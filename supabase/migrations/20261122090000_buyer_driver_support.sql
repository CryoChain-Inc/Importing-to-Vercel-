-- buyer-driver-support: a buyer sees who is delivering their own order (name, phone, truck plate) once a driver
-- is on it, and the ops support phone and email. ops_config and driver profiles stay private; only these
-- two functions expose these fields.

create or replace function public.buyer_order_tracking(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  drop_stop public.delivery_stops;
  next_id uuid;
  loc public.driver_locations;
  drv jsonb;
begin
  select * into ord from public.orders where id = p_order and buyer_id = (select auth.uid());
  if not found then
    raise exception 'order not found';
  end if;
  select * into drop_stop from public.delivery_stops where order_id = ord.id and kind = 'dropoff';

  if drop_stop.state = 'done' then
    return jsonb_build_object('state', 'delivered', 'deliveredAt', drop_stop.done_at);
  end if;
  if drop_stop.id is null or drop_stop.driver_id is null then
    return jsonb_build_object('state', 'waiting');
  end if;

  select * into loc from public.driver_locations where driver_id = drop_stop.driver_id;
  select s.id into next_id from public.delivery_stops s
   where s.driver_id = drop_stop.driver_id and s.state = 'pending' and s.seq is not null order by s.seq limit 1;
  select jsonb_build_object('name', p.display_name, 'phone', p.phone, 'plate', t.plate) into drv
    from public.profiles p
    left join public.trucks t on t.driver_id = p.id
   where p.id = drop_stop.driver_id;

  return jsonb_build_object(
    'state', case when next_id = drop_stop.id then 'next' else 'on_the_way' end,
    'eta', drop_stop.eta,
    'destination', jsonb_build_object('lat', drop_stop.lat, 'lng', drop_stop.lng),
    'truck', case when loc.driver_id is null then null
                  else jsonb_build_object('lat', loc.lat, 'lng', loc.lng, 'at', loc.updated_at) end,
    'driver', drv,
    -- Only the road from the truck to this buyer, and only when nothing else is in between.
    'polyline', case when next_id = drop_stop.id then drop_stop.leg_polyline end
  );
end;
$$;

create function public.get_support_contact()
returns table (phone text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_buyer()) then
    raise exception 'buyers only';
  end if;
  return query select c.support_phone, c.support_email from public.ops_config c;
end;
$$;
revoke all on function public.get_support_contact() from public, anon;
grant execute on function public.get_support_contact() to authenticated;
