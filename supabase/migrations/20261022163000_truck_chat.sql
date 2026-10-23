-- Chat and phone numbers for a cold-truck booking. Separate from lot orders.
-- The buyer and the assigned driver can message each other, and each side keeps
-- the other's number so Call opens the phone dialer. Run this once after the truck booking migration.

alter table public.truck_bookings add column if not exists buyer_name text;
alter table public.truck_bookings add column if not exists buyer_phone text;

update public.truck_bookings b
   set buyer_name = left(coalesce(nullif(btrim(p.display_name), ''), 'Buyer'), 80),
       buyer_phone = nullif(left(btrim(p.phone), 32), '')
  from public.profiles p
 where p.id = b.buyer_id
   and b.buyer_name is null;

-- Drivers need to see a trip as soon as they are assigned, including before it is paid, so they can answer the buyer.
drop policy if exists truck_bookings_select_driver on public.truck_bookings;
create policy truck_bookings_select_driver on public.truck_bookings for select to authenticated
  using (driver_id = (select auth.uid()) and state <> 'cancelled');

create or replace function public.book_truck(
  p_purpose text,
  p_pickup_label text,
  p_pickup_lat numeric,
  p_pickup_lng numeric,
  p_dropoff_label text,
  p_dropoff_lat numeric,
  p_dropoff_lng numeric,
  p_pickup_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rate numeric;
  km numeric;
  fare numeric;
  chosen uuid;
  dname text;
  dphone text;
  dplate text;
  dvehicle text;
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

  select r.price_per_km into rate from public.truck_rates r where r.id = 1;
  if rate is null then
    raise exception 'set a price per kilometre first';
  end if;
  km := private.trip_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng);
  if km < 0.5 then
    raise exception 'choose two different places';
  end if;
  fare := round(km * rate, 2);

  select d.id into chosen
    from public.drivers d
   order by (
     select count(*) from public.truck_bookings b
      where b.driver_id = d.id
        and b.state in ('awaiting_payment', 'paid')
        and abs(extract(epoch from (b.pickup_at - p_pickup_at))) < 7200
   ), d.created_at
   limit 1;

  if chosen is not null then
    select p.display_name, p.phone, d.plate_number, d.vehicle_type
      into dname, dphone, dplate, dvehicle
      from public.drivers d
      join public.profiles p on p.id = d.id
     where d.id = chosen;
  end if;

  select left(coalesce(nullif(btrim(p.display_name), ''), 'Buyer'), 80), nullif(left(btrim(p.phone), 32), '')
    into bname, bphone
    from public.profiles p
   where p.id = uid;

  insert into public.truck_bookings (
    buyer_id, buyer_name, buyer_phone, purpose, pickup_label, pickup_lat, pickup_lng, dropoff_label, dropoff_lat, dropoff_lng,
    distance_km, price_per_km, amount, pickup_at, driver_id, driver_name, driver_phone, driver_plate, driver_vehicle
  ) values (
    uid, bname, bphone, p_purpose, p_pickup_label, p_pickup_lat, p_pickup_lng, p_dropoff_label, p_dropoff_lat, p_dropoff_lng,
    km, rate, fare, p_pickup_at, chosen, dname, dphone, dplate, dvehicle
  ) returning id into new_id;
  return new_id;
end;
$$;

create table if not exists public.truck_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.truck_bookings (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists truck_messages_booking_idx on public.truck_messages (booking_id, created_at);

alter table public.truck_messages enable row level security;
revoke all on table public.truck_messages from anon, authenticated;
grant select, insert on public.truck_messages to authenticated;

drop policy if exists truck_messages_select_party on public.truck_messages;
create policy truck_messages_select_party on public.truck_messages for select to authenticated
  using (exists (
    select 1 from public.truck_bookings b
    where b.id = booking_id
      and b.state <> 'cancelled'
      and b.driver_id is not null
      and (b.buyer_id = (select auth.uid()) or b.driver_id = (select auth.uid()))
  ));

drop policy if exists truck_messages_select_ops on public.truck_messages;
create policy truck_messages_select_ops on public.truck_messages for select to authenticated
  using ((select private.is_ops()));

drop policy if exists truck_messages_insert_party on public.truck_messages;
create policy truck_messages_insert_party on public.truck_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and char_length(btrim(body)) between 1 and 500
    and exists (
      select 1 from public.truck_bookings b
      where b.id = booking_id
        and b.state <> 'cancelled'
        and b.driver_id is not null
        and (b.buyer_id = (select auth.uid()) or b.driver_id = (select auth.uid()))
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'truck_messages'
     ) then
    alter publication supabase_realtime add table public.truck_messages;
  end if;
end $$;

comment on table public.truck_messages is 'Messages between the buyer and the assigned driver for one cold-truck booking.';
