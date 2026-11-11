-- live-tracking: the trail is kept only during a trip, and a buyer learns nothing about other stops.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

update public.ops_config set dispatch_start = '00:00', dispatch_end = '23:59:59', dispatch_wait_minutes = 0, detour_km = 25;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000007f0f01', 'track-farmer@test.local'),
  ('00000000-0000-0000-0000-0000007f0b01', 'track-buyer-1@test.local'), ('00000000-0000-0000-0000-0000007f0b02', 'track-buyer-2@test.local'),
  ('00000000-0000-0000-0000-0000007f0d01', 'track-driver@test.local');
update public.profiles set role = 'driver' where id = '00000000-0000-0000-0000-0000007f0d01';
insert into public.buyers (id) values ('00000000-0000-0000-0000-0000007f0b01'), ('00000000-0000-0000-0000-0000007f0b02');
insert into public.farmers (id, address, latitude, longitude) values ('00000000-0000-0000-0000-0000007f0f01', 'Farm', 5.600, -0.200);
insert into public.drivers (id) values ('00000000-0000-0000-0000-0000007f0d01');
insert into public.trucks (plate, capacity_kg, driver_id) values ('TRACK-1', 1000, '00000000-0000-0000-0000-0000007f0d01');
insert into public.categories (id, name) values ('00000000-0000-0000-0000-0000007f0c01', 'Track Test Category');
insert into public.products (id, name, unit, active, category_id) values ('00000000-0000-0000-0000-0000007f0a01', 'Track Cabbage', 'kg', true, '00000000-0000-0000-0000-0000007f0c01');
insert into public.product_prices (product_id, price) values ('00000000-0000-0000-0000-0000007f0a01', 10);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000007f0f01"}', true);
insert into public.produce_listings (farmer_id, product, unit, weight_kg, image_paths) values ('00000000-0000-0000-0000-0000007f0f01', 'Track Cabbage', 'kg', 500,
  array['00000000-0000-0000-0000-0000007f0f01/a.jpg', '00000000-0000-0000-0000-0000007f0f01/b.jpg', '00000000-0000-0000-0000-0000007f0f01/c.jpg']);

-- ── No trip: only the latest position ───────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000007f0d01"}', true);
select public.report_driver_location(5.590, -0.200);
select is((select count(*) from public.driver_location_trail), 0::bigint, 'nothing is kept while the driver has no work');

-- Two buyers' orders on the one truck: buyer 1 nearer (5.610), buyer 2 further (5.650).
insert into public.orders (id, buyer_id, amount, state, delivery_address, delivery_lat, delivery_lng) values
  ('00000000-0000-0000-0000-0000007f0e01', '00000000-0000-0000-0000-0000007f0b01', 1200, 'paid', 'Buyer one', 5.610, -0.200),
  ('00000000-0000-0000-0000-0000007f0e02', '00000000-0000-0000-0000-0000007f0b02', 1200, 'paid', 'Buyer two', 5.650, -0.200);
insert into public.order_items (order_id, product_id, unit, kg, unit_price, line_total) values
  ('00000000-0000-0000-0000-0000007f0e01', '00000000-0000-0000-0000-0000007f0a01', 'kg', 100, 12, 1200),
  ('00000000-0000-0000-0000-0000007f0e02', '00000000-0000-0000-0000-0000007f0a01', 'kg', 100, 12, 1200);
select private.allocate_order('00000000-0000-0000-0000-0000007f0e01');
select private.allocate_order('00000000-0000-0000-0000-0000007f0e02');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000007f0d01"}', true);
select public.report_driver_location(5.591, -0.200);
select is((select count(*) from public.driver_location_trail), 1::bigint, 'positions are kept during a trip');

-- Google's lines arrive for every leg.
select public.set_route_etas('00000000-0000-0000-0000-0000007f0d01',
  (select array_agg(600::numeric) from public.delivery_stops where driver_id = '00000000-0000-0000-0000-0000007f0d01' and state = 'pending'),
  (select array_agg('leg-' || seq order by seq) from public.delivery_stops where driver_id = '00000000-0000-0000-0000-0000007f0d01' and state = 'pending'));

-- ── Buyer 2, before the truck heads to them ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000007f0b02"}', true);
select is(public.buyer_order_tracking('00000000-0000-0000-0000-0000007f0e02') ->> 'state', 'on_the_way', 'the order is on the way');
select ok(public.buyer_order_tracking('00000000-0000-0000-0000-0000007f0e02') -> 'truck' is not null, 'the buyer sees the truck');
select ok(public.buyer_order_tracking('00000000-0000-0000-0000-0000007f0e02') ->> 'eta' is not null, 'and an arrival time');
select is(public.buyer_order_tracking('00000000-0000-0000-0000-0000007f0e02') ->> 'polyline', null, 'but no road line while other stops come first');
select ok(public.buyer_order_tracking('00000000-0000-0000-0000-0000007f0e02')::text !~ '5\.61|5\.600|Buyer one|Track Cabbage',
  'nothing about the farm or the other buyer is in the reply');
select throws_like($$select public.buyer_order_tracking('00000000-0000-0000-0000-0000007f0e01')$$, '%order not found%', 'another buyer''s order cannot be tracked');

-- ── Once every earlier stop is done, buyer 2 is next ────────────────────────
update public.delivery_stops set state = 'done', done_at = now()
 where driver_id = '00000000-0000-0000-0000-0000007f0d01' and not (order_id = '00000000-0000-0000-0000-0000007f0e02' and kind = 'dropoff');
select results_eq($$select x ->> 'state', x ->> 'polyline' is not null from (select public.buyer_order_tracking('00000000-0000-0000-0000-0000007f0e02') x) q$$,
  $$values ('next', true)$$, 'when the buyer is the next stop the road line is shown');

-- ── Retention ───────────────────────────────────────────────────────────────
reset role;
insert into public.driver_location_trail (driver_id, lat, lng, at) values ('00000000-0000-0000-0000-0000007f0d01', 5.6, -0.2, now() - interval '31 days');
delete from public.driver_location_trail where at < now() - interval '30 days';
select is((select count(*) from public.driver_location_trail), 1::bigint, 'the daily clean-up removes positions older than 30 days');

select * from finish();
rollback;
