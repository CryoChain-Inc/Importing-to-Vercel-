import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { imageUrl } from '../../../services/catalogueImage';
import { fetchProductsPage, savePrice, type Category, type OpsConfig, type Product } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import type { PageProps } from '../useOpsLocation';
import { CategoriesSection, ProductForm, ProductList } from './CatalogueSections';
import { ListRowsSkeleton, PriceCardsSkeleton } from './CatalogueSkeletons';
import { Empty, Pager, UnderlineTabs, useServerPage } from './OpsBits';
import { Sheet } from './Sheet';
import { useAction } from './useAction';

type View_ = 'prices' | 'products' | 'categories';
const change = (p: Product) => {
  if (!p.price || !p.prevPrice) return null;
  const pct = ((p.price - p.prevPrice) / p.prevPrice) * 100;
  return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, down: pct < 0 };
};

const parse = (t: string) => Number(t.replace(',', '.'));
const validPrice = (n: number) => Number.isFinite(n) && n > 0 && n <= 100000;

// Mirrors private.buyer_price / private.farmer_price in the database, which is what buyers and farmers are actually charged and paid.
const buyerPrice = (base: number, c: OpsConfig) => Math.round(base * (1 + Number(c.buyerMarkupPct || 0) / 100) * 100) / 100;
const farmerPrice = (base: number, c: OpsConfig) => Math.round(base * (1 - Number(c.farmerDiscountPct || 0) / 100) * 100) / 100;

/** A product's base price per unit in one dialog. Buyer and farmer prices are worked out from it and shown as you type. */
function PriceSheet({ product, config, onSaved, onClose }: { product: Product; config: OpsConfig; onSaved: () => Promise<void>; onClose: () => void }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onSaved);
  const [text, setText] = useState(product.price == null ? '' : String(product.price));
  const base = parse(text);
  const ok = validPrice(base);
  const dirty = text.trim() !== '' && base !== product.price;

  return (
    <Sheet title={product.name} subtitle={`Base price per ${product.unit}. Buyers and farmers see prices worked out from it; the previous price is kept to show the change.`} onClose={onClose}
      footer={<>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        <Button label="Save price" loading={busy} disabled={!dirty || !ok}
          onPress={() => run(async () => { await savePrice(product.id, base); onClose(); })} />
      </>}>
      {error ? <Banner text={error} /> : null}
      <Input label={`Base price per ${product.unit}`} prefix="GH₵" value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder="0.00"
        error={text !== '' && !ok ? 'Enter an amount above 0.' : undefined} />
      {ok ? (
        <View style={s.unitBlock}>
          <Text style={s.derived}>Buyers pay {ghs(buyerPrice(base, config))} per {product.unit} (base + {config.buyerMarkupPct || 0}%)</Text>
          <Text style={s.derived}>Farmers are paid {ghs(farmerPrice(base, config))} per {product.unit} (base − {config.farmerDiscountPct || 0}%)</Text>
        </View>
      ) : null}
      <Text style={s.hint}>Change the percentages in Settings. A product with no price is not for sale.</Text>
    </Sheet>
  );
}

/** One product with its unit and its base, buyer and farmer price. */
function PriceCard({ product, config, onEdit }: { product: Product; config: OpsConfig; onEdit: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const photo = imageUrl(product.imagePath);
  const d = change(product);
  const missing = product.price == null;
  return (
    <Card style={s.item}>
      <View style={s.head}>
        {photo ? <Image source={{ uri: photo }} style={s.thumb} accessibilityLabel={product.name} /> : <View style={[s.thumb, s.noThumb]}><Icon name="leaf" size={22} color={colors.inkMuted} /></View>}
        <View style={s.grow}>
          <Text style={s.name} numberOfLines={1}>{product.name}</Text>
          <Text style={s.meta} numberOfLines={1}>{product.category} · per {product.unit}{product.aliases ? ` · ${product.aliases}` : ''}</Text>
        </View>
        {product.active ? null : <Badge label="Hidden" tone="neutral" />}
        <Button label={missing ? 'Set price' : 'Edit price'} size="sm" variant={missing ? 'primary' : 'outline'} onPress={onEdit} />
      </View>
      {missing ? <Text style={s.meta}>Not for sale until it has a price.</Text> : (
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cPrice]}>Base</Text>
            <Text style={[s.th, s.cPrice]}>Buyer</Text>
            <Text style={[s.th, s.cPrice]}>Farmer</Text>
          </View>
          <View style={[s.tr, s.trBorder]}>
            <View style={s.cPrice}>
              <Text style={s.price}>{ghs(product.price!)}</Text>
              {d ? <Text style={[s.delta, d.down && s.down]}>{d.text}</Text> : null}
            </View>
            <Text style={[s.price, s.cPrice]}>{ghs(buyerPrice(product.price!, config))}</Text>
            <Text style={[s.price, s.cPrice]}>{ghs(farmerPrice(product.price!, config))}</Text>
          </View>
        </View>
      )}
    </Card>
  );
}

export function PricesPanel({ categories, config, onChange, params, setParams, rev }: PageProps & { categories: Category[]; config: OpsConfig; onChange: () => Promise<void> }) {
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
            <View style={s.search}><Input label="Search products" value={text} onChangeText={setText} placeholder="Name or local name, e.g. Garden egg" /></View>
            {view === 'products' ? <Button label="Add product" icon="tag" onPress={() => setForm('new')} /> : null}
          </View>
          {categories.length ? (
            <ChoiceChips label="Category" options={['All', ...categories.map((c) => c.name)]} value={category?.name ?? 'All'}
              onChange={(n) => setParams({ ...params, cat: categories.find((c) => c.name === n)?.id ?? '', page: '' })} />
          ) : null}
          {firstLoad || switching ? (view === 'prices' ? <PriceCardsSkeleton /> : <ListRowsSkeleton />) : empty ? (
            <Empty icon="tag" title="No products yet" hint="Add a category and a product first, then set its base price." />
          ) : total === 0 ? <Text style={s.meta}>No product matches.</Text> : view === 'prices' ? (
            <View style={s.cards}>{rows.map((p) => <PriceCard key={p.id} product={p} config={config} onEdit={() => setPriceFor(p.id)} />)}</View>
          ) : <ProductList rows={rows} onChange={onChange} onEdit={setForm} />}
          {firstLoad ? null : <Pager page={page} total={total} onPage={goPage} noun="products" />}
        </>
      ) : <CategoriesSection categories={categories} onChange={onChange} />}
      {form ? <ProductForm categories={categories} product={form === 'new' ? undefined : form} onSaved={onChange} onClose={() => setForm(null)} /> : null}
      {target ? <PriceSheet product={target} config={config} onSaved={onChange} onClose={() => setPriceFor(null)} /> : null}
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
  cUnit: { width: 72 },
  cPrice: { flex: 1, gap: 1 },
  unit: { fontFamily: fonts.sansBold, fontSize: 15, color: c.brandInk },
  price: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums' as const] },
  delta: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: c.brandInk },
  down: { color: c.dangerInk },
  off: { opacity: 0.5 },
  unitBlock: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: c.surfaceSunken },
  derived: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.brandInk },
  rowActions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  common: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  pair: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  cell: { flexGrow: 1, flexBasis: 180, minWidth: 0 },
  rule: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.dangerInk },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
});
