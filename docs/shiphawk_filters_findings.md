# ShipHawk Filters Across Platforms: Findings

Date: 2026-02-08  
Scope: How filtering works today in ShipHawk code/public docs, where performance bottlenecks are, and what alternative systems can support faster future filtering.

## Executive Summary

- ShipHawk filtering is already split by platform and use case:
  - API/Web Orders + Shipments rely primarily on Elasticsearch/OpenSearch-style queries, with SQL fallback when search is unhealthy.
  - Workstation search uses a separate, narrower path optimized for operational lookup (order number / LPN / tote).
  - Admin uses ActiveAdmin/Ransack plus custom scopes.
  - WMS workflows expose operator filter pages in wave release / dashboards.
- The best current fast path is exact/range filters (`term`, `terms`, `range`) with account and warehouse scoping.
- The highest-cost pattern in current code is wildcard contains/ends-with (`*value*`, `*value`) and deep nested query combinations.
- Recommended next target for “quick performing filters”: stay on OpenSearch-compatible architecture for main workload and add stricter filter policy + field strategy; use PostgreSQL `GIN` + `pg_trgm` selectively where transactional + search coexistence is more valuable than ES-style faceting/scoring scale.

## How ShipHawk Filters Work Across Platforms

### 1) API v4 + Web (Orders/Shipments)

- Primary route handlers:
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/orders.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/shipments.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/web/orders.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/web/shipments.rb`
- Engine choice:
  - Orders and shipments choose Elastic service unless health is red; then fallback to SQL:
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/order_service.rb`
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/shipment_service.rb`
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/lib/elastic/check.rb`
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/lib/elastic/healthcheck.rb`

### Orders path details

- Two filter engines are used in elastic service:
  - Legacy `FilterQueryBuilder` for API/client style params.
  - Modular filter engine (`filters` + `match`) for dashboard-style filters:
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/fetchers/order/elastic_service.rb`
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/fetchers/order/elastic/filter_query_builder.rb`
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/fetchers/order/elastic/modular_filter_query_builder.rb`
- Warehouse scoping is injected when user is warehouse-scoped and request omitted explicit warehouse modular filter:
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/order_service.rb`
- Search text behavior spans many fields and nested structures (orders, addresses, line items, refs, shipments):
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/fetchers/order/elastic/search_query_builder.rb`

### Shipments path details

- Same dual mode:
  - Legacy query-string parser path (status/date/etc packed into query string).
  - Modular filter path (`filters` + `match`):
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/fetchers/shipment/elastic/build_filter_query.rb`
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/fetchers/shipment/elastic/build_modular_filter_query.rb`
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/fetchers/shipment/elastic/base_filter_query.rb`
- User warehouse restrictions are also applied by default when relevant.

### Modular filter contract (Orders + Shipments)

- API contracts accept:
  - `match: all|some`
  - `filters: [{field, values[], operator}]`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/helpers/order_params_helper.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/helpers/shipment_params_helper.rb`
- Build behavior:
  - `match=all` => AND style
  - `match=some` => OR style wrapper
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/helpers/modular_filter/build_query.rb`

### Operator behavior and performance implications

- Operators are converted centrally (`eq`, `one_of`, `range`, `contains`, `starts_with`, `ends_with`, etc.):
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/helpers/modular_filter/filter_converter.rb`
- `contains` and `ends_with` become wildcard queries using leading `*` patterns (high cost at scale).

### 2) Workstation (WS)

- WS order search is separate and intentionally narrow:
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/ws/orders.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/ws/order_search.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/ws/fetchers/order/elastic_service.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/ws/fetchers/order/sql_service.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/ws/orders_list.rb`
- Typical behavior:
  - Filter to active in-process statuses.
  - Search against order number plus optional LPN/tote.
  - Then apply operational post-filters for unprocessed proposed shipments and remaining pickable qty.

### 3) Admin (ActiveAdmin + Ransack)

- Admin filter layer is independent of API elastic queries:
  - Example resource filters:
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/admin/shipments.rb`
    - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/admin/shipping_api_credentials.rb`
- Ransack scopes define custom searchable scopes:
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/models/ransackable/shipping_api_credential.rb`
- Notable hotspot:
  - Credentials filter currently evaluates in Ruby over scope records, then re-queries matched ids (non-index-accelerated for JSON criteria):
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/shipping_api_credentials/credentials_filter_service.rb`

### 4) Saved Views (Cross-UI Reuse of Filters)

- Saved views store request payload (`request_data`) per user/entity and can capture filter body + addl params:
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/saved_views.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/api/v4/helpers/saved_views_params_helper.rb`
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/models/saved_view.rb`
- This aligns with ShipHawk public UX messaging around saved filters/views.

### 5) Public WMS Filtering UX (Operational Platform)

- Public WMS docs show filter-driven operational control in wave release and dashboards:
  - <https://shiphawk.com/wms-docs/pick.html>
- Public blog describes order-history filters with `all/some` style matching and saved views:
  - <https://blog.shiphawk.com/innovation-for-user-efficiency>

## Performance Findings (Current State)

### Strong patterns (good for quick performance)

- Exact filters (`term`, `terms`), ranges, and fixed scoping fields (`account_id`, warehouse scopes).
- Early constraint injection (account, not deleted, user warehouse).
- Dedicated WS path for highly constrained lookup use cases.

### Risk patterns (likely slow at scale)

- Wildcards with leading `*` for contains/ends-with.
- Broad nested queries over line items/reference numbers with complex `should` sets.
- SQL fallback feature mismatch for heavy aggregations:
  - SQL `counts_by_status` raises health error by design:
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/services/api_services/search/fetchers/sql_base_service.rb`
- In-memory admin credentials filtering.

