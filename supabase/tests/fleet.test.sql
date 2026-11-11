-- fleet: who may manage trucks, and the rules that keep dispatch's view of the fleet sane.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f101', 'fleet-ops@test.local'),
  ('00000000-0000-0000-0000-00000000f102', 'fleet-driver-a@test.local'),
  ('00000000-0000-0000-0000-00000000f103', 'fleet-driver-b@test.local');
update public.profiles set role = 'ops' where id = '00000000-0000-0000-0000-00000000f101';
update public.profiles set role = 'driver' where id in ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-00000000f103');
insert into public.drivers (id) values ('00000000-0000-0000-0000-00000000f102'), ('00000000-0000-0000-0000-00000000f103');

set local role authenticated;

-- Ops
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f101"}', true);
select lives_ok($$insert into public.trucks (id, plate, capacity_kg, driver_id) values
  ('00000000-0000-0000-0000-00000000f1a1', 'FLEET-T1', 1000, '00000000-0000-0000-0000-00000000f102'),
  ('00000000-0000-0000-0000-00000000f1a2', 'FLEET-T2', 1000, null)$$, 'ops can add trucks');
select throws_ok($$insert into public.trucks (plate, capacity_kg) values ('FLEET-T1', 500)$$, '23505', null, 'a plate cannot be used twice');
select throws_ok($$update public.trucks set driver_id = '00000000-0000-0000-0000-00000000f102' where plate = 'FLEET-T2'$$, '23505', null, 'a driver cannot hold two trucks');
select throws_ok($$update public.trucks set active = false where plate = 'FLEET-T1'$$, '23514', null, 'a truck with a driver cannot be retired');
select throws_ok($$insert into public.trucks (plate, capacity_kg) values ('FLEET-T3', 0)$$, '23514', null, 'capacity must be above zero');
select lives_ok($$update public.trucks set driver_id = null, active = false where plate = 'FLEET-T1'$$, 'ops can unassign and retire a truck');
update public.trucks set active = true, driver_id = '00000000-0000-0000-0000-00000000f102' where plate = 'FLEET-T1';

-- Driver A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f102"}', true);
select results_eq($$select plate from public.trucks where plate like 'FLEET-%'$$, $$values ('FLEET-T1')$$, 'a driver sees only their own truck');
select throws_ok($$insert into public.trucks (plate, capacity_kg) values ('FLEET-T9', 1000)$$, '42501', null, 'a driver cannot add a truck');
update public.trucks set capacity_kg = 9999 where plate = 'FLEET-T1';
reset role;
select is((select capacity_kg from public.trucks where plate = 'FLEET-T1'), 1000::numeric, 'a driver cannot change their truck');

select * from finish();
rollback;
