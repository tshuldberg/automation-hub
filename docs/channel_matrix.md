# Unified Channel Matrix

This matrix defines how to consolidate communication and planning channels into one automation stream.

## Scope

- Email
- Calendar
- Apple Reminders
- Texts to self
- Texts from others
- Voice memos/transcripts (Superwhisper)

## Channel Status

| Channel | Current Integration Path | MCP Status | Provider Notes |
|---|---|---|---|
| Gmail/Outlook Email | Native connector tools or MCP server wrappers | Ready now | OpenAI lists email/calendar connectors; Claude supports MCP servers. |
| Google/Outlook Calendar | Native connector tools or MCP server wrappers | Ready now | Use free/busy + events for due-date planning. |
| Apple Reminders | Local bridge MCP via EventKit/Shortcuts | Ready with bridge | No standard cross-platform connector is assumed; run as local MCP adapter. |
| Texts to self / from others (iMessage/SMS) | Zapier bridge app or local Messages bridge MCP | Ready with bridge | Prefer third-party bridge with approval gating for outbound messages. |
| Superwhisper voice memos/transcripts | File-drop watcher + transcript ingestion MCP | Ready with bridge | Superwhisper supports file transcription and local history access. |
| ShipHawk context references | Read-only workspace context | Ready now | Use only for context and task grounding, not runtime dependency. |

## Recommended Adapters

- `adapter_email`:
  - OpenAI: connector-based or MCP wrapper.
  - Claude: MCP wrapper.
- `adapter_calendar`:
  - OpenAI/Claude: MCP wrapper with `list_events` + `list_free_busy`.
- `adapter_reminders_apple`:
  - Local MCP service on Mac that exposes reminders as tool calls.
- `adapter_messages_bridge`:
  - Primary: Zapier-compatible messaging bridge.
  - Fallback: local macOS bridge MCP.
- `adapter_superwhisper_ingest`:
  - Poll transcript/history folder and normalize entries into canonical notes/tasks.

## Data Contract

Normalize all channels into a shared event model:

- `event_id`
- `channel`
- `source_reference`
- `timestamp`
- `actor`
- `raw_text`
- `entities` (people, account, project, dates)
- `proposed_actions`
- `confidence`

Map proposed actions into `schemas/canonical_task.schema.json`.

## Operational Rules

- Every write action requires human approval.
- Every outbound message draft is stored before send.
- Deduplicate by `source_reference` + semantic fingerprint.
- Keep sync cursors per channel in `state/`.

## Superwhisper Notes

- Treat Superwhisper output as a transcript channel, not a task system.
- Ingest transcript files/history records, then classify into:
  - task candidate,
  - follow-up draft,
  - archive note.
- Preserve original transcript references in evidence.
