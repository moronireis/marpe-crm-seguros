-- =============================================
-- Migration: Deal Panel Expansion
-- Date: 2026-07-01
-- Purpose: Add notes, documents, and Corp-aligned fields to deals
-- =============================================

-- 1. New table: Deal Notes
CREATE TABLE IF NOT EXISTS public.marpe_deal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.marpe_deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.marpe_profiles(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_notes_deal ON public.marpe_deal_notes(deal_id, created_at DESC);

-- 2. New table: Deal Documents
CREATE TABLE IF NOT EXISTS public.marpe_deal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.marpe_deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.marpe_profiles(id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_documents_deal ON public.marpe_deal_documents(deal_id, created_at DESC);

-- 3. Add new columns to marpe_deals (Corp-aligned fields from Image #3)
ALTER TABLE public.marpe_deals
  ADD COLUMN IF NOT EXISTS campanha text,
  ADD COLUMN IF NOT EXISTS ja_possui_produto boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS seguradora_atual text,
  ADD COLUMN IF NOT EXISTS vigencia_atual_fim date,
  ADD COLUMN IF NOT EXISTS corretora_atual text,
  ADD COLUMN IF NOT EXISTS base_calculo_repasse numeric(12,2),
  ADD COLUMN IF NOT EXISTS pct_repasse numeric(5,2),
  ADD COLUMN IF NOT EXISTS valor_repasse numeric(12,2),
  ADD COLUMN IF NOT EXISTS agente text,
  ADD COLUMN IF NOT EXISTS observacoes_proposta text,
  ADD COLUMN IF NOT EXISTS detalhes_corp jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.marpe_profiles(id);

-- 4. Update deal_activities type constraint to include new activity types
-- First drop the existing constraint, then recreate with expanded values
ALTER TABLE public.marpe_deal_activities
  DROP CONSTRAINT IF EXISTS deal_activities_type_check;

ALTER TABLE public.marpe_deal_activities
  ADD CONSTRAINT deal_activities_type_check
  CHECK (type IN (
    'stage_change', 'note', 'message_sent', 'field_update',
    'assignment', 'creation', 'loss', 'automation',
    'document_upload', 'document_delete', 'note_added'
  ));

-- 5. Create storage bucket for deal documents (if not exists)
-- Note: bucket creation is done via Supabase API/SDK, not SQL.
-- The API endpoint handles this with: sb.storage.createBucket('marpe-deal-docs', ...)
