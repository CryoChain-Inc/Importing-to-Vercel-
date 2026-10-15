import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { closeRequirement, createRequirement, type Period, type Requirement } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';

const PERIODS: Period[] = ['once', 'daily', 'weekly'];
const TONE = { open: 'warning', matched: 'success', closed: 'neutral' } as const;

/** Post demand when no lot fits; ops builds a lot against it and the requirement shows as matched. */
export function Requirements({ requirements, products, location, onRefresh }: {
  requirements: Requirement[];
  products: string[];
  location: string;
  onRefresh: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onRefresh);
  const [product, setProduct] = useState('');
  const [grade, setGrade] = useState<'A' | 'B'>('A');
  const [qty, setQty] = useState('');
  const [period, setPeriod] = useState<Period>('once');
  const [price, setPrice] = useState('');
  const [dest, setDest] = useState(location);

  const chosen = product || products[0] || '';
  const q = Number(qty);
  const p = Number(price);
  const valid = Boolean(chosen) && q > 0 && q <= 30000 && p > 0 && dest.trim().length >= 2;

  return (
    <View style={s.list}>
      <Card style={s.form}>
        <Text style={s.title}>Request a lot</Text>
        <Text style={s.meta}>Can’t find what you need today? Tell us and our team will assemble a lot.</Text>
        {error ? <Banner text={error} /> : null}
        <ChoiceChips label="Product" options={products} value={chosen} onChange={setProduct} />
        <ChoiceChips label="Grade" options={['A', 'B']} value={grade} onChange={(g) => setGrade(g as 'A' | 'B')} />
        <Input label="Quantity (kg)" value={qty} onChangeText={setQty} keyboardType="decimal-pad" hint="Up to 30,000 kg per request. A truck carries 3,000 kg." />
        <ChoiceChips label="How often" options={PERIODS} value={period} onChange={(v) => setPeriod(v as Period)} />
        <Input label="Highest price per kg (GH₵)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <Input label="Delivery location" value={dest} onChangeText={setDest} />
        <Button label="Post requirement" loading={busy} disabled={!valid}
          onPress={() => run(async () => {
            await createRequirement({ product: chosen, grade, quantityKg: q, period, maxPricePerKg: p, destination: dest });
            setQty('');
            setPrice('');
          })} />
      </Card>

      {requirements.map((r) => (
        <Card key={r.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{r.product} · Grade {r.grade}</Text>
            <Badge label={r.state} tone={TONE[r.state]} />
          </View>
          <Text style={s.meta}>{r.quantityKg.toLocaleString('en-GH')} kg {r.period} · up to {ghs(r.maxPricePerKg)}/kg · {r.destination}</Text>
          {r.state === 'open' ? <Button size="sm" variant="outline" label="Close" onPress={() => run(() => closeRequirement(r.id))} /> : null}
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  item: { gap: 6, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
