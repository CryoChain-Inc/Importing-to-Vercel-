import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { imageUrl } from '../../../services/catalogueImage';
import { fetchProductsPage, savePrices, type Category, type PriceKind, type PriceRow, type Product } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { GRADES, gradeOrderError, type Grade } from '../../../utils/gradeOrder';
import type { PageProps } from '../useOpsLocation';
import { CategoriesSection, ProductForm, ProductList } from './CatalogueSections';
import { ListRowsSkeleton, PriceCardsSkeleton } from './CatalogueSkeletons';
import { Empty, Pager, UnderlineTabs, useServerPage } from './OpsBits';
import { Sheet } from './Sheet';
import { useAction } from './useAction';

type View_ = 'prices' | 'products' | 'categories';
type Texts = Record<PriceKind, Record<Grade, string>>;
const KINDS: PriceKind[] = ['farmer', 'buyer'];

const change = (r?: PriceRow) => {
  if (!r?.prevPrice) return null;
  const pct = ((r.price - r.prevPrice) / r.prevPrice) * 100;
  return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, down: pct < 0 };
};

/** '' clears the grade (null); anything that is not a positive number is NaN. */
const parse = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')));
const valid = (n: number | null) => n === null || (Number.isFinite(n) && n > 0 && n <= 100000);

/** Farmer and buyer price for every grade in one dialog, with the margin shown as you type. */
function PriceSheet({ product, rows, onSaved, onClose }: { product: Product; rows: PriceRow[]; onSaved: () => Promise<void>; onClose: () => void }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onSaved);
  const initial: Texts = { farmer: { A: '', B: '', C: '' }, buyer: { A: '', B: '', C: '' } };
  for (const r of rows) initial[r.kind][r.grade] = String(r.price);
  const [text, setText] = useState(initial);
  const nums = (k: PriceKind) => ({ A: parse(text[k].A), B: parse(text[k].B), C: parse(text[k].C) }) as Record<Grade, number | null>;
  const badNumber = KINDS.some((k) => GRADES.some((g) => !valid(nums(k)[g])));
  const order = KINDS.map((k) => {
    const e = badNumber ? null : gradeOrderError(nums(k));
    return e ? `${k === 'farmer' ? 'Farmer' : 'Buyer'} prices: ${e}` : null;
  }).filter(Boolean) as string[];
  const inverted = badNumber ? [] : GRADES.filter((g) => {
    const f = nums('farmer')[g], b = nums('buyer')[g];
    return f !== null && b !== null && f > b;
  });
  const dirty = KINDS.some((k) => GRADES.some((g) => text[k][g] !== initial[k][g]));
  const set = (k: PriceKind, g: Grade, v: string) => setText((t) => ({ ...t, [k]: { ...t[k], [g]: v } }));

  return (
    <Sheet title={product.name} subtitle="Prices per kg. Grade A farmer price shows on the public landing page; the previous price is kept to show the change." onClose={onClose}
      footer={<>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        <Button label="Save prices" loading={busy} disabled={!dirty || badNumber || order.length > 0 || inverted.length > 0}
          onPress={() => run(async () => {
            for (const k of KINDS) if (GRADES.some((g) => text[k][g] !== initial[k][g])) await savePrices(product.id, k, nums(k));
            onClose();
          })} />
      </>}>
      {error ? <Banner text={error} /> : null}
      {GRADES.map((g) => {
        const f = parse(text.farmer[g]);
        const b = parse(text.buyer[g]);
        const both = f !== null && b !== null && valid(f) && valid(b);
        const margin = both ? b - f : null;
        return (
          <View key={g} style={s.gradeBlock}>
            <View style={s.gradeHead}>
              <Text style={s.gradeTitle}>Grade {g}</Text>
              {margin !== null ? (
                <Text style={[s.margin, margin <= 0 && s.marginBad]}>
                  {margin <= 0 ? 'Buyer pays no more than the farmer gets' : `Margin ${ghs(margin)} · ${Math.round((margin / f!) * 100)}%`}
                </Text>
              ) : null}
            </View>
            <View style={s.pair}>
              <View style={s.cell}><Input label="Farmer price" prefix="GH₵" value={text.farmer[g]} onChangeText={(v) => set('farmer', g, v)} keyboardType="decimal-pad" placeholder="Not set"
                error={!valid(f) ? 'Enter an amount above 0.' : undefined} /></View>
              <View style={s.cell}><Input label="Buyer price" prefix="GH₵" value={text.buyer[g]} onChangeText={(v) => set('buyer', g, v)} keyboardType="decimal-pad" placeholder="Not set"
                error={!valid(b) ? 'Enter an amount above 0.' : undefined} /></View>
            </View>
          </View>
        );
      })}
      {order.map((o) => <Text key={o} style={s.rule}>{o}</Text>)}
      {inverted.length ? <Text style={s.rule}>Farmer price is higher than the buyer price for grade {inverted.join(', ')}. Fix it to save.</Text> : null}
      <Text style={s.hint}>Leave a box empty to remove that price. Grade A must cost more than B, and B more than C.</Text>
    </Sheet>
  );
}

