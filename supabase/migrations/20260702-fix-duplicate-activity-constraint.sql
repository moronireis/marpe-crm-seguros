-- Migration: 2026-07-02 — Fix duplicate CHECK constraint on marpe_deal_activities.type
--
-- Problem (QA BUG-03): two CHECK constraints coexist on the `type` column:
--   1. marpe_deal_activities_type_check (original, from schema.sql) — allows only the 7 original types
--   2. deal_activities_type_check (added 2026-07-01) — allows the 7 original + Fase 2 types
-- Any INSERT with the new types (note_added, document_upload, document_delete, automation)
-- fails against the old constraint even though the new one permits it.
--
-- Fix: drop the old constraint. The expanded one (deal_activities_type_check) remains.

ALTER TABLE public.marpe_deal_activities
  DROP CONSTRAINT IF EXISTS marpe_deal_activities_type_check;

-- Verification: exactly one CHECK constraint should remain on the type column
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.marpe_deal_activities'::regclass
  AND contype = 'c';
