-- dispatch: merged pickup lines, truck capacity, the dispatch window, mid-trip additions and arrival times.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Dispatch hours cover the whole day so the test does not depend on when it runs.
update public.ops_config set dispatch_start = '00:00', dispatch_end = '23:59:59', dispatch_wait_minutes = 120, detour_km = 25;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0f01', 'dispatch-farmer-1@test.local'),
  ('00000000-0000-0000-0000-0000000d0f02', 'dispatch-farmer-2@test.local'),
  ('00000000-0000-0000-0000-0000000d0f03', 'dispatch-farmer-far@test.local'),
  ('00000000-0000-0000-0000-0000000d0b01', 'dispatch-buyer@test.local'),
  ('00000000-0000-0000-0000-0000000d0d01', 'dispatch-driver-1@test.local'),
  ('00000000-0000-0000-0000-0000000d0d02', 'dispatch-driver-2@test.local');
update public.profiles set role = 'driver' where id in ('00000000-0000-0000-0000-0000000d0d01', '00000000-0000-0000-0000-0000000d0d02');
insert into public.buyers (id) values ('00000000-0000-0000-0000-0000000d0b01');
insert into public.farmers (id, address, latitude, longitude) values
  ('00000000-0000-0000-0000-0000000d0f01', 'Farm one', 5.60, -0.20),
  ('00000000-0000-0000-0000-0000000d0f02', 'Farm two', 5.62, -0.20),
  ('00000000-0000-0000-0000-0000000d0f03', 'Far farm', 8.60, -0.20);
insert into public.drivers (id) values ('00000000-0000-0000-0000-0000000d0d01'), ('00000000-0000-0000-0000-0000000d0d02');
insert into public.trucks (plate, capacity_kg, driver_id) values
  ('DISP-1', 1000, '00000000-0000-0000-0000-0000000d0d01'), ('DISP-2', 1000, '00000000-0000-0000-0000-0000000d0d02');
insert into public.driver_locations (driver_id, lat, lng) values ('00000000-0000-0000-0000-0000000d0d01', 5.59, -0.20);

insert into public.categories (id, name) values ('00000000-0000-0000-0000-0000000d0c01', 'Dispatch Test Category');
insert into public.products (id, name, unit, active, category_id) values
  ('00000000-0000-0000-0000-0000000d0a01', 'Dispatch Tomato', 'kg', true, '00000000-0000-0000-0000-0000000d0c01'),
  ('00000000-0000-0000-0000-0000000d0a02', 'Dispatch Okra', 'kg', true, '00000000-0000-0000-0000-0000000d0c01'),
  ('00000000-0000-0000-0000-0000000d0a03', 'Dispatch Yam', 'kg', true, '00000000-0000-0000-0000-0000000d0c01');
insert into public.product_prices (product_id, price) values
  ('00000000-0000-0000-0000-0000000d0a01', 10), ('00000000-0000-0000-0000-0000000d0a02', 10), ('00000000-0000-0000-0000-0000000d0a03', 10);

create function pg_temp.list(p_farmer uuid, p_product text, p_kg numeric) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_farmer)::text, true);
  insert into public.produce_listings (farmer_id, product, unit, weight_kg, image_paths)
  values (p_farmer, p_product, 'kg', p_kg, array[p_farmer || '/a.jpg', p_farmer || '/b.jpg', p_farmer || '/c.jpg']);
end $$;
-- Farm one lists tomato twice (the double-collection case); farm two has plenty of okra; the far farm has yam.
select pg_temp.list('00000000-0000-0000-0000-0000000d0f01', 'Dispatch Tomato', 50);
select pg_temp.list('00000000-0000-0000-0000-0000000d0f01', 'Dispatch Tomato', 50);
select pg_temp.list('00000000-0000-0000-0000-0000000d0f02', 'Dispatch Okra', 5000);
select pg_temp.list('00000000-0000-0000-0000-0000000d0f03', 'Dispatch Yam', 500);

create function pg_temp.pay(p_order uuid, p_product uuid, p_kg numeric) returns void language plpgsql as $$
begin
  insert into public.orders (id, buyer_id, amount, state, delivery_address, delivery_lat, delivery_lng)
  values (p_order, '00000000-0000-0000-0000-0000000d0b01', p_kg * 12, 'paid', 'Test buyer', 5.65, -0.18);
  insert into public.order_items (order_id, product_id, unit, kg, unit_price, line_total) values (p_order, p_product, 'kg', p_kg, 12, p_kg * 12);
  perform private.allocate_order(p_order);
end $$;
create function pg_temp.driver_of(p_order uuid) returns uuid language sql as
  $$ select max(driver_id::text)::uuid from public.delivery_stops where order_id = p_order $$;

