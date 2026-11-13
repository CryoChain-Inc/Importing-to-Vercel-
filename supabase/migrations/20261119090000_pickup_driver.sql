-- pickup-driver: a farmer sees who is collecting (name, phone, truck) once a truck is assigned to the pickup,
-- so they can call the driver. The buyer is still never shown.

create or replace function public.farmer_pickups()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.obj order by x.upcoming desc, x.sort_at desc), '[]'::jsonb)
  from (
    select
      bool_or(a.status in ('offered', 'accepted')) as upcoming,
      coalesce(max(s.done_at), max(s.eta), max(a.created_at)) as sort_at,
      jsonb_build_object(
        'id', coalesce(a.pickup_stop_id, min(a.id::text)::uuid),
        'product', p.name,
        'unit', min(a.unit),
        'expected', sum(a.kg) filter (where a.status in ('offered', 'accepted', 'collected', 'declined')),
        'collected', coalesce(sum(a.kg) filter (where a.status = 'collected'), 0),
        'short', coalesce(sum(a.kg) filter (where a.status = 'declined'), 0),
        'earning', coalesce(sum(a.amount) filter (where a.status in ('offered', 'accepted', 'collected')), 0),
        'paid', coalesce(sum(a.amount) filter (where a.payout_status = 'paid'), 0),
        'state', case
          when bool_or(a.status in ('offered', 'accepted')) and max(s.driver_id::text) is not null then 'on_the_way'
          when bool_or(a.status in ('offered', 'accepted')) then 'waiting'
          when bool_and(a.payout_status = 'paid' or a.status = 'declined') and bool_or(a.status = 'collected') then 'paid'
          when bool_or(a.payout_status = 'payable') then 'delivered'
          when bool_or(a.status = 'collected') then 'collected'
          else 'not_supplied' end,
        'eta', coalesce(max(s.eta) filter (where s.state = 'pending'), max(a.pickup_at)),
        'collectedAt', max(s.done_at),
        'reservedAt', min(a.created_at),
        'driver', case when max(s.driver_id::text) is null then null else jsonb_build_object(
          'name', max(dp.display_name), 'phone', max(dp.phone), 'plate', max(t.plate), 'vehicle', max(t.name)) end
      ) as obj
    from public.order_allocations a
    join public.products p on p.id = a.product_id
    left join public.delivery_stops s on s.id = a.pickup_stop_id
    left join public.profiles dp on dp.id = s.driver_id
    left join public.trucks t on t.driver_id = s.driver_id
    where a.farmer_id = (select auth.uid())
      and a.status in ('offered', 'accepted', 'collected', 'declined')
    group by coalesce(a.pickup_stop_id, a.id), a.pickup_stop_id, p.name
  ) x;
$$;
revoke all on function public.farmer_pickups() from public, anon;
grant execute on function public.farmer_pickups() to authenticated;
