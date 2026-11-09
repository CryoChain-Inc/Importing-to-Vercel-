#!/usr/bin/env python3
"""Build product images from generated catalogue sheets and product triptychs."""
from pathlib import Path
import re
import unicodedata

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHEETS = ROOT / "assets/catalogue/sheets"
OUT = ROOT / "assets/catalogue/products"
CATEGORIES = ROOT / "assets/catalogue/categories"
GALLERIES = SHEETS / "product-gallery"

FRUIT = "exec-207ea3f3-eeb8-4385-9144-f56c1af64452.png"
VEG1 = "exec-ef82cb1a-d687-4fbe-8d8a-28182947b3a8.png"
VEG2 = "exec-d8dc966f-e8cf-4c3c-bd6e-6451fb66e7e2.png"
VEG3 = "exec-b49eeea2-14db-4467-8315-4de885c3eca5.png"
MEAT1 = "exec-c12e0596-8202-4625-a398-da2ef2cac3dd.png"
MEAT2 = "exec-fc3a9f95-29c5-4f70-bbdf-7bb0d416b3a4.png"
MEAT3 = "exec-6cee20a6-65a5-4c0f-a58e-545fe0b0b81d.png"
EGGS_DAIRY = "exec-cf87a3a7-1ffd-46d0-bed1-c8a1d645e5d8.png"
DAIRY_DRINKS = "exec-0bc20219-847c-4c12-93e9-4b4d1cf7c88b.png"
DRINKS_HEROES = "exec-ec09d97d-1a84-4025-ac5b-a7725ce88101.png"

