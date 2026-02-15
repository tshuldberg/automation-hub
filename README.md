# Automation Hub

Multi-channel task automation engine that consolidates email, calendar, reminders, iMessage, and Slack into a unified task pipeline with approval gates.

## Purpose

- Consolidate incoming signals from 5+ communication channels into a single prioritized action queue.
- Extract tasks, due dates, and blockers from email threads, messages, and calendar events.
- Plan due dates against calendar load and PM dependencies.
- Detect gantt drift and prepare response drafts plus voice review queues.
- Enforce human-in-the-loop approval for all write actions.

## Independence Rules

- No code dependency on `shiphawk-dev`.
- Optional reference to `shiphawk-dev` is read-only and only for context/QA.
- All runtime state and outputs stay inside this project.

## Layout

```
config/                         Provider + connector settings
  runtime.example.yaml          Runtime configuration template
  channel_adapters.example.yaml Channel adapter map
policies/                       Approval policy rules
  approval_policy.yaml          Action gating rules
pm_mcp_interface.yaml           PM/Gantt MCP tool contract
schemas/                        JSON schemas
  canonical_task.schema.json    Shared task model
jobs/                           YAML job specifications
  01_email_triage.yaml          Job 01: Email triage
  02_calendar_due_date_planner.yaml  Job 02: Due date planner
  03_gantt_drift_voice_queue.yaml    Job 03: Gantt drift
  04_unified_channel_consolidation.yaml  Job 04: Channel consolidation
docs/                           Project documentation
state/                          Sync cursors and execution state
runs/                           Generated run outputs
src/                            TypeScript runtime
  adapters/                     Channel adapters (7 total)
    adapter.interface.ts        Shared ChannelAdapter interface
    factory.ts                  AdapterKit factory (mock vs real)
    router.ts                   ChannelRouter for reply-in-same-channel
    slack.adapter.ts            Slack MCP wrapper
    macos-messages.adapter.ts   iMessage via macos-hub MCP
    macos-mail.adapter.ts       Apple Mail via macos-hub MCP
    macos-calendar.adapter.ts   Apple Calendar via macos-hub MCP
    macos-reminders.adapter.ts  Apple Reminders via macos-hub MCP
    pm.adapter.ts               PM tool wrapper (falls back to Reminders)
    mock.ts                     Mock adapters for dry-run testing
  approval/                     Approval gate logic
  jobs/                         Job runner implementations
    email-triage.ts             Job 01 runner
    due-date-planner.ts         Job 02 runner
    gantt-drift.ts              Job 03 runner
    channel-consolidation.ts    Job 04 runner
  runtime/                      Config loaders + run file management
  utils/                        Extraction, hashing, helpers
  cli.ts                        CLI entry point
  contracts.ts                  Zod schemas and types
tests/                          Vitest test suite
```

## Channel Adapters

| Adapter | Channel | MCP Source | Capabilities |
|---------|---------|------------|-------------|
| SlackAdapter | `slack` | Slack MCP | list, send, search, read thread |
| MacosMessagesAdapter | `imessage` | macos-hub | list, send, search |
| MacosMailAdapter | `email` | macos-hub | list, get, send, search |
| MacosCalendarAdapter | `calendar` | macos-hub | list, get, create, update |
| MacosRemindersAdapter | `reminders` | macos-hub | list, get, create, complete |
| PmAdapter | `pm` | PM MCP / Reminders fallback | list, get, create, search |
| MockEmailAdapter | (dry-run) | Local fixtures | list threads |

All real adapters implement the `ChannelAdapter` interface. In production, they delegate to MCP tools via the Claude Code session. In standalone CLI mode, they return empty results / log intent.

## Job Specs

| Job | ID | Command | Description |
|-----|-----|---------|-------------|
| 01 | email-triage | `npm run job:email-triage:dry-run` | Extract tasks from email, map to PM projects, draft replies |
| 02 | due-date-planner | `npm run job:due-date-planner:dry-run` | Propose due dates using calendar availability and dependencies |
| 03 | gantt-drift | `npm run job:gantt-drift:dry-run` | Detect timeline drift from email signals, generate voice queue |
| 04 | channel-consolidation | `npm run job:channel-consolidation:dry-run` | Poll all channels, deduplicate, build unified action queue |

## Runtime Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Optional: copy `config/runtime.example.yaml` to `config/runtime.yaml` and fill credentials.
   If missing, runtime falls back to `config/runtime.example.yaml`.
3. Run any job in dry-run mode:
   ```bash
   npm run job:email-triage:dry-run
   npm run job:due-date-planner:dry-run
   npm run job:gantt-drift:dry-run
   npm run job:channel-consolidation:dry-run
   ```
4. Run with write approvals enabled:
   ```bash
   npm run job:email-triage -- --approve-writes
   ```

## CLI Commands

```bash
node dist/cli.js <command> [options]

Commands:
  run-email-triage            Run Job 01: email triage
  run-due-date-planner        Run Job 02: calendar-aware due date planner
  run-gantt-drift             Run Job 03: gantt drift voice queue
  run-channel-consolidation   Run Job 04: unified channel consolidation

Options:
  --job-file <path>    Override the YAML job spec file
  --dry-run            Run without executing write actions
  --approve-writes     Approve human-gated write actions
```

## Testing

```bash
npm test     # Run all tests with vitest
```

Tests cover:
- Extraction utilities (action candidates, dates, priorities, summarization)
- Approval gate (default-deny, rule matching, dry-run blocking)
- Semantic deduplication (fingerprint determinism, normalization)
- Adapter interface compliance (all 6 real adapters)
- Channel router (registration, routing, error handling)
- E2E dry-run for all 4 job runners

## Provider Agnostic Operation

- OpenAI: Responses API background jobs + MCP/connectors.
- Claude: headless or Agent SDK + MCP.
- Shared behavior: same tools, same schema, same approval gates.
