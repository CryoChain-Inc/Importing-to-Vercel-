-- shortfall: pay on what was collected, tolerance, automatic top-up, and what happens when nothing can be found.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

update public.ops_config set dispatch_start = '00:00', dispatch_end = '23:59:59', dispatch_wait_minutes = 0, detour_km = 25, pickup_tolerance_pct = 2;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000005f0f01', 'short-f1@test.local'), ('00000000-0000-0000-0000-0000005f0f02', 'short-f2@test.local'),
  ('00000000-0000-0000-0000-0000005f0f03', 'short-f3@test.local'), ('00000000-0000-0000-0000-0000005f0f04', 'short-f4@test.local'),
  ('00000000-0000-0000-0000-0000005f0f05', 'short-f5@test.local'), ('00000000-0000-0000-0000-0000005f0f06', 'short-f6-far@test.local'),
  ('00000000-0000-0000-0000-0000005f0b01', 'short-buyer@test.local'), ('00000000-0000-0000-0000-0000005f0d01', 'short-driver@test.local');
update public.profiles set role = 'driver' where id = '00000000-0000-0000-0000-0000005f0d01';
insert into public.buyers (id) values ('00000000-0000-0000-0000-0000005f0b01');
insert into public.farmers (id, address, latitude, longitude) values
  ('00000000-0000-0000-0000-0000005f0f01', 'F1 tomato', 5.600, -0.200), ('00000000-0000-0000-0000-0000005f0f02', 'F2 tomato', 5.630, -0.200),
  ('00000000-0000-0000-0000-0000005f0f03', 'F3 yam', 5.610, -0.200), ('00000000-0000-0000-0000-0000005f0f04', 'F4 okra', 5.605, -0.200),
  ('00000000-0000-0000-0000-0000005f0f05', 'F5 okra', 5.640, -0.200), ('00000000-0000-0000-0000-0000005f0f06', 'F6 yam, far', 8.600, -0.200);
insert into public.drivers (id) values ('00000000-0000-0000-0000-0000005f0d01');
insert into public.trucks (plate, capacity_kg, driver_id) values ('SHORT-1', 1000, '00000000-0000-0000-0000-0000005f0d01');
insert into public.driver_locations (driver_id, lat, lng) values ('00000000-0000-0000-0000-0000005f0d01', 5.600, -0.200);

insert into public.categories (id, name) values ('00000000-0000-0000-0000-0000005f0c01', 'Shortfall Test Category');
insert into public.products (id, name, unit, active, category_id) values
  ('00000000-0000-0000-0000-0000005f0a01', 'Short Tomato', 'kg', true, '00000000-0000-0000-0000-0000005f0c01'),
  ('00000000-0000-0000-0000-0000005f0a02', 'Short Yam', 'kg', true, '00000000-0000-0000-0000-0000005f0c01'),
  ('00000000-0000-0000-0000-0000005f0a03', 'Short Okra', 'kg', true, '00000000-0000-0000-0000-0000005f0c01');
insert into public.product_prices (product_id, price) values
  ('00000000-0000-0000-0000-0000005f0a01', 10), ('00000000-0000-0000-0000-0000005f0a02', 10), ('00000000-0000-0000-0000-0000005f0a03', 10);

create function pg_temp.list(p_farmer uuid, p_product text, p_kg numeric) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_farmer)::text, true);
  insert into public.produce_listings (farmer_id, product, unit, weight_kg, image_paths, created_at)
  values (p_farmer, p_product, 'kg', p_kg, array[p_farmer || '/a.jpg', p_farmer || '/b.jpg', p_farmer || '/c.jpg'], clock_timestamp());
end $$;
select pg_temp.list('00000000-0000-0000-0000-0000005f0f01', 'Short Tomato', 60);
select pg_temp.list('00000000-0000-0000-0000-0000005f0f01', 'Short Tomato', 60);
select pg_temp.list('00000000-0000-0000-0000-0000005f0f02', 'Short Tomato', 500);
select pg_temp.list('00000000-0000-0000-0000-0000005f0f03', 'Short Yam', 100);
select pg_temp.list('00000000-0000-0000-0000-0000005f0f06', 'Short Yam', 500);
select pg_temp.list('00000000-0000-0000-0000-0000005f0f04', 'Short Okra', 50);
select pg_temp.list('00000000-0000-0000-0000-0000005f0f05', 'Short Okra', 500);

