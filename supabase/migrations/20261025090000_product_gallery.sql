-- Product detail: a description and extra gallery photos (storage keys in the public 'catalogue' bucket; image_path stays the cover).
-- The shop now also lists priced products that are out of stock, so buyers see them flagged instead of missing.

alter table public.products
  add column description text,
  add column image_paths text[] not null default '{}',
  add constraint products_description_len check (description is null or char_length(description) <= 600),
  add constraint products_gallery_size check (cardinality(image_paths) <= 8);

drop function public.buyer_catalogue();

create function public.buyer_catalogue()
returns table (
  product_id uuid,
  product_name text,
  product_image text,
  product_images text[],
  product_description text,
  category_id uuid,
  category_name text,
  category_image text,
  grade text,
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
    p.image_path,
    p.image_paths,
    p.description,
    c.id,
    c.name,
    c.image_path,
    bp.grade,
    bp.price,
    private.available_kg(p.id, bp.grade)
  from public.buyer_prices bp
  join public.products p on p.id = bp.product_id and p.active
  join public.categories c on c.id = p.category_id and c.active
  where (select private.is_buyer()) or (select private.is_ops())
  order by c.name, p.name, bp.grade;
$$;

revoke all on function public.buyer_catalogue() from public, anon;
grant execute on function public.buyer_catalogue() to authenticated;
