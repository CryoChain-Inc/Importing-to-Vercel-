-- Once a lot or an order has been delivered, its recorded details stay as they were.
-- An agent cannot change the capture, a farmer cannot edit that listing, and ops cannot
-- allocate more supply onto the finished order. Paying the farmer afterwards is unchanged.

create or replace function private.lot_is_delivered(p_lot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_lot is not null and (
    exists (select 1 from public.lots where id = p_lot and state in ('delivered', 'accepted', 'disputed'))
    or exists (select 1 from public.route_lots where lot_id = p_lot and delivered_at is not null)
  );
$$;

create or replace function private.order_is_delivered(p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.delivery_stops s
     where s.order_id = p_order and s.kind = 'dropoff' and s.state = 'done'
  ) or exists (
    select 1 from public.order_allocations a
     where a.order_id = p_order and a.delivered_at is not null
  ) or exists (
    select 1 from public.orders o
     where o.id = p_order and private.lot_is_delivered(o.lot_id)
  );
$$;

revoke all on function private.lot_is_delivered(uuid), private.order_is_delivered(uuid) from public, anon;
grant execute on function private.lot_is_delivered(uuid), private.order_is_delivered(uuid) to authenticated;

-- Agent captures: locked once the stop is confirmed, and also once the lot or its order is delivered.
create or replace function private.agent_can_capture(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.produce_listings l
    join public.route_lots rl on rl.lot_id = l.lot_id
    join public.routes r on r.id = rl.route_id
    where l.id = p_listing
      and r.agent_id = (select auth.uid())
      and r.service_date = (timezone('Africa/Accra', now()))::date
      and not private.lot_is_delivered(l.lot_id)
      and not exists (
        select 1 from public.order_allocations a
         where a.listing_id = l.id and private.order_is_delivered(a.order_id)
      )
      and not exists (
        select 1 from public.route_stops s
        where s.route_id = r.id and s.collection_point_id = l.collection_point_id and s.confirmed_at is not null
      )
  );
$$;

-- Replacing the photograph in storage is an edit too.
create or replace function private.capture_is_locked(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.captures c
    join public.produce_listings l on l.id = c.listing_id
    where c.photo_path = p_path
      and (
        private.lot_is_delivered(l.lot_id)
        or exists (
          select 1 from public.order_allocations a
           where a.listing_id = l.id and private.order_is_delivered(a.order_id)
        )
      )
  );
$$;

revoke all on function private.capture_is_locked(text) from public, anon;
grant execute on function private.capture_is_locked(text) to authenticated;

drop policy if exists captures_storage_update on storage.objects;
create policy captures_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.capture_is_locked(name))
  );

-- A security-definer write still has to pass this, because triggers are not skipped.
create or replace function private.freeze_delivered_capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lot uuid;
begin
  select l.lot_id into lot from public.produce_listings l where l.id = new.listing_id;
  if private.lot_is_delivered(lot)
     or exists (
       select 1 from public.order_allocations a
        where a.listing_id = new.listing_id and private.order_is_delivered(a.order_id)
     ) then
    raise exception 'this lot has been delivered, so it can no longer be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists captures_freeze_delivered on public.captures;
create trigger captures_freeze_delivered
before insert or update on public.captures
for each row execute function private.freeze_delivered_capture();

-- New supply cannot be attached to an order that has already been delivered.
-- Payout updates (payable -> paid) only change payout columns, so they still go through.
create or replace function private.freeze_delivered_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and private.order_is_delivered(new.order_id) then
    raise exception 'this order has been delivered, so it can no longer be changed';
  end if;
  if tg_op = 'UPDATE' and old.delivered_at is not null and (
       new.kg is distinct from old.kg
    or new.grade is distinct from old.grade
    or new.amount is distinct from old.amount
    or new.farmer_price is distinct from old.farmer_price
    or new.farmer_id is distinct from old.farmer_id
    or new.product_id is distinct from old.product_id
    or new.listing_id is distinct from old.listing_id
    or new.status is distinct from old.status
    or new.order_id is distinct from old.order_id
  ) then
    raise exception 'this order has been delivered, so it can no longer be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists allocations_freeze_delivered on public.order_allocations;
create trigger allocations_freeze_delivered
before insert or update on public.order_allocations
for each row execute function private.freeze_delivered_allocation();

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
  if private.order_is_delivered(p_order) then
    raise exception 'this order has been delivered, so it can no longer be changed';
  end if;
  perform private.allocate_order(p_order);
end;
$$;

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
  if private.order_is_delivered(a.order_id) then
    raise exception 'this order has been delivered, so it can no longer be changed';
  end if;
  if a.expires_at < now() then
    raise exception 'offer expired';
  end if;

  update public.order_allocations
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = a.id;

  if not p_accept then
    perform private.allocate_order(a.order_id);
  end if;
end;
$$;

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
  if private.lot_is_delivered(l.lot_id) or exists (
    select 1 from public.order_allocations a
     where a.listing_id = p_id and private.order_is_delivered(a.order_id)
  ) then
    raise exception 'this produce has been delivered, so it can no longer be edited';
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
