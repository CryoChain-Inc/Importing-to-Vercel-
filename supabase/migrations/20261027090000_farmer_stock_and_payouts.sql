-- Farmer stock tracking and per-order farmer payouts.
--   Stock: a listing's remaining kg falls the moment a buyer's payment allocates it (settle_paystack_payment ->
--   allocate_order). Nothing is copied or decremented by hand: listing_stock derives listed / sold / delivered /
--   withdrawn / remaining from order_allocations, so it cannot drift from the shop's supply.
--   Payouts: an allocation becomes payable when its order is delivered (the drop-off stop is done). Ops puts payable
--   allocations into a payout run (same preflight / approval / release flow as before) and the farmer is paid once
--   Paystack confirms the transfer.

-- ── Payout state on each allocation ─────────────────────────────────────────
alter table public.order_allocations
  add column payout_status text not null default 'pending' check (payout_status in ('pending', 'payable', 'paid')),
  add column delivered_at timestamptz,
  add column paid_at timestamptz;

create index order_allocations_payout_idx on public.order_allocations (payout_status) where payout_status = 'payable';

-- A transfer now pays either a legacy settlement or an allocation.
alter table public.payout_transfers
  alter column settlement_id drop not null,
  add column allocation_id uuid references public.order_allocations (id),
  add constraint payout_transfers_one_target check ((settlement_id is null) <> (allocation_id is null));
-- An allocation has at most one live transfer, so it can never be paid twice.
create unique index payout_transfers_one_live_alloc on public.payout_transfers (allocation_id)
  where allocation_id is not null and status <> 'cancelled';

-- ── Stock per listing ───────────────────────────────────────────────────────
-- sold = a buyer has paid and the kg is allocated here (offered, accepted or collected).
-- withdrawn = the farmer declined or let the offer lapse, so those kg are no longer available from this listing.
create view public.listing_stock with (security_invoker = true) as
select
  l.id as listing_id,
  l.farmer_id,
  l.weight_kg as listed_kg,
  coalesce(sum(a.kg) filter (where a.status in ('offered', 'accepted', 'collected')), 0) as sold_kg,
  coalesce(sum(a.kg) filter (where a.status = 'collected' and a.payout_status <> 'pending'), 0) as delivered_kg,
  coalesce(sum(a.kg) filter (where a.status in ('declined', 'expired')), 0) as withdrawn_kg,
  greatest(0, l.weight_kg - coalesce(sum(a.kg) filter (where a.status in ('offered', 'accepted', 'collected', 'declined', 'expired')), 0)) as remaining_kg,
  coalesce(sum(a.amount) filter (where a.status in ('offered', 'accepted', 'collected')), 0) as earned,
  coalesce(sum(a.amount) filter (where a.payout_status = 'paid'), 0) as paid_out
from public.produce_listings l
left join public.order_allocations a on a.listing_id = l.id
group by l.id;

revoke all on public.listing_stock from anon, authenticated;
grant select on public.listing_stock to authenticated;
comment on view public.listing_stock is 'Per listing: kg listed, sold (paid by buyers), delivered, withdrawn and remaining, with what it has earned.';

