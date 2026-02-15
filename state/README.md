# State Directory

Use this directory for persistent automation state.

Recommended files:

- `email_cursor.json`: Gmail historyId or Outlook deltaLink.
- `calendar_cursor.json`: calendar sync token or deltaLink.
- `pm_mapping.json`: external refs to PM task IDs.
- `last_runs.json`: last successful job runs.

This data is runtime state and should stay outside `shiphawk-dev`.
