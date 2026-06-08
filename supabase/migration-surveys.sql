-- migration-surveys.sql
-- Satisfaction survey tracking for Marpe CRM
-- Run this against the Supabase project after the base schema is applied.

create table if not exists public.marpe_surveys (
  id            uuid        primary key default gen_random_uuid(),
  contact_id    uuid        not null references public.marpe_contacts(id) on delete cascade,
  deal_id       uuid        references public.marpe_deals(id) on delete set null,
  automation_id uuid        references public.marpe_automations(id) on delete set null,
  question      text        not null,
  rating        integer     check (rating between 1 and 5),
  status        text        not null default 'pending'
                            check (status in ('pending', 'completed', 'expired')),
  sent_at       timestamptz not null default now(),
  responded_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Fast lookup: find pending surveys for a contact when a new inbound message arrives
create index if not exists idx_marpe_surveys_contact_pending
  on public.marpe_surveys (contact_id)
  where status = 'pending';

-- Allow the anon/service role key used by the server client to read and write
alter table public.marpe_surveys enable row level security;

create policy "service can manage surveys"
  on public.marpe_surveys
  for all
  using (true)
  with check (true);