-- ── A listing that has sold kg can no longer be removed or reshaped ─────────
create or replace function public.update_own_listing(p_id uuid, p_product text, p_grade text, p_weight_kg numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  l public.produce_listings;
  committed numeric;
  e record;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select * into l from public.produce_listings where id = p_id and farmer_id = uid for update;
  if not found then
    raise exception 'listing not found';
  end if;
  if l.lot_id is not null then
    raise exception 'already in a lot';
  end if;
  if p_grade not in ('A', 'B', 'C') then
    raise exception 'invalid grade';
  end if;
  if p_weight_kg is null or p_weight_kg <= 0 or p_weight_kg >= 100000000 then
    raise exception 'invalid weight';
  end if;
  if not exists (select 1 from public.products p where p.name = btrim(p_product) and p.active) then
    raise exception 'unknown product';
  end if;

  select coalesce(sum(a.kg), 0) into committed
    from public.order_allocations a
   where a.listing_id = p_id and a.status in ('offered', 'accepted', 'collected', 'declined', 'expired');
  if committed > 0 and (btrim(p_product) <> l.product or p_grade <> l.grade) then
    raise exception 'part of this listing is already sold, so the product and grade cannot change';
  end if;
  if p_weight_kg < committed then
    raise exception 'weight cannot be below the % kg already sold', committed;
  end if;

  select * into e from public.estimate_listing(btrim(p_product), p_weight_kg, p_grade);
  if e.price_per_kg is null then
    raise exception 'no published price for this product and grade';
  end if;
  update public.produce_listings
     set product = btrim(p_product),
         grade = p_grade,
         weight_kg = p_weight_kg,
         est_price_per_kg = e.price_per_kg,
         est_gross = e.gross,
         est_fee_rate = e.fee_rate,
         est_fee = e.fee,
         est_net = e.net
   where id = p_id and farmer_id = uid;
end;
$$;

create or replace function public.delete_own_listing(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  paths text[];
  allocated uuid;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select l.image_paths, l.lot_id into paths, allocated
    from public.produce_listings l
   where l.id = p_id and l.farmer_id = uid
   for update;
  if not found then
    raise exception 'listing not found';
  end if;
  if allocated is not null then
    raise exception 'already in a lot';
  end if;
  if exists (select 1 from public.order_allocations a where a.listing_id = p_id) then
    raise exception 'this listing has been sold from, so it cannot be removed';
  end if;

  delete from public.captures where listing_id = p_id;
  delete from public.produce_listings where id = p_id and farmer_id = uid;
  return coalesce(paths, '{}');
end;
$$;

-- ── Delivery makes the farmer's share payable ───────────────────────────────
create or replace function public.complete_delivery_stop(p_stop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.delivery_stops;
begin
  select * into s from public.delivery_stops where id = p_stop and driver_id = uid and state = 'pending' for update;
  if not found then
    raise exception 'stop not on your route';
  end if;
  if s.kind = 'dropoff' and exists (
       select 1 from public.delivery_stops p where p.order_id = s.order_id and p.kind = 'pickup' and p.state = 'pending') then
    raise exception 'collect all produce first';
  end if;

  update public.delivery_stops set state = 'done', done_at = now() where id = s.id;
  if s.kind = 'pickup' then
    update public.order_allocations set status = 'collected' where id = s.allocation_id;
  else
    with due as (
      update public.order_allocations
         set payout_status = 'payable', delivered_at = now()
       where order_id = s.order_id and status = 'collected' and payout_status = 'pending'
      returning farmer_id, amount
    )
    insert into public.notifications (user_id, title, body)
    select farmer_id, 'Order delivered',
           format('Your produce reached the buyer. GH₵ %s is now ready to be paid to your wallet.', to_char(sum(amount), 'FM999G999G990D00'))
      from due group by farmer_id;
  end if;
  perform private.plan_routes();
end;
$$;

-- ── Payout runs over allocations ────────────────────────────────────────────
drop function public.create_payout_run(uuid[]);
create function public.create_payout_run(p_allocations uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rid uuid;
  wanted int := (select count(distinct x) from unnest(coalesce(p_allocations, '{}')) x);
  found_n int;
  tot numeric;
  thr numeric;
begin
  if not (select private.is_ops()) then raise exception 'ops only'; end if;
  if wanted = 0 then raise exception 'choose payouts to run'; end if;

  select count(*), sum(a.amount) into found_n, tot
    from public.order_allocations a
    join public.farmers f on f.id = a.farmer_id
   where a.id = any (p_allocations) and a.payout_status = 'payable' and f.momo_number is not null
     and not exists (select 1 from public.payout_transfers t where t.allocation_id = a.id and t.status <> 'cancelled');
  if found_n <> wanted then raise exception 'some payouts are not payable, have no wallet, or are already in a run'; end if;

  select payout_threshold_ghs into thr from public.ops_config;
  insert into public.payout_runs (total, needs_approval, created_by)
  values (tot, thr is not null and tot > thr, uid)
  returning id into rid;

  insert into public.payout_transfers (run_id, allocation_id, farmer_id, amount, network, momo_number, momo_name)
  select rid, a.id, a.farmer_id, a.amount, f.momo_network, f.momo_number, f.momo_name
    from public.order_allocations a join public.farmers f on f.id = a.farmer_id
   where a.id = any (p_allocations);
  return rid;
end;
$$;

revoke all on function public.create_payout_run(uuid[]) from public, anon;
grant execute on function public.create_payout_run(uuid[]) to authenticated;

-- Paystack's verdict on a transfer. Allocation turns paid on success and back to payable if Paystack reverses it.
create or replace function public.apply_transfer_result(p_transfer uuid, p_status text, p_provider_ref text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.payout_transfers;
  r public.payout_runs;
  live int;
  paid int;
  bad int;
begin
  if p_status not in ('sent', 'succeeded', 'failed') then raise exception 'bad status'; end if;
  select * into t from public.payout_transfers where id = p_transfer for update;
  if not found or t.status = 'cancelled' or t.status = p_status then return; end if;
  if t.status = 'succeeded' and p_status = 'sent' then return; end if;

  update public.payout_transfers set
    status = p_status,
    attempts = attempts + (case when t.status in ('queued', 'failed') then 1 else 0 end),
    provider_ref = coalesce(p_provider_ref, provider_ref),
    last_error = case when p_status = 'succeeded' then null else coalesce(p_error, last_error) end,
    updated_at = now()
   where id = p_transfer;

  if p_status = 'succeeded' then
    if t.allocation_id is not null then
      update public.order_allocations set payout_status = 'paid', paid_at = now() where id = t.allocation_id;
    else
      update public.settlements set status = 'paid', paid_at = now(), updated_at = now() where listing_id = t.settlement_id;
    end if;
    insert into public.notifications (user_id, title, body)
    values (t.farmer_id, 'Payment sent', format('GHS %s was sent to your %s wallet.', to_char(t.amount, 'FM999999990.00'), t.network));
  elsif t.status = 'succeeded' then
    if t.allocation_id is not null then
      update public.order_allocations set payout_status = 'payable', paid_at = null where id = t.allocation_id;
    else
      update public.settlements set status = 'payable', paid_at = null, updated_at = now() where listing_id = t.settlement_id;
    end if;
  end if;

  select * into r from public.payout_runs where id = t.run_id;
  if r.status in ('released', 'partial', 'completed') then
    select count(*) filter (where status in ('queued', 'sent')), count(*) filter (where status = 'succeeded'), count(*) filter (where status = 'failed')
      into live, paid, bad
      from public.payout_transfers where run_id = r.id;
    update public.payout_runs set status = case when live > 0 then 'released' when bad > 0 then 'partial' else 'completed' end
     where id = r.id;
  end if;
end;
$$;

revoke all on function public.apply_transfer_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_transfer_result(uuid, text, text, text) to service_role;
