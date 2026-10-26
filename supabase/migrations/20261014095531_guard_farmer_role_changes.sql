-- Allow pending profiles to become farmer or buyer, and block any later role change.
-- A pending profile with bank details is promoted to farmer.

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id := old.id;
  new.email := old.email;

  if old.role <> 'pending' then
    new.role := old.role;
  elsif new.role is distinct from old.role and new.role not in ('farmer', 'buyer') then
    new.role := old.role;
  end if;

  if new.role = 'pending'
     and nullif(btrim(new.display_name), '') is not null
     and nullif(btrim(new.address), '') is not null
     and nullif(btrim(new.bank_name), '') is not null
     and nullif(btrim(new.account_holder), '') is not null
     and new.account_number is not null
  then
    new.role := 'farmer';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.handle_auth_user() from public, anon, authenticated;
