-- Allocation is automatic and final: a paid order is allocated straight to farmers as 'accepted' with a pickup time.
-- Farmers are told in the app and by SMS how many kg will be collected and when; there is no accept or decline step.

alter table public.order_allocations add column pickup_at timestamptz;
alter table public.order_allocations alter column expires_at drop not null;

-- Offers still waiting when this ships become scheduled pickups.
update public.order_allocations
   set status = 'accepted',
       pickup_at = (((now() at time zone 'Africa/Accra')::date + 1) + time '08:00') at time zone 'Africa/Accra'
 where status = 'offered';

drop function public.respond_allocation(uuid, boolean);

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
  -- shortcut: every pickup is 08:00 the next day in Accra; replace with a driver ETA once routes carry one.
  pick timestamptz := (((now() at time zone 'Africa/Accra')::date + 1) + time '08:00') at time zone 'Africa/Accra';
  pick_txt text := to_char(pick at time zone 'Africa/Accra', 'FMDay DD Mon') || ' from 08:00';
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

      insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, grade, kg, farmer_price, amount, km_to_buyer, status, pickup_at)
      values (ord.id, item.product_id, cand.listing_id, cand.farmer_id, item.grade, take, fprice, pay, round(cand.km_buyer, 1), 'accepted', pick)
      returning id into alloc_id;

      -- Farmers see what to supply and what they earn, never who the buyer is.
      insert into public.notifications (user_id, title, body)
      values (cand.farmer_id, 'Pickup scheduled',
        format('We will collect %s kg of %s (grade %s) from your farm on %s. You earn GH₵ %s once it is collected.', take, item.name, item.grade, pick_txt, to_char(pay, 'FM999G999G990D00')));

      select pr.phone into fphone from public.profiles pr where pr.id = cand.farmer_id;
      insert into public.sms_outbox (user_id, allocation_id, phone, body, status, error)
      values (cand.farmer_id, alloc_id, fphone,
        format('CryoChain: pickup scheduled. We will collect %s kg %s (grade %s) from your farm on %s. You earn GHS %s once collected.', take, item.name, item.grade, pick_txt, to_char(pay, 'FM999G999G990D00')),
        case when fphone is null then 'failed' else 'pending' end,
        case when fphone is null then 'Farmer has no phone number' end);
      if fphone is null then
        perform private.raise_decision('sms_failed', ord.id,
          'A farmer has no phone number on file, so no SMS was sent. The pickup is in their app.', alloc_id::text);
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
      'A farmer could not be reached by SMS: ' || coalesce(left(p_error, 120), 'unknown error') || '. Call them to confirm the pickup.',
      m.id::text);
  else
    update public.sms_outbox set status = 'pending', error = left(p_error, 300) where id = p_id;
  end if;
end;
$$;
