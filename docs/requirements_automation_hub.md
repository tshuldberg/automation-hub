# Automation Hub Requirements Document (Review Draft)

Status: Draft for stakeholder review  
Document owner: Automation Hub team  
Last updated: 2026-02-08  
Workspace: `/Users/trey/Desktop/Apps/SH/automation-hub`

## 1. Purpose

Define complete functional and non-functional requirements for a standalone Automation Hub that:

- Consolidates communication channels into one operational task stream.
- Automates email review, task creation, and response draft generation.
- Plans task due dates against calendar load and project schedules.
- Supports voice-first capture workflows (Superwhisper transcripts).
- Remains provider-agnostic for GPT- and Claude-based agent runtimes.

This document is intended for engineering, product, operations, and security review.

## 2. Background and Context

Current pain points:

- Work arrives across disconnected channels (email, calendar, reminders, texts, voice notes).
- Task creation is manual and inconsistent.
- Due dates are often set without calendar capacity context.
- PM schedules (Gantt and dependencies) are not continuously reconciled with incoming requests.
- Responses are drafted ad hoc, reducing consistency and speed.

Target state:

- A dedicated adjacent project (not embedded into other app codebases).
- One canonical event and task model.
- Scheduled automations with approval gates for any write/send action.
- Consistent outputs for triage, planning, and response drafting.

## 3. Scope

## 3.1 In Scope

- Standalone automation runtime in this workspace.
- Ingestion/normalization from:
  - Email (Gmail/Outlook or equivalent connector).
  - Calendar.
  - Apple Reminders.
  - Text channels (including self-notes and external messages) via bridge.
  - Superwhisper voice transcript sources.
  - PM/Gantt source via MCP contract.
- Canonical task generation with evidence traceability.
- Calendar-aware due-date planning.
- PM schedule drift detection and task/update suggestions.
- Response draft generation and approval queueing.
- Scheduled recurring jobs.
- Filter/query framework for fast future retrieval and triage views.

## 3.2 Out of Scope

- Replacing source systems (email/calendar/PM apps).
- Fully autonomous outbound messaging without approval.
- Building a full CRM/PM replacement.
- Hard dependency on any single model vendor.

## 4. Goals and Success Criteria

## 4.1 Goals

- Reduce manual triage effort by at least 50%.
- Produce consistent task proposals with due-date suggestions.
- Improve response draft turnaround speed for inbound requests.
- Maintain an auditable chain from source event to proposed action.
- Keep architecture portable across GPT and Claude execution environments.

## 4.2 Success Metrics

- `Triage Coverage`: % of inbound items classified with confidence above threshold.
- `Task Proposal Rate`: % of triaged items converted into task candidates.
- `Due-Date Accuracy`: % of planned due dates accepted without manual edits.
- `Draft Reuse Rate`: % of generated drafts sent with minor edits.
- `Approval SLA`: median time from proposal creation to review completion.
- `Duplicate Suppression Rate`: % of duplicate events correctly deduplicated.

## 5. Stakeholders and Roles

- Product owner: defines policy, priorities, approval rules.
- Technical lead: architecture and delivery sequencing.
- Integration engineer: channel connectors and MCP interfaces.
- Backend/automation engineer: job runners, state, scheduling, reliability.
- AI/data engineer: extraction/classification and confidence tuning.
- Security/compliance reviewer: secret handling, PII controls, audit policy.
- Operations reviewer: runbook acceptance and escalation handling.

## 6. System Requirements

## 6.1 Architecture Requirements

- Must run as a standalone service in `/Users/trey/Desktop/Apps/SH/automation-hub`.
- Must keep runtime state inside local project folders (`state/`, `runs/`).
- Must keep provider/tool abstractions behind adapters.
- Must support MCP-based connectors for portable tooling.
- Must support dry-run mode and explicit write approvals.

## 6.2 Data Model Requirements