### Elastic/OpenSearch boundary conditions

- Result window hard cap (`max_elastic_result_window`, default 10k) and paging behavior:
  - `/Users/trey/Desktop/Apps/SH/shiphawk-dev/app/models/concerns/elastic_searchable.rb`
- Healthcheck fallback may shift behavior from elastic semantics to simpler SQL semantics during outages.

## Other Systems You Could Use for Future Fast Filters

### Option A: OpenSearch (recommended primary)

When to use:
- You want closest fit to current ShipHawk filter model (bool filters, nested docs, faceting/aggregations, full-text + exact filters).

Pros:
- Minimal conceptual migration from current implementation.
- Strong for mixed faceted + free-text + nested search.
- Query/filter separation guidance is clear for performance tuning.

Cons:
- Requires careful index/mapping discipline to avoid wildcard abuse.
- Cluster operations overhead remains.

### Option B: PostgreSQL + GIN + `pg_trgm` (recommended selective/secondary)

When to use:
- You want fewer moving parts and your filter workload is mostly transactional/reporting with moderate text search.

Pros:
- Keep data + filtering in one persistence layer.
- `GIN` and trigram operator classes can accelerate text similarity and pattern matching.

Cons:
- Complex relevance/faceting and very high-cardinality search workloads may need more tuning than search-native engines.
- Trigram behavior can still degrade when patterns cannot extract useful trigrams.

### Option C: Solr

When to use:
- You want mature Lucene-based filtering and explicit filter-query caching controls.

Pros:
- Strong `fq` semantics and cache behavior.
- Proven at large scale.

Cons:
- Operational overhead similar class to OpenSearch.
- Lower alignment with current team/tooling if you are already invested in OpenSearch-style APIs.

### Option D: Typesense

When to use:
- You want developer-friendly fast filtering + typo-tolerant search for product-style UX with simpler ops.

Pros:
- Clear `filter_by` expression language, AND/OR logic, prefix filters.
- Fast implementation velocity.

Cons:
- Not a drop-in replacement for deep nested + complex analytics workloads.

### Option E: Redis Query Engine

When to use:
- You need ultra-low-latency query patterns and can model query semantics around `FT.SEARCH` / `FT.AGGREGATE`.

Pros:
- Very fast in-memory operations.
- Good for exact/range/combined query scenarios.

Cons:
- Memory cost and data-model constraints can be high for broad enterprise search history.

## Recommended Path for “Quick Performing Filters” in Your Future

1. Keep OpenSearch-compatible core for orders/shipments history.
2. Enforce a filter policy:
   - Prefer exact/range operators.
   - Restrict leading-wildcard contains on large fields.
   - Route contains/ends-with only to specialized indexed fields.
3. Add field strategy:
   - Dedicated keyword fields for exact filters.
   - Controlled wildcard/ngram fields only where required.
4. Normalize filter AST once (portable across GPT/Claude tool runners):
   - Canonical filter JSON with `match`, `filters`, operators.
   - Adapter layer translates to OpenSearch / SQL / other backend.
5. Replace in-memory admin JSON filtering with indexed queryable structure (JSONB + GIN or indexed extracted columns).
6. Keep saved views as canonical payload snapshots and version schema for safe evolution.

## Claude “Universally Applicable” Check

- Claude Code public docs describe MCP support and multi-surface operation (terminal/IDE/web/desktop), which is compatible with a model-agnostic MCP-first filter/task architecture:
  - <https://code.claude.com/docs/en/overview>
- Practical interpretation:
  - Design your filter/task orchestration around canonical payloads + MCP tool contracts, not model-specific prompt formatting.
  - This keeps the same automation hub usable from GPT-based and Claude-based coding/agent clients.

## Source Links

- ShipHawk public:
  - <https://blog.shiphawk.com/innovation-for-user-efficiency>
  - <https://shiphawk.com/wms-docs/pick.html>
- Claude docs:
  - <https://code.claude.com/docs/en/overview>
- OpenSearch:
  - <https://docs.opensearch.org/latest/query-dsl/query-filter-context/>
  - <https://docs.opensearch.org/latest/query-dsl/term/wildcard/>
- PostgreSQL:
  - <https://www.postgresql.org/docs/current/gin.html>
  - <https://www.postgresql.org/docs/current/pgtrgm.html>
- Typesense:
  - <https://typesense.org/docs/29.0/api/search.html#filter-parameters>
- Solr:
  - <https://solr.apache.org/guide/solr/latest/query-guide/common-query-parameters.html>
- Redis:
  - <https://redis.io/docs/latest/develop/ai/search-and-query/query/>
  - <https://redis.io/docs/latest/develop/ai/search-and-query/query/exact-match/>
