-- Phase 2 sharing migration. Run once in Supabase SQL Editor.
alter table public.nebulas add column if not exists owner_email text;
update public.nebulas n set owner_email = lower(u.email) from auth.users u where n.owner_id = u.id and n.owner_email is null;
create table if not exists public.nebula_shares (
  id uuid primary key default gen_random_uuid(), nebula_id text not null references public.nebulas(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, shared_with_email text not null,
  permission text not null check (permission in ('view','edit')), created_at timestamptz not null default now(),
  unique (nebula_id, shared_with_email)
);
create index if not exists nebula_shares_email_idx on public.nebula_shares (shared_with_email);
alter table public.nebula_shares enable row level security;
drop policy if exists "Owners read their nebulas" on public.nebulas;
drop policy if exists "Owners create their nebulas" on public.nebulas;
drop policy if exists "Owners edit their nebulas" on public.nebulas;
drop policy if exists "Owners delete their nebulas" on public.nebulas;
drop policy if exists "Members read nebulas" on public.nebulas;
drop policy if exists "Owners create nebulas" on public.nebulas;
drop policy if exists "Members edit nebulas" on public.nebulas;
drop policy if exists "Owners delete nebulas" on public.nebulas;
create policy "Members read nebulas" on public.nebulas for select to authenticated using (owner_id = (select auth.uid()) or exists (select 1 from public.nebula_shares s where s.nebula_id = nebulas.id and s.shared_with_email = lower((select auth.jwt()->>'email'))));
create policy "Owners create nebulas" on public.nebulas for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Members edit nebulas" on public.nebulas for update to authenticated using (owner_id = (select auth.uid()) or exists (select 1 from public.nebula_shares s where s.nebula_id = nebulas.id and s.shared_with_email = lower((select auth.jwt()->>'email')) and s.permission = 'edit')) with check (owner_id = (select auth.uid()) or exists (select 1 from public.nebula_shares s where s.nebula_id = nebulas.id and s.shared_with_email = lower((select auth.jwt()->>'email')) and s.permission = 'edit'));
create policy "Owners delete nebulas" on public.nebulas for delete to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "Share participants read shares" on public.nebula_shares;
drop policy if exists "Owners create shares" on public.nebula_shares;
drop policy if exists "Owners update shares" on public.nebula_shares;
drop policy if exists "Owners delete shares" on public.nebula_shares;
create policy "Share participants read shares" on public.nebula_shares for select to authenticated using (owner_id = (select auth.uid()) or shared_with_email = lower((select auth.jwt()->>'email')));
create policy "Owners create shares" on public.nebula_shares for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.nebulas n where n.id = nebula_id and n.owner_id = (select auth.uid())));
create policy "Owners update shares" on public.nebula_shares for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete shares" on public.nebula_shares for delete to authenticated using (owner_id = (select auth.uid()));
revoke update on public.nebulas from authenticated;
grant update (name, state, updated_at) on public.nebulas to authenticated;
grant select, insert, delete on public.nebulas to authenticated;
grant select, insert, update, delete on public.nebula_shares to authenticated;