- Must normalize all inbound events into a canonical event shape.
- Must map proposed work into `schemas/canonical_task.schema.json`.
- Must preserve source references for traceability.
- Must support semantic dedupe fingerprinting per event/task.
- Must support canonical filter representation:
  - `match` + `filters[]` operator model.
  - Engine adapters for search backend translation.

## 7. Functional Requirements

## 7.1 Channel Ingestion and Normalization

- FR-001: System must ingest email metadata/body and attachments metadata.
- FR-002: System must ingest calendar events and free/busy blocks.
- FR-003: System must ingest reminder items and reminder status.
- FR-004: System must ingest message channels through approved bridge.
- FR-005: System must ingest Superwhisper transcript files/history entries.
- FR-006: System must normalize all channels into a common event schema.

Acceptance criteria:

- Given any supported source event, system emits one canonical event with:
  - stable `event_id`,
  - source reference,
  - timestamp,
  - actor,
  - raw text payload,
  - extracted entities,
  - confidence.

## 7.2 Email Triage and Task Candidate Creation

- FR-010: System must classify inbound emails into categories (task, question, FYI, noise).
- FR-011: System must extract entities (account, project, dates, owners, urgency).
- FR-012: System must generate task candidates with confidence scoring.
- FR-013: System must route low-confidence items to explicit review queue.
- FR-014: System must avoid duplicate task creation for repeated threads.

Acceptance criteria:

- Duplicate inbound references do not create duplicate open tasks.
- Confidence thresholding behavior is configurable.
- Every created candidate links to at least one source evidence item.

## 7.3 Calendar-Aware Due-Date Planning

- FR-020: System must propose due dates based on:
  - event urgency,
  - dependencies,
  - calendar capacity/free-busy.
- FR-021: System must annotate reasons for chosen due date.
- FR-022: System must flag conflicts and overloaded dates.
- FR-023: System must allow human override and preserve audit log.

Acceptance criteria:

- Planner outputs ranked due-date options with rationale.
- Planner marks conflicts against existing calendar commitments.

## 7.4 PM/Gantt Schedule Reconciliation

- FR-030: System must read PM schedule tasks/dependencies via MCP interface.
- FR-031: System must detect schedule drift (late predecessors, blocked successors).
- FR-032: System must generate remediation task suggestions.
- FR-033: System must generate response drafts for stakeholder updates.

Acceptance criteria:

- Drift detection includes impacted milestones and affected owners.
- Suggested actions include risk level and target completion window.

## 7.5 Unified Communication Consolidation

- FR-040: System must merge channel events into one timeline per work context.
- FR-041: System must support task grouping by project/account/topic.
- FR-042: System must expose consolidated “action inbox” output per run.
- FR-043: System must maintain channel-specific privacy rules.

Acceptance criteria:

- One run output includes a single consolidated summary + grouped action list.

## 7.6 Response Draft Generation (Human-in-the-loop)

- FR-050: System must draft responses for email/message channels.
- FR-051: Drafts must include tone/policy templates by channel/use-case.
- FR-052: No outbound send occurs without explicit approval.
- FR-053: Draft revisions must be tracked and linked to original proposal.

Acceptance criteria:

- Outbound action path is blocked until approval state = approved.
- Final sent content is auditable with before/after draft versions.

## 7.7 Voice-First Workflow Requirements

- FR-060: Voice transcripts from Superwhisper must be ingested automatically.
- FR-061: Transcript entries must be classified into:
  - task candidate,
  - response draft idea,
  - archive note.
- FR-062: Voice-originated items must preserve transcript pointer.

Acceptance criteria:

- Every voice-derived task/draft includes transcript source reference.

## 7.8 Filter and Retrieval Requirements (Future Performance Path)

- FR-070: System must support canonical filter JSON for all retrieval paths.
- FR-071: Filter operators must support exact, set, range, contains, starts/ends.
- FR-072: Filter policy must allow operator controls by field class.
- FR-073: System must provide adapter interface for OpenSearch and SQL backends.
- FR-074: Saved-view-like filter payload snapshots must be versioned.

Acceptance criteria:

- Same canonical filter payload can be translated to each enabled backend.
- Policy can disable high-cost operators on configured fields.

## 7.9 Scheduling and Automation

- FR-080: System must support recurring jobs for all defined automation specs.
- FR-081: Jobs must support dry-run and write-enabled modes.
- FR-082: Each run must persist run artifacts and outcome status.
- FR-083: Failed runs must record actionable error context.

Acceptance criteria:

- Scheduled jobs produce deterministic run output folder artifacts.

## 7.10 Security, Approval, and Audit

- FR-090: All write/send actions require policy-gated approval.
- FR-091: Secrets must not be logged in clear text.
- FR-092: Sensitive payload handling must be configurable by channel.
- FR-093: Audit records must include who approved what and when.

Acceptance criteria:

- Approval policy violation blocks write/send execution.

## 8. Non-Functional Requirements

- NFR-001 Reliability: system must recover safely after interrupted runs.
- NFR-002 Idempotency: repeated ingestion should not create duplicate outputs.
- NFR-003 Performance:
  - 95% of ingest+triage runs for standard batch complete under 5 minutes.
  - Retrieval/filter queries for operational dashboards target sub-second on indexed fields.
- NFR-004 Observability: run-level logs, metrics, and error categories required.
- NFR-005 Maintainability: adapter boundaries + typed contracts required.
- NFR-006 Portability: model-provider logic must be behind abstraction layer.

## 9. External Integration Requirements

Required integration classes:

- Email connector adapter (MCP or native wrapper).
- Calendar connector adapter (MCP or native wrapper).
- Messaging bridge adapter (Zapier-compatible path and/or local bridge).
- Apple Reminders adapter (local bridge path).
- Superwhisper ingestion adapter (file/history polling or API path).
- PM/Gantt MCP adapter (existing `pm_mcp_interface.yaml` alignment).

Each adapter must provide:

- health check,
- pagination/sync cursor behavior,
- deterministic error mapping,
- retry policy with backoff,
- source reference normalization.

## 10. Phased Implementation Backlog (Item 1)

Estimates are calendar time, assuming one focused squad (Tech Lead + 2 Engineers + part-time QA).

## Phase 0: Foundation and Controls (1 week)

Owner roles:

- Tech lead (primary), backend engineer, security reviewer.

Deliverables:

- Finalize runtime config loading rules.
- Enforce approval policy baseline.
- Standardize run artifact structure.
- Baseline health checks and adapter interfaces.

Exit criteria:

- Dry-run and write-mode gating validated.
- Policy blocks unsafe write/send actions.

## Phase 1: Production-Grade Email Triage (2 weeks)

Owner roles:

- Integration engineer (primary), AI/data engineer, backend engineer.

Deliverables:

- Replace mock email adapter with real connector.
- Entity extraction + confidence thresholds.
- Task candidate generation with dedupe.
- Review queue output schema and templates.

Exit criteria:

- End-to-end email triage run in production-like environment.
- Dedupe and confidence routing verified.

## Phase 2: Calendar-Aware Due-Date Planner (2 weeks)

Owner roles:

- Backend engineer (primary), AI/data engineer, integration engineer.

Deliverables:

- Calendar free/busy adapter integration.
- Due-date scoring and conflict detection.
- Planner rationale output.

Exit criteria:

- Planner suggests due dates with conflict flags and rationale.

## Phase 3: PM/Gantt Drift Automation (2 weeks)

Owner roles:

- Integration engineer (primary), backend engineer.

Deliverables:

- PM MCP ingestion pipeline.
- Dependency/slip detection.
- Remediation task suggestions and status draft output.

Exit criteria:

- Drift report generated from live PM schedule sample.

## Phase 4: Unified Channels + Voice Workflow (3 weeks)

Owner roles:

- Integration engineer (primary), AI/data engineer, backend engineer.

Deliverables:

- Apple Reminders bridge.
- Messaging bridge (Zapier/local adapter path).
- Superwhisper transcript ingestion and classification.
- Unified timeline/action inbox generation.

