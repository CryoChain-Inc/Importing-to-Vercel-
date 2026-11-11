-- live-tracking: where the truck is, for buyers and ops.
--   * driver_location_trail: positions reported while a driver has dispatched stops (the path actually driven).
--     Ops only. Deleted after 30 days.
--   * delivery_stops.leg_polyline: Google's road line from the previous point (the truck, or the stop before) to
--     this stop, saved by the route-eta function.
--   * buyer_order_tracking(): the buyer's own order only. It never reveals other stops: the road line is given
--     only once the buyer's drop-off is the truck's next stop.

create table public.driver_location_trail (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  lat numeric(9, 6) not null check (lat between -90 and 90),
  lng numeric(9, 6) not null check (lng between -180 and 180),
  at timestamptz not null default now()
);
create index driver_location_trail_driver_idx on public.driver_location_trail (driver_id, at desc);

alter table public.driver_location_trail enable row level security;
revoke all on table public.driver_location_trail from anon, authenticated;
grant select on public.driver_location_trail to authenticated;
create policy driver_location_trail_select_ops on public.driver_location_trail for select to authenticated
  using ((select private.is_ops()));

alter table public.delivery_stops add column leg_polyline text check (leg_polyline is null or char_length(leg_polyline) <= 100000);

-- Positions are recorded in the trail only while the driver has work on the road.
create or replace function public.report_driver_location(p_lat numeric, p_lng numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  prev timestamptz;
begin
  if not (select private.is_driver()) then
    raise exception 'drivers only';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;

  select updated_at into prev from public.driver_locations where driver_id = uid;
  insert into public.driver_locations (driver_id, lat, lng, updated_at)
  values (uid, p_lat, p_lng, now())
  on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();

  if exists (select 1 from public.delivery_stops s where s.driver_id = uid and s.state = 'pending') then
    insert into public.driver_location_trail (driver_id, lat, lng) values (uid, p_lat, p_lng);
  end if;

  if prev is null or prev < now() - interval '30 minutes' then
    perform private.plan_routes();
  else
    perform private.refresh_etas(uid);
  end if;
end;
$$;

-- Google times and road lines for the driver's pending stops, in route order.
drop function public.set_route_etas(uuid, numeric[]);
create function public.set_route_etas(p_driver uuid, p_seconds numeric[], p_polylines text[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.ops_config;
  st record;
  t timestamptz := now();
  i integer := 0;
begin
  select * into cfg from public.ops_config where id;
  for st in
    select s.id from public.delivery_stops s
     where s.driver_id = p_driver and s.state = 'pending' and s.seq is not null order by s.seq
  loop
    i := i + 1;
    exit when i > coalesce(cardinality(p_seconds), 0);
    -- A leg of a few seconds is the same farm: no second wait there.
    t := t + make_interval(mins => case when i > 1 and p_seconds[i] > 30 then cfg.stop_minutes else 0 end)
           + make_interval(secs => greatest(p_seconds[i], 0) * (1 + cfg.eta_buffer_pct / 100));
    update public.delivery_stops
       set eta = t, eta_source = 'google', eta_at = now(),
           leg_polyline = case when p_polylines is null then leg_polyline else nullif(p_polylines[i], '') end
     where id = st.id;
  end loop;
end;
$$;
revoke all on function public.set_route_etas(uuid, numeric[], text[]) from public, anon, authenticated;
grant execute on function public.set_route_etas(uuid, numeric[], text[]) to service_role;

-- ── What a buyer may see about their own order ──────────────────────────────
create function public.buyer_order_tracking(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  drop_stop public.delivery_stops;
  next_id uuid;
  loc public.driver_locations;
begin
  select * into ord from public.orders where id = p_order and buyer_id = (select auth.uid());
  if not found then
    raise exception 'order not found';
  end if;
  select * into drop_stop from public.delivery_stops where order_id = ord.id and kind = 'dropoff';

  if drop_stop.state = 'done' then
    return jsonb_build_object('state', 'delivered', 'deliveredAt', drop_stop.done_at);
  end if;
  if drop_stop.id is null or drop_stop.driver_id is null then
    return jsonb_build_object('state', 'waiting');
  end if;

  select * into loc from public.driver_locations where driver_id = drop_stop.driver_id;
  select s.id into next_id from public.delivery_stops s
   where s.driver_id = drop_stop.driver_id and s.state = 'pending' and s.seq is not null order by s.seq limit 1;

  return jsonb_build_object(
    'state', case when next_id = drop_stop.id then 'next' else 'on_the_way' end,
    'eta', drop_stop.eta,
    'destination', jsonb_build_object('lat', drop_stop.lat, 'lng', drop_stop.lng),
    'truck', case when loc.driver_id is null then null
                  else jsonb_build_object('lat', loc.lat, 'lng', loc.lng, 'at', loc.updated_at) end,
    -- Only the road from the truck to this buyer, and only when nothing else is in between.
    'polyline', case when next_id = drop_stop.id then drop_stop.leg_polyline end
  );
end;
$$;
revoke all on function public.buyer_order_tracking(uuid) from public, anon;
grant execute on function public.buyer_order_tracking(uuid) to authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('trim-location-trail', '17 3 * * *',
    $q$delete from public.driver_location_trail where at < now() - interval '30 days'$q$);
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;
