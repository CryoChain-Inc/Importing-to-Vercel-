-- Accounts created before the first script have no profile row.
-- The signup trigger only runs for accounts created after it.

insert into public.profiles (id, role, display_name, phone)
select
  u.id,
  case
    when (select count(*) from public.profiles) = 0
      and u.id = (select id from auth.users order by created_at asc limit 1)
    then 'ops'
    else 'pending'
  end,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email, 'user'), '@', 1)),
  u.phone
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  existing int;
begin
  select * into result from public.profiles where id = auth.uid();
  if found then
    return result;
  end if;

  perform pg_advisory_xact_lock(41012026);
  select count(*) into existing from public.profiles;
  insert into public.profiles (id, role, display_name, phone)
  select
    u.id,
    case when existing = 0 then 'ops' else 'pending' end,
    coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email, 'user'), '@', 1)),
    u.phone
  from auth.users u
  where u.id = auth.uid()
  returning * into result;
  return result;
end;
$$;

grant execute on function public.ensure_my_profile() to authenticated;

notify pgrst, 'reload schema';
