-- Private Presence rooms for Nebula collaborators. Run once in Supabase SQL Editor.

create or replace function public.can_access_nebula(target_nebula_id text)
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
      and (
        n.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.nebula_shares s
          where s.nebula_id = n.id
            and s.shared_with_email = lower((select auth.jwt()->>'email'))
        )
      )
  );
$$;

revoke all on function public.can_access_nebula(text) from public;
grant execute on function public.can_access_nebula(text) to authenticated;

drop policy if exists "Nebula members read presence" on realtime.messages;
create policy "Nebula members read presence"
on realtime.messages
for select
to authenticated
using (
  extension = 'presence'
  and split_part((select realtime.topic()), ':', 1) = 'nebula'
  and public.can_access_nebula(split_part((select realtime.topic()), ':', 2))
);

drop policy if exists "Nebula members publish presence" on realtime.messages;
create policy "Nebula members publish presence"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'presence'
  and split_part((select realtime.topic()), ':', 1) = 'nebula'
  and public.can_access_nebula(split_part((select realtime.topic()), ':', 2))
);
