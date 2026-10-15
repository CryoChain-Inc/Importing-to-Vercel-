import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { addProduct, setPrice, type PriceRow, type Product } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from './useAction';

const GRADES = ['A', 'B', 'C'];

export function PricesPanel({ products, prices, onChange }: { products: Product[]; prices: PriceRow[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [productName, setProductName] = useState('');
  const [grade, setGrade] = useState('A');
  const [price, setPriceText] = useState('');
  const [window, setWindow] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const product = products.find((p) => p.name === productName) ?? products[0];
  const amount = Number(price);

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>Update price</Text>
        <Text style={s.meta}>Grade A is shown on the public landing page. The previous price is kept to show the change.</Text>
        {product ? (
          <>
            <ChoiceChips label="Product" options={products.map((p) => p.name)} value={product.name} onChange={setProductName} />
            <ChoiceChips label="Grade" options={GRADES} value={grade} onChange={setGrade} />
            <Input label="Price per kg (GH₵)" value={price} onChangeText={setPriceText} keyboardType="decimal-pad" placeholder="8.50" />
            <Input label="Collection window label" value={window} onChangeText={setWindow} placeholder="Mon–Wed collection" />
            <Button label="Save price" loading={busy} disabled={!(amount > 0)}
              onPress={() => run(async () => { await setPrice(product.id, grade, amount, window); setPriceText(''); })} />
          </>
        ) : <Text style={s.meta}>Add a product first.</Text>}
      </Card>

      {products.map((p) => {
        const rows = prices.filter((r) => r.productId === p.id).sort((a, b) => a.grade.localeCompare(b.grade));
        return (
          <Card key={p.id} style={s.item}>
            <Text style={s.name}>{p.name} <Text style={s.meta}>· {p.category}</Text></Text>
            {rows.length ? rows.map((r) => (
              <View key={r.grade} style={s.top}>
                <Text style={s.meta}>Grade {r.grade}{r.window ? ` · ${r.window}` : ''}</Text>
                <Text style={s.value}>
                  {ghs(r.price)}{r.prevPrice ? `  (${r.price >= r.prevPrice ? '+' : ''}${(((r.price - r.prevPrice) / r.prevPrice) * 100).toFixed(1)}%)` : ''}
                </Text>
              </View>
            )) : <Text style={s.meta}>No prices set.</Text>}
          </Card>
        );
      })}

      <Card style={s.form}>
        <Text style={s.title}>Add product</Text>
        <Input label="Name" value={newName} onChangeText={setNewName} placeholder="Garden egg" />
        <Input label="Category" value={newCategory} onChangeText={setNewCategory} placeholder="Vegetables" />
        <Button label="Add product" variant="tonal" loading={busy} disabled={newName.trim().length < 2 || newCategory.trim().length < 2}
          onPress={() => run(async () => { await addProduct(newName, newCategory); setNewName(''); })} />
      </Card>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  item: { gap: 4 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  value: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
