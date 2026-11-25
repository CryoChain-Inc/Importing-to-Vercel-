-- Ops can correct a team member's name and, for drivers, licence number. Vehicle and plate come from the assigned truck (Fleet). Phone and email are the
-- sign-in identity (auth.users), so they are not editable here.
create function public.ops_update_staff(
  p_id uuid, p_name text, p_licence text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
begin
  if not (select private.is_ops()) then
    raise exception 'not allowed';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 60 then
    raise exception 'name must be 2 to 60 characters';
  end if;
  select role into r from public.profiles where id = p_id and role in ('driver', 'ops');
  if r is null then
    raise exception 'team member not found';
  end if;
  update public.profiles set display_name = btrim(p_name) where id = p_id;
  if r = 'driver' then
    update public.drivers
      set licence_number = nullif(upper(btrim(coalesce(p_licence, ''))), '')
      where id = p_id;
  end if;
end;
$$;
revoke all on function public.ops_update_staff(uuid, text, text) from public, anon;
grant execute on function public.ops_update_staff(uuid, text, text) to authenticated;
