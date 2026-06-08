-- migration-chatbot.sql
-- Chatbot de primeiro atendimento — persistent toggle and rate-limit tracking
-- Run this against the Supabase project after the base schema is applied.

-- Key-value settings store (generic, reusable for future toggles)
create table if not exists public.marpe_settings (
  key         text        primary key,
  value       jsonb       not null default '{}',
  updated_at  timestamptz not null default now()
);

alter table public.marpe_settings enable row level security;

create policy "service can manage settings"
  on public.marpe_settings
  for all
  using (true)
  with check (true);

-- Seed the chatbot toggle as ON by default
insert into public.marpe_settings (key, value)
values ('chatbot', '{"enabled": true}')
on conflict (key) do nothing;
