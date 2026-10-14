-- Staff (agent / driver / ops) are invited by ops through the invite-staff edge function, which creates the
-- auth user with the service role and then calls provision_staff(). Clients never set roles.

alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table public.agents (
  id uuid primary key references public.profiles (id) on delete cascade,
  coverage_area text,
  created_at timestamptz not null default now(),
  constraint agents_coverage_len check (coverage_area is null or char_length(coverage_area) <= 120)
);

create table public.drivers (
  id uuid primary key references public.profiles (id) on delete cascade,
  vehicle_type text,
  plate_number text,
  licence_number text,
  created_at timestamptz not null default now(),
  constraint drivers_vehicle_len check (vehicle_type is null or char_length(vehicle_type) <= 60),
  constraint drivers_plate_len check (plate_number is null or char_length(plate_number) <= 20),
  constraint drivers_licence_len check (licence_number is null or char_length(licence_number) <= 40)
);

alter table public.agents enable row level security;
alter table public.drivers enable row level security;

revoke all on table public.agents, public.drivers from anon, authenticated;
grant select on public.agents, public.drivers to authenticated;
grant update (coverage_area) on public.agents to authenticated;
grant update (vehicle_type, plate_number, licence_number) on public.drivers to authenticated;

create policy agents_select_own_or_ops on public.agents for select to authenticated
  using (id = (select auth.uid()) or (select private.is_ops()));
create policy agents_update_own on public.agents for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy drivers_select_own_or_ops on public.drivers for select to authenticated
  using (id = (select auth.uid()) or (select private.is_ops()));
create policy drivers_update_own on public.drivers for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Called only by the edge function (service role): sets the role on the freshly created profile
-- and creates the matching detail row, atomically. Only still-pending profiles can be provisioned.
create or replace function public.provision_staff(p_id uuid, p_role text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role not in ('agent', 'driver', 'ops') then
    raise exception 'invalid staff role';
  end if;
  update public.profiles set role = p_role, display_name = btrim(p_name) where id = p_id and role = 'pending';
  if not found then
    raise exception 'profile not pending';
  end if;
  if p_role = 'agent' then
    insert into public.agents (id) values (p_id);
  elsif p_role = 'driver' then
    insert into public.drivers (id) values (p_id);
  end if;
end;
$$;

revoke all on function public.provision_staff(uuid, text, text) from public, anon, authenticated;
grant execute on function public.provision_staff(uuid, text, text) to service_role;
