-- Automated fulfilment of paid cart orders.
--   paid order -> allocate_order(): picks farmers (nearest to the buyer, weighed by how close a driver is), records how
--   many kg and how much we pay each, notifies them in app and by SMS, then plan_routes() builds each driver's route.
--   Anything the system cannot settle itself lands in ops_decisions (the decision register) for ops to handle.

-- ── Driver location (latest ping only) ──────────────────────────────────────
create table public.driver_locations (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  lat numeric(9, 6) not null check (lat between -90 and 90),
  lng numeric(9, 6) not null check (lng between -180 and 180),
  updated_at timestamptz not null default now()
);

-- ── Allocations: which farmer supplies how many kg of an order ──────────────
create table public.order_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  listing_id uuid not null references public.produce_listings (id),
  farmer_id uuid not null references public.profiles (id),
  grade text not null check (grade in ('A', 'B', 'C')),
  kg numeric(10, 2) not null check (kg > 0),
  farmer_price numeric(10, 2) not null check (farmer_price > 0),
  -- what CryoChain pays the farmer for this allocation
  amount numeric(12, 2) not null check (amount > 0),
  km_to_buyer numeric(8, 1),
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'expired', 'cancelled', 'collected')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_allocations_order_idx on public.order_allocations (order_id);
create index order_allocations_listing_idx on public.order_allocations (listing_id);
create index order_allocations_farmer_idx on public.order_allocations (farmer_id, status);
create index order_allocations_offered_idx on public.order_allocations (expires_at) where status = 'offered';

-- ── Driver routes: ordered stops (farm pickups, then the buyer drop-off) ─────
create table public.delivery_stops (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.drivers (id),
  order_id uuid not null references public.orders (id) on delete cascade,
  allocation_id uuid references public.order_allocations (id) on delete cascade,
  kind text not null check (kind in ('pickup', 'dropoff')),
  label text not null,
  lat numeric(9, 6) not null,
  lng numeric(9, 6) not null,
  seq integer,
  state text not null default 'pending' check (state in ('pending', 'done')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  constraint delivery_stops_pickup_has_allocation check (kind <> 'pickup' or allocation_id is not null)
);
create index delivery_stops_driver_idx on public.delivery_stops (driver_id, state, seq);
create index delivery_stops_order_idx on public.delivery_stops (order_id);
create unique index delivery_stops_one_dropoff on public.delivery_stops (order_id) where kind = 'dropoff';
create unique index delivery_stops_one_pickup on public.delivery_stops (allocation_id) where kind = 'pickup';

-- ── Decision register ───────────────────────────────────────────────────────
create table public.ops_decisions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('no_supply', 'no_farmer_price', 'no_driver', 'sms_failed', 'allocation_error')),
  order_id uuid references public.orders (id) on delete cascade,
  summary text not null,
  key text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open decision per problem; raising it again just refreshes the summary.
create unique index ops_decisions_open_key on public.ops_decisions (kind, key) where status = 'open';
create index ops_decisions_status_idx on public.ops_decisions (status, created_at desc);

-- ── SMS outbox (Twilio, sent by the dispatch-sms edge function) ─────────────
create table public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  allocation_id uuid references public.order_allocations (id) on delete set null,
  phone text,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  error text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index sms_outbox_pending_idx on public.sms_outbox (created_at) where status in ('pending', 'sending');

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.driver_locations enable row level security;
alter table public.order_allocations enable row level security;
alter table public.delivery_stops enable row level security;
alter table public.ops_decisions enable row level security;
alter table public.sms_outbox enable row level security;

revoke all on table public.driver_locations, public.order_allocations, public.delivery_stops,
  public.ops_decisions, public.sms_outbox from anon, authenticated;
grant select on public.driver_locations, public.order_allocations, public.delivery_stops,
  public.ops_decisions, public.sms_outbox to authenticated;
-- Writes go only through the functions below.

create policy driver_locations_select_own on public.driver_locations for select to authenticated
  using (driver_id = (select auth.uid()));
create policy driver_locations_select_ops on public.driver_locations for select to authenticated
  using ((select private.is_ops()));

create policy order_allocations_select_own on public.order_allocations for select to authenticated
  using (farmer_id = (select auth.uid()));
create policy order_allocations_select_ops on public.order_allocations for select to authenticated
  using ((select private.is_ops()));

create policy delivery_stops_select_own on public.delivery_stops for select to authenticated
  using (driver_id = (select auth.uid()));
create policy delivery_stops_select_ops on public.delivery_stops for select to authenticated
  using ((select private.is_ops()));