/** One product with farmer and buyer prices side by side for every grade. */
function PriceCard({ product, rows, onEdit }: { product: Product; rows: PriceRow[]; onEdit: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const photo = imageUrl(product.imagePath);
  const find = (kind: PriceKind, grade: Grade) => rows.find((r) => r.kind === kind && r.grade === grade);
  const missing = rows.length < 6;
  return (
    <Card style={s.item}>
      <View style={s.head}>
        {photo ? <Image source={{ uri: photo }} style={s.thumb} accessibilityLabel={product.name} /> : <View style={[s.thumb, s.noThumb]}><Icon name="leaf" size={22} color={colors.inkMuted} /></View>}
        <View style={s.grow}>
          <Text style={s.name} numberOfLines={1}>{product.name}</Text>
          <Text style={s.meta} numberOfLines={1}>{product.category}</Text>
        </View>
        {product.active ? null : <Badge label="Hidden" tone="neutral" />}
        <Button label={missing ? 'Set prices' : 'Edit prices'} size="sm" variant={missing ? 'primary' : 'outline'} onPress={onEdit} />
      </View>
      <View style={s.table}>
        <View style={s.tr}>
          <Text style={[s.th, s.cGrade]}>Grade</Text>
          <Text style={[s.th, s.cPrice]}>Farmer</Text>
          <Text style={[s.th, s.cPrice]}>Buyer</Text>
          <Text style={[s.th, s.cMargin]}>Margin</Text>
        </View>
        {GRADES.map((g) => {
          const f = find('farmer', g);
          const b = find('buyer', g);
          return (
            <View key={g} style={[s.tr, s.trBorder]}>
              <Text style={[s.grade, s.cGrade]}>{g}</Text>
              {[f, b].map((r, i) => {
                const d = change(r);
                return (
                  <View key={i} style={s.cPrice}>
                    <Text style={[s.price, !r && s.unset]}>{r ? ghs(r.price) : '—'}</Text>
                    {d ? <Text style={[s.delta, d.down && s.down]}>{d.text}</Text> : null}
                  </View>
                );
              })}
              <Text style={[s.price, s.cMargin, !(f && b) && s.unset, f && b && b.price <= f.price && s.down]}>{f && b ? `${b.price - f.price >= 0 ? '+' : ''}${ghs(b.price - f.price)}` : '—'}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export function PricesPanel({ categories, onChange, params, setParams, rev }: PageProps & { categories: Category[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const view: View_ = params.view === 'products' || params.view === 'categories' ? params.view : 'prices';
  const category = categories.find((c) => c.id === params.cat);
  const { rows, total, q, text, setText, page, goPage, firstLoad, switching, error } = useServerPage(params, setParams, rev,
    (p, term) => fetchProductsPage(p, term, params.cat ?? ''));
  const [form, setForm] = useState<Product | 'new' | null>(null);
  const [priceFor, setPriceFor] = useState<string | null>(null);
  const target = rows.find((p) => p.id === priceFor);
  const listed = view !== 'categories';
  const empty = !firstLoad && !total && !q && !category;

  return (
    <View style={s.list}>
      <UnderlineTabs value={view} onChange={(k) => setParams(k === 'prices' ? {} : { view: k })} options={[
        { key: 'prices', label: 'Prices' },
        { key: 'products', label: 'Products' },
        { key: 'categories', label: 'Categories', count: categories.length },
      ]} />
      {listed ? (
        <>
          {error ? <Banner text={error} /> : null}
          <View style={s.bar}>
            <View style={s.search}><Input label="Search products" value={text} onChangeText={setText} placeholder="Garden egg" /></View>
            {view === 'products' ? <Button label="Add product" icon="tag" onPress={() => setForm('new')} /> : null}
          </View>
          {categories.length ? (
            <ChoiceChips label="Category" options={['All', ...categories.map((c) => c.name)]} value={category?.name ?? 'All'}
              onChange={(n) => setParams({ ...params, cat: categories.find((c) => c.name === n)?.id ?? '', page: '' })} />
          ) : null}
          {firstLoad || switching ? (view === 'prices' ? <PriceCardsSkeleton /> : <ListRowsSkeleton />) : empty ? (
            <Empty icon="tag" title="No products yet" hint="Add a category and a product first, then set a farmer and a buyer price for each grade." />
          ) : total === 0 ? <Text style={s.meta}>No product matches.</Text> : view === 'prices' ? (
            <View style={s.cards}>{rows.map((p) => <PriceCard key={p.id} product={p} rows={p.prices} onEdit={() => setPriceFor(p.id)} />)}</View>
          ) : <ProductList rows={rows} onChange={onChange} onEdit={setForm} />}
          {firstLoad ? null : <Pager page={page} total={total} onPage={goPage} noun="products" />}
        </>
      ) : <CategoriesSection categories={categories} onChange={onChange} />}
      {form ? <ProductForm categories={categories} product={form === 'new' ? undefined : form} onSaved={onChange} onClose={() => setForm(null)} /> : null}
      {target ? <PriceSheet product={target} rows={target.prices} onSaved={onChange} onClose={() => setPriceFor(null)} /> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 16 },
  bar: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, flexWrap: 'wrap' as const, gap: 12 },
  search: { flexGrow: 1, flexBasis: 220, maxWidth: 420 },
  cards: { gap: 14 },
  item: { gap: 14, padding: 16 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: 12 },
  grow: { flex: 1, flexBasis: 140, gap: 2 },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: c.surfaceSunken },
  noThumb: { alignItems: 'center' as const, justifyContent: 'center' as const },
  name: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  table: { borderRadius: 12, backgroundColor: c.surfaceSunken, paddingHorizontal: 12 },
  tr: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 48 },
  trBorder: { borderTopWidth: 1, borderTopColor: c.borderSubtle },
  th: { fontFamily: fonts.sansSemiBold, fontSize: 12, letterSpacing: 0.3, color: c.inkMuted },
  cGrade: { width: 44 },
  cPrice: { flex: 1, gap: 1 },
  cMargin: { flex: 1, textAlign: 'right' as const },
  grade: { fontFamily: fonts.heading, fontSize: 20, color: c.brandInk },
  price: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums' as const] },
  unset: { fontFamily: fonts.sansRegular, color: c.inkMuted },
  delta: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: c.brandInk },
  down: { color: c.dangerInk },
  gradeBlock: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.surfaceSunken },
  gradeHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, flexWrap: 'wrap' as const, gap: 8 },
  gradeTitle: { fontFamily: fonts.heading, fontSize: 18, color: c.ink },
  margin: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.brandInk },
  marginBad: { color: c.harvestInk },
  pair: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  cell: { flexGrow: 1, flexBasis: 180, minWidth: 0 },
  rule: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.dangerInk },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
});
