# Automation Hub

Multi-channel task automation engine that consolidates email, calendar, reminders, iMessage, and Slack into a unified task pipeline with approval gates.

## Stack

- Node.js (ES modules), TypeScript 5.9
- Zod 3.24 (schema validation)
- Vitest (testing)
- YAML (job specs, config, policies)

## Key Commands

```bash
npm run build                              # Compile TypeScript to dist/
npm test                                   # Run all tests (vitest)
npm run typecheck                          # Type check without emit
npm run job:email-triage:dry-run           # Job 01: email triage
npm run job:due-date-planner:dry-run       # Job 02: due date planner
npm run job:gantt-drift:dry-run            # Job 03: gantt drift voice queue
npm run job:channel-consolidation:dry-run  # Job 04: unified channel consolidation
```

## Architecture

```
src/
├── cli.ts                    CLI entry point (4 commands)
├── contracts.ts              Zod schemas + TypeScript types
├── adapters/
│   ├── adapter.interface.ts  Shared ChannelAdapter interface + types
│   ├── factory.ts            AdapterKit factory (mock vs real)
│   ├── router.ts             ChannelRouter for reply-in-same-channel
│   ├── slack.adapter.ts      Slack MCP wrapper
│   ├── macos-messages.adapter.ts   iMessage via macos-hub MCP
│   ├── macos-mail.adapter.ts       Apple Mail via macos-hub MCP
│   ├── macos-calendar.adapter.ts   Apple Calendar via macos-hub MCP
│   ├── macos-reminders.adapter.ts  Apple Reminders via macos-hub MCP
│   ├── pm.adapter.ts         PM tool wrapper (Reminders fallback)
│   └── mock.ts               Mock adapters for dry-run testing
├── approval/
│   └── gate.ts               Approval gate evaluator
├── jobs/
│   ├── email-triage.ts       Job 01 runner
│   ├── due-date-planner.ts   Job 02 runner
│   ├── gantt-drift.ts        Job 03 runner
│   └── channel-consolidation.ts  Job 04 runner
├── runtime/
│   ├── loaders.ts            YAML/JSON config loaders
│   └── run-files.ts          Run directory + output path management
└── utils/
    ├── extraction.ts         Text extraction (actions, dates, priorities)
    └── hash.ts               Semantic fingerprinting for dedup
```

**Key patterns:**
- **Adapter pattern:** All channel interactions go through `ChannelAdapter` interface. `AdapterKit` factory builds mock or real adapters based on dry-run flag.
- **Router:** `ChannelRouter` routes responses back to the originating channel.
- **Approval gate:** All write actions require explicit approval. Dry-run mode blocks all writes.
- **Job specs:** YAML files define inputs, steps, approval rules, and output templates.
- **Run artifacts:** Each job run writes to `runs/<run_id>/` with summary markdown, JSON proposals, and audit logs.

## Critical: Outbound Message Rules
- NEVER auto-send to external recipients — all external replies are drafts presented for approval
- Auto-send OK: messages to Trey (self), Receeps Slack (internal)
- iMessage is one-way notifications only — never process incoming iMessages

## Session Logging
- Append questions, edge cases, and improvement ideas to `logs/session-difficulties.md`
- Each entry: timestamp, category, description, context
- Utility: `src/utils/session-log.ts` (`logSessionDifficulty()`)

## Code Style

- ES modules with `.js` extensions in imports
- Zod schemas for all data validation
- Type-safe adapter interface with `ChannelType` union
- No inline AppleScript -- all macOS interaction via macos-hub MCP tools

## Testing

```bash
npm test
```

6 test suites covering:
- `extraction.test.ts` — Action extraction, date parsing, priority inference, text summarization
- `approval-gate.test.ts` — Default-deny, rule matching, human approval, dry-run blocking
- `hash.test.ts` — Semantic fingerprint determinism, normalization, collision resistance
- `adapters.test.ts` — Interface compliance for all 6 real adapters
- `router.test.ts` — Registration, routing, error handling
- `jobs-e2e.test.ts` — Dry-run E2E for all 4 job runners

## Git Workflow

- Branch naming: `feature/`, `fix/`, `docs/` prefixes
- Commit messages: Conventional Commits (imperative mood)
- Always `npm run build && npm test` before committing

## Parallel Agent Work

This project participates in the workspace plan queue system. See `/Users/trey/Desktop/Apps/CLAUDE.md` for the full Plan Queue Protocol.

### Worktree Setup
- Bootstrap: `.cmux/setup` handles env symlinks and dependency installation
- Branch naming: `plan/[plan-name]` for plan-driven work, `feature/[name]` for ad-hoc

### File Ownership Boundaries
When multiple agents work on this project simultaneously, use these boundaries to avoid conflicts:

| Agent Role | Owned Paths |
|------------|-------------|
| Adapters | `src/adapters/` (all adapter implementations, `adapter.interface.ts`, `factory.ts`, `router.ts`) |
| Jobs | `src/jobs/`, `jobs/` (YAML job specs) |
| Listeners | `src/listeners/`, `src/listener-cli.ts` |
| Core/runtime | `src/contracts.ts`, `src/cli.ts`, `src/runtime/`, `src/approval/`, `src/utils/` |
| Config | `config/`, `policies/`, `schemas/` |
| Tests | `tests/` (all test suites) |
| Docs | `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/` |

**Rules:**
- Each file belongs to exactly one zone
- Never have two agents editing the same file simultaneously

### Conflict Prevention
- Check which files other active plans target before starting (read `docs/plans/active/*.md`)
- If your scope overlaps with an active plan, coordinate or wait
- After completing work, run `npm run build && npm test` before marking the plan done

### Agent Teams Strategy
When `/dispatch` detects 2+ plans targeting this project with overlapping scope, it creates an Agent Team instead of parallel subagents. Custom agent definitions from `/Users/trey/Desktop/Apps/.claude/agents/` are available:
- `plan-executor` — Execute plan phases with testing and verification
- `test-writer` — Write tests without modifying source code
- `docs-agent` — Update documentation (CLAUDE.md, timeline, diagrams)
- `reviewer` — Read-only code review and quality gates (uses Sonnet)
