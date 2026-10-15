-- Farmers declare an expected grade on each listing; the estimate uses that grade's farm-gate price.
-- The grade is confirmed or changed by the field agent at collection.
alter table public.produce_listings
  add column grade text not null default 'A' check (grade in ('A', 'B', 'C'));

drop function public.estimate_listing(text, numeric);

create function public.estimate_listing(p_product text, p_kg numeric, p_grade text default 'A')
returns table (price_per_kg numeric, gross numeric, fee_rate numeric, fee numeric, net numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_price numeric;
  v_rate numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  select cp.price into v_price
    from public.crop_prices cp
    join public.products pr on pr.id = cp.product_id
   where pr.name = p_product and pr.active and cp.grade = p_grade;
  if v_price is null then
    return;
  end if;
  select c.collection_fee_rate into v_rate from public.ops_config c;
  price_per_kg := v_price;
  gross := round(v_price * p_kg, 2);
  fee_rate := v_rate;
  fee := round(gross * v_rate, 2);
  net := gross - fee;
  return next;
end;
$$;

revoke all on function public.estimate_listing(text, numeric, text) from public, anon;
grant execute on function public.estimate_listing(text, numeric, text) to authenticated;

create or replace function private.stamp_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  p text;
begin
  if cardinality(new.image_paths) not between 3 and 6 then
    raise exception 'add 3 to 6 photos';
  end if;
  foreach p in array new.image_paths loop
    if p not like new.farmer_id::text || '/%' then
      raise exception 'invalid photo path';
    end if;
  end loop;
  select * into e from public.estimate_listing(new.product, new.weight_kg, new.grade);
  if e.price_per_kg is null then
    raise exception 'no published price for this product and grade';
  end if;
  new.est_price_per_kg := e.price_per_kg;
  new.est_gross := e.gross;
  new.est_fee_rate := e.fee_rate;
  new.est_fee := e.fee;
  new.est_net := e.net;
  return new;
end;
$$;
