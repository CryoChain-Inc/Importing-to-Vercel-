-- Products are stocked in one base unit only: kg, liter, piece or bunch.
-- Why: stock, holds and allocations are counted in the product's unit. A "crate of 30" could not represent 45 eggs,
-- so supply was wrong. Pack sizes (crate, bag, "3 fruits", "500 ml bottle") are folded into the base unit and the price re-based.
-- Existing data is converted: the unit and base price change for every product in the map below. Listings, orders and
-- other rows recorded in an old unit are kept as history but no longer match anything for sale. Carts for converted
-- products are emptied (their quantities were in the old unit). Not reversible without a backup.
-- Assumptions to review in ops: olonka = 2.5 kg, mini paint container = 2 kg, large sack = 100 kg, banana hand -> bunch at the same price.

create temp table unit_map (old_unit text primary key, new_unit text not null, per numeric not null) on commit drop;
insert into unit_map values
  ('500 ml bottle', 'liter', 0.5), ('500 ml', 'liter', 0.5), ('1 liter tub', 'liter', 1),
  ('1.5 liter bottle', 'piece', 1), ('625 ml bottle', 'piece', 1), ('bottle', 'piece', 1),
  ('330 ml bottle or can', 'piece', 1), ('can', 'piece', 1), ('bag of 30', 'piece', 30),
  ('fruit', 'piece', 1), ('nut', 'piece', 1), ('cob', 'piece', 1), ('tuber', 'piece', 1), ('head', 'piece', 1),
  ('egg', 'piece', 1), ('bird', 'piece', 1), ('animal', 'piece', 1), ('large snail', 'piece', 1), ('medium piece', 'piece', 1),
  ('3 fruits', 'piece', 3), ('5 pieces', 'piece', 5), ('4 pieces', 'piece', 4), ('crate of 30', 'piece', 30),
  ('hand', 'bunch', 1),
  ('olonka', 'kg', 2.5), ('mini paint container', 'kg', 2), ('large sack', 'kg', 100), ('50 kg bag', 'kg', 50), ('250 g', 'kg', 0.25);

create temp table converted on commit drop as
  select p.id from public.products p join unit_map m on m.old_unit = p.unit;

delete from public.cart_lines where product_id in (select id from converted);

update public.product_prices pp set price = greatest(0.01, round(pp.price / m.per, 2))
  from public.products p, unit_map m
 where pp.product_id = p.id and p.unit = m.old_unit;

-- The guard blocks unit changes once listings or orders exist; this conversion is the deliberate exception.
alter table public.products disable trigger products_unit_guard;
update public.products p set unit = m.new_unit from unit_map m where p.unit = m.old_unit;
alter table public.products enable trigger products_unit_guard;

-- The old price was in another unit, so a "previous price" would show a false change.
update public.product_prices set prev_price = null where product_id in (select id from converted);

-- Fails loudly if a product still has a unit outside the list: map it above, then rerun.
alter table public.products
  add constraint products_unit_base check (unit in ('kg', 'liter', 'piece', 'bunch'));
comment on column public.products.unit is 'The one base unit (kg, liter, piece or bunch) this product is stocked, listed, ordered, collected and paid in.';
