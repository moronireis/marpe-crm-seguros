-- Migration: producer goals table
-- Run this in Supabase SQL editor or via CLI

create table if not exists public.marpe_producer_goals (
  id uuid primary key default gen_random_uuid(),
  producer_name text not null,
  month integer not null check (month between 1 and 12),
  year integer not null,
  target_premio numeric(12,2) not null default 0,
  target_deals integer not null default 0,
  created_at timestamptz not null default now(),
  unique(producer_name, month, year)
);

-- RLS: same pattern as other marpe_ tables — allow authenticated service role
alter table public.marpe_producer_goals enable row level security;

-- Allow all operations for authenticated users (service role bypasses RLS anyway)
create policy "authenticated users can manage goals"
  on public.marpe_producer_goals
  for all
  using (true)
  with check (true);
