-- Fix the circular RLS check used when an owner creates a share.
-- Safe to run after supabase-sharing.sql. This does not modify Nebula data.
create or replace function public.is_nebula_owner(target_nebula_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nebulas n
    where n.id = target_nebula_id
      and n.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.is_nebula_owner(text) from public;
grant execute on function public.is_nebula_owner(text) to authenticated;

drop policy if exists "Owners create shares" on public.nebula_shares;
create policy "Owners create shares"
on public.nebula_shares
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and public.is_nebula_owner(nebula_id)
);
