-- refunds: a short quantity becomes one refund request; only ops can approve it; results apply once.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000ef0b01', 'refund-buyer@test.local'), ('00000000-0000-0000-0000-000000ef0001', 'refund-ops@test.local');
update public.profiles set role = 'ops' where id = '00000000-0000-0000-0000-000000ef0001';
insert into public.buyers (id) values ('00000000-0000-0000-0000-000000ef0b01');
insert into public.categories (id, name) values ('00000000-0000-0000-0000-000000ef0c01', 'Refund Test Category');
insert into public.products (id, name, unit, active, category_id) values
  ('00000000-0000-0000-0000-000000ef0a01', 'Refund Tomato', 'kg', true, '00000000-0000-0000-0000-000000ef0c01'),
  ('00000000-0000-0000-0000-000000ef0a02', 'Refund Okra', 'kg', true, '00000000-0000-0000-0000-000000ef0c01');
insert into public.orders (id, buyer_id, amount, state) values
  ('00000000-0000-0000-0000-000000ef0e01', '00000000-0000-0000-0000-000000ef0b01', 1800, 'paid'),
  ('00000000-0000-0000-0000-000000ef0e02', '00000000-0000-0000-0000-000000ef0b01', 1200, 'paid');
insert into public.order_items (order_id, product_id, unit, kg, unit_price, line_total) values
  ('00000000-0000-0000-0000-000000ef0e01', '00000000-0000-0000-0000-000000ef0a01', 'kg', 100, 12, 1200),
  ('00000000-0000-0000-0000-000000ef0e01', '00000000-0000-0000-0000-000000ef0a02', 'kg', 50, 12, 600),
  ('00000000-0000-0000-0000-000000ef0e02', '00000000-0000-0000-0000-000000ef0a01', 'kg', 100, 12, 1200);
-- Order 1 was paid online; order 2 by bank transfer.
insert into public.payments (id, order_id, reference, amount_pesewas, status, paid_at)
values ('00000000-0000-0000-0000-000000ef0f01', '00000000-0000-0000-0000-000000ef0e01', 'REFUND-TEST-REF', 180000, 'success', now());

-- ── A request is created and kept up to date ────────────────────────────────
update public.order_items set short_kg = 20 where order_id = '00000000-0000-0000-0000-000000ef0e01' and product_id = '00000000-0000-0000-0000-000000ef0a01';
select results_eq($$select amount, status, payment_id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'$$,
  $$values (240::numeric, 'requested', '00000000-0000-0000-0000-000000ef0f01'::uuid)$$, '20 short at GH₵ 12 asks for GH₵ 240 against the online payment');
update public.order_items set short_kg = 10 where order_id = '00000000-0000-0000-0000-000000ef0e01' and product_id = '00000000-0000-0000-0000-000000ef0a02';
select results_eq($$select count(*), sum(amount) from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'$$,
  $$values (1::bigint, 360::numeric)$$, 'a second short product grows the same request instead of adding one');

-- ── Only ops can approve, and only once ─────────────────────────────────────
select throws_like($$select * from public.claim_refund((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), '00000000-0000-0000-0000-000000ef0b01')$$,
  '%ops only%', 'a buyer cannot approve a refund');
select results_eq($$select reference, amount_pesewas from public.claim_refund((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), '00000000-0000-0000-0000-000000ef0001')$$,
  $$values ('REFUND-TEST-REF', 36000::bigint)$$, 'ops approval hands back the payment reference and the amount in pesewas');
select throws_like($$select * from public.claim_refund((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), '00000000-0000-0000-0000-000000ef0001')$$,
  '%not waiting for approval%', 'a second approval is refused, so it cannot be sent twice');

-- ── Paystack's answers ──────────────────────────────────────────────────────
select public.apply_refund_result((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), 'sent', '991', null);
select public.apply_refund_result((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), 'failed', null, 'bank declined');
select results_eq($$select status, last_error from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'$$, $$values ('failed', 'bank declined')$$, 'a failure is recorded with its reason');
select lives_ok($$select * from public.claim_refund((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), '00000000-0000-0000-0000-000000ef0001')$$, 'a failed refund can be approved again');
select public.apply_refund_result((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), 'refunded', '992', null);
select public.apply_refund_result((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), 'refunded', '992', null);
select public.apply_refund_result((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), 'failed', null, 'late event');
select is((select status from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01'), 'refunded', 'refunded is final, whatever arrives afterwards');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000ef0b01' and title = 'Refund sent'), 1::bigint, 'the buyer is told once');

-- ── More goes short after a refund: only the difference is asked for ────────
update public.order_items set short_kg = 25 where order_id = '00000000-0000-0000-0000-000000ef0e01' and product_id = '00000000-0000-0000-0000-000000ef0a01';
select results_eq($$select amount from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e01' and status = 'requested'$$, $$values (60::numeric)$$, '5 more short asks for GH₵ 60, not the whole amount again');

-- ── Bank-transfer order: by hand ────────────────────────────────────────────
update public.order_items set short_kg = 10 where order_id = '00000000-0000-0000-0000-000000ef0e02';
select throws_like($$select * from public.claim_refund((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e02'), '00000000-0000-0000-0000-000000ef0001')$$,
  '%no online payment%', 'an order not paid online cannot be sent to Paystack');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ef0b01"}', true);
select throws_like($$select public.mark_refund_done((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e02'), 'sent by bank')$$, '%ops only%', 'a buyer cannot mark a refund done');
select is((select count(*) from public.refunds), 3::bigint, 'the buyer can see their own refunds');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000ef0001"}', true);
select lives_ok($$select public.mark_refund_done((select id from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e02'), 'Sent by bank transfer, ref 123')$$, 'ops mark a hand refund done with a note');
reset role;
select is((select status from public.refunds where order_id = '00000000-0000-0000-0000-000000ef0e02'), 'refunded', 'and it is recorded as refunded');

select * from finish();
rollback;
