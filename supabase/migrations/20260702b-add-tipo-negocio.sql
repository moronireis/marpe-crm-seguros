-- Migration: 2026-07-02b — Add missing tipo_negocio column to marpe_deals
-- The Fase 2 migration (20260701) planned this column but it was not included
-- in the executed statements. The Corp sync maps neg.tipo_neg → tipo_negocio
-- (e.g. "PROSPECÇÃO", "RENOVAÇÃO") and inserts fail without it.

ALTER TABLE public.marpe_deals ADD COLUMN IF NOT EXISTS tipo_negocio text;
