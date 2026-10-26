-- Cold-truck bookings are separate from lots and orders. Ops sets a price per kilometre.
-- A buyer picks two places and a time; the fare is distance × that rate, a driver is
-- assigned automatically, and the buyer pays the same way as a lot (Paystack or bank transfer).

create or replace function private.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric
language sql
immutable
as $$
  select (6371 * 2 * asin(least(1::numeric, sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2 - lng1) / 2)), 2)
  ))))::numeric;
$$;

-- Straight-line distance understates a road. 1.3 brings the fare closer to a driving trip.
create or replace function private.trip_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric
language sql
immutable
as $$
  select round(greatest(private.haversine_km(lat1, lng1, lat2, lng2) * 1.3, 0), 1);
$$;

create table public.truck_rates (
  id int primary key default 1 check (id = 1),
  price_per_km numeric(10, 2) not null check (price_per_km > 0 and price_per_km <= 100000),
  updated_at timestamptz not null default now()
);
insert into public.truck_rates (price_per_km) values (8.00);

create sequence public.truck_booking_code_seq;

create table public.truck_bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'TRK-' || lpad(nextval('public.truck_booking_code_seq')::text, 5, '0'),
  buyer_id uuid not null references public.buyers (id),
  purpose text not null check (purpose in ('transfer', 'pickup')),
  pickup_label text not null check (char_length(btrim(pickup_label)) between 2 and 160),
  pickup_lat numeric(9, 6) not null check (pickup_lat between -90 and 90),
  pickup_lng numeric(9, 6) not null check (pickup_lng between -180 and 180),
  dropoff_label text not null check (char_length(btrim(dropoff_label)) between 2 and 160),
  dropoff_lat numeric(9, 6) not null check (dropoff_lat between -90 and 90),
  dropoff_lng numeric(9, 6) not null check (dropoff_lng between -180 and 180),
  distance_km numeric(8, 1) not null check (distance_km > 0),
  price_per_km numeric(10, 2) not null check (price_per_km > 0),
  amount numeric(12, 2) not null check (amount > 0),
  pickup_at timestamptz not null,
  driver_id uuid references public.drivers (id),
  driver_name text,
  driver_phone text,
  driver_plate text,
  driver_vehicle text,
  state text not null default 'awaiting_payment' check (state in ('awaiting_payment', 'paid', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index truck_bookings_buyer_idx on public.truck_bookings (buyer_id, created_at desc);
create index truck_bookings_driver_idx on public.truck_bookings (driver_id, pickup_at) where state = 'paid';

create table public.truck_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.truck_bookings (id),
  reference text not null unique,
  amount_pesewas bigint not null check (amount_pesewas > 0),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned', 'mismatch', 'orphaned')),
  authorization_url text,
  channel text,
  gateway_response text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index truck_payments_booking_idx on public.truck_payments (booking_id, created_at desc);
create unique index truck_payments_one_pending on public.truck_payments (booking_id) where status = 'pending';

alter table public.truck_rates enable row level security;
alter table public.truck_bookings enable row level security;
alter table public.truck_payments enable row level security;

revoke all on table public.truck_rates, public.truck_bookings, public.truck_payments from anon, authenticated;
grant select on public.truck_bookings, public.truck_payments to authenticated;

create policy truck_bookings_select_buyer on public.truck_bookings for select to authenticated
  using (buyer_id = (select auth.uid()));
create policy truck_bookings_select_ops on public.truck_bookings for select to authenticated
  using ((select private.is_ops()));
create policy truck_bookings_select_driver on public.truck_bookings for select to authenticated
  using (driver_id = (select auth.uid()) and state = 'paid');

create policy truck_payments_select_buyer on public.truck_payments for select to authenticated
  using (exists (
    select 1 from public.truck_bookings b
    where b.id = booking_id and b.buyer_id = (select auth.uid())
  ));
create policy truck_payments_select_ops on public.truck_payments for select to authenticated
  using ((select private.is_ops()));

-- Fare for two points at the current per-kilometre rate. The booking uses this same formula.
create or replace function public.truck_quote(p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric)
returns table (distance_km numeric, price_per_km numeric, amount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rate numeric;
  km numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  select r.price_per_km into rate from public.truck_rates r where r.id = 1;
  if rate is null then
    raise exception 'set a price per kilometre first';
  end if;
  km := private.trip_km(p_lat1, p_lng1, p_lat2, p_lng2);
  if km is null or km < 0.5 then
    raise exception 'choose two different places';
  end if;
  distance_km := km;
  price_per_km := rate;
  amount := round(km * rate, 2);
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

  -- Prefer a driver who is not already on a trip within two hours of this pickup.
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

  insert into public.truck_bookings (
    buyer_id, purpose, pickup_label, pickup_lat, pickup_lng, dropoff_label, dropoff_lat, dropoff_lng,
    distance_km, price_per_km, amount, pickup_at, driver_id, driver_name, driver_phone, driver_plate, driver_vehicle
  ) values (
    uid, p_purpose, btrim(p_pickup_label), p_pickup_lat, p_pickup_lng, btrim(p_dropoff_label), p_dropoff_lat, p_dropoff_lng,
    km, rate, fare, p_pickup_at, chosen, dname, dphone, dplate, dvehicle
  ) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.cancel_truck_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  b public.truck_bookings;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select * into b from public.truck_bookings where id = p_booking_id for update;
  if not found or b.state <> 'awaiting_payment'
     or not (b.buyer_id = uid or (select private.is_ops())) then
    raise exception 'booking cannot be cancelled';
  end if;
  update public.truck_bookings set state = 'cancelled' where id = b.id;
  update public.truck_payments
     set status = 'abandoned', gateway_response = 'booking cancelled'
   where booking_id = b.id and status = 'pending';
end;
$$;

create or replace function public.set_truck_rate(p_price_per_km numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if p_price_per_km is null or p_price_per_km <= 0 or p_price_per_km > 100000 then
    raise exception 'enter a price per kilometre';
  end if;
  update public.truck_rates
     set price_per_km = round(p_price_per_km, 2), updated_at = now()
   where id = 1;
end;
$$;

-- Fills in a driver when none was free at booking time. Same least-busy rule as book_truck.
create or replace function public.assign_truck_driver(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.truck_bookings;
  chosen uuid;
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
  select d.id into chosen
    from public.drivers d
   order by (
     select count(*) from public.truck_bookings x
      where x.driver_id = d.id
        and x.id <> b.id
        and x.state in ('awaiting_payment', 'paid')
        and abs(extract(epoch from (x.pickup_at - b.pickup_at))) < 7200
   ), d.created_at
   limit 1;
  if chosen is null then
    raise exception 'no driver is available';
  end if;
  select p.display_name, p.phone, d.plate_number, d.vehicle_type
    into dname, dphone, dplate, dvehicle
    from public.drivers d
    join public.profiles p on p.id = d.id
   where d.id = chosen;
  update public.truck_bookings
     set driver_id = chosen, driver_name = dname, driver_phone = dphone, driver_plate = dplate, driver_vehicle = dvehicle
   where id = b.id;
end;
$$;

-- Ops can replace the calculated fare before the buyer pays.
create or replace function public.set_truck_fare(p_booking_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'enter a fare';
  end if;
  update public.truck_bookings
     set amount = round(p_amount, 2)
   where id = p_booking_id and state = 'awaiting_payment';
  if not found then
    raise exception 'booking cannot be repriced';
  end if;
  update public.truck_payments
     set status = 'abandoned', gateway_response = 'fare changed'
   where booking_id = p_booking_id and status = 'pending';
end;
$$;

create or replace function public.confirm_truck_payment(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  update public.truck_bookings
     set state = 'paid', paid_at = now()
   where id = p_booking_id and state = 'awaiting_payment';
  if not found then
    raise exception 'booking is not awaiting payment';
  end if;
end;
$$;

create or replace function public.settle_truck_payment(p_reference text, p_paid_pesewas bigint, p_currency text, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.truck_payments;
  b public.truck_bookings;
begin
  select * into pay from public.truck_payments where reference = p_reference for update;
  if not found then
    raise exception 'unknown truck payment';
  end if;
  if pay.status in ('success', 'orphaned') then
    return;
  end if;
  if p_currency <> 'GHS' or p_paid_pesewas < pay.amount_pesewas then
    update public.truck_payments set status = 'mismatch', channel = p_channel where id = pay.id;
    return;
  end if;
  select * into b from public.truck_bookings where id = pay.booking_id for update;
  if b.state = 'awaiting_payment' then
    update public.truck_payments set status = 'success', channel = p_channel, paid_at = now() where id = pay.id;
    update public.truck_bookings set state = 'paid', paid_at = now() where id = b.id;
  else
    update public.truck_payments set status = 'orphaned', channel = p_channel, paid_at = now() where id = pay.id;
  end if;
end;
$$;

create or replace function public.fail_truck_payment(p_reference text, p_status text, p_message text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.truck_payments
     set status = p_status, gateway_response = left(p_message, 200)
   where reference = p_reference and status = 'pending' and p_status in ('failed', 'abandoned');
$$;

-- The published per-kilometre rate. Buyers see it on the fare; ops edits it.
create or replace function public.truck_rate()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select price_per_km from public.truck_rates where id = 1;
$$;

revoke all on function public.truck_quote(numeric, numeric, numeric, numeric), public.truck_rate(),
  public.book_truck(text, text, numeric, numeric, text, numeric, numeric, timestamptz),
  public.cancel_truck_booking(uuid), public.assign_truck_driver(uuid), public.set_truck_rate(numeric), public.set_truck_fare(uuid, numeric),
  public.confirm_truck_payment(uuid)
  from public, anon;
grant execute on function public.truck_quote(numeric, numeric, numeric, numeric), public.truck_rate(),
  public.book_truck(text, text, numeric, numeric, text, numeric, numeric, timestamptz),
  public.cancel_truck_booking(uuid), public.assign_truck_driver(uuid), public.set_truck_rate(numeric), public.set_truck_fare(uuid, numeric),
  public.confirm_truck_payment(uuid)
  to authenticated;

revoke all on function public.settle_truck_payment(text, bigint, text, text), public.fail_truck_payment(text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_truck_payment(text, bigint, text, text), public.fail_truck_payment(text, text, text)
  to service_role;

comment on table public.truck_bookings is 'Buyer booking of a cold truck from one place to another. Separate from lot orders.';
comment on table public.truck_payments is 'Paystack attempts for a truck booking. Separate from lot payments.';