def slug(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")

def sql_quote(value):
    return "'" + value.replace("'", "''") + "'"

def crop(sheet, index, target):
    image = Image.open(SHEETS / sheet).convert("RGB")
    col, row = index % 4, index // 4
    cell_w, cell_h = image.width / 4, image.height / 4
    inset_x, inset_y = max(2, round(cell_w * 0.006)), max(2, round(cell_h * 0.006))
    tile = image.crop((round(col * cell_w) + inset_x, round(row * cell_h) + inset_y,
                       round((col + 1) * cell_w) - inset_x, round((row + 1) * cell_h) - inset_y))
    tile.save(target, "JPEG", quality=88, optimize=True, progressive=True)

def create_gallery(target):
    """Crop three independent generated photos from this product's triptych."""
    source = GALLERIES / f"{target.stem}.png"
    if not source.exists():
        raise ValueError(f"Missing distinct product gallery sheet: {source}")
    image = Image.open(source).convert("RGB")
    cell_w = image.width / 3
    for index in range(3):
        inset_x = max(3, round(cell_w * 0.012))
        inset_y = max(3, round(image.height * 0.012))
        left = round(index * cell_w) + inset_x
        right = round((index + 1) * cell_w) - inset_x
        top, bottom = inset_y, image.height - inset_y
        cell = image.crop((left, top, right, bottom))
        width, height = cell.size
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        cell = cell.crop((left, top, left + side, top + side))
        cell.save(target.with_name(f"{target.stem}-{index + 2}.jpg"), "JPEG",
                  quality=88, optimize=True, progressive=True)

def many(names, sheet, start=0):
    for offset, name in enumerate(names):
        target = OUT / f"{slug(name)}.jpg"
        crop(sheet, start + offset, target)
        create_gallery(target)

OUT.mkdir(parents=True, exist_ok=True)
CATEGORIES.mkdir(parents=True, exist_ok=True)

many(["Mango", "Pineapple", "Papaya", "Avocado", "Guava", "Passion Fruit", "Soursop", "Coconut", "Watermelon", "Banana", "Plantain", "Orange", "Tangerine", "Lime", "Lemon", "African Star Apple"], FRUIT)
Image.open(ROOT / "assets/catalogue/palm-fruit-source.png").convert("RGB").save(OUT / "palm-fruit.jpg", "JPEG", quality=88, optimize=True, progressive=True)
create_gallery(OUT / "palm-fruit.jpg")

many(["Tomato", "Hot Pepper", "Bell Pepper", "Okra", "Garden Egg", "Turkey Berry", "Cucumber", "Sweet Corn", "Onion", "Shallot", "Ginger", "Garlic", "Carrot", "Cabbage", "Lettuce", "Spring Onion"], VEG1)
many(["Kontomire", "Jute Mallow", "Amaranth Greens", "Bitter Leaf", "Fluted Pumpkin Leaves", "Scent Leaf", "Moringa Leaves", "Cassava Leaves", "Green Beans", "Mushroom", "Yam", "Cassava", "Cocoyam", "Sweet Potato", "Rice", "Maize"], VEG2)
many(["Millet", "Sorghum", "Cowpea", "Groundnut", "Soybean", "Gari"], VEG3)

many(["Whole Chicken (Broiler)", "Local Chicken", "Chicken Parts", "Guinea Fowl", "Turkey", "Duck", "Beef", "Minced Beef", "Beef Offal", "Cow Skin", "Goat Meat", "Lamb and Mutton", "Pork", "Grasscutter", "Rabbit", "Snail"], MEAT1)
many(["Tilapia", "Catfish", "Silver Catfish", "Horse Mackerel", "Chub Mackerel", "Sardinella", "Anchovy", "Red Fish (Sea Bream)", "Red Snapper", "Cassava Fish (Croaker)", "Tuna", "Barracuda", "Bonga Shad", "Shrimp and Prawns", "Crab", "Lobster"], MEAT2)
many(["Squid and Octopus", "Smoked Fish", "Salted Dried Fish", "Fermented Fish", "Dried Shrimp and Crayfish"], MEAT3)

many(["Chicken Eggs (Large)", "Chicken Eggs (Medium)", "Pullet Eggs", "Local Fowl Eggs", "Guinea Fowl Eggs", "Quail Eggs", "Duck Eggs"], EGGS_DAIRY)
many(["Fresh Cow Milk", "Pasteurized Milk", "Goat Milk", "Nunu", "Yogurt", "Drinking Yogurt", "Brukina", "Wagashi", "Cheese"], EGGS_DAIRY, 7)
many(["Butter", "Cream", "Ice Cream"], DAIRY_DRINKS)
many(["Sobolo", "Asaana", "Lamugin", "Tiger Nut Drink", "Kunu", "Coconut Water", "Pineapple Juice", "Orange Juice", "Mango Juice", "Mixed Fruit Juice", "Lager Beer", "Stout", "Palm Wine"], DAIRY_DRINKS, 3)
many(["Pito", "Malt Drink", "Soft Drinks", "Energy Drinks", "Bottled Water", "Sachet Water"], DRINKS_HEROES)

heroes = {
    "fruit": (DRINKS_HEROES, 6), "vegetables": (DRINKS_HEROES, 7),
    "meat": (DRINKS_HEROES, 8), "eggs": (DRINKS_HEROES, 9),
    "dairy": (DRINKS_HEROES, 10), "beverages": (DRINKS_HEROES, 11),
}
for name, (sheet, index) in heroes.items():
    crop(sheet, index, CATEGORIES / f"{name}.jpg")

catalogue_sql = (ROOT / "supabase/seed/catalogue.sql").read_text()
products = []
category = None
for line in catalogue_sql.splitlines():
    category_match = re.search(r"with c as \(select id from public\.categories where lower\(name\) = lower\('((?:''|[^'])*)'\)", line)
    if category_match:
        category = category_match.group(1).replace("''", "'")
    product_match = re.search(r"select '((?:''|[^'])*)', c\.id", line)
    if product_match:
        name = product_match.group(1).replace("''", "'")
        path = f"products/{slug(name)}.jpg"
        if not (OUT / f"{slug(name)}.jpg").exists():
            raise ValueError(f"Missing generated image for product: {name}")
        products.append((name, path, [f"products/{slug(name)}-{i}.jpg" for i in (2, 3, 4)]))

category_names = re.findall(r"insert into public\.categories \(name\) select '((?:''|[^'])*)'", catalogue_sql)
product_files = list(OUT.glob("*.jpg"))
if len(products) * 4 != len(product_files) or len(category_names) != len(heroes):
    raise ValueError(f"Catalogue/image mismatch: {len(products)} products, {len(product_files)} product files, {len(category_names)} categories")

def values(rows):
    return ",\n  ".join(f"({sql_quote(name)}, {sql_quote(path)})" for name, path in rows)

gallery_values = ",\n  ".join(
    f"({sql_quote(name)}, array[{', '.join(sql_quote(path) for path in paths)}]::text[])"
    for name, _, paths in products
)
product_name_values = ", ".join(f"({sql_quote(name)})" for name, _, _ in products)

category_rows = [(name.replace("''", "'"), f"categories/{slug(name.replace(chr(39) * 2, chr(39)))}.jpg") for name in category_names]
seed = f"""-- Generated by scripts/build-catalogue-images.py; safe to rerun after uploading the assets.
begin;
with image_map(name, path) as (values
  {values([(name, path) for name, path, _ in products])}
)
update public.products p set image_path = image_map.path
from image_map where lower(btrim(p.name)) = lower(image_map.name);

with image_map(name, paths) as (values
  {gallery_values}
)
update public.products p set image_paths = image_map.paths
from image_map where lower(btrim(p.name)) = lower(image_map.name);

with image_map(name, path) as (values
  {values(category_rows)}
)
update public.categories c set image_path = image_map.path
from image_map where lower(btrim(c.name)) = lower(image_map.name);

do $$
declare product_images integer; category_images integer;
begin
  with expected(name, path) as (values {values([(name, path) for name, path, _ in products])})
  select count(*) into product_images from expected e join public.products p
    on lower(btrim(p.name)) = lower(e.name) and p.image_path = e.path;
  with expected(name, path) as (values {values(category_rows)})
  select count(*) into category_images from expected e join public.categories c
    on lower(btrim(c.name)) = lower(e.name) and c.image_path = e.path;
  if product_images <> {len(products)} then
    raise exception 'Catalogue image seed did not assign all {len(products)} product images';
  end if;
  if (with expected(name) as (values {product_name_values})
      select count(*) from expected e join public.products p
      on lower(btrim(p.name)) = lower(e.name) and cardinality(p.image_paths) = 3) <> {len(products)} then
    raise exception 'Catalogue image seed did not assign all {len(products)} product galleries';
  end if;
  if category_images <> {len(category_rows)} then
    raise exception 'Catalogue image seed did not assign all {len(category_rows)} category images';
  end if;
end;
$$;
commit;
"""
(ROOT / "supabase/seed/catalogue-images.sql").write_text(seed)
print(f"Built {len(products) * 4} product photos, {len(category_rows)} category photos, and the image path seed")