Exit criteria:

- Multi-channel run consolidates email/calendar/messages/reminders/voice.

## Phase 5: Fast Filter Framework (2 weeks)

Owner roles:

- Tech lead (primary), backend engineer.

Deliverables:

- Canonical filter AST specification and validation.
- Backend adapter implementations for chosen storage engines.
- Operator policy controls by field.
- Saved-view payload versioning.

Exit criteria:

- Identical canonical filters execute correctly across configured backends.

## Phase 6: Hardening, QA, and Rollout (2 weeks)

Owner roles:

- QA lead (primary), operations reviewer, all engineers.

Deliverables:

- Regression suite and smoke runs for all jobs.
- Runbook and escalation procedures.
- Production rollout checklist and rollback plan.

Exit criteria:

- Signed-off release readiness checklist.

Total estimate: 12 weeks.

## 11. Milestone Acceptance Gates

- Gate A (end Phase 1): reliable email-to-task pipeline with approvals.
- Gate B (end Phase 3): schedule-aware planning + PM drift actions.
- Gate C (end Phase 4): channel consolidation including voice inputs.
- Gate D (end Phase 6): operationally hardened production candidate.

## 12. Risks and Mitigations

- Connector/API instability:
  - Mitigation: adapter retries, cursor checkpoints, graceful degradation.
- Over-automation risk (incorrect outbound responses):
  - Mitigation: strict approval gates + confidence thresholds.
- Duplicate tasks across channels:
  - Mitigation: source-ref and semantic fingerprint dedupe.
- Privacy/PII leakage:
  - Mitigation: redact logs, scoped data retention, policy enforcement.
- Vendor lock-in:
  - Mitigation: canonical schemas + MCP/provider abstraction.

## 13. Testing Requirements

- Unit tests:
  - extraction/parsing,
  - dedupe,
  - due-date scoring,
  - policy gating.
- Integration tests:
  - adapter contract compliance,
  - job run output structure.
- End-to-end dry-run tests:
  - jobs 01-04 with fixture data.
- Security checks:
  - secret redaction and approval enforcement.

## 14. Operational Requirements

- Must include runbook for:
  - failed connectors,
  - queue backlog,
  - manual replay,
  - approval deadlocks.
- Must include dashboard metrics:
  - run success rate,
  - item throughput,
  - approval latency,
  - duplicate suppression.

## 15. Open Decisions Needed for Final Sign-off

- Which message bridge is primary in production (Zapier vs local)?
- What confidence thresholds trigger auto-proposal vs manual review?
- What maximum allowed outbound automation scope is acceptable?
- Which backend is selected first for high-performance filtering?
- Data retention policy per channel and evidence type.

## 16. Review Checklist (for “full and detailed” review)

- Product:
  - Are goals and success metrics aligned with business outcomes?
- Engineering:
  - Are phase boundaries and estimates realistic?
  - Are adapter contracts sufficient and testable?
- Security/compliance:
  - Are approval and audit requirements complete?
- Operations:
  - Are runbook and alerting requirements actionable?
- Leadership:
  - Is the 12-week phased plan acceptable in scope and sequence?

## 17. Related Project Documents

- `/Users/trey/Desktop/Apps/SH/automation-hub/README.md`
- `/Users/trey/Desktop/Apps/SH/automation-hub/docs/channel_matrix.md`
- `/Users/trey/Desktop/Apps/SH/automation-hub/docs/shiphawk_filters_findings.md`
- `/Users/trey/Desktop/Apps/SH/automation-hub/pm_mcp_interface.yaml`
- `/Users/trey/Desktop/Apps/SH/automation-hub/policies/approval_policy.yaml`
- `/Users/trey/Desktop/Apps/SH/automation-hub/schemas/canonical_task.schema.json`

## 18. Appendix A: Canonical Filter Spec (Detailed Review for Item 2)

This appendix provides a full review target for the canonical filter model so teams can review item 2 in detail while item 1 backlog execution starts.

