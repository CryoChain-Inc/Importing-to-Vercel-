-- Grade A must cost more than B, and B more than C, for both the farmer and the buyer price.
-- Deferred to commit so a save that rewrites all three grades in one request is checked once, on the final state.

create or replace function private.check_grade_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bad boolean;
begin
  if tg_table_name = 'crop_prices' then
    select exists (
      select 1 from public.crop_prices hi
      join public.crop_prices lo on lo.product_id = hi.product_id and lo.grade > hi.grade
      where hi.product_id = new.product_id and hi.price <= lo.price
    ) into bad;
  else
    select exists (
      select 1 from public.buyer_prices hi
      join public.buyer_prices lo on lo.product_id = hi.product_id and lo.grade > hi.grade
      where hi.product_id = new.product_id and hi.price <= lo.price
    ) into bad;
  end if;
  if bad then
    raise exception 'Grade A must cost more than Grade B, and Grade B more than Grade C.' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger crop_prices_grade_order
after insert or update of price on public.crop_prices
deferrable initially deferred
for each row execute function private.check_grade_order();

create constraint trigger buyer_prices_grade_order
after insert or update of price on public.buyer_prices
deferrable initially deferred
for each row execute function private.check_grade_order();
