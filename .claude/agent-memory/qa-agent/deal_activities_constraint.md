---
name: Duplicate CHECK Constraint on marpe_deal_activities.type
description: Two simultaneous CHECK constraints — old one blocks Fase 2 activity types (note_added, document_upload, document_delete, automation)
type: project
---

As of 2026-07-01, `marpe_deal_activities` has TWO conflicting CHECK constraints on the `type` column:

- `deal_activities_type_check` (new): allows stage_change, note, message_sent, field_update, assignment, creation, loss, automation, document_upload, document_delete, note_added
- `marpe_deal_activities_type_check` (old): allows ONLY stage_change, note, message_sent, field_update, assignment, creation, loss

**Why:** The old constraint was never dropped when the new one was added for Fase 2.

**How to apply:** Any insert into marpe_deal_activities with type in {note_added, document_upload, document_delete, automation} will fail with constraint violation even after the .catch() bug is fixed. The data-engineer must run:
```sql
ALTER TABLE marpe_deal_activities DROP CONSTRAINT IF EXISTS marpe_deal_activities_type_check;
```
before activity logging will work end-to-end.

Verify with: `SELECT conname FROM pg_constraint WHERE conrelid = 'marpe_deal_activities'::regclass AND contype = 'c';`
