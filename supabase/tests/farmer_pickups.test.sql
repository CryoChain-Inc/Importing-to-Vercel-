-- farmer-pickups: a farmer sees each pickup line with expected, collected and short quantities, and only their own.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

update public.ops_config set dispatch_start = '00:00', dispatch_end = '23:59:59', dispatch_wait_minutes = 0, detour_km = 25, pickup_tolerance_pct = 2;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000009f0f01', 'pickups-farmer@test.local'), ('00000000-0000-0000-0000-0000009f0f02', 'pickups-other@test.local'),
  ('00000000-0000-0000-0000-0000009f0b01', 'pickups-buyer@test.local'), ('00000000-0000-0000-0000-0000009f0d01', 'pickups-driver@test.local');
update public.profiles set role = 'driver' where id = '00000000-0000-0000-0000-0000009f0d01';
insert into public.buyers (id) values ('00000000-0000-0000-0000-0000009f0b01');
insert into public.farmers (id, address, latitude, longitude) values
  ('00000000-0000-0000-0000-0000009f0f01', 'Farm', 5.600, -0.200), ('00000000-0000-0000-0000-0000009f0f02', 'Other', 5.601, -0.200);
insert into public.drivers (id) values ('00000000-0000-0000-0000-0000009f0d01');
insert into public.trucks (plate, capacity_kg, driver_id) values ('PICKUPS-1', 1000, '00000000-0000-0000-0000-0000009f0d01');
insert into public.driver_locations (driver_id, lat, lng) values ('00000000-0000-0000-0000-0000009f0d01', 5.600, -0.200);
insert into public.categories (id, name) values ('00000000-0000-0000-0000-0000009f0c01', 'Pickups Test Category');
insert into public.products (id, name, unit, active, category_id) values
  ('00000000-0000-0000-0000-0000009f0a01', 'Pickups Pepper', 'kg', true, '00000000-0000-0000-0000-0000009f0c01'),
  ('00000000-0000-0000-0000-0000009f0a02', 'Pickups Garden Egg', 'kg', true, '00000000-0000-0000-0000-0000009f0c01');
insert into public.product_prices (product_id, price) values ('00000000-0000-0000-0000-0000009f0a01', 10), ('00000000-0000-0000-0000-0000009f0a02', 10);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009f0f01"}', true);
insert into public.produce_listings (farmer_id, product, unit, weight_kg, image_paths) values
  ('00000000-0000-0000-0000-0000009f0f01', 'Pickups Pepper', 'kg', 100, array['00000000-0000-0000-0000-0000009f0f01/a.jpg', '00000000-0000-0000-0000-0000009f0f01/b.jpg', '00000000-0000-0000-0000-0000009f0f01/c.jpg']),
  ('00000000-0000-0000-0000-0000009f0f01', 'Pickups Garden Egg', 'kg', 100, array['00000000-0000-0000-0000-0000009f0f01/a.jpg', '00000000-0000-0000-0000-0000009f0f01/b.jpg', '00000000-0000-0000-0000-0000009f0f01/c.jpg']);

insert into public.orders (id, buyer_id, amount, state, delivery_address, delivery_lat, delivery_lng) values
  ('00000000-0000-0000-0000-0000009f0e01', '00000000-0000-0000-0000-0000009f0b01', 1200, 'paid', 'Buyer', 5.600, -0.190);
insert into public.order_items (order_id, product_id, unit, kg, unit_price, line_total) values
  ('00000000-0000-0000-0000-0000009f0e01', '00000000-0000-0000-0000-0000009f0a01', 'kg', 100, 12, 1200);
select private.allocate_order('00000000-0000-0000-0000-0000009f0e01');

select results_eq($$select x ->> 'state', (x ->> 'expected')::numeric, x ->> 'eta' is not null from jsonb_array_elements(public.farmer_pickups()) x$$,
  $$values ('on_the_way', 100::numeric, true)$$, 'a reserved line shows as on the way, with the quantity and arrival time');

-- The driver collects 80; no other pepper farm exists, so 20 is short.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009f0d01"}', true);
select public.record_delivery_handover((select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-0000009f0e01' and kind = 'pickup'), 80, 4, null, '00000000-0000-0000-0000-0000009f0d01/p.jpg', 'photo');
select public.complete_delivery_stop((select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-0000009f0e01' and kind = 'pickup'));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009f0f01"}', true);
select is(jsonb_array_length(public.farmer_pickups()), 1, 'the short part does not appear as a second pickup');
select results_eq($$select x ->> 'state', (x ->> 'expected')::numeric, (x ->> 'collected')::numeric, (x ->> 'short')::numeric, (x ->> 'earning')::numeric
                     from jsonb_array_elements(public.farmer_pickups()) x$$,
  $$values ('collected', 100::numeric, 80::numeric, 20::numeric, 640::numeric)$$, 'expected 100, collected 80, short 20, earning for 80');
select ok((select (x ->> 'collectedAt') is not null from jsonb_array_elements(public.farmer_pickups()) x), 'the collection time is shown');

-- A second order waits for a truck: the only truck is still busy and the order does not join it (window not reached and it is a new route).
update public.trucks set active = false, driver_id = null where plate = 'PICKUPS-1';
insert into public.orders (id, buyer_id, amount, state, delivery_address, delivery_lat, delivery_lng) values
  ('00000000-0000-0000-0000-0000009f0e02', '00000000-0000-0000-0000-0000009f0b01', 600, 'paid', 'Buyer', 5.600, -0.190);
insert into public.order_items (order_id, product_id, unit, kg, unit_price, line_total) values
  ('00000000-0000-0000-0000-0000009f0e02', '00000000-0000-0000-0000-0000009f0a02', 'kg', 50, 12, 600);
select private.allocate_order('00000000-0000-0000-0000-0000009f0e02');
select results_eq($$select x ->> 'product', x ->> 'state' from jsonb_array_elements(public.farmer_pickups()) x limit 1$$,
  $$values ('Pickups Garden Egg', 'waiting')$$, 'upcoming pickups come first; one with no truck yet is waiting');
select ok(not (public.farmer_pickups()::text ilike '%Buyer%'), 'nothing about the buyer is included');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000009f0f02"}', true);
select is(public.farmer_pickups(), '[]'::jsonb, 'another farmer sees none of it');

select * from finish();
rollback;
