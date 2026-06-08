-- =============================================
-- MARPE CRM SEGUROS — Database Schema
-- 17 tables + triggers + indexes
-- =============================================

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language plpgsql security definer stable;

-- =============================================
-- 1. PROFILES (extends auth.users)
-- =============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  email text not null,
  phone text,
  role text not null default 'operador' check (role in ('admin', 'operador')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- 2. CONTACTS (insurance clients)
-- =============================================
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cpf_cnpj text,
  email text,
  phone text,
  phone_secondary text,
  address text,
  city text,
  state text default 'RS',
  birth_date date,
  profession text,
  marital_status text,
  corp_id text,
  tags text[] default '{}',
  notes text,
  responsible_id uuid references public.profiles(id),
  source text default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_contacts_phone on public.contacts(phone);
create index idx_contacts_corp_id on public.contacts(corp_id);
create index idx_contacts_responsible on public.contacts(responsible_id);
create index idx_contacts_name on public.contacts using gin(to_tsvector('portuguese', name));

-- =============================================
-- 3. FUNNELS (customizable pipelines)
-- =============================================
create table public.funnels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- 4. FUNNEL STAGES (kanban columns)
-- =============================================
create table public.funnel_stages (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  name text not null,
  color text not null default '#3B82F6',
  sort_order integer not null default 0,
  is_terminal boolean not null default false,
  terminal_type text check (terminal_type in ('won', 'lost') or terminal_type is null),
  created_at timestamptz not null default now()
);

create index idx_stages_funnel on public.funnel_stages(funnel_id, sort_order);

-- =============================================
-- 5. DEALS (insurance negotiations)
-- =============================================
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  funnel_id uuid not null references public.funnels(id),
  stage_id uuid not null references public.funnel_stages(id),
  title text not null,
  ramo text,
  seguradora text,
  apolice text,
  premio numeric(12,2),
  comissao_pct numeric(5,2),
  comissao_valor numeric(12,2),
  produtor text,
  vigencia_inicio date,
  vigencia_fim date,
  veiculo text,
  placa text,
  status_custom text,
  status_color text,
  responsible_id uuid references public.profiles(id),
  loss_reason text,
  next_action text,
  next_action_date date,
  corp_id text,
  deal_type text default 'prospeccao' check (deal_type in ('prospeccao', 'renovacao', 'resgate', 'venda_cruzada', 'endosso')),
  last_activity timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_deals_contact on public.deals(contact_id);
create index idx_deals_funnel_stage on public.deals(funnel_id, stage_id);
create index idx_deals_responsible on public.deals(responsible_id);
create index idx_deals_vigencia on public.deals(vigencia_fim);
create index idx_deals_corp_id on public.deals(corp_id);
create index idx_deals_next_action on public.deals(next_action_date);

-- =============================================
-- 6. DEAL ACTIVITIES (audit log)
-- =============================================
create table public.deal_activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid references public.profiles(id),
  type text not null check (type in ('stage_change', 'note', 'message_sent', 'field_update', 'assignment', 'creation', 'loss')),
  description text not null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_activities_deal on public.deal_activities(deal_id, created_at desc);

-- =============================================
-- 7. WHATSAPP SESSIONS
-- =============================================
create table public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  label text not null,
  session_data jsonb,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'qr_pending', 'error')),
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- 8. MESSAGES (WhatsApp history)
-- =============================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  whatsapp_session_id uuid references public.whatsapp_sessions(id),
  wa_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  content_type text not null default 'text' check (content_type in ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'template')),
  body text,
  media_url text,
  media_mime text,
  template_name text,
  status text default 'sent' check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  sent_by uuid references public.profiles(id),
  is_from_automation boolean default false,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_messages_contact on public.messages(contact_id, created_at desc);
create index idx_messages_wa_id on public.messages(wa_message_id);

-- =============================================
-- 9. QUICK REPLY TEMPLATES
-- =============================================
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'geral',
  body text not null,
  variables text[] default '{}',
  shortcut text,
  is_meta_template boolean default false,
  meta_template_name text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- 10. AUTOMATIONS
-- =============================================
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  trigger_type text not null check (trigger_type in (
    'stage_change', 'date_field', 'corp_sync', 'new_contact', 'tag_added', 'manual'
  )),
  trigger_config jsonb not null default '{}',
  action_type text not null check (action_type in (
    'send_whatsapp', 'move_deal', 'notify_user', 'assign_user', 'add_tag', 'create_deal'
  )),
  action_config jsonb not null default '{}',
  created_by uuid references public.profiles(id),
  execution_count integer not null default 0,
  last_executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- 11. AUTOMATION LOGS
-- =============================================
create table public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  deal_id uuid references public.deals(id),
  contact_id uuid references public.contacts(id),
  status text not null check (status in ('success', 'failed', 'skipped')),
  error_message text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_auto_logs on public.automation_logs(automation_id, created_at desc);

-- =============================================
-- 12. CAMPAIGNS (mass messaging)
-- =============================================
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid references public.templates(id),
  segment_filter jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  sent_count integer default 0,
  delivered_count integer default 0,
  read_count integer default 0,
  failed_count integer default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================
-- 13. CAMPAIGN RECIPIENTS
-- =============================================
create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  sent_at timestamptz,
  error_message text
);

create index idx_campaign_recipients on public.campaign_recipients(campaign_id);

-- =============================================
-- 14. CORP SYNC LOG
-- =============================================
create table public.corp_sync_log (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null check (sync_type in ('contacts', 'policies', 'installments', 'full')),
  status text not null check (status in ('running', 'completed', 'failed')),
  records_created integer default 0,
  records_updated integer default 0,
  records_skipped integer default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- =============================================
-- 15. INSTALLMENTS (from Corp sync)
-- =============================================
create table public.installments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  corp_id text,
  installment_number integer not null,
  total_installments integer,
  amount numeric(12,2) not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_installments_due on public.installments(due_date, status);
create index idx_installments_contact on public.installments(contact_id);

-- =============================================
-- 16. NOTIFICATIONS (in-app)
-- =============================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  body text not null,
  link text default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on public.notifications(user_id, read, created_at desc);

-- =============================================
-- 17. LINK TRACKING
-- =============================================
create table public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  original_url text not null,
  slug text not null unique,
  source text,
  funnel_id uuid references public.funnels(id),
  click_count integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.link_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.tracked_links(id) on delete cascade,
  contact_id uuid references public.contacts(id),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_link_clicks on public.link_clicks(link_id, created_at desc);

-- =============================================
-- LOSS REASONS (configurable)
-- =============================================
create table public.loss_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =============================================
-- AUTO-UPDATE updated_at TRIGGER
-- =============================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated before update on public.profiles for each row execute function update_updated_at();
create trigger trg_contacts_updated before update on public.contacts for each row execute function update_updated_at();
create trigger trg_funnels_updated before update on public.funnels for each row execute function update_updated_at();
create trigger trg_deals_updated before update on public.deals for each row execute function update_updated_at();
create trigger trg_whatsapp_sessions_updated before update on public.whatsapp_sessions for each row execute function update_updated_at();
create trigger trg_templates_updated before update on public.templates for each row execute function update_updated_at();
create trigger trg_automations_updated before update on public.automations for each row execute function update_updated_at();
create trigger trg_campaigns_updated before update on public.campaigns for each row execute function update_updated_at();
create trigger trg_installments_updated before update on public.installments for each row execute function update_updated_at();
