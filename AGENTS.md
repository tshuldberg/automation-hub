# Automation hub

- External replies are drafts presented for approval, never automatically sent to external recipients.
- Preserve job approval gates and dry-run blocking of writes. Existing configured self/internal notification exceptions remain allowed.
- iMessage is one-way outbound notifications only; do not process incoming iMessages.
- Preserve channel/task state boundaries and use existing adapters. Commands and setup belong in package.json and README.md.
