-- 2026-07-17 — Colunas do Sprint S3 (Inbox) em marpe_contacts:
--   inbox_read_at  → filtro "Não lidas" com leitura real (marca ao abrir a conversa;
--                    não lida = última msg inbound mais recente que inbox_read_at)
--   pinned         → favoritar conversa (fixa no topo da lista)
--   conv_status    → finalizar conversa ('open' | 'closed'; reabre em nova mensagem)

ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS inbox_read_at timestamptz;
ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.marpe_contacts ADD COLUMN IF NOT EXISTS conv_status text NOT NULL DEFAULT 'open';
