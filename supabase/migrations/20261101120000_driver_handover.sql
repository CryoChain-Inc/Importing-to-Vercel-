-- Driver product deliveries: who to collect from, and the reading taken at each stop.
-- A pickup stores the kilos, grade, temperature and an optional note. A drop-off stores the temperature.
-- The stop cannot be marked done until that reading is saved, and the reading cannot change afterwards.
-- Safe to run again.

create table if not exists public.delivery_handovers (
  stop_id uuid primary key references public.delivery_stops (id) on delete cascade,
  driver_id uuid not null references public.drivers (id),
  recorded_kg numeric(10, 2),
  grade text,
  temperature_c numeric(5, 1) not null,
  note text,
  created_at timestamptz not null default now(),
  constraint delivery_handovers_kg check (recorded_kg is null or (recorded_kg > 0 and recorded_kg <= 100000)),
  constraint delivery_handovers_grade check (grade is null or grade in ('A', 'B', 'C')),
  constraint delivery_handovers_temp check (temperature_c between -100 and 100),
  constraint delivery_handovers_note check (note is null or char_length(note) <= 280)
);

alter table public.delivery_handovers enable row level security;
revoke all on table public.delivery_handovers from anon, authenticated;
grant select on public.delivery_handovers to authenticated;

drop policy if exists delivery_handovers_select_own on public.delivery_handovers;
create policy delivery_handovers_select_own on public.delivery_handovers
  for select to authenticated
  using (driver_id = (select auth.uid()));

drop policy if exists delivery_handovers_select_ops on public.delivery_handovers;
create policy delivery_handovers_select_ops on public.delivery_handovers
  for select to authenticated
  using ((select private.is_ops()));

create or replace function private.freeze_completed_handover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.delivery_stops s where s.id = new.stop_id and s.state = 'done') then
    raise exception 'this stop has been completed, so it can no longer be changed';
  end if;
  return new;
end;
$$;

revoke all on function private.freeze_completed_handover() from public, anon, authenticated;

drop trigger if exists delivery_handovers_freeze on public.delivery_handovers;
create trigger delivery_handovers_freeze
before insert or update on public.delivery_handovers
for each row execute function private.freeze_completed_handover();

