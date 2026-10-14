import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { createPoint, setPointActive, type PointRow, type Product } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { DAY_NAMES, windowLabel } from '../../../utils/format';
import { MultiChips } from './MultiChips';
import { useAction } from './useAction';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = DAY_NAMES.map((label, key) => ({ key, label }));

export function PointsPanel({ points, products, onChange }: { points: PointRow[]; products: Product[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [name, setName] = useState('');
  const [locality, setLocality] = useState('');
  const [address, setAddress] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3]);
  const [start, setStart] = useState('06:00');
  const [end, setEnd] = useState('10:00');
  const [productIds, setProductIds] = useState<string[]>([]);

  const valid = name.trim().length >= 2 && days.length > 0 && TIME.test(start) && TIME.test(end) && end > start && productIds.length > 0;
  const byId = new Map(products.map((p) => [p.id, p]));

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>New collection point</Text>
        <Input label="Name" value={name} onChangeText={setName} placeholder="Techiman Market Hub" />
        <Input label="Locality" value={locality} onChangeText={setLocality} />
        <Input label="Address" value={address} onChangeText={setAddress} />
        <MultiChips label="Collection days" options={DAYS} value={days} onChange={setDays} />
        <Input label="Opens (24h)" value={start} onChangeText={setStart} placeholder="06:00" />
        <Input label="Closes (24h)" value={end} onChangeText={setEnd} placeholder="10:00" error={TIME.test(start) && TIME.test(end) && end <= start ? 'Must be after opening time' : undefined} />
        <MultiChips label="Products accepted (grouped by category in the list below)" options={products.filter((p) => p.active).map((p) => ({ key: p.id, label: `${p.name} · ${p.category}` }))} value={productIds} onChange={setProductIds} />
        <Button label="Create collection point" loading={busy} disabled={!valid}
          onPress={() => run(async () => {
            await createPoint({ name, locality, address, days, start, end, productIds });
            setName(''); setLocality(''); setAddress(''); setProductIds([]);
          })} />
      </Card>

      {points.map((p) => (
        <Card key={p.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{p.name}</Text>
            <Badge label={p.active ? 'Active' : 'Inactive'} tone={p.active ? 'success' : 'neutral'} />
          </View>
          <Text style={s.meta}>{[p.locality, p.address].filter(Boolean).join(' · ')}</Text>
          <Text style={s.meta}>{windowLabel(p.days, p.start, p.end)}</Text>
          <Text style={s.meta}>{p.productIds.map((id) => byId.get(id)).filter(Boolean).map((x) => `${x!.name} (${x!.category})`).join(', ') || 'No products'}</Text>
          <Button size="sm" variant="outline" label={p.active ? 'Deactivate' : 'Activate'} onPress={() => run(() => setPointActive(p.id, !p.active))} />
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
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
