-- Listings carry 3-6 photos and an estimated settlement (Grade A farm-gate price x listed kg, less the collection fee).
-- Estimates are frozen at listing time; the final amounts are set at collection from recorded weight and grade.

-- Collection fee is capped at 5% of gross value (docs/Workflow-short.md §3.2); ops can lower it.
alter table public.ops_config
  add column collection_fee_rate numeric(5, 4) not null default 0.05
    check (collection_fee_rate >= 0 and collection_fee_rate <= 0.05);

alter table public.produce_listings
  add column image_paths text[] not null default '{}',
  add column est_price_per_kg numeric(10, 2),
  add column est_gross numeric(12, 2),
  add column est_fee_rate numeric(5, 4),
  add column est_fee numeric(12, 2),
  add column est_net numeric(12, 2),
  -- not valid: listings made before photos existed stay as they are
  add constraint produce_listings_images check (cardinality(image_paths) between 3 and 6) not valid;

-- Single source of truth for the preview and the stored estimate.
create function public.estimate_listing(p_product text, p_kg numeric)
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
   where pr.name = p_product and pr.active and cp.grade = 'A';
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

revoke all on function public.estimate_listing(text, numeric) from public, anon;
grant execute on function public.estimate_listing(text, numeric) to authenticated;

-- Server-side stamp: clients cannot choose their own estimate or attach another farmer's photos.
create function private.stamp_listing()
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
  select * into e from public.estimate_listing(new.product, new.weight_kg);
  if e.price_per_kg is null then
    raise exception 'no published price for this product';
  end if;
  new.est_price_per_kg := e.price_per_kg;
  new.est_gross := e.gross;
  new.est_fee_rate := e.fee_rate;
  new.est_fee := e.fee;
  new.est_net := e.net;
  return new;
end;
$$;

create trigger produce_listings_stamp
before insert on public.produce_listings
for each row execute function private.stamp_listing();

-- ── Storage: farmers manage photos under their own folder; public read so ops and buyers can see them ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produce', 'produce', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy produce_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'produce' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy produce_own_select on storage.objects for select to authenticated
  using (bucket_id = 'produce' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy produce_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'produce' and (storage.foldername(name))[1] = (select auth.uid())::text);