-- Orders on this driver's route, with each farmer's name, phone and farm, plus any reading already saved.
create or replace function public.driver_deliveries()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not (select private.is_driver()) then
    raise exception 'driver only';
  end if;

  return jsonb_build_object(
    'tempMin', (select min_temp_c from public.ops_config where id),
    'tempMax', (select max_temp_c from public.ops_config where id),
    'orders', coalesce((
      select jsonb_agg(q.obj order by q.ongoing desc, q.seq nulls last, q.done_at desc nulls last)
      from (
        select
          bool_or(s.state = 'pending') as ongoing,
          min(s.seq) filter (where s.state = 'pending') as seq,
          max(s.done_at) as done_at,
          jsonb_build_object(
            'id', o.id,
            'code', o.code,
            'ongoing', bool_or(s.state = 'pending'),
            'buyerName', coalesce(nullif(btrim(bp.display_name), ''), 'Buyer'),
            'buyerPhone', coalesce(bp.phone, ''),
            'address', coalesce(o.delivery_address, ''),
            'lat', o.delivery_lat,
            'lng', o.delivery_lng,
            'pickups', coalesce((
              select jsonb_agg(p.obj order by p.seq nulls last, p.created_at)
              from (
                select s2.seq, s2.created_at,
                  jsonb_build_object(
                    'stopId', s2.id,
                    'farmerName', coalesce(nullif(btrim(fp.display_name), ''), 'Farmer'),
                    'farmerPhone', coalesce(fp.phone, ''),
                    'place', concat_ws(', ',
                      nullif(btrim(f.line1), ''), nullif(btrim(f.address), ''),
                      nullif(btrim(f.landmark), ''), nullif(btrim(f.city), ''),
                      nullif(btrim(f.postcode), ''), nullif(btrim(f.locality), '')),
                    'product', pr.name,
                    'expectedKg', a.kg,
                    'expectedGrade', a.grade,
                    'lat', s2.lat,
                    'lng', s2.lng,
                    'state', s2.state,
                    'seq', s2.seq,
                    'recordedKg', h.recorded_kg,
                    'recordedGrade', h.grade,
                    'temperatureC', h.temperature_c,
                    'note', coalesce(h.note, '')
                  ) as obj
                from public.delivery_stops s2
                join public.order_allocations a on a.id = s2.allocation_id
                join public.products pr on pr.id = a.product_id
                join public.farmers f on f.id = a.farmer_id
                left join public.profiles fp on fp.id = a.farmer_id
                left join public.delivery_handovers h on h.stop_id = s2.id
                where s2.order_id = o.id and s2.driver_id = uid and s2.kind = 'pickup'
              ) p
            ), '[]'::jsonb),
            'dropoff', (
              select jsonb_build_object(
                'stopId', s3.id,
                'lat', s3.lat,
                'lng', s3.lng,
                'state', s3.state,
                'seq', s3.seq,
                'temperatureC', h3.temperature_c,
                'note', coalesce(h3.note, '')
              )
              from public.delivery_stops s3
              left join public.delivery_handovers h3 on h3.stop_id = s3.id
              where s3.order_id = o.id and s3.driver_id = uid and s3.kind = 'dropoff'
              limit 1
            )
          ) as obj
        from public.delivery_stops s
        join public.orders o on o.id = s.order_id
        left join public.profiles bp on bp.id = o.buyer_id
        where s.driver_id = uid
        group by o.id, o.code, o.delivery_address, o.delivery_lat, o.delivery_lng, bp.display_name, bp.phone
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.driver_deliveries() from public, anon;
grant execute on function public.driver_deliveries() to authenticated;

create or replace function public.record_delivery_handover(
  p_stop uuid,
  p_kg numeric,
  p_grade text,
  p_celsius numeric,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.delivery_stops;
  lo numeric;
  hi numeric;
  grade text := upper(btrim(coalesce(p_grade, '')));
  kg numeric := round(p_kg, 2);
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if uid is null or not (select private.is_driver()) then
    raise exception 'driver only';
  end if;
  if note is not null and char_length(note) > 280 then
    raise exception 'note is too long';
  end if;
  if p_celsius is null or p_celsius < -100 or p_celsius > 100 then
    raise exception 'temperature out of range';
  end if;
  select min_temp_c, max_temp_c into lo, hi from public.ops_config where id;
  if lo is not null and p_celsius < lo then
    raise exception 'temperature out of range';
  end if;
  if hi is not null and p_celsius > hi then
    raise exception 'temperature out of range';
  end if;

  select * into s from public.delivery_stops where id = p_stop and driver_id = uid for update;
  if not found then
    raise exception 'stop not on your route';
  end if;
  if s.state <> 'pending' then
    raise exception 'this stop has been completed, so it can no longer be changed';
  end if;

  if s.kind = 'pickup' then
    if kg is null or kg <= 0 or kg > 100000 then
      raise exception 'enter the kilos';
    end if;
    if grade not in ('A', 'B', 'C') then
      raise exception 'choose a grade';
    end if;
  else
    kg := null;
    grade := null;
  end if;

  insert into public.delivery_handovers (stop_id, driver_id, recorded_kg, grade, temperature_c, note)
  values (s.id, uid, kg, nullif(grade, ''), p_celsius, note)
  on conflict (stop_id) do update
    set recorded_kg = excluded.recorded_kg,
        grade = excluded.grade,
        temperature_c = excluded.temperature_c,
        note = excluded.note;
end;
$$;

revoke all on function public.record_delivery_handover(uuid, numeric, text, numeric, text) from public, anon;
grant execute on function public.record_delivery_handover(uuid, numeric, text, numeric, text) to authenticated;

-- A stop stays open until the driver has saved the reading for it.
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
  if s.kind = 'pickup' and not exists (
       select 1 from public.delivery_handovers h
        where h.stop_id = s.id and h.recorded_kg is not null and h.grade in ('A', 'B', 'C') and h.temperature_c is not null) then
    raise exception 'record the pickup first';
  end if;
  if s.kind = 'dropoff' and not exists (
       select 1 from public.delivery_handovers h where h.stop_id = s.id and h.temperature_c is not null) then
    raise exception 'log the temperature';
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

revoke all on function public.complete_delivery_stop(uuid) from public, anon;
grant execute on function public.complete_delivery_stop(uuid) to authenticated;