create policy ops_decisions_select_ops on public.ops_decisions for select to authenticated
  using ((select private.is_ops()));
create policy sms_outbox_select_ops on public.sms_outbox for select to authenticated
  using ((select private.is_ops()));

-- ── Decision register helper ────────────────────────────────────────────────
create or replace function private.raise_decision(p_kind text, p_order uuid, p_summary text, p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ops_decisions (kind, order_id, summary, key)
  values (p_kind, p_order, p_summary, p_key)
  on conflict (kind, key) where status = 'open' do update set summary = excluded.summary;
$$;

create or replace function private.auto_resolve_decision(p_kind text, p_key text, p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ops_decisions
     set status = 'resolved', resolution = p_note, resolved_at = now()
   where kind = p_kind and key = p_key and status = 'open';
$$;

revoke all on function private.raise_decision(text, uuid, text, text), private.auto_resolve_decision(text, text, text) from public, anon, authenticated;

-- ── Supply: kg a farmer turned down or ignored is no longer available ───────
create or replace function private.available_kg(p_product_id uuid, p_grade text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    coalesce((
      select sum(l.weight_kg)
      from public.produce_listings l
      join public.products p on lower(btrim(p.name)) = lower(btrim(l.product))
      where p.id = p_product_id
        and l.grade = p_grade
        and l.lot_id is null
        and not exists (select 1 from public.captures c where c.listing_id = l.id)
    ), 0)
    - coalesce((
      select sum(h.kg)
      from public.supply_holds h
      where h.product_id = p_product_id
        and h.grade = p_grade
        and (h.state = 'committed' or (h.state = 'held' and h.expires_at > now()))
    ), 0)
    - coalesce((
      select sum(a.kg)
      from public.order_allocations a
      where a.product_id = p_product_id
        and a.grade = p_grade
        and a.status in ('declined', 'expired')
    ), 0)
  );
$$;

revoke all on function private.available_kg(uuid, text) from public, anon, authenticated;

-- ── Routes ──────────────────────────────────────────────────────────────────
-- Keeps every driver's route in step with the orders: adds and removes stops, gives unrouted orders to the
-- least-loaded driver who has pinged recently, and re-sequences pending stops nearest-first from where the driver is.
-- A drop-off never comes before its order's pickups. Cheap enough to run on every change at this scale.
create or replace function private.plan_routes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  drv record;
  nxt record;
  chosen uuid;
  cur_lat numeric;
  cur_lng numeric;
  n integer;
begin
  perform pg_advisory_xact_lock(7001);

  delete from public.delivery_stops s
   where s.state = 'pending' and s.kind = 'pickup'
     and not exists (select 1 from public.order_allocations a where a.id = s.allocation_id and a.status in ('offered', 'accepted'));
  delete from public.delivery_stops s
   where s.state = 'pending' and s.kind = 'dropoff'
     and not exists (select 1 from public.order_allocations a where a.order_id = s.order_id and a.status in ('offered', 'accepted', 'collected'));

  insert into public.delivery_stops (order_id, allocation_id, kind, label, lat, lng)
  select a.order_id, a.id, 'pickup',
         'Pick up ' || a.kg::text || ' kg ' || p.name || ' (grade ' || a.grade || ') · ' || coalesce(nullif(f.locality, ''), 'farm'),
         f.latitude::numeric(9, 6), f.longitude::numeric(9, 6)
    from public.order_allocations a
    join public.products p on p.id = a.product_id
    join public.farmers f on f.id = a.farmer_id
   where a.status in ('offered', 'accepted') and f.latitude is not null
     and not exists (select 1 from public.delivery_stops s where s.allocation_id = a.id);

  insert into public.delivery_stops (order_id, kind, label, lat, lng)
  select ord.id, 'dropoff', 'Deliver ' || ord.code || ' · ' || coalesce(ord.delivery_address, 'buyer'),
         ord.delivery_lat::numeric(9, 6), ord.delivery_lng::numeric(9, 6)
    from public.orders ord
   where ord.state = 'paid' and ord.delivery_lat is not null
     and exists (select 1 from public.order_allocations a where a.order_id = ord.id and a.status in ('offered', 'accepted', 'collected'))
     and not exists (select 1 from public.delivery_stops s where s.order_id = ord.id and s.kind = 'dropoff');

  for o in
    select s.order_id from public.delivery_stops s
     where s.driver_id is null and s.state = 'pending'
     group by s.order_id order by min(s.created_at)
  loop
    select d.id into chosen
      from public.drivers d
      join public.driver_locations dl on dl.driver_id = d.id and dl.updated_at > now() - interval '30 minutes'
      left join lateral (
        select s.lat, s.lng from public.delivery_stops s
         where s.order_id = o.order_id and s.kind = 'pickup' and s.state = 'pending'
         order by s.created_at limit 1
      ) fp on true
     order by (select count(*) from public.delivery_stops x where x.driver_id = d.id and x.state = 'pending'),
              private.haversine_km(dl.lat, dl.lng, fp.lat, fp.lng)
     limit 1;

    if chosen is null then
      perform private.raise_decision('no_driver', o.order_id,
        'No driver has shared a location in the last 30 minutes, so this order has no route yet.', o.order_id::text);
    else
      update public.delivery_stops set driver_id = chosen
       where order_id = o.order_id and state = 'pending' and driver_id is null;
      perform private.auto_resolve_decision('no_driver', o.order_id::text, 'Resolved automatically: a driver was assigned.');
    end if;
  end loop;

  for drv in
    select distinct s.driver_id from public.delivery_stops s where s.driver_id is not null and s.state = 'pending'
  loop
    update public.delivery_stops set seq = null where driver_id = drv.driver_id and state = 'pending';
    select dl.lat, dl.lng into cur_lat, cur_lng from public.driver_locations dl where dl.driver_id = drv.driver_id;
    n := 0;
    loop
      select s.id, s.lat, s.lng into nxt
        from public.delivery_stops s
       where s.driver_id = drv.driver_id and s.state = 'pending' and s.seq is null
         and (s.kind = 'pickup' or not exists (
               select 1 from public.delivery_stops p
                where p.order_id = s.order_id and p.driver_id = s.driver_id and p.kind = 'pickup' and p.state = 'pending' and p.seq is null))
       order by case when cur_lat is null then 0 else private.haversine_km(cur_lat, cur_lng, s.lat, s.lng) end, s.created_at
       limit 1;
      exit when nxt.id is null;
      n := n + 1;
      update public.delivery_stops set seq = n where id = nxt.id;
      cur_lat := nxt.lat;
      cur_lng := nxt.lng;
    end loop;
  end loop;
end;
$$;

revoke all on function private.plan_routes() from public, anon, authenticated;

-- ── Allocation ──────────────────────────────────────────────────────────────
-- Fills whatever part of a paid order is not yet covered by an active allocation, so it is safe to run again after a
-- decline, an expiry or an ops retry. Farmers are ranked by distance to the buyer plus half the distance from the
-- nearest recently-seen driver to the farm. Each pick records kg and the amount we pay (kg x the farmer price).
create or replace function private.allocate_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  item record;
  cand record;
  need numeric;
  fprice numeric;
  take numeric;
  alloc_id uuid;
  pay numeric;
  fphone text;
  -- shortcut: fixed 2 hour response window, move to ops_config if ops need to tune it.
  window_len interval := interval '2 hours';
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or ord.state <> 'paid' or ord.delivery_lat is null or ord.delivery_lng is null then
    return;
  end if;

  for item in
    select oi.product_id, oi.grade, oi.kg, p.name
      from public.order_items oi join public.products p on p.id = oi.product_id
     where oi.order_id = ord.id
  loop
    select item.kg - coalesce(sum(a.kg), 0) into need
      from public.order_allocations a
     where a.order_id = ord.id and a.product_id = item.product_id and a.grade = item.grade
       and a.status in ('offered', 'accepted', 'collected');
    continue when need <= 0;

    select cp.price into fprice from public.crop_prices cp where cp.product_id = item.product_id and cp.grade = item.grade;
    if fprice is null then
      perform private.raise_decision('no_farmer_price', ord.id,
        format('No farmer price is set for %s grade %s, so %s kg of order %s could not be allocated.', item.name, item.grade, need, ord.code),
        ord.id::text || item.product_id::text || item.grade);
      continue;
    end if;

    for cand in
      select l.id as listing_id, l.farmer_id, kb.km as km_buyer,
             l.weight_kg - coalesce((
               select sum(a.kg) from public.order_allocations a
                where a.listing_id = l.id and a.status in ('offered', 'accepted', 'collected', 'declined', 'expired')), 0) as cap
        from public.produce_listings l
        join public.farmers f on f.id = l.farmer_id
        cross join lateral (
          select private.haversine_km(f.latitude::numeric, f.longitude::numeric, ord.delivery_lat::numeric, ord.delivery_lng::numeric) as km
        ) kb
        left join lateral (
          select min(private.haversine_km(dl.lat, dl.lng, f.latitude::numeric, f.longitude::numeric)) as km
            from public.driver_locations dl where dl.updated_at > now() - interval '30 minutes'
        ) kd on true
       where lower(btrim(l.product)) = lower(btrim(item.name))
         and l.grade = item.grade
         and l.lot_id is null
         and f.latitude is not null and f.longitude is not null
         and not exists (select 1 from public.captures c where c.listing_id = l.id)
       order by kb.km + 0.5 * coalesce(kd.km, 0), l.created_at
    loop
      continue when cand.cap <= 0;
      take := least(need, cand.cap);
      pay := round(take * fprice, 2);

      insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, grade, kg, farmer_price, amount, km_to_buyer, expires_at)
      values (ord.id, item.product_id, cand.listing_id, cand.farmer_id, item.grade, take, fprice, pay, round(cand.km_buyer, 1), now() + window_len)
      returning id into alloc_id;

      -- Farmers see what to supply and what they earn, never who the buyer is.
      insert into public.notifications (user_id, title, body)
      values (cand.farmer_id, 'New order for your produce',
        format('We need %s kg of %s (grade %s). You would earn GH₵ %s. Open the app and accept within 2 hours.', take, item.name, item.grade, to_char(pay, 'FM999G999G990D00')));

      select pr.phone into fphone from public.profiles pr where pr.id = cand.farmer_id;
      insert into public.sms_outbox (user_id, allocation_id, phone, body, status, error)
      values (cand.farmer_id, alloc_id, fphone,
        format('CryoChain: new order. Supply %s kg %s (grade %s) for GHS %s. Open the app to accept within 2 hours.', take, item.name, item.grade, to_char(pay, 'FM999G999G990D00')),
        case when fphone is null then 'failed' else 'pending' end,
        case when fphone is null then 'Farmer has no phone number' end);
      if fphone is null then
        perform private.raise_decision('sms_failed', ord.id,
          'A farmer has no phone number on file, so no SMS was sent. They can still accept in the app.', alloc_id::text);
      end if;

      need := need - take;
      exit when need <= 0;
    end loop;

    if need > 0 then
      perform private.raise_decision('no_supply', ord.id,
        format('%s kg of %s grade %s on order %s is paid for but no farmer can cover it.', need, item.name, item.grade, ord.code),
        ord.id::text || item.product_id::text || item.grade);
    else
      perform private.auto_resolve_decision('no_supply', ord.id::text || item.product_id::text || item.grade, 'Resolved automatically: fully allocated.');
      perform private.auto_resolve_decision('no_farmer_price', ord.id::text || item.product_id::text || item.grade, 'Resolved automatically: fully allocated.');
    end if;
  end loop;

  perform private.plan_routes();
end;
$$;

revoke all on function private.allocate_order(uuid) from public, anon, authenticated;

-- Offers a farmer ignores are released and re-allocated to the next farmer.
create or replace function private.expire_offers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    with gone as (
      update public.order_allocations
         set status = 'expired', responded_at = now()
       where status = 'offered' and expires_at < now()
      returning order_id)
    select distinct order_id from gone
  loop
    perform private.allocate_order(r.order_id);
  end loop;
end;
$$;

revoke all on function private.expire_offers() from public, anon, authenticated;

-- Runs every 10 minutes where pg_cron is available; elsewhere ops can still retry from the decision register.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-allocation-offers', '*/10 * * * *', 'select private.expire_offers()');
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;

-- ── Payment hook: a paid cart order is allocated straight away ──────────────
-- Allocation failing must never undo a payment, so it is caught and sent to the decision register.
create or replace function public.settle_paystack_payment(p_reference text, p_paid_pesewas bigint, p_currency text, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  ord public.orders;
begin
  select * into pay from public.payments where reference = p_reference for update;
  if not found then
    raise exception 'unknown payment reference';
  end if;
  if pay.status in ('success', 'orphaned') then
    return;
  end if;
  if p_currency <> 'GHS' or p_paid_pesewas < pay.amount_pesewas then
    update public.payments set status = 'mismatch', channel = p_channel where id = pay.id;
    return;
  end if;

  select * into ord from public.orders where id = pay.order_id for update;
  if ord.state = 'awaiting_payment' then
    update public.payments set status = 'success', channel = p_channel, paid_at = now() where id = pay.id;
    update public.orders set state = 'paid', method = 'paystack', paid_at = now() where id = ord.id;
    update public.lots set state = 'escrow_funded' where id = ord.lot_id and state = 'escrow_pending';
    update public.supply_holds set state = 'committed' where order_id = ord.id and state = 'held';
    if ord.lot_id is null then
      begin
        perform private.allocate_order(ord.id);
      exception when others then
        perform private.raise_decision('allocation_error', ord.id,
          'Automatic allocation failed: ' || sqlerrm, ord.id::text);
      end;
    end if;
  else
    update public.payments set status = 'orphaned', channel = p_channel, paid_at = now() where id = pay.id;
  end if;
end;
$$;

revoke all on function public.settle_paystack_payment(text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.settle_paystack_payment(text, bigint, text, text) to service_role;

-- ── Farmer: accept or decline an offer ──────────────────────────────────────
create or replace function public.respond_allocation(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  a public.order_allocations;
begin
  select * into a from public.order_allocations where id = p_id and farmer_id = uid for update;
  if not found or a.status <> 'offered' then
    raise exception 'offer not available';
  end if;
  if a.expires_at < now() then
    raise exception 'offer expired';
  end if;

  update public.order_allocations
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = a.id;

  -- A decline is topped up from the next-best farmer straight away.
  if not p_accept then
    perform private.allocate_order(a.order_id);
  end if;
end;
$$;

revoke all on function public.respond_allocation(uuid, boolean) from public, anon;
grant execute on function public.respond_allocation(uuid, boolean) to authenticated;

-- ── Driver: location ping and stop completion ───────────────────────────────
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

  -- Coming online (or back after a gap) hands over waiting orders and re-sequences from here.
  if prev is null or prev < now() - interval '30 minutes' then
    perform private.plan_routes();
  end if;
end;
$$;

revoke all on function public.report_driver_location(numeric, numeric) from public, anon;
grant execute on function public.report_driver_location(numeric, numeric) to authenticated;

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
  end if;
  perform private.plan_routes();
end;
$$;

revoke all on function public.complete_delivery_stop(uuid) from public, anon;
grant execute on function public.complete_delivery_stop(uuid) to authenticated;

-- ── Ops: resolve, retry, re-plan ────────────────────────────────────────────
create or replace function public.ops_resolve_decision(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'write what you decided';
  end if;
  update public.ops_decisions
     set status = 'resolved', resolution = btrim(p_note), resolved_by = (select auth.uid()), resolved_at = now()
   where id = p_id and status = 'open';
end;
$$;

create or replace function public.ops_retry_allocation(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  perform private.allocate_order(p_order);
end;
$$;

create or replace function public.ops_replan_routes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  perform private.plan_routes();
end;
$$;

revoke all on function public.ops_resolve_decision(uuid, text), public.ops_retry_allocation(uuid), public.ops_replan_routes() from public, anon;
grant execute on function public.ops_resolve_decision(uuid, text), public.ops_retry_allocation(uuid), public.ops_replan_routes() to authenticated;

-- ── SMS queue, used by the dispatch-sms edge function (service role only) ───
create or replace function public.claim_sms(p_limit integer default 20)
returns setof public.sms_outbox
language sql
security definer
set search_path = ''
as $$
  update public.sms_outbox o
     set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
   where o.id in (
     select x.id from public.sms_outbox x
      where x.phone is not null
        and (x.status = 'pending' or (x.status = 'sending' and x.claimed_at < now() - interval '5 minutes'))
      order by x.created_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked)
  returning o.*;
$$;

create or replace function public.finish_sms(p_id uuid, p_ok boolean, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.sms_outbox;
  oid uuid;
begin
  select * into m from public.sms_outbox where id = p_id for update;
  if not found then
    return;
  end if;
  if p_ok then
    update public.sms_outbox set status = 'sent', sent_at = now(), error = null where id = p_id;
    return;
  end if;
  if m.attempts >= 3 then
    update public.sms_outbox set status = 'failed', error = left(p_error, 300) where id = p_id;
    select a.order_id into oid from public.order_allocations a where a.id = m.allocation_id;
    perform private.raise_decision('sms_failed', oid,
      'A farmer could not be reached by SMS: ' || coalesce(left(p_error, 120), 'unknown error') || '. They can still accept in the app; call them if it is urgent.',
      m.id::text);
  else
    update public.sms_outbox set status = 'pending', error = left(p_error, 300) where id = p_id;
  end if;
end;
$$;

revoke all on function public.claim_sms(integer), public.finish_sms(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_sms(integer), public.finish_sms(uuid, boolean, text) to service_role;
