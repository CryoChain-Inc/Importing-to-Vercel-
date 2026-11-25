-- Shop search runs in the database: every word typed must appear in the product name or an alias.
drop function if exists public.buyer_catalogue();
create function public.buyer_catalogue(p_search text default null)
returns table (
  product_id uuid,
  product_name text,
  product_aliases text,
  product_image text,
  product_images text[],
  product_description text,
  category_id uuid,
  category_name text,
  category_image text,
  unit text,
  price numeric,
  available_kg numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.aliases,
    p.image_path,
    p.image_paths,
    p.description,
    c.id,
    c.name,
    c.image_path,
    p.unit,
    private.buyer_price(pp.price),
    private.available_kg(p.id, p.unit)
  from public.product_prices pp
  join public.products p on p.id = pp.product_id and p.active
  join public.categories c on c.id = p.category_id and c.active
  where ((select private.is_buyer()) or (select private.is_ops()))
    and not exists (
      select 1
        from unnest(regexp_split_to_array(trim(coalesce(p_search, '')), '\s+')) w
       where w <> ''
         and (p.name || ' ' || coalesce(p.aliases, ''))
             not ilike '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by p.created_at desc, p.id;
$$;
revoke all on function public.buyer_catalogue(text) from public, anon;
grant execute on function public.buyer_catalogue(text) to authenticated;