create function pg_temp.pay(p_order uuid, p_product uuid, p_kg numeric) returns void language plpgsql as $$
begin
  insert into public.orders (id, buyer_id, amount, state, delivery_address, delivery_lat, delivery_lng)
  values (p_order, '00000000-0000-0000-0000-0000005f0b01', p_kg * 12, 'paid', 'Test buyer', 5.600, -0.190);
  insert into public.order_items (order_id, product_id, unit, kg, unit_price, line_total) values (p_order, p_product, 'kg', p_kg, 12, p_kg * 12);
  perform private.allocate_order(p_order);
end $$;
create function pg_temp.stop_of(p_order uuid, p_farmer uuid) returns uuid language sql as
  $$ select id from public.delivery_stops where order_id = p_order and farmer_id = p_farmer and kind = 'pickup' and state = 'pending' $$;
create function pg_temp.collect(p_order uuid, p_farmer uuid, p_kg numeric) returns void language plpgsql as $$
declare sid uuid := pg_temp.stop_of(p_order, p_farmer);
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000005f0d01"}', true);
  perform public.record_delivery_handover(sid, p_kg, 4, null, '00000000-0000-0000-0000-0000005f0d01/p.jpg', 'photo');
  perform public.complete_delivery_stop(sid);
end $$;

-- ── 80 of 100 over two listings, with another tomato farm nearby ────────────
select pg_temp.pay('00000000-0000-0000-0000-0000005f0e01', '00000000-0000-0000-0000-0000005f0a01', 100);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000005f0d01"}', true);
select throws_like($$select public.record_delivery_handover(pg_temp.stop_of('00000000-0000-0000-0000-0000005f0e01', '00000000-0000-0000-0000-0000005f0f01'), 150, 4, null, '00000000-0000-0000-0000-0000005f0d01/p.jpg', 'photo')$$,
  '%more than reserved%', 'the driver cannot record more than was reserved');
select pg_temp.collect('00000000-0000-0000-0000-0000005f0e01', '00000000-0000-0000-0000-0000005f0f01', 80);
select results_eq($$select kg from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e01' and farmer_id = '00000000-0000-0000-0000-0000005f0f01' and status = 'collected' order by kg desc$$,
  $$values (60::numeric), (20::numeric)$$, 'the 80 collected fills the older listing first: 60 then 20');
