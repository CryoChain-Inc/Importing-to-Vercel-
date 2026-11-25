-- available_kg: a committed order line only claims what will still be delivered.
-- The tolerated and short part of a line is already subtracted as a 'declined' allocation, so counting it in the
-- committed hold as well took it off sale twice and hid real supply. Matches allocate_order's kg - tolerated_kg - short_kg.
create or replace function private.available_kg(p_product_id uuid, p_unit text)
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
        and l.unit = p_unit
        and l.lot_id is null
        and not exists (select 1 from public.captures c where c.listing_id = l.id)
    ), 0)
    - coalesce((
      select sum(h.kg)
      from public.supply_holds h
      where h.product_id = p_product_id
        and h.unit = p_unit
        and (h.state = 'committed' or (h.state = 'held' and h.expires_at > now()))
    ), 0)
    + coalesce((
      select sum(oi.tolerated_kg + oi.short_kg)
      from public.order_items oi
      where oi.product_id = p_product_id
        and oi.unit = p_unit
        and exists (
          select 1 from public.supply_holds h
          where h.order_id = oi.order_id and h.product_id = oi.product_id and h.unit = oi.unit and h.state = 'committed'
        )
    ), 0)
    - coalesce((
      select sum(a.kg)
      from public.order_allocations a
      where a.product_id = p_product_id
        and a.unit = p_unit
        and a.status in ('declined', 'expired')
    ), 0)
  );
$$;
revoke all on function private.available_kg(uuid, text) from public, anon, authenticated;
