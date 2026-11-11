#!/usr/bin/env python3
"""Turns "Product Catalog.xlsx" into SQL that loads categories, products (unit, aliases, description) and base prices.

Prints SQL to stdout and a summary to stderr. It writes nothing itself, so review it, then run it where you want it:

    python3 scripts/load-catalogue.py "~/Downloads/Product Catalog.xlsx" > /tmp/catalogue.sql
    psql "$DATABASE_URL" -f /tmp/catalogue.sql        # or paste it into the Supabase SQL editor

Safe to run again: categories and products are matched by name and updated, prices are upserted (the previous
price is kept for the change %). Existing product units are preserved. If a workbook's price unit differs from
an existing product's unit, its price is skipped rather than applying a price in the wrong unit.

Mapping: Products sheet -> product_name, category_name, description, price_unit ("per kg" -> unit "kg"),
price_mid_ghs -> base price. Aliases = Search Aliases sheet + other_names, de-duplicated.
Not used: the other sale_units (one product is sold in one unit), storage temperatures, keywords.
"""
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
DESC_MAX, ALIAS_MAX, UNIT_MAX, NAME_MIN, NAME_MAX = 600, 500, 40, 2, 80


def read_sheets(path):
    """Sheet name -> list of {column letter: text}, using each sheet's own header row."""
    z = zipfile.ZipFile(path)
    strings = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(NS + 'si')]
    names = [s.get('name') for s in ET.fromstring(z.read('xl/workbook.xml')).iter(NS + 'sheet')]
    out = {}
    for i, name in enumerate(names, 1):
        rows = []
        for r in ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml')).iter(NS + 'row'):
            cells = {}
            for c in r.findall(NS + 'c'):
                v = c.find(NS + 'v')
                if v is not None and (v.text or c.get('t') == 's'):
                    cells[re.sub(r'\d', '', c.get('r'))] = strings[int(v.text)] if c.get('t') == 's' else (v.text or '')
            if cells:
                rows.append(cells)
        out[name] = rows
    return out


def table(rows, key):
    """Rows below the header row that contains `key`, as dicts keyed by header text."""
    head = next(r for r in rows if key in r.values())
    col = {letter: text for letter, text in head.items()}
    return [{col[k]: v.strip() for k, v in r.items() if k in col} for r in rows[rows.index(head) + 1:]]


def q(s):
    return "'" + s.replace("'", "''") + "'"


# Pack-sized workbook units -> (base unit, how many base units one pack holds). Keep in step with supabase/migrations/20261110090000_base_units.sql.
BASE = {u: ('piece', n) for u, n in [('1.5 liter bottle', 1), ('625 ml bottle', 1), ('bottle', 1), ('330 ml bottle or can', 1), ('can', 1),
        ('bag of 30', 30), ('fruit', 1), ('nut', 1), ('cob', 1), ('tuber', 1), ('head', 1), ('egg', 1), ('bird', 1), ('animal', 1),
        ('large snail', 1), ('medium piece', 1), ('3 fruits', 3), ('5 pieces', 5), ('4 pieces', 4), ('crate of 30', 30)]}
BASE.update({'500 ml bottle': ('liter', 0.5), '500 ml': ('liter', 0.5), '1 liter tub': ('liter', 1), 'hand': ('bunch', 1),
             'olonka': ('kg', 2.5), 'mini paint container': ('kg', 2), 'large sack': ('kg', 100), '50 kg bag': ('kg', 50), '250 g': ('kg', 0.25)})


def unit_of(price_unit):
    """'per kg' -> 'kg', 'per crate of 30' -> 'piece'. Use base_of to also re-base the price."""
    return re.sub(r'^per\s+', '', price_unit.strip(), flags=re.I)


def base_of(unit, price):
    """(workbook unit, price per that unit) -> (base unit, price per base unit)."""
    new, per = BASE.get(unit, (unit, 1))
    return new, round(price / per, 2)


def aliases_of(product, other_names, alias_rows):
    seen, out = {product['product_name'].lower()}, []
    raw = [a['alias'] for a in alias_rows if a.get('product_id') == product['product_id']]
    # other_names looks like "abrobe (Twi); ananas (French)": keep the word, drop the language tag.
    raw += [part.strip() for part in re.split(r'[;,]', re.sub(r'\s*\(.*?\)', '', other_names or ''))]
    for a in raw:
        if a and a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return ', '.join(out)


def main(path):
    sheets = read_sheets(os.path.expanduser(path))
    products = table(sheets['Products'], 'product_id')
    alias_rows = table(sheets['Search Aliases'], 'alias_id')
    sql, skipped, clipped, categories = [], [], 0, []
    for p in products:
        name, cat = p.get('product_name', ''), p.get('category_name', '')
        unit, price = unit_of(p.get('price_unit', '')), p.get('price_mid_ghs', '')
        try:
            unit, price_n = base_of(unit, float(price))
        except ValueError:
            price_n = 0
        if not (p.get('product_id', '').startswith('P') and NAME_MIN <= len(name) <= NAME_MAX and cat and unit and len(unit) <= UNIT_MAX and 0 < price_n <= 100000):
            if p.get('product_id', '').startswith('P'):
                skipped.append(name or p['product_id'])
            continue
        desc = p.get('description', '')
        if len(desc) > DESC_MAX:
            desc, clipped = desc[:DESC_MAX - 1].rsplit(' ', 1)[0] + '…', clipped + 1
        aliases = aliases_of(p, p.get('other_names', ''), alias_rows)
        if len(aliases) > ALIAS_MAX:
            aliases = aliases[:ALIAS_MAX].rsplit(',', 1)[0]
        if cat not in categories:
            categories.append(cat)
        sql.append(
            f"with c as (select id from public.categories where lower(name) = lower({q(cat)}) limit 1),\n"
            f"p as (insert into public.products (name, category_id, description, aliases, unit, active)\n"
            f"  select {q(name)}, c.id, {q(desc) if desc else 'null'}, {q(aliases)}, {q(unit)}, true from c\n"
            f"  on conflict (name) do update set category_id = excluded.category_id, description = excluded.description,\n"
            f"    aliases = excluded.aliases returning id, unit)\n"
            f"insert into public.product_prices (product_id, price) select id, {price_n} from p where unit = {q(unit)}\n"
            f"  on conflict (product_id) do update set price = excluded.price;")
    print('-- Generated by scripts/load-catalogue.py. Not a migration: run it once where you want the data.')
    print('begin;')
    for c in categories:
        print(f"insert into public.categories (name) select {q(c)} where not exists (select 1 from public.categories where lower(name) = lower({q(c)}));")
    print('\n'.join(sql))
    print('commit;')
    print(f"{len(sql)} products, {len(categories)} categories; {clipped} descriptions shortened to {DESC_MAX} characters; "
          f"{len(skipped)} skipped{': ' + ', '.join(skipped) if skipped else ''}.", file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