select is((select sum(amount) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e01' and farmer_id = '00000000-0000-0000-0000-0000005f0f01' and status = 'collected'),
  (select round(80 * max(farmer_price), 2) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e01'), 'the farmer is owed for 80, not 100');
select is((select sum(remaining_kg) from public.listing_stock where farmer_id = '00000000-0000-0000-0000-0000005f0f01'), 0::numeric, 'nothing unsold is left on the short farm''s listings');
select results_eq($$select kg, status from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e01' and farmer_id = '00000000-0000-0000-0000-0000005f0f02'$$,
  $$values (20::numeric, 'accepted')$$, 'the missing 20 is reserved at once from the next farm');
select is((select driver_id from public.delivery_stops where id = pg_temp.stop_of('00000000-0000-0000-0000-0000005f0e01', '00000000-0000-0000-0000-0000005f0f02')),
  '00000000-0000-0000-0000-0000005f0d01'::uuid, 'and the top-up pickup is on the same truck');
select is((select short_kg + tolerated_kg from public.order_items where order_id = '00000000-0000-0000-0000-0000005f0e01'), 0::numeric, 'nothing is short on the order');

-- ── 99 of 100 is inside the 2 % tolerance ───────────────────────────────────
select pg_temp.pay('00000000-0000-0000-0000-0000005f0e02', '00000000-0000-0000-0000-0000005f0a01', 100);
select pg_temp.collect('00000000-0000-0000-0000-0000005f0e02', '00000000-0000-0000-0000-0000005f0f02', 99);
select is((select tolerated_kg from public.order_items where order_id = '00000000-0000-0000-0000-0000005f0e02'), 1::numeric, 'a 1 % gap is recorded as tolerated');
select is((select count(*) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e02' and status in ('offered', 'accepted')), 0::bigint, 'with no top-up');
select is((select count(*) from public.ops_decisions where order_id = '00000000-0000-0000-0000-0000005f0e02' and status = 'open' and kind in ('short_supply', 'no_supply')), 0::bigint, 'and nothing for ops');

-- ── 70 of 100 with the only other farm far away ─────────────────────────────
select pg_temp.pay('00000000-0000-0000-0000-0000005f0e03', '00000000-0000-0000-0000-0000005f0a02', 100);
select pg_temp.collect('00000000-0000-0000-0000-0000005f0e03', '00000000-0000-0000-0000-0000005f0f03', 70);
select is((select short_kg from public.order_items where order_id = '00000000-0000-0000-0000-0000005f0e03'), 30::numeric, 'the 30 that cannot be found nearby is recorded as short');
select is((select count(*) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e03' and farmer_id = '00000000-0000-0000-0000-0000005f0f06'), 0::bigint, 'the far farm is not used');
select is((select count(*) from public.ops_decisions where order_id = '00000000-0000-0000-0000-0000005f0e03' and kind = 'short_supply' and status = 'open'), 1::bigint, 'ops get a short-supply item');
select is((select count(*) from public.ops_decisions where order_id = '00000000-0000-0000-0000-0000005f0e03' and kind = 'no_supply' and status = 'open'), 0::bigint, 'and not a second generic one');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000005f0b01' and title = 'Part of your order is short'), 1::bigint, 'the buyer is told');
select is((select state from public.delivery_stops where order_id = '00000000-0000-0000-0000-0000005f0e03' and kind = 'dropoff'), 'pending', 'the rest of the order is still delivered');

-- ── Nothing to collect ──────────────────────────────────────────────────────
select pg_temp.pay('00000000-0000-0000-0000-0000005f0e04', '00000000-0000-0000-0000-0000005f0a03', 50);
select pg_temp.collect('00000000-0000-0000-0000-0000005f0e04', '00000000-0000-0000-0000-0000005f0f04', 0);
select is((select status from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e04' and farmer_id = '00000000-0000-0000-0000-0000005f0f04'), 'declined', 'a farm with nothing is paid nothing');
select is((select kg from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e04' and farmer_id = '00000000-0000-0000-0000-0000005f0f05' and status = 'accepted'), 50::numeric, 'and the whole line moves to the next farm');

-- ── A farmer reports a shortage before the truck arrives ────────────────────
select pg_temp.pay('00000000-0000-0000-0000-0000005f0e05', '00000000-0000-0000-0000-0000005f0a03', 100);
-- Everything in this test shares one transaction time; in real use the later order is newer.
update public.order_allocations set created_at = now() + interval '1 minute' where order_id = '00000000-0000-0000-0000-0000005f0e05';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000005f0f05"}', true);
select throws_like($$select public.report_listing_shortage((select id from public.produce_listings where farmer_id = '00000000-0000-0000-0000-0000005f0f05'), 150)$$,
  '%enter less than%', 'reporting no shortage is refused');
select lives_ok($$select public.report_listing_shortage((select id from public.produce_listings where farmer_id = '00000000-0000-0000-0000-0000005f0f05'), 100)$$, 'the farmer reports having 100 of the 150 reserved');
select results_eq($$select (select short_kg from public.order_items where order_id = '00000000-0000-0000-0000-0000005f0e05'),
                          (select sum(kg) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e05' and status = 'accepted'),
                          (select sum(kg) from public.order_allocations where order_id = '00000000-0000-0000-0000-0000005f0e04' and status = 'accepted')$$,
  $$values (50::numeric, 50::numeric, 50::numeric)$$, 'the newest reservation gives way: 50 short on it, the older one untouched');

select * from finish();
rollback;
