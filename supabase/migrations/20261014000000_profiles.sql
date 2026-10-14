-- One profile per auth user. Role is never taken from user metadata (clients can set that).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'pending'
    check (role in ('pending', 'farmer', 'buyer', 'agent', 'driver', 'ops')),
  display_name text,
  phone text,
  email text
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
-- No insert/update policies: writes go through the triggers and complete_onboarding().

create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone, email)
  values (new.id, nullif(new.phone, ''), new.email)
  on conflict (id) do update set phone = excluded.phone, email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_sync on auth.users;
create trigger on_auth_user_sync
  after insert or update of email, phone on auth.users
  for each row execute function public.handle_auth_user();

-- Self-service onboarding: pending -> farmer|buyer only. Staff roles are set in the dashboard.
create or replace function public.complete_onboarding(new_role text, new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new_role not in ('farmer', 'buyer') then
    raise exception 'invalid role';
  end if;
  update public.profiles
     set role = new_role, display_name = new_name
   where id = (select auth.uid()) and role = 'pending';
  if not found then
    raise exception 'already onboarded';
  end if;
end;
$$;

revoke all on function public.complete_onboarding(text, text) from public, anon;
grant execute on function public.complete_onboarding(text, text) to authenticated;

-- Backfill users that existed before this migration.
insert into public.profiles (id, phone, email)
select id, nullif(phone, ''), email from auth.users
on conflict (id) do nothing;
