import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  cancelLot, createLot, LOT_MAX_KG, LOT_MIN_KG, STOP_MIN_VALUE_GHS,
  type LotRow, type PriceRow, type Product, type SupplyRow,
} from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { MultiChips } from './MultiChips';
import { useAction } from './useAction';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Build a lot from unallocated listings of one product; list and cancel existing lots. */
export function LotsPanel({ supply, lots, products, prices, onChange }: {
  supply: SupplyRow[];
  lots: LotRow[];
  products: Product[];
  prices: PriceRow[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [picked, setPicked] = useState<string[]>([]);
  const [productName, setProductName] = useState('');

  const pool = supply.filter((r) => !r.lotId);
  const names = [...new Set(pool.map((r) => r.product))].sort();
  const product = names.includes(productName) ? productName : names[0];
  const candidates = pool.filter((r) => r.product === product);
  const selected = candidates.filter((r) => picked.includes(r.id));

  const total = selected.reduce((a, r) => a + r.weightKg, 0);
  // Listings carry no grade yet, so stop value is estimated at the Grade A price.
  const productId = products.find((p) => p.name === product)?.id;
  const priceA = prices.find((r) => r.productId === productId && r.grade === 'A')?.price;
  const stops = new Map<string, { name: string; kg: number }>();
  selected.forEach((r) => {
    const k = r.pointId ?? 'none';
    stops.set(k, { name: r.point, kg: (stops.get(k)?.kg ?? 0) + r.weightKg });
  });

  const over = total > LOT_MAX_KG;
  const warnings = [
    total > 0 && total < LOT_MIN_KG ? `Under ${kg(LOT_MIN_KG)}: the truck won't be full.` : null,
    ...[...stops.values()].map((st) =>
      priceA && st.kg * priceA < STOP_MIN_VALUE_GHS ? `${st.name}: ${ghs(st.kg * priceA)} is under the ${ghs(STOP_MIN_VALUE_GHS)} stop minimum.` : null,
    ),
    selected.length > 0 && !priceA ? 'No Grade A price set, so stop value can\'t be checked.' : null,
  ].filter(Boolean) as string[];

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>Create lot</Text>
        <Text style={s.meta}>One product per lot, up to {kg(LOT_MAX_KG)} (one truck). Aim for {kg(LOT_MIN_KG)}+ across 2–3 stops.</Text>
        {names.length ? (
          <>
            <ChoiceChips label="Product" options={names} value={product} onChange={(n) => { setProductName(n); setPicked([]); }} />
            <MultiChips label="Available listings" value={picked} onChange={setPicked}
              options={candidates.map((r) => ({ key: r.id, label: `${r.farmer} · ${r.point} · ${kg(r.weightKg)}` }))} />
            <Text style={[s.value, over && s.bad]}>{kg(total)} / {kg(LOT_MAX_KG)} · {selected.length} listing{selected.length === 1 ? '' : 's'}</Text>
            {over ? <Text style={s.bad}>Over the vehicle capacity. Remove some listings.</Text> : null}
            {warnings.map((w) => <Text key={w} style={s.meta}>⚠ {w}</Text>)}
            <Button label="Create lot" loading={busy} disabled={!selected.length || over}
              onPress={() => run(async () => { await createLot(selected.map((r) => r.id)); setPicked([]); })} />
          </>
        ) : <Text style={s.meta}>No unallocated supply. Listings appear here once farmers list produce.</Text>}
      </Card>

      {lots.map((l) => (
        <Card key={l.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{l.code} · {l.product}</Text>
            <Badge label={l.state.replace('_', ' ')} tone={l.state === 'cancelled' ? 'neutral' : 'success'} />
          </View>
          <Text style={s.meta}>{kg(l.totalKg)} · {l.listings} listing{l.listings === 1 ? '' : 's'} · {new Date(l.createdAt).toLocaleDateString('en-GH')}</Text>
          {l.state === 'listed' ? <Button size="sm" variant="outline" label="Cancel lot" onPress={() => run(() => cancelLot(l.id))} /> : null}
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
  value: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  bad: { fontFamily: fonts.sansBold, fontSize: 13, color: c.dangerInk },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
