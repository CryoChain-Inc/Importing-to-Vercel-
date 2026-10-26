-- The assigned driver ends a cold-truck trip after it has started. Payment state stays paid.

alter table public.truck_bookings add column if not exists completed_at timestamptz;

create or replace function public.complete_truck_trip(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.truck_bookings;
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
  update public.truck_bookings set completed_at = now() where id = b.id;
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
     and started_at is not null
     and completed_at is null;
  if not found then
    raise exception 'trip has not started';
  end if;
end;
$$;

revoke all on function public.complete_truck_trip(uuid) from public, anon;
grant execute on function public.complete_truck_trip(uuid) to authenticated;

comment on column public.truck_bookings.completed_at is 'When the assigned driver ended the trip. Null while the ride is still open.';