## 18.1 Canonical Filter Object

```json
{
  "version": "1.0",
  "entity": "tasks",
  "match": "all",
  "filters": [
    {
      "field": "status",
      "operator": "one_of",
      "values": ["new", "blocked"]
    },
    {
      "field": "due_at",
      "operator": "range",
      "values": ["2026-02-08", "2026-02-15"]
    }
  ],
  "sort": [
    {
      "field": "priority",
      "direction": "desc"
    },
    {
      "field": "due_at",
      "direction": "asc"
    }
  ],
  "limit": 100,
  "offset": 0
}
```

## 18.2 Core Fields

- `version`: schema version for migration compatibility.
- `entity`: target collection (`tasks`, `events`, `drafts`, `runs`).
- `match`:
  - `all` = logical AND across filter clauses.
  - `some` = logical OR across filter clauses.
- `filters[]`: list of filter clauses.
- `sort[]`: ordered sort clauses.
- `limit` and `offset`: pagination controls.

## 18.3 Allowed Operators

- `eq`: exact single-value equality.
- `not_eq`: exact inequality.
- `one_of`: in-set match.
- `not_one_of`: not-in-set match.
- `contains`: substring or token containment.
- `not_contains`: negated containment.
- `starts_with`: prefix match.
- `ends_with`: suffix match.
- `range`: two-value inclusive bounds.
- `gt`, `gte`, `lt`, `lte`: single-sided numeric/date bounds.

## 18.4 Field Policy Classes

- `exact_only`: only `eq`, `one_of`, `not_eq`, `not_one_of`.
- `range_capable`: range operators allowed.
- `text_flexible`: includes contains/prefix/suffix.
- `high_cost_text`: contains/ends_with disabled by default.

Policy requirement:

- Every field must declare a policy class.
- Query compiler must reject operators not allowed by class.

## 18.5 Validation Rules

- `match` required when `filters` is present.
- `filters[].field` must exist in entity registry.
- `filters[].operator` must be in allowed operator set.
- `filters[].values` cannot be empty.
- `range` requires exactly two values.
- `gt/gte/lt/lte` require exactly one value.
- `limit` max default: 500 (configurable).
- Reject unknown top-level keys unless explicitly allowed by version.

## 18.6 Backend Translation Contract

Compiler output interface:

- Input: canonical filter object.
- Output:
  - backend query payload,
  - safe execution metadata,
  - rejected clause list (if any).

Required backend adapters:

- `adapter_opensearch_compile`
- `adapter_sql_compile`

Behavior guarantees:

- Same canonical filter input yields semantically equivalent output across backends.
- Backend-specific unsupported clauses must fail validation, not silently drop.

## 18.7 Saved View Payload Rules

- Persist full canonical filter object plus:
  - `name`,
  - `entity`,
  - `created_by`,
  - `is_default`,
  - `version`.
- Saved view migrations must be version-aware.
- Any incompatible version must be flagged and converted explicitly.

## 18.8 Example Entity Registry (Initial)

- `tasks.status`: `exact_only`
- `tasks.priority`: `exact_only`
- `tasks.assignee_id`: `exact_only`
- `tasks.due_at`: `range_capable`
- `tasks.title`: `text_flexible`
- `tasks.description`: `high_cost_text`
- `events.channel`: `exact_only`
- `events.timestamp`: `range_capable`

## 18.9 Performance Safety Rules

- Block leading wildcard equivalent translation on `high_cost_text` fields.
- Require indexed-field check for `sort[]`.
- Enforce max filter clause count (default: 25).
- Enforce max values per clause (default: 100).
- Enforce query execution timeout with deterministic error response.

## 18.10 Acceptance Criteria (Item 2 Review Completion)

- Reviewer can validate operator policy by field from one table.
- Reviewer can see exact canonical JSON shape and versioning strategy.
- Engineering can implement compiler and adapters without ambiguity.
- QA can derive positive/negative validation test cases directly from this appendix.
