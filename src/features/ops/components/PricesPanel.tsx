import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { deletePrice, setPrice, type Category, type PriceRow, type Product } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { CategoriesSection, ProductsSection } from './CatalogueSections';
import { useAction } from './useAction';

const GRADES = ['A', 'B', 'C'];
const VIEWS = ['Prices', 'Products', 'Categories'];

export function PricesPanel({ categories, products, prices, onChange }: {
  categories: Category[];
  products: Product[];
  prices: PriceRow[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [view, setView] = useState('Prices');
  const [categoryName, setCategoryName] = useState('');
  const [productName, setProductName] = useState('');
  const [grade, setGrade] = useState('A');
  const [price, setPriceText] = useState('');

  const live = products.filter((p) => p.active);
  const categoryNames = [...new Set(live.map((p) => p.category))].sort();
  const category = categoryNames.includes(categoryName) ? categoryName : categoryNames[0];
  const inCategory = live.filter((p) => p.category === category);
  const product = inCategory.find((p) => p.name === productName) ?? inCategory[0];
  const amount = Number(price);
  const editing = product ? prices.find((r) => r.productId === product.id && r.grade === grade) : undefined;

  const edit = (p: Product, r: PriceRow) => {
    setCategoryName(p.category);
    setProductName(p.name);
    setGrade(r.grade);
    setPriceText(String(r.price));
  };

  return (
    <View style={s.list}>
      <ChoiceChips label="Manage" options={VIEWS} value={view} onChange={setView} />
      {view === 'Categories' ? <CategoriesSection categories={categories} onChange={onChange} /> : null}
      {view === 'Products' ? <ProductsSection categories={categories} products={products} onChange={onChange} /> : null}
      {view === 'Prices' ? (
        <>
          {error ? <Banner text={error} /> : null}
          <Card style={s.form}>
            <Text style={s.title}>{editing ? 'Edit price' : 'Set price'}</Text>
            <Text style={s.meta}>Grade A is shown on the public landing page. The previous price is kept to show the change.</Text>
            {product ? (
              <>
                <ChoiceChips label="Category" options={categoryNames} value={category} onChange={setCategoryName} />
                <ChoiceChips label="Product" options={inCategory.map((p) => p.name)} value={product.name} onChange={setProductName} />
                <ChoiceChips label="Grade" options={GRADES} value={grade} onChange={setGrade} />
                <Input label="Price per kg (GH₵)" value={price} onChangeText={setPriceText} keyboardType="decimal-pad" placeholder={editing ? String(editing.price) : '8.50'} />
                <Button label={editing ? 'Update price' : 'Save price'} loading={busy} disabled={!(amount > 0)}
                  onPress={() => run(async () => { await setPrice(product.id, grade, amount); setPriceText(''); })} />
              </>
            ) : <Text style={s.meta}>Add a category and a product first.</Text>}
          </Card>

          {products.map((p) => {
            const rows = prices.filter((r) => r.productId === p.id).sort((a, b) => a.grade.localeCompare(b.grade));
            return (
              <Card key={p.id} style={s.item}>
                <Text style={s.name}>{p.name} <Text style={s.meta}>· {p.category}{p.active ? '' : ' · hidden'}</Text></Text>
                {rows.length ? rows.map((r) => (
                  <View key={r.grade} style={s.top}>
                    <Text style={s.meta}>Grade {r.grade}</Text>
                    <Text style={s.value}>
                      {ghs(r.price)}{r.prevPrice ? `  (${r.price >= r.prevPrice ? '+' : ''}${(((r.price - r.prevPrice) / r.prevPrice) * 100).toFixed(1)}%)` : ''}
                    </Text>
                    <Button label="Edit" size="sm" variant="outline" onPress={() => edit(p, r)} />
                    <Button label="Remove" size="sm" variant="danger" loading={busy} onPress={() => run(() => deletePrice(p.id, r.grade))} />
                  </View>
                )) : <Text style={s.meta}>No prices set.</Text>}
              </Card>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  item: { gap: 6 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  value: { flex: 1, textAlign: 'right' as const, fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
