-- ops-control: every manual action is ops-only, keeps the rules, and is logged.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

update public.ops_config set dispatch_start = '00:00', dispatch_end = '23:59:59', dispatch_wait_minutes = 0, detour_km = 25, pickup_tolerance_pct = 2;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000c00001', 'ctl-ops@test.local'), ('00000000-0000-0000-0000-000000c0f001', 'ctl-farmer-1@test.local'),
  ('00000000-0000-0000-0000-000000c0f002', 'ctl-farmer-2@test.local'), ('00000000-0000-0000-0000-000000c0b001', 'ctl-buyer@test.local'),
  ('00000000-0000-0000-0000-000000c0d001', 'ctl-driver-1@test.local'), ('00000000-0000-0000-0000-000000c0d002', 'ctl-driver-2@test.local');
update public.profiles set role = 'ops' where id = '00000000-0000-0000-0000-000000c00001';
update public.profiles set role = 'driver' where id in ('00000000-0000-0000-0000-000000c0d001', '00000000-0000-0000-0000-000000c0d002');
insert into public.buyers (id) values ('00000000-0000-0000-0000-000000c0b001');
insert into public.farmers (id, address, latitude, longitude) values
  ('00000000-0000-0000-0000-000000c0f001', 'Farm one', 5.600, -0.200), ('00000000-0000-0000-0000-000000c0f002', 'Farm two', 5.620, -0.200);
insert into public.drivers (id) values ('00000000-0000-0000-0000-000000c0d001'), ('00000000-0000-0000-0000-000000c0d002');
insert into public.trucks (plate, capacity_kg, driver_id) values
  ('CTL-1', 1000, '00000000-0000-0000-0000-000000c0d001'), ('CTL-2', 150, '00000000-0000-0000-0000-000000c0d002');
insert into public.driver_locations (driver_id, lat, lng) values
  ('00000000-0000-0000-0000-000000c0d001', 5.600, -0.200), ('00000000-0000-0000-0000-000000c0d002', 5.900, -0.200);
insert into public.categories (id, name) values ('00000000-0000-0000-0000-000000c0c001', 'Control Test Category');
insert into public.products (id, name, unit, active, category_id) values ('00000000-0000-0000-0000-000000c0a001', 'Control Carrot', 'kg', true, '00000000-0000-0000-0000-000000c0c001');
insert into public.product_prices (product_id, price) values ('00000000-0000-0000-0000-000000c0a001', 10);
create function pg_temp.list(p_farmer uuid, p_kg numeric) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_farmer)::text, true);
  insert into public.produce_listings (farmer_id, product, unit, weight_kg, image_paths)
  values (p_farmer, 'Control Carrot', 'kg', p_kg, array[p_farmer || '/a.jpg', p_farmer || '/b.jpg', p_farmer || '/c.jpg']);
end $$;
select pg_temp.list('00000000-0000-0000-0000-000000c0f001', 300);
select pg_temp.list('00000000-0000-0000-0000-000000c0f002', 300);
create function pg_temp.pay(p_order uuid, p_kg numeric, p_lat numeric) returns void language plpgsql as $$
begin
  insert into public.orders (id, buyer_id, amount, state, delivery_address, delivery_lat, delivery_lng)
  values (p_order, '00000000-0000-0000-0000-000000c0b001', p_kg * 12, 'paid', 'Buyer', p_lat, -0.190);
  insert into public.order_items (order_id, product_id, unit, kg, unit_price, line_total) values (p_order, '00000000-0000-0000-0000-000000c0a001', 'kg', p_kg, 12, p_kg * 12);
  perform private.allocate_order(p_order);
end $$;
create function pg_temp.pickup(p_order uuid) returns uuid language sql as $$ select id from public.delivery_stops where order_id = p_order and kind = 'pickup' and state = 'pending' limit 1 $$;
create function pg_temp.driver_of(p_order uuid) returns uuid language sql as $$ select max(driver_id::text)::uuid from public.delivery_stops where order_id = p_order and state = 'pending' $$;

select pg_temp.pay('00000000-0000-0000-0000-000000c0e001', 100, 5.610);
select pg_temp.pay('00000000-0000-0000-0000-000000c0e002', 100, 5.640);

-- ── Only ops, and only with a reason ────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000c0b001"}', true);
select throws_like($$select public.ops_reassign_order('00000000-0000-0000-0000-000000c0e001', null, 'x')$$, '%ops only%', 'a buyer cannot move an order');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000c00001"}', true);
select throws_like($$select public.ops_reassign_order('00000000-0000-0000-0000-000000c0e001', null, '  ')$$, '%give a reason%', 'a reason is required');