-- ── One line for two listings; the order waits inside the window ────────────
select pg_temp.pay('00000000-0000-0000-0000-0000000d0e01', '00000000-0000-0000-0000-0000000d0a01', 100);
select is((select count(*) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000000d0e01'), 2::bigint, 'the order draws on both listings');
select is((select count(*) from public.delivery_stops where order_id = '00000000-0000-0000-0000-0000000d0e01' and kind = 'pickup'), 1::bigint, 'two listings at one farm are one pickup line');
select matches((select label from public.delivery_stops where order_id = '00000000-0000-0000-0000-0000000d0e01' and kind = 'pickup'), '^Pick up 100(\.00)? kg Dispatch Tomato', 'the line carries the combined quantity');
select is(pg_temp.driver_of('00000000-0000-0000-0000-0000000d0e01'), null, 'a lone small order waits for the truck to fill');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000d0f01' and title = 'Truck on the way'), 0::bigint, 'the farmer is not given a time before dispatch');

-- ── After the window it leaves, with a route and arrival times ──────────────
update public.delivery_stops set created_at = now() - interval '3 hours' where order_id = '00000000-0000-0000-0000-0000000d0e01';
select private.plan_routes();
select is(pg_temp.driver_of('00000000-0000-0000-0000-0000000d0e01'), '00000000-0000-0000-0000-0000000d0d01'::uuid, 'after the window the order goes to the truck that is online');
select results_eq($$select kind, seq, eta is not null from public.delivery_stops where order_id = '00000000-0000-0000-0000-0000000d0e01' order by seq$$,
  $$values ('pickup', 1, true), ('dropoff', 2, true)$$, 'pickup first, drop-off second, both with an arrival time');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000d0f01' and title = 'Truck on the way'), 1::bigint, 'the farmer is told once when the truck is dispatched');
select is((select count(*) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000000d0e01' and pickup_at is not null), 2::bigint, 'both allocations carry the pickup time');

-- ── Capacity and mid-trip additions ─────────────────────────────────────────
update public.ops_config set dispatch_wait_minutes = 0;
insert into public.driver_locations (driver_id, lat, lng) values ('00000000-0000-0000-0000-0000000d0d02', 5.61, -0.21);
select pg_temp.pay('00000000-0000-0000-0000-0000000d0e02', '00000000-0000-0000-0000-0000000d0a02', 700);
select is(pg_temp.driver_of('00000000-0000-0000-0000-0000000d0e02'), '00000000-0000-0000-0000-0000000d0d01'::uuid, 'a nearby order that fits joins the truck already on the road (100 + 700 of 1000)');
select pg_temp.pay('00000000-0000-0000-0000-0000000d0e03', '00000000-0000-0000-0000-0000000d0a02', 600);
select is(pg_temp.driver_of('00000000-0000-0000-0000-0000000d0e03'), '00000000-0000-0000-0000-0000000d0d02'::uuid, 'an order that does not fit goes on the free truck');
select pg_temp.pay('00000000-0000-0000-0000-0000000d0e04', '00000000-0000-0000-0000-0000000d0a02', 1500);
select is(pg_temp.driver_of('00000000-0000-0000-0000-0000000d0e04'), null, 'an order larger than any truck is not dispatched');
select is((select count(*) from public.ops_decisions where order_id = '00000000-0000-0000-0000-0000000d0e04' and kind = 'over_capacity' and status = 'open'), 1::bigint, 'and is raised to ops');
select pg_temp.pay('00000000-0000-0000-0000-0000000d0e05', '00000000-0000-0000-0000-0000000d0a03', 50);
select is(pg_temp.driver_of('00000000-0000-0000-0000-0000000d0e05'), null, 'an order far off the route does not join a truck on the road');

select ok((select bool_and(ok) from (select eta >= lag(eta, 1, eta) over (order by seq) as ok from public.delivery_stops
            where driver_id = '00000000-0000-0000-0000-0000000d0d01' and state = 'pending') x), 'arrival times never go backwards along the route');

-- ── Collecting a merged line ────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000d0d01"}', true);
select public.record_delivery_handover(
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-0000000d0e01' and kind = 'pickup'),
  100, 4, null, '00000000-0000-0000-0000-0000000d0d01/p.jpg', 'photo');
select lives_ok($$select public.complete_delivery_stop((select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-0000000d0e01' and kind = 'pickup'))$$, 'the driver completes the merged line');
select is((select count(*) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000000d0e01' and status = 'collected'), 2::bigint, 'both listings are marked collected');
select is((select jsonb_array_length(o -> 'pickups') from jsonb_array_elements(public.driver_deliveries() -> 'orders') o where o ->> 'id' = '00000000-0000-0000-0000-0000000d0e01'), 1, 'the driver sees one pickup for that order');

-- ── Outside dispatch hours nothing leaves ───────────────────────────────────
update public.ops_config set dispatch_start = '00:00', dispatch_end = '00:00:01';
select pg_temp.pay('00000000-0000-0000-0000-0000000d0e06', '00000000-0000-0000-0000-0000000d0a02', 100);
select is(pg_temp.driver_of('00000000-0000-0000-0000-0000000d0e06'), null, 'nothing is dispatched outside working hours');

select * from finish();
rollback;
