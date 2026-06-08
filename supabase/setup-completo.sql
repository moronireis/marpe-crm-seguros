-- =============================================
-- MARPE CRM SEGUROS — Setup Completo
-- Cole no Supabase Studio > SQL Editor > Run
-- =============================================

-- Helpers
CREATE OR REPLACE FUNCTION public.marpe_is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.marpe_profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.marpe_update_updated_at()
RETURNS trigger AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.marpe_profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text NOT NULL, email text NOT NULL, phone text,
  role text NOT NULL DEFAULT 'operador' CHECK (role IN ('admin','operador')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_mp_upd BEFORE UPDATE ON public.marpe_profiles FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

CREATE OR REPLACE FUNCTION public.marpe_handle_new_user()
RETURNS trigger AS $$
BEGIN INSERT INTO public.marpe_profiles (id, full_name, email) VALUES (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email); RETURN new; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS marpe_on_auth_user_created ON auth.users;
CREATE TRIGGER marpe_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.marpe_handle_new_user();

-- 2. CONTACTS
CREATE TABLE IF NOT EXISTS public.marpe_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, cpf_cnpj text, email text, phone text, phone_secondary text,
  address text, city text, state text DEFAULT 'RS', birth_date date, profession text, marital_status text,
  corp_id text, tags text[] DEFAULT '{}', notes text,
  responsible_id uuid REFERENCES public.marpe_profiles(id), source text DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mc_phone ON public.marpe_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_mc_corp ON public.marpe_contacts(corp_id);
CREATE TRIGGER trg_mc_upd BEFORE UPDATE ON public.marpe_contacts FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

-- 3. FUNNELS
CREATE TABLE IF NOT EXISTS public.marpe_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text, sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, created_by uuid REFERENCES public.marpe_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_mf_upd BEFORE UPDATE ON public.marpe_funnels FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

-- 4. FUNNEL STAGES
CREATE TABLE IF NOT EXISTS public.marpe_funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.marpe_funnels(id) ON DELETE CASCADE,
  name text NOT NULL, color text NOT NULL DEFAULT '#3B82F6', sort_order integer NOT NULL DEFAULT 0,
  is_terminal boolean NOT NULL DEFAULT false,
  terminal_type text CHECK (terminal_type IN ('won','lost') OR terminal_type IS NULL),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfs_funnel ON public.marpe_funnel_stages(funnel_id, sort_order);

-- 5. DEALS
CREATE TABLE IF NOT EXISTS public.marpe_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marpe_contacts(id) ON DELETE CASCADE,
  funnel_id uuid NOT NULL REFERENCES public.marpe_funnels(id),
  stage_id uuid NOT NULL REFERENCES public.marpe_funnel_stages(id),
  title text NOT NULL, ramo text, seguradora text, apolice text,
  premio numeric(12,2), comissao_pct numeric(5,2), comissao_valor numeric(12,2),
  produtor text, vigencia_inicio date, vigencia_fim date, veiculo text, placa text,
  status_custom text, status_color text,
  responsible_id uuid REFERENCES public.marpe_profiles(id),
  loss_reason text, next_action text, next_action_date date, corp_id text,
  deal_type text DEFAULT 'prospeccao' CHECK (deal_type IN ('prospeccao','renovacao','resgate','venda_cruzada','endosso')),
  last_activity timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_md_contact ON public.marpe_deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_md_funnel ON public.marpe_deals(funnel_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_md_resp ON public.marpe_deals(responsible_id);
CREATE INDEX IF NOT EXISTS idx_md_vig ON public.marpe_deals(vigencia_fim);
CREATE TRIGGER trg_md_upd BEFORE UPDATE ON public.marpe_deals FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

-- 6. DEAL ACTIVITIES
CREATE TABLE IF NOT EXISTS public.marpe_deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.marpe_deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.marpe_profiles(id),
  type text NOT NULL CHECK (type IN ('stage_change','note','message_sent','field_update','assignment','creation','loss')),
  description text NOT NULL, metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mda_deal ON public.marpe_deal_activities(deal_id, created_at DESC);

-- 7. WHATSAPP SESSIONS
CREATE TABLE IF NOT EXISTS public.marpe_whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE, label text NOT NULL,
  session_data jsonb, status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','qr_pending','error')),
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_mws_upd BEFORE UPDATE ON public.marpe_whatsapp_sessions FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

-- 8. MESSAGES
CREATE TABLE IF NOT EXISTS public.marpe_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.marpe_contacts(id) ON DELETE CASCADE,
  whatsapp_session_id uuid REFERENCES public.marpe_whatsapp_sessions(id),
  wa_message_id text, direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  content_type text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','image','audio','video','document','sticker','location','template')),
  body text, media_url text, media_mime text, template_name text,
  status text DEFAULT 'sent' CHECK (status IN ('pending','sent','delivered','read','failed')),
  sent_by uuid REFERENCES public.marpe_profiles(id), is_from_automation boolean DEFAULT false, metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mm_contact ON public.marpe_messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mm_waid ON public.marpe_messages(wa_message_id);

-- 9. TEMPLATES
CREATE TABLE IF NOT EXISTS public.marpe_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, category text DEFAULT 'geral', body text NOT NULL,
  variables text[] DEFAULT '{}', shortcut text,
  is_meta_template boolean DEFAULT false, meta_template_name text,
  created_by uuid REFERENCES public.marpe_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_mt_upd BEFORE UPDATE ON public.marpe_templates FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

-- 10. AUTOMATIONS
CREATE TABLE IF NOT EXISTS public.marpe_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text, is_active boolean NOT NULL DEFAULT true,
  trigger_type text NOT NULL CHECK (trigger_type IN ('stage_change','date_field','corp_sync','new_contact','tag_added','manual')),
  trigger_config jsonb NOT NULL DEFAULT '{}',
  action_type text NOT NULL CHECK (action_type IN ('send_whatsapp','move_deal','notify_user','assign_user','add_tag','create_deal')),
  action_config jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.marpe_profiles(id),
  execution_count integer NOT NULL DEFAULT 0, last_executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_ma_upd BEFORE UPDATE ON public.marpe_automations FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

-- 11. AUTOMATION LOGS
CREATE TABLE IF NOT EXISTS public.marpe_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.marpe_automations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.marpe_deals(id), contact_id uuid REFERENCES public.marpe_contacts(id),
  status text NOT NULL CHECK (status IN ('success','failed','skipped')),
  error_message text, metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. CAMPAIGNS
CREATE TABLE IF NOT EXISTS public.marpe_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, template_id uuid REFERENCES public.marpe_templates(id),
  segment_filter jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','completed','cancelled')),
  scheduled_at timestamptz, sent_count integer DEFAULT 0, delivered_count integer DEFAULT 0,
  read_count integer DEFAULT 0, failed_count integer DEFAULT 0,
  created_by uuid REFERENCES public.marpe_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_mcmp_upd BEFORE UPDATE ON public.marpe_campaigns FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

-- 13. CAMPAIGN RECIPIENTS
CREATE TABLE IF NOT EXISTS public.marpe_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marpe_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.marpe_contacts(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','failed')),
  sent_at timestamptz, error_message text
);

-- 14. CORP SYNC LOG
CREATE TABLE IF NOT EXISTS public.marpe_corp_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL CHECK (sync_type IN ('contacts','policies','installments','full')),
  status text NOT NULL CHECK (status IN ('running','completed','failed')),
  records_created integer DEFAULT 0, records_updated integer DEFAULT 0, records_skipped integer DEFAULT 0,
  error_message text, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);

-- 15. INSTALLMENTS
CREATE TABLE IF NOT EXISTS public.marpe_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.marpe_deals(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.marpe_contacts(id),
  corp_id text, installment_number integer NOT NULL, total_installments integer,
  amount numeric(12,2) NOT NULL, due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  reminder_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mi_due ON public.marpe_installments(due_date, status);
CREATE TRIGGER trg_mi_upd BEFORE UPDATE ON public.marpe_installments FOR EACH ROW EXECUTE FUNCTION marpe_update_updated_at();

-- 16. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.marpe_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.marpe_profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system', title text NOT NULL, body text NOT NULL,
  link text DEFAULT '', read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mn_user ON public.marpe_notifications(user_id, read, created_at DESC);

-- 17. LINK TRACKING
CREATE TABLE IF NOT EXISTS public.marpe_tracked_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, original_url text NOT NULL, slug text NOT NULL UNIQUE, source text,
  funnel_id uuid REFERENCES public.marpe_funnels(id), click_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.marpe_profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.marpe_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.marpe_tracked_links(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marpe_contacts(id),
  ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now()
);

-- 18. LOSS REASONS
CREATE TABLE IF NOT EXISTS public.marpe_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- SEED: Funnels + Stages
-- =============================================
INSERT INTO public.marpe_funnels (id, name, description, sort_order) VALUES
  ('00000000-0000-0000-0001-000000000001', 'Vendas', 'Prospecção até emissão', 1),
  ('00000000-0000-0000-0001-000000000002', 'Renovações', 'Contratos vencendo', 2),
  ('00000000-0000-0000-0001-000000000003', 'Sinistros', 'Acompanhamento de sinistros', 3),
  ('00000000-0000-0000-0001-000000000004', 'Assistência 24h', 'Guincho e emergências', 4);

INSERT INTO public.marpe_funnel_stages (funnel_id, name, color, sort_order, is_terminal, terminal_type) VALUES
  ('00000000-0000-0000-0001-000000000001','Prospecção','#3B82F6',1,false,null),
  ('00000000-0000-0000-0001-000000000001','Cotação Enviada','#F59E0B',2,false,null),
  ('00000000-0000-0000-0001-000000000001','Aguardando Retorno','#8B5CF6',3,false,null),
  ('00000000-0000-0000-0001-000000000001','Proposta Transmitida','#06B6D4',4,false,null),
  ('00000000-0000-0000-0001-000000000001','Aguardando Emissão','#F97316',5,false,null),
  ('00000000-0000-0000-0001-000000000001','Emitido','#22C55E',6,true,'won'),
  ('00000000-0000-0000-0001-000000000001','Perdido','#EF4444',7,true,'lost'),
  ('00000000-0000-0000-0001-000000000002','60 dias','#F59E0B',1,false,null),
  ('00000000-0000-0000-0001-000000000002','30 dias','#EF4444',2,false,null),
  ('00000000-0000-0000-0001-000000000002','Contato Realizado','#3B82F6',3,false,null),
  ('00000000-0000-0000-0001-000000000002','Cotação Enviada','#8B5CF6',4,false,null),
  ('00000000-0000-0000-0001-000000000002','Renovado','#22C55E',5,true,'won'),
  ('00000000-0000-0000-0001-000000000002','Cancelado','#6B7280',6,true,'lost'),
  ('00000000-0000-0000-0001-000000000003','Pendente','#F59E0B',1,false,null),
  ('00000000-0000-0000-0001-000000000003','Aberto','#EF4444',2,false,null),
  ('00000000-0000-0000-0001-000000000003','Em Andamento','#3B82F6',3,false,null),
  ('00000000-0000-0000-0001-000000000003','Autorizado','#06B6D4',4,false,null),
  ('00000000-0000-0000-0001-000000000003','Concluído','#22C55E',5,true,'won'),
  ('00000000-0000-0000-0001-000000000004','Assistência Aberta','#EF4444',1,false,null),
  ('00000000-0000-0000-0001-000000000004','Prestador Acionado','#F59E0B',2,false,null),
  ('00000000-0000-0000-0001-000000000004','Prestador Chegou','#06B6D4',3,false,null),
  ('00000000-0000-0000-0001-000000000004','Finalizada','#22C55E',4,true,'won');

-- SEED: Loss Reasons
INSERT INTO public.marpe_loss_reasons (label, sort_order) VALUES
  ('Sem aceitação do risco',1),('Sem interesse',2),('Sem dinheiro',3),
  ('Sem contato (não responde)',4),('Renovou com outra corretora',5),
  ('Vendeu o veículo/imóvel',6),('Sem perfil',7),('Outro',8);

-- SEED: Templates
INSERT INTO public.marpe_templates (name, category, body, variables) VALUES
  ('Cotação pronta','comercial','#periodo_dia, #primeiro_nome! Sua cotação já está pronta. Posso enviar os detalhes agora?','{primeiro_nome,periodo_dia}'),
  ('Proposta transmitida','comercial','#periodo_dia, #primeiro_nome! Sua proposta de seguro #ramo foi transmitida com sucesso para a #seguradora. Assim que a pólice for emitida, te aviso.','{primeiro_nome,periodo_dia,ramo,seguradora}'),
  ('Boas-vindas','pos-venda','#periodo_dia, #primeiro_nome! Seja bem-vindo à Marpe Corretora de Seguros! Sua pólice #apolice já foi emitida. Assistência 24h: 0800-XXX-XXXX | Marpe: (55) 99912-0001.','{primeiro_nome,periodo_dia,apolice}'),
  ('Aviso de parcela','cobranca','#periodo_dia, #primeiro_nome! Lembrete: sua parcela do seguro #ramo vence em #vencimento, no valor de R$ #valor.','{primeiro_nome,periodo_dia,ramo,vencimento,valor}'),
  ('Guincho acionado','assistencia','#periodo_dia, #primeiro_nome! Seu guincho foi acionado. Previsão: ~40 min. Protocolo: #protocolo.','{primeiro_nome,periodo_dia,protocolo}'),
  ('Prestador a caminho','assistencia','#primeiro_nome, o prestador já foi acionado e está a caminho. Protocolo: #protocolo.','{primeiro_nome,protocolo}'),
  ('Serviço agendado','assistencia','#periodo_dia, #primeiro_nome! Serviço agendado. Oficina: #oficina. Franquia: R$ #franquia. Protocolo: #protocolo.','{primeiro_nome,periodo_dia,oficina,franquia,protocolo}'),
  ('Pesquisa satisfação','pos-venda','#periodo_dia, #primeiro_nome! Atendimento finalizado (protocolo #protocolo). De 1 a 10, como avalia nosso atendimento?','{primeiro_nome,periodo_dia,protocolo}'),
  ('Follow-up','comercial','#periodo_dia, #primeiro_nome! Dando continuidade ao contato sobre o seguro #ramo. Posso ajudar com alguma dúvida?','{primeiro_nome,periodo_dia,ramo}'),
  ('Aviso renovação','renovacao','#periodo_dia, #primeiro_nome! Seu seguro #ramo com a #seguradora vence em #vencimento. Vamos renovar?','{primeiro_nome,periodo_dia,ramo,seguradora,vencimento}');

-- =============================================
-- ADMIN USER: Admin / Admin
-- Run this AFTER the tables are created.
-- Creates auth user + sets role to admin.
-- =============================================
-- Step 1: Create user via Supabase Auth (go to Authentication > Users > Add User)
--   Email: admin@marpe.com.br
--   Password: Admin
-- Step 2: After user is created, run:
-- UPDATE public.marpe_profiles SET role = 'admin', full_name = 'Admin' WHERE email = 'admin@marpe.com.br';
