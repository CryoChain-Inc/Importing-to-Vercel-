-- A paid cold-truck trip starts only when the driver enters the buyer's code.
-- The code lives in its own table so the driver cannot read it. Live position is the latest point on the booking.

alter table public.truck_bookings add column if not exists started_at timestamptz;
alter table public.truck_bookings add column if not exists driver_lat numeric(9, 6);
alter table public.truck_bookings add column if not exists driver_lng numeric(9, 6);
alter table public.truck_bookings add column if not exists driver_seen_at timestamptz;

create table if not exists public.truck_start_codes (
  booking_id uuid primary key references public.truck_bookings (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);

alter table public.truck_start_codes enable row level security;
revoke all on table public.truck_start_codes from anon, authenticated;
grant select on public.truck_start_codes to authenticated;

drop policy if exists truck_start_codes_select_buyer on public.truck_start_codes;
create policy truck_start_codes_select_buyer on public.truck_start_codes for select to authenticated
  using (exists (
    select 1 from public.truck_bookings b
    where b.id = booking_id and b.buyer_id = (select auth.uid())
  ));

drop policy if exists truck_start_codes_select_ops on public.truck_start_codes;
create policy truck_start_codes_select_ops on public.truck_start_codes for select to authenticated
  using ((select private.is_ops()));

create or replace function private.issue_truck_start_code(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.truck_start_codes (booking_id, code)
  select p_booking_id, lpad((floor(random() * 10000))::int::text, 4, '0')
  where not exists (select 1 from public.truck_start_codes c where c.booking_id = p_booking_id);
end;
$$;

revoke all on function private.issue_truck_start_code(uuid) from public, anon, authenticated;

insert into public.truck_start_codes (booking_id, code)
select b.id, lpad((floor(random() * 10000))::int::text, 4, '0')
from public.truck_bookings b
where b.state = 'paid'
  and not exists (select 1 from public.truck_start_codes c where c.booking_id = b.id);

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
  perform private.issue_truck_start_code(p_booking_id);
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
    perform private.issue_truck_start_code(b.id);
  else
    update public.truck_payments set status = 'orphaned', channel = p_channel, paid_at = now() where id = pay.id;
  end if;
end;
$$;

create or replace function public.start_truck_trip(p_booking_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.truck_bookings;
  expected text;
begin
  select * into b from public.truck_bookings where id = p_booking_id for update;
  if not found or b.driver_id is distinct from (select auth.uid()) then
    raise exception 'not your trip';
  end if;
  if b.state <> 'paid' then
    raise exception 'pay before starting';
  end if;
  if b.started_at is not null then
    raise exception 'trip already started';
  end if;
  select c.code into expected from public.truck_start_codes c where c.booking_id = b.id;
  if expected is null or expected is distinct from btrim(p_code) then
    raise exception 'that code is not right';
  end if;
  update public.truck_bookings set started_at = now() where id = b.id;
end;
$$;

create or replace function public.report_truck_location(p_booking_id uuid, p_lat numeric, p_lng numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'location is not valid';
  end if;
  update public.truck_bookings
     set driver_lat = p_lat, driver_lng = p_lng, driver_seen_at = now()
   where id = p_booking_id
     and driver_id = (select auth.uid())
     and state = 'paid'
     and started_at is not null;
  if not found then
    raise exception 'trip has not started';
  end if;
end;
$$;

revoke all on function public.start_truck_trip(uuid, text), public.report_truck_location(uuid, numeric, numeric) from public, anon;
grant execute on function public.start_truck_trip(uuid, text), public.report_truck_location(uuid, numeric, numeric) to authenticated;

comment on table public.truck_start_codes is 'Four-digit code the buyer reads out so the assigned driver can start the trip. Hidden from the driver.';
