-- Cold-truck bookings switch from a per-kilometre fare and automatic driver
-- assignment to hour packages, a scheduled pickup, and an ops-chosen driver.
-- The billed clock starts when the driver enters the buyer's pickup code and
-- stops when the driver ends the trip at the drop-off.

create table if not exists public.truck_hour_rates (
  id uuid primary key default gen_random_uuid(),
  hours int not null unique check (hours between 1 and 168),
  price numeric(12, 2) not null check (price > 0 and price <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.truck_hour_rates enable row level security;
revoke all on table public.truck_hour_rates from anon, authenticated;
grant select on table public.truck_hour_rates to authenticated;

drop policy if exists truck_hour_rates_select on public.truck_hour_rates;
create policy truck_hour_rates_select on public.truck_hour_rates for select to authenticated
  using (true);

insert into public.truck_hour_rates (hours, price)
select v.hours, v.price
from (values (4, 200.00::numeric), (8, 360.00::numeric), (12, 480.00::numeric)) as v(hours, price)
where not exists (select 1 from public.truck_hour_rates);

alter table public.truck_bookings add column if not exists booked_hours int;
alter table public.truck_bookings add column if not exists hourly_price numeric(12, 2);
alter table public.truck_bookings add column if not exists rate_id uuid references public.truck_hour_rates (id) on delete set null;
alter table public.truck_bookings add column if not exists elapsed_minutes int check (elapsed_minutes is null or elapsed_minutes >= 0);

update public.truck_bookings
   set booked_hours = coalesce(booked_hours, 4),
       hourly_price = coalesce(hourly_price, amount)
 where booked_hours is null or hourly_price is null;

alter table public.truck_bookings alter column booked_hours set not null;
alter table public.truck_bookings alter column hourly_price set not null;

alter table public.truck_bookings drop constraint if exists truck_bookings_booked_hours_check;
alter table public.truck_bookings add constraint truck_bookings_booked_hours_check check (booked_hours between 1 and 168);
alter table public.truck_bookings drop constraint if exists truck_bookings_hourly_price_check;
alter table public.truck_bookings add constraint truck_bookings_hourly_price_check check (hourly_price > 0);
alter table public.truck_bookings drop constraint if exists truck_bookings_price_per_km_check;
alter table public.truck_bookings add constraint truck_bookings_price_per_km_check check (price_per_km >= 0);

create index if not exists truck_bookings_open_driver_idx
  on public.truck_bookings (driver_id, pickup_at)
  where state in ('awaiting_payment', 'paid') and completed_at is null;

drop function if exists public.truck_quote(numeric, numeric, numeric, numeric);
drop function if exists public.book_truck(text, text, numeric, numeric, text, numeric, numeric, timestamptz);
drop function if exists public.assign_truck_driver(uuid);
drop function if exists public.set_truck_rate(numeric);
drop function if exists public.truck_rate();

create or replace function public.list_truck_hour_rates()
returns table (id uuid, hours int, price numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  return query
    select r.id, r.hours, r.price
      from public.truck_hour_rates r
     order by r.hours;
end;
$$;

create or replace function public.add_truck_hour_rate(p_hours int, p_price numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 168 then
    raise exception 'enter the number of hours';
  end if;
  if p_price is null or p_price <= 0 or p_price > 1000000 then
    raise exception 'enter a price for that hour package';
  end if;
  if exists (select 1 from public.truck_hour_rates r where r.hours = p_hours) then
    raise exception 'that hour package already exists';
  end if;
  insert into public.truck_hour_rates (hours, price)
  values (p_hours, round(p_price, 2))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.set_truck_hour_rate(p_id uuid, p_price numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if p_price is null or p_price <= 0 or p_price > 1000000 then
    raise exception 'enter a price for that hour package';
  end if;
  update public.truck_hour_rates
     set price = round(p_price, 2), updated_at = now()
   where id = p_id;
  if not found then
    raise exception 'hour package not found';
  end if;
end;
$$;

create or replace function public.delete_truck_hour_rate(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  delete from public.truck_hour_rates where id = p_id;
  if not found then
    raise exception 'hour package not found';
  end if;
end;
$$;

create or replace function public.truck_quote(p_hours int)
returns table (hours int, price numeric, amount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rate public.truck_hour_rates;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if p_hours is null or p_hours < 1 then
    raise exception 'choose the number of hours';
  end if;
  select * into rate from public.truck_hour_rates r where r.hours = p_hours;
  if not found then
    raise exception 'that hour package is not available';
  end if;
  hours := rate.hours;
  price := rate.price;
  amount := rate.price;
  return next;
end;
$$;

create or replace function public.book_truck(
  p_purpose text,
  p_pickup_label text,
  p_pickup_lat numeric,
  p_pickup_lng numeric,
  p_dropoff_label text,
  p_dropoff_lat numeric,
  p_dropoff_lng numeric,
  p_pickup_at timestamptz,
  p_hours int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rate public.truck_hour_rates;
  km numeric;
  bname text;
  bphone text;
  new_id uuid;
begin
  if not (select private.is_buyer()) then
    raise exception 'buyers only';
  end if;
  if p_purpose not in ('transfer', 'pickup') then
    raise exception 'choose transfer or pickup';
  end if;
  if p_pickup_at < now() - interval '10 minutes' then
    raise exception 'pickup time must be in the future';
  end if;
  p_pickup_label := left(btrim(p_pickup_label), 160);
  p_dropoff_label := left(btrim(p_dropoff_label), 160);
  if char_length(p_pickup_label) not between 2 and 160
     or char_length(p_dropoff_label) not between 2 and 160 then
    raise exception 'enter both places';
  end if;
  if p_hours is null or p_hours < 1 then
    raise exception 'choose the number of hours';
  end if;

  select * into rate from public.truck_hour_rates r where r.hours = p_hours;
  if not found then
    raise exception 'that hour package is not available';
  end if;

  km := private.trip_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng);
  if km < 0.5 then
    raise exception 'choose two different places';
  end if;

  select left(coalesce(nullif(btrim(p.display_name), ''), 'Buyer'), 80), nullif(left(btrim(p.phone), 32), '')
    into bname, bphone
    from public.profiles p
   where p.id = uid;

  insert into public.truck_bookings (
    buyer_id, buyer_name, buyer_phone, purpose, pickup_label, pickup_lat, pickup_lng, dropoff_label, dropoff_lat, dropoff_lng,
    distance_km, price_per_km, amount, pickup_at, booked_hours, hourly_price, rate_id
  ) values (
    uid, bname, bphone, p_purpose, p_pickup_label, p_pickup_lat, p_pickup_lng, p_dropoff_label, p_dropoff_lat, p_dropoff_lng,
    km, 0, rate.price, p_pickup_at, rate.hours, rate.price, rate.id
  ) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.truck_driver_busy(
  p_driver_id uuid,
  p_booking_id uuid,
  p_pickup_at timestamptz,
  p_hours int
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.truck_bookings x
     where x.driver_id = p_driver_id
       and x.id is distinct from p_booking_id
       and x.state in ('awaiting_payment', 'paid')
       and x.completed_at is null
       and tstzrange(x.pickup_at, x.pickup_at + make_interval(hours => coalesce(x.booked_hours, 4)), '[)')
           && tstzrange(p_pickup_at, p_pickup_at + make_interval(hours => coalesce(p_hours, 4)), '[)')
  );
$$;

create or replace function public.truck_driver_options(p_booking_id uuid)
returns table (id uuid, name text, phone text, plate text, vehicle text, available boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.truck_bookings;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  select * into b from public.truck_bookings where public.truck_bookings.id = p_booking_id;
  if not found then
    raise exception 'booking not found';
  end if;
  return query
    select d.id,
           left(coalesce(nullif(btrim(p.display_name), ''), 'Driver'), 80),
           coalesce(p.phone, ''),
           coalesce(d.plate_number, ''),
           coalesce(d.vehicle_type, ''),
           not public.truck_driver_busy(d.id, b.id, b.pickup_at, b.booked_hours)
      from public.drivers d
      join public.profiles p on p.id = d.id
     order by 6 desc, 2;
end;
$$;

create or replace function public.assign_truck_driver(p_booking_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.truck_bookings;
  dname text;
  dphone text;
  dplate text;
  dvehicle text;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  select * into b from public.truck_bookings where id = p_booking_id for update;
  if not found or b.state = 'cancelled' then
    raise exception 'booking cannot take a driver';
  end if;
  if b.started_at is not null then
    raise exception 'trip already started';
  end if;
  if p_driver_id is null then
    raise exception 'choose a driver';
  end if;
  select p.display_name, p.phone, d.plate_number, d.vehicle_type
    into dname, dphone, dplate, dvehicle
    from public.drivers d
    join public.profiles p on p.id = d.id
   where d.id = p_driver_id;
  if not found then
    raise exception 'driver not found';
  end if;
  if public.truck_driver_busy(p_driver_id, b.id, b.pickup_at, b.booked_hours) then
    raise exception 'that driver is not available';
  end if;
  update public.truck_bookings
     set driver_id = p_driver_id,
         driver_name = left(coalesce(nullif(btrim(dname), ''), 'Driver'), 80),
         driver_phone = nullif(left(btrim(dphone), 32), ''),
         driver_plate = dplate,
         driver_vehicle = dvehicle
   where id = b.id;
end;
$$;

create or replace function public.complete_truck_trip(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.truck_bookings;
  mins int;
begin
  select * into b from public.truck_bookings where id = p_booking_id for update;
  if not found or b.driver_id is distinct from (select auth.uid()) then
    raise exception 'not your trip';
  end if;
  if b.state <> 'paid' then
    raise exception 'pay before ending';
  end if;
  if b.started_at is null then
    raise exception 'trip has not started';
  end if;
  if b.completed_at is not null then
    raise exception 'trip already ended';
  end if;
  mins := greatest(1, ceil(extract(epoch from (now() - b.started_at)) / 60.0)::int);
  update public.truck_bookings
     set completed_at = now(), elapsed_minutes = mins
   where id = b.id;
end;
$$;

revoke all on function public.list_truck_hour_rates(), public.add_truck_hour_rate(int, numeric),
  public.set_truck_hour_rate(uuid, numeric), public.delete_truck_hour_rate(uuid),
  public.truck_quote(int),
  public.book_truck(text, text, numeric, numeric, text, numeric, numeric, timestamptz, int),
  public.truck_driver_busy(uuid, uuid, timestamptz, int),
  public.truck_driver_options(uuid), public.assign_truck_driver(uuid, uuid)
  from public, anon;
grant execute on function public.list_truck_hour_rates(), public.truck_quote(int),
  public.book_truck(text, text, numeric, numeric, text, numeric, numeric, timestamptz, int)
  to authenticated;
grant execute on function public.add_truck_hour_rate(int, numeric), public.set_truck_hour_rate(uuid, numeric),
  public.delete_truck_hour_rate(uuid), public.truck_driver_options(uuid), public.assign_truck_driver(uuid, uuid)
  to authenticated;

revoke all on function public.truck_driver_busy(uuid, uuid, timestamptz, int) from public, anon, authenticated;
grant execute on function public.complete_truck_trip(uuid) to authenticated;

comment on table public.truck_hour_rates is 'Hour packages operations publishes. The buyer picks one; the fare is that package price, not distance.';
comment on column public.truck_bookings.booked_hours is 'Hour package the buyer paid for. Snapshotted at booking time.';
comment on column public.truck_bookings.elapsed_minutes is 'Minutes from start code to trip end. Null until the driver ends the trip.';
comment on function public.assign_truck_driver(uuid, uuid) is 'Operations allots a specific available driver. Drivers are not assigned automatically.';
