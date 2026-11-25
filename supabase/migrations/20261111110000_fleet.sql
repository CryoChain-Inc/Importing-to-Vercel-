-- fleet: the trucks CryoChain runs, how much each carries, and which driver has it.
-- Ops manage trucks from the dashboard; dispatch reads capacity_kg from here.
create table public.trucks (
  id uuid primary key default gen_random_uuid(),
  plate text not null check (plate = upper(btrim(plate)) and char_length(plate) between 2 and 20),
  name text not null default '' check (char_length(name) <= 60),
  capacity_kg numeric(8, 2) not null check (capacity_kg > 0 and capacity_kg <= 50000),
  driver_id uuid references public.drivers (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- A truck taken out of service cannot stay with a driver, or dispatch would load it.
  constraint trucks_inactive_unassigned check (active or driver_id is null)
);
create unique index trucks_plate_key on public.trucks (plate);
-- One truck per driver.
create unique index trucks_driver_key on public.trucks (driver_id) where driver_id is not null;

alter table public.trucks enable row level security;
revoke all on table public.trucks from anon, authenticated;
grant select, insert, update on public.trucks to authenticated;
-- No delete: a truck is retired by setting active = false, so past trips keep their truck.

create policy trucks_select_ops_or_driver on public.trucks for select to authenticated
  using ((select private.is_ops()) or driver_id = (select auth.uid()));
create policy trucks_insert_ops on public.trucks for insert to authenticated
  with check ((select private.is_ops()));
create policy trucks_update_ops on public.trucks for update to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

-- Start from the plates drivers already entered, at the current one-tonne capacity. Ops correct them in the dashboard.
insert into public.trucks (plate, name, capacity_kg, driver_id)
select distinct on (upper(btrim(d.plate_number)))
       upper(btrim(d.plate_number)), left(coalesce(btrim(d.vehicle_type), ''), 60), 1000, d.id
  from public.drivers d
 where char_length(btrim(coalesce(d.plate_number, ''))) between 2 and 20
 order by upper(btrim(d.plate_number)), d.created_at
on conflict do nothing;
