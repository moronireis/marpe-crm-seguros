-- =============================================
-- MARPE CRM SEGUROS — RLS Policies
-- All authenticated users can read. Admin can write all. Operador can write own.
-- =============================================

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.funnels enable row level security;
alter table public.funnel_stages enable row level security;
alter table public.deals enable row level security;
alter table public.deal_activities enable row level security;
alter table public.whatsapp_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.templates enable row level security;
alter table public.automations enable row level security;
alter table public.automation_logs enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.corp_sync_log enable row level security;
alter table public.installments enable row level security;
alter table public.notifications enable row level security;
alter table public.tracked_links enable row level security;
alter table public.link_clicks enable row level security;
alter table public.loss_reasons enable row level security;

-- Profiles: read all, update own
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid());
create policy "profiles_admin_all" on public.profiles for all to authenticated using (is_admin());

-- Contacts: all authenticated can read + write (small team, no restrictions needed)
create policy "contacts_all" on public.contacts for all to authenticated using (true);

-- Funnels: all can read, admin creates/edits
create policy "funnels_select" on public.funnels for select to authenticated using (true);
create policy "funnels_admin" on public.funnels for all to authenticated using (is_admin());

-- Funnel stages: same as funnels
create policy "stages_select" on public.funnel_stages for select to authenticated using (true);
create policy "stages_admin" on public.funnel_stages for all to authenticated using (is_admin());

-- Deals: all can read + write (team collaboration)
create policy "deals_all" on public.deals for all to authenticated using (true);

-- Deal activities: all can read + insert
create policy "activities_all" on public.deal_activities for all to authenticated using (true);

-- WhatsApp sessions: all read, admin manages
create policy "wa_sessions_select" on public.whatsapp_sessions for select to authenticated using (true);
create policy "wa_sessions_admin" on public.whatsapp_sessions for all to authenticated using (is_admin());

-- Messages: all can read + insert
create policy "messages_all" on public.messages for all to authenticated using (true);

-- Templates: all read, all can create/edit
create policy "templates_all" on public.templates for all to authenticated using (true);

-- Automations: all read, admin manages
create policy "automations_select" on public.automations for select to authenticated using (true);
create policy "automations_admin" on public.automations for all to authenticated using (is_admin());

-- Automation logs: all read
create policy "auto_logs_select" on public.automation_logs for select to authenticated using (true);
create policy "auto_logs_insert" on public.automation_logs for insert to authenticated with check (true);

-- Campaigns: all read + write
create policy "campaigns_all" on public.campaigns for all to authenticated using (true);

-- Campaign recipients: all read + write
create policy "campaign_recipients_all" on public.campaign_recipients for all to authenticated using (true);

-- Corp sync log: all read, service role inserts
create policy "corp_sync_select" on public.corp_sync_log for select to authenticated using (true);

-- Installments: all read
create policy "installments_select" on public.installments for select to authenticated using (true);

-- Notifications: own only
create policy "notifications_own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications for update to authenticated using (user_id = auth.uid());

-- Tracked links: all read + write
create policy "links_all" on public.tracked_links for all to authenticated using (true);
create policy "clicks_all" on public.link_clicks for all to authenticated using (true);

-- Loss reasons: all read, admin manages
create policy "loss_reasons_select" on public.loss_reasons for select to authenticated using (true);
create policy "loss_reasons_admin" on public.loss_reasons for all to authenticated using (is_admin());