-- ── Move an order between trucks ────────────────────────────────────────────
select is(public.ops_reassign_order('00000000-0000-0000-0000-000000c0e001', '00000000-0000-0000-0000-000000c0d002', 'Truck 1 has a flat tyre'), null, 'moving 100 onto a 150 truck gives no warning');
select is(pg_temp.driver_of('00000000-0000-0000-0000-000000c0e001'), '00000000-0000-0000-0000-000000c0d002'::uuid, 'the order is on the other truck');
select matches(public.ops_reassign_order('00000000-0000-0000-0000-000000c0e002', '00000000-0000-0000-0000-000000c0d002', 'Same area'), 'carries 200 against a capacity of 150', 'over capacity is a warning, not a block');
select is(pg_temp.driver_of('00000000-0000-0000-0000-000000c0e002'), '00000000-0000-0000-0000-000000c0d002'::uuid, 'and the move still happens');
select throws_like($$select public.ops_reassign_order('00000000-0000-0000-0000-000000c0e001', '00000000-0000-0000-0000-000000c00001', 'x')$$, '%no truck%', 'a driver without a truck is refused');

-- ── Reorder by hand, and the order holds ────────────────────────────────────
select throws_like(format($$select public.ops_reorder_stops('00000000-0000-0000-0000-000000c0d002', array[%L, %L, %L, %L]::uuid[], 'x')$$,
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-000000c0e002' and kind = 'dropoff'),
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-000000c0e002' and kind = 'pickup'),
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-000000c0e001' and kind = 'pickup'),
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-000000c0e001' and kind = 'dropoff')),
  '%after its pickups%', 'a delivery cannot come before its pickup');
create temp table wanted as select array[
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-000000c0e002' and kind = 'pickup'),
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-000000c0e002' and kind = 'dropoff'),
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-000000c0e001' and kind = 'pickup'),
  (select id from public.delivery_stops where order_id = '00000000-0000-0000-0000-000000c0e001' and kind = 'dropoff')] as ids;
select lives_ok($$select public.ops_reorder_stops('00000000-0000-0000-0000-000000c0d002', (select ids from wanted), 'Buyer two closes at noon')$$, 'ops set the order by hand');
select private.plan_routes();
select is((select array_agg(id order by seq) from public.delivery_stops where driver_id = '00000000-0000-0000-0000-000000c0d002' and state = 'pending'),
  (select ids from wanted), 'an automatic re-plan keeps it');
select lives_ok($$select public.ops_unlock_route('00000000-0000-0000-0000-000000c0d002', 'Back to automatic')$$, 'ops can unlock');
select is((select route_locked from public.drivers where id = '00000000-0000-0000-0000-000000c0d002'), false, 'and the route is automatic again');

-- ── Re-source and cancel a line ─────────────────────────────────────────────
select public.ops_resource_line(pg_temp.pickup('00000000-0000-0000-0000-000000c0e001'), 'Farmer not answering');
select is((select farmer_id from public.order_allocations where order_id = '00000000-0000-0000-0000-000000c0e001' and status = 'accepted'),
  '00000000-0000-0000-0000-000000c0f002'::uuid, 're-sourcing moves the line to another farm');
select public.ops_cancel_line(pg_temp.pickup('00000000-0000-0000-0000-000000c0e002'), 'Road closed');
select is((select short_kg from public.order_items where order_id = '00000000-0000-0000-0000-000000c0e002'), 100::numeric, 'cancelling records the line as short');
select is((select amount from public.refunds where order_id = '00000000-0000-0000-0000-000000c0e002'), 1200::numeric, 'and the refund request follows');

-- ── Complete a stop for the driver, then correct it ─────────────────────────
select throws_like(format($$select public.ops_complete_stop(%L, 150, 4, 'Phone dead')$$, pg_temp.pickup('00000000-0000-0000-0000-000000c0e001')),
  '%between 0 and 100%', 'ops cannot record more than reserved');
create temp table line as select pg_temp.pickup('00000000-0000-0000-0000-000000c0e001') as id;
select lives_ok($$select public.ops_complete_stop((select id from line), 90, 4, 'Driver phone dead, confirmed by call')$$, 'ops complete the pickup');
select is((select sum(amount) from public.order_allocations where pickup_stop_id = (select id from line) and status = 'collected'), 720::numeric, 'the farmer is owed for 90');
select lives_ok($$select public.ops_correct_pickup((select id from line), 95, 'Scale ticket says 95')$$, 'ops correct the quantity');
select results_eq($$select coalesce(sum(kg) filter (where status = 'collected'), 0), coalesce(sum(kg) filter (where status = 'declined'), 0)
                     from public.order_allocations where pickup_stop_id = (select id from line)$$,
  $$values (95::numeric, 5::numeric)$$, 'collected becomes 95, the rest stays recorded as not supplied');

-- ── Logged ──────────────────────────────────────────────────────────────────
select is((select count(*) from public.ops_actions where order_id is not null), 6::bigint, 'every action on an order that went through is logged');
update public.ops_config set pickup_tolerance_pct = 3;
select is((select details -> 'pickup_tolerance_pct' ->> 'to' from public.ops_actions where action = 'settings' order by id desc limit 1)::numeric, 3::numeric, 'a settings change is logged with the new value');

select * from finish();
rollback;
