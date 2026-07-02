-- Migration: 20260625 — contact photo_url, message deal_id FK, marpe_status_options table
-- Applied: 2026-06-25
-- Author: data-engineer

-- 1. Add photo_url to marpe_contacts
ALTER TABLE marpe_contacts ADD COLUMN IF NOT EXISTS photo_url text;

-- 2. Add deal_id FK to marpe_messages
ALTER TABLE marpe_messages ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES marpe_deals(id) ON DELETE SET NULL;

-- 3. Index on marpe_messages.deal_id
CREATE INDEX IF NOT EXISTS idx_marpe_messages_deal_id ON marpe_messages(deal_id);

-- 4. New table: marpe_status_options
CREATE TABLE IF NOT EXISTS marpe_status_options (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#60A5FA',
  created_at timestamptz DEFAULT now()
);

-- DOWN (reference only — never run without orchestrator approval):
-- DROP TABLE IF EXISTS marpe_status_options;
-- ALTER TABLE marpe_messages DROP COLUMN IF EXISTS deal_id;
-- DROP INDEX IF EXISTS idx_marpe_messages_deal_id;
-- ALTER TABLE marpe_contacts DROP COLUMN IF EXISTS photo_url;
