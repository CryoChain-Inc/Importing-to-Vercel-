-- A farmer can edit product, grade and weight until ops adds the listing to a lot.
-- Runs as the owner (farmers have no UPDATE policy) and re-stamps the expected payout,
-- the same way private.stamp_listing does on insert.

create or replace function public.update_own_listing(p_id uuid, p_product text, p_grade text, p_weight_kg numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  allocated uuid;
  e record;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select l.lot_id into allocated
    from public.produce_listings l
   where l.id = p_id and l.farmer_id = uid
   for update;
  if not found then
    raise exception 'listing not found';
  end if;
  if allocated is not null then
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

revoke all on function public.update_own_listing(uuid, text, text, numeric) from public, anon;
grant execute on function public.update_own_listing(uuid, text, text, numeric) to authenticated;
