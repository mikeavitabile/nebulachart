-- Phase 3 realtime collaboration foundation. Run once in Supabase SQL Editor.
-- Adds optimistic revision checks and publishes Nebula changes to Realtime.

alter table public.nebulas
  add column if not exists revision bigint not null default 1;

create or replace function public.update_nebula_if_current(
  p_id text,
  p_expected_revision bigint,
  p_name text,
  p_state jsonb,
  p_updated_at timestamptz
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_revision bigint;
begin
  update public.nebulas
  set name = p_name,
      state = p_state,
      updated_at = p_updated_at,
      revision = revision + 1
  where id = p_id
    and revision = p_expected_revision
  returning revision into next_revision;

  return next_revision;
end;
$$;

revoke all on function public.update_nebula_if_current(text, bigint, text, jsonb, timestamptz) from public;
grant execute on function public.update_nebula_if_current(text, bigint, text, jsonb, timestamptz) to authenticated;
grant update (name, state, updated_at, revision) on public.nebulas to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'nebulas'
  ) then
    alter publication supabase_realtime add table public.nebulas;
  end if;
end $$;
