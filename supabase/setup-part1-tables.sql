-- PART 1: Tables only (no functions, no triggers)

CREATE TABLE IF NOT EXISTS public.marpe_profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text NOT NULL, email text NOT NULL, phone text,
  role text NOT NULL DEFAULT 'operador' CHECK (role IN ('admin','operador')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.marpe_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text, sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, created_by uuid REFERENCES public.marpe_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marpe_funnel_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.marpe_funnels(id) ON DELETE CASCADE,
  name text NOT NULL, color text NOT NULL DEFAULT '#3B82F6', sort_order integer NOT NULL DEFAULT 0,
  is_terminal boolean NOT NULL DEFAULT false,
  terminal_type text CHECK (terminal_type IN ('won','lost') OR terminal_type IS NULL),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfs_funnel ON public.marpe_funnel_stages(funnel_id, sort_order);

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

CREATE TABLE IF NOT EXISTS public.marpe_deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.marpe_deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.marpe_profiles(id),
  type text NOT NULL CHECK (type IN ('stage_change','note','message_sent','field_update','assignment','creation','loss')),
  description text NOT NULL, metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mda_deal ON public.marpe_deal_activities(deal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marpe_whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE, label text NOT NULL,
  session_data jsonb, status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','qr_pending','error')),
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.marpe_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, category text DEFAULT 'geral', body text NOT NULL,
  variables text[] DEFAULT '{}', shortcut text,
  is_meta_template boolean DEFAULT false, meta_template_name text,
  created_by uuid REFERENCES public.marpe_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.marpe_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.marpe_automations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.marpe_deals(id), contact_id uuid REFERENCES public.marpe_contacts(id),
  status text NOT NULL CHECK (status IN ('success','failed','skipped')),
  error_message text, metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.marpe_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marpe_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.marpe_contacts(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','failed')),
  sent_at timestamptz, error_message text
);

CREATE TABLE IF NOT EXISTS public.marpe_corp_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL CHECK (sync_type IN ('contacts','policies','installments','full')),
  status text NOT NULL CHECK (status IN ('running','completed','failed')),
  records_created integer DEFAULT 0, records_updated integer DEFAULT 0, records_skipped integer DEFAULT 0,
  error_message text, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);

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

CREATE TABLE IF NOT EXISTS public.marpe_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.marpe_profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system', title text NOT NULL, body text NOT NULL,
  link text DEFAULT '', read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mn_user ON public.marpe_notifications(user_id, read, created_at DESC);

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

CREATE TABLE IF NOT EXISTS public.marpe_loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
