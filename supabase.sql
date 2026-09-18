-- Run in the Supabase SQL Editor. The browser uses only the publishable/anon key.
create table if not exists public.nebulas (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  state jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists nebulas_owner_updated_idx on public.nebulas (owner_id, updated_at desc);
alter table public.nebulas enable row level security;
create policy "Owners read their nebulas" on public.nebulas for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners create their nebulas" on public.nebulas for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owners edit their nebulas" on public.nebulas for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners delete their nebulas" on public.nebulas for delete to authenticated using ((select auth.uid()) = owner_id);
