import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { imageUrl } from '../../../services/catalogueImage';
import { deletePrice, setPrice, type Category, type PriceKind, type PriceRow, type Product } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { CategoriesSection, ProductsSection } from './CatalogueSections';
import { Empty, Segmented, usePaged } from './OpsBits';
import { useAction } from './useAction';

const GRADES = ['A', 'B', 'C'];
const KINDS: { key: PriceKind; label: string }[] = [{ key: 'farmer', label: 'Farmer price' }, { key: 'buyer', label: 'Buyer price' }];
type View_ = 'prices' | 'products' | 'categories';

const change = (r: PriceRow) => {
  if (!r.prevPrice) return null;
  const pct = ((r.price - r.prevPrice) / r.prevPrice) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
};

/** One grade row: shows the price, or turns into an inline editor. */
function GradeRow({ kind, product, grade, row, editing, onEdit, onDone, onSaved }: {
  kind: PriceKind; product: Product; grade: string; row?: PriceRow; editing: boolean;
  onEdit: () => void; onDone: () => void; onSaved: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onSaved);
  const [text, setText] = useState(row ? String(row.price) : '');
  const amount = Number(text);
  const delta = row ? change(row) : null;
  if (!editing) {
    return (
      <View style={s.grade}>
        <Text style={s.gradeName}>Grade {grade}</Text>
        <View style={s.gradeVal}>
          <Text style={[s.price, !row && s.unset]}>{row ? ghs(row.price) : 'Not set'}</Text>
          {delta ? <Text style={[s.delta, row!.price < row!.prevPrice! && s.down]}>{delta}</Text> : null}
        </View>
        <Button size="sm" variant={row ? 'outline' : 'tonal'} label={row ? 'Edit' : 'Set'} onPress={onEdit} />
      </View>
    );
  }
  return (
    <View style={s.editor}>
      <Text style={s.gradeName}>Grade {grade} · price per kg</Text>
      {error ? <Banner text={error} /> : null}
      <Input label="GH₵ per kg" value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder="8.50" autoFocus />
      <Text style={s.meta}>{kind === 'farmer' ? `${grade === 'A' ? 'Grade A is shown on the public landing page. ' : ''}The previous price is kept to show the change.` : 'Buyers see this price. The previous price is kept to show the change.'}</Text>
      <View style={s.actions}>
        <Button size="sm" label="Save price" loading={busy} disabled={!(amount > 0)} onPress={() => run(async () => { await setPrice(kind, product.id, grade, amount); onDone(); })} />
        {row ? <Button size="sm" variant="danger" label="Remove" disabled={busy} onPress={() => run(async () => { await deletePrice(kind, product.id, grade); onDone(); })} /> : null}
        <Button size="sm" variant="ghost" label="Cancel" onPress={onDone} />
      </View>
    </View>
  );
}

export function PricesPanel({ categories, products, prices, onChange }: {
  categories: Category[];
  products: Product[];
  prices: PriceRow[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [view, setView] = useState<View_>('prices');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [kind, setKind] = useState<PriceKind>('farmer');
  const [edit, setEdit] = useState<{ id: string; grade: string } | null>(null);
  const ofKind = prices.filter((r) => r.kind === kind);
  const needle = q.trim().toLowerCase();
  const filtered = products.filter((p) => (category === 'All' || p.category === category) && (!needle || p.name.toLowerCase().includes(needle)));
  const { rows, more } = usePaged(filtered, `${category}|${needle}`, 5);

  return (
    <View style={s.list}>
      <Segmented value={view} onChange={setView} options={[
        { key: 'prices', label: 'Prices', count: prices.length },
        { key: 'products', label: 'Products', count: products.length },
        { key: 'categories', label: 'Categories', count: categories.length },
      ]} />
      {view === 'categories' ? <CategoriesSection categories={categories} onChange={onChange} /> : null}
      {view === 'products' ? <ProductsSection categories={categories} products={products} onChange={onChange} /> : null}
      {view === 'prices' ? (
        products.length === 0 ? <Empty icon="tag" title="No products yet" hint="Add a category and a product first, then set a farmer and a buyer price for each grade." /> : (
          <>
            <Segmented value={kind} onChange={(k) => { setKind(k); setEdit(null); }} options={KINDS} />
            <Input label="Search products" value={q} onChangeText={setQ} placeholder="Garden egg" />
            <ChoiceChips label="Category" options={['All', ...categories.map((c) => c.name)]} value={category} onChange={setCategory} />
            {filtered.length === 0 ? <Text style={s.meta}>No product matches.</Text> : null}
            {rows.map((p) => {
              const photo = imageUrl(p.imagePath);
              return (
                <Card key={p.id} style={s.item}>
                  <View style={s.head}>
                    {photo ? <Image source={{ uri: photo }} style={s.thumb} accessibilityLabel={p.name} /> : <View style={[s.thumb, s.noThumb]}><Icon name="leaf" size={20} color={colors.inkMuted} /></View>}
                    <View style={s.grow}>
                      <Text style={s.name} numberOfLines={1}>{p.name}</Text>
                      <Text style={s.meta}>{p.category}</Text>
                    </View>
                    {p.active ? null : <Badge label="Hidden" tone="neutral" />}
                  </View>
                  <View style={s.grades}>
                    {GRADES.map((g) => (
                      <GradeRow key={`${kind}${p.id}${g}${ofKind.find((r) => r.productId === p.id && r.grade === g)?.price}`} kind={kind} product={p} grade={g}
                        row={ofKind.find((r) => r.productId === p.id && r.grade === g)}
                        editing={edit?.id === p.id && edit.grade === g}
                        onEdit={() => setEdit({ id: p.id, grade: g })} onDone={() => setEdit(null)} onSaved={onChange} />
                    ))}
                  </View>
                </Card>
              );
            })}
            {more}
          </>
        )
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 12, padding: 16 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1, gap: 2 },
  thumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: c.surfaceSunken },
  noThumb: { alignItems: 'center' as const, justifyContent: 'center' as const },
  grades: { borderRadius: 14, backgroundColor: c.surfaceSunken, overflow: 'hidden' as const },
  grade: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 6 },
  gradeName: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted, width: 64 },
  gradeVal: { flex: 1, flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  price: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, fontVariant: ['tabular-nums' as const] },
  unset: { fontFamily: fonts.sansRegular, color: c.inkMuted },
  delta: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.brandInk },
  down: { color: c.dangerInk },
  editor: { gap: 10, padding: 14, backgroundColor: c.brandTint },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
