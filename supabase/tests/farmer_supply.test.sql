-- farmer-supply: stock breakdown and what a farmer may edit once produce is reserved.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'farmer-supply-farmer@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'farmer-supply-buyer@test.local');
insert into public.buyers (id) values ('00000000-0000-0000-0000-0000000000b1');
insert into public.farmers (id, address, latitude, longitude)
values ('00000000-0000-0000-0000-0000000000f1', 'Test farm', 5.6, -0.18);
insert into public.categories (id, name) values ('00000000-0000-0000-0000-0000000000aa', 'Supply Test Category');
insert into public.products (id, name, unit, active, category_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'Supply Test Crop', 'kg', true, '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-0000000000a2', 'Supply Other Crop', 'kg', true, '00000000-0000-0000-0000-0000000000aa');
insert into public.product_prices (product_id, price) values
  ('00000000-0000-0000-0000-0000000000a1', 10), ('00000000-0000-0000-0000-0000000000a2', 10);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);

insert into public.produce_listings (id, farmer_id, product, unit, weight_kg, image_paths)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'Supply Test Crop', 'kg', 80,
  array['00000000-0000-0000-0000-0000000000f1/a.jpg', '00000000-0000-0000-0000-0000000000f1/b.jpg', '00000000-0000-0000-0000-0000000000f1/c.jpg']);

-- Nothing reserved: everything can change.
select lives_ok($$select public.update_own_listing('00000000-0000-0000-0000-0000000000c1', 'Supply Other Crop', 'kg', 50)$$, 'unreserved: product and quantity change');
select lives_ok($$select public.update_own_listing('00000000-0000-0000-0000-0000000000c1', 'Supply Test Crop', 'kg', 100)$$, 'unreserved: change back');
select is(
  public.update_own_listing_photos('00000000-0000-0000-0000-0000000000c1',
    array['00000000-0000-0000-0000-0000000000f1/a.jpg', '00000000-0000-0000-0000-0000000000f1/b.jpg', '00000000-0000-0000-0000-0000000000f1/d.jpg']),
  array['00000000-0000-0000-0000-0000000000f1/c.jpg'], 'unreserved: a photo can be replaced, the dropped path is returned');
select throws_ok($$select public.update_own_listing_photos('00000000-0000-0000-0000-0000000000c1', array['00000000-0000-0000-0000-0000000000f1/a.jpg'])$$,
  'add 3 to 6 photos', 'fewer than 3 photos is refused');
select throws_ok($$select public.update_own_listing_photos('00000000-0000-0000-0000-0000000000c1', array['x/a.jpg', 'x/b.jpg', 'x/c.jpg'])$$,
  'invalid photo path', 'photos outside the farmer''s folder are refused');

-- A paid order reserves 60 of the 100.
insert into public.orders (id, buyer_id, amount, state)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 720, 'paid');
insert into public.order_allocations (id, order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, status)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'kg', 60, 8, 480, 'accepted');

select results_eq(
  $$select listed_kg, reserved_kg, collected_kg, remaining_kg from public.listing_stock where listing_id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values (100::numeric, 60::numeric, 0::numeric, 40::numeric)$$, 'reserved: 100 listed / 60 reserved / 0 collected / 40 available');

select throws_like($$select public.update_own_listing('00000000-0000-0000-0000-0000000000c1', 'Supply Test Crop', 'kg', 50)$$,
  '%60%already reserved', 'reserved: quantity below the reserved amount is refused and names it');
select lives_ok($$select public.update_own_listing('00000000-0000-0000-0000-0000000000c1', 'Supply Test Crop', 'kg', 60)$$, 'reserved: quantity down to the reserved amount');
select lives_ok($$select public.update_own_listing('00000000-0000-0000-0000-0000000000c1', 'Supply Test Crop', 'kg', 150)$$, 'reserved: quantity can go up');
select throws_like($$select public.update_own_listing('00000000-0000-0000-0000-0000000000c1', 'Supply Other Crop', 'kg', 150)$$,
  '%product and unit cannot change', 'reserved: product cannot change');
select throws_like($$select public.delete_own_listing('00000000-0000-0000-0000-0000000000c1')$$, '%cannot be removed', 'reserved: cannot delete');
select lives_ok($$select public.update_own_listing_photos('00000000-0000-0000-0000-0000000000c1',
  array['00000000-0000-0000-0000-0000000000f1/a.jpg', '00000000-0000-0000-0000-0000000000f1/b.jpg', '00000000-0000-0000-0000-0000000000f1/d.jpg', '00000000-0000-0000-0000-0000000000f1/e.jpg'])$$,
  'reserved: a photo can be added');
select throws_ok($$select public.update_own_listing_photos('00000000-0000-0000-0000-0000000000c1',
  array['00000000-0000-0000-0000-0000000000f1/a.jpg', '00000000-0000-0000-0000-0000000000f1/b.jpg', '00000000-0000-0000-0000-0000000000f1/e.jpg'])$$,
  'photos of reserved produce cannot be removed', 'reserved: a photo cannot be removed');

-- The driver collects the 60.
update public.order_allocations set status = 'collected' where id = '00000000-0000-0000-0000-0000000000e1';
select results_eq(
  $$select listed_kg, reserved_kg, collected_kg, remaining_kg from public.listing_stock where listing_id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values (150::numeric, 0::numeric, 60::numeric, 90::numeric)$$, 'collected: reserved moves to collected');
select lives_ok($$select public.update_own_listing('00000000-0000-0000-0000-0000000000c1', 'Supply Test Crop', 'kg', 60)$$, 'part collected: quantity down to what was collected');

-- Everything listed has now been collected: frozen.
select throws_like($$select public.update_own_listing('00000000-0000-0000-0000-0000000000c1', 'Supply Test Crop', 'kg', 200)$$,
  '%been collected%', 'fully collected: quantity is frozen');
select throws_like($$select public.update_own_listing_photos('00000000-0000-0000-0000-0000000000c1',
  array['00000000-0000-0000-0000-0000000000f1/a.jpg', '00000000-0000-0000-0000-0000000000f1/b.jpg', '00000000-0000-0000-0000-0000000000f1/d.jpg', '00000000-0000-0000-0000-0000000000f1/e.jpg', '00000000-0000-0000-0000-0000000000f1/f.jpg'])$$,
  '%been collected%', 'fully collected: photos are frozen');

select * from finish();
rollback;
