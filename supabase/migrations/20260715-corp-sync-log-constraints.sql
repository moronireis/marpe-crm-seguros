-- 2026-07-15 — Corrige marpe_corp_sync_log: as CHECK constraints originais
-- (sync_type in contacts/policies/installments/full; status in running/completed/failed)
-- rejeitavam os valores que o código sempre usou ('negocios', 'documents', 'success',
-- 'partial') — TODO insert de log falhava silenciosamente e a tabela ficou vazia
-- desde o início. Removemos as CHECKs (valores são controlados só pelo servidor);
-- novos tipos do checkpoint 15/07: 'negocios_day', 'negocios_reconcile'.

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.marpe_corp_sync_log'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.marpe_corp_sync_log DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
