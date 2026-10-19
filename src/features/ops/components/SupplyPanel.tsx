import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Card } from '../../../components/common';
import { isSold, type SupplyRow } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { supplySplit } from '../data';
import { Empty, Hero, kg, Segmented, SectionTitle, usePaged } from './OpsBits';

const status = (r: SupplyRow) => (!r.lotId ? 'Available' : isSold(r) ? 'Sold' : 'In open lot');
type Filter = 'all' | 'Available' | 'In open lot' | 'Sold';

/** One row per product: kilos left to sell, with sold and in-lot figures beneath. Pages so a long catalogue stays short. */
export function ProductSupply({ supply, page = 5 }: { supply: SupplyRow[]; page?: number }) {
  const s = useThemedStyles(styles);
  const products = [...new Set(supply.map((r) => r.product))]
    .map((p) => ({ p, sp: supplySplit(supply.filter((r) => r.product === p), isSold) }))
    .sort((a, b) => b.sp.left - a.sp.left);
  const { rows, more } = usePaged(products, 'products', page);
  return (
    <View style={s.gap}>
      <Card style={s.group}>
        {rows.map(({ p, sp }, i) => (
          <View key={p} style={[s.prod, i > 0 && s.divider]}>
            <View style={s.top}>
              <Text style={s.name} numberOfLines={1}>{p}</Text>
              <Text style={s.left}>{kg(sp.left)} <Text style={s.leftNote}>left</Text></Text>
            </View>
            <Text style={s.meta}>Sold {kg(sp.sold)} · in unpaid lots {kg(sp.reserved)} · estimated {kg(sp.total)}</Text>
          </View>
        ))}
      </Card>
      {more}
    </View>
  );
}

/** Estimated supply less what buyers have paid for, with the farmers' listings behind a filter. */
export function SupplyPanel({ supply }: { supply: SupplyRow[] }) {
  const s = useThemedStyles(styles);
  const [filter, setFilter] = useState<Filter>('all');
  const total = supplySplit(supply, isSold);
  const filtered = supply.filter((r) => filter === 'all' || status(r) === filter);
  const { rows, more } = usePaged(filtered, filter, 6);
  const n = (f: Filter) => supply.filter((r) => status(r) === f).length;

  if (!supply.length) return <Empty icon="leaf" title="No supply yet" hint="Farmers' listings appear here with their estimated kilos. When a buyer pays for a lot, its estimated kilos move from left to sold." />;
  return (
    <View style={s.gap}>
      <Hero label="Left to sell" value={kg(total.left)} cells={[
        { label: 'Estimated', value: kg(total.total) },
        { label: 'Sold (paid)', value: kg(total.sold) },
        { label: 'In unpaid lots', value: kg(total.reserved) },
      ]} />

      <SectionTitle title="By product" note="Estimated kilos listed by farmers, less lots a buyer has paid for." />
      <ProductSupply supply={supply} />

      <SectionTitle title="Farmer listings" note={`${filtered.length} of ${supply.length}`} />
      <Segmented value={filter} onChange={setFilter} options={[
        { key: 'all', label: 'All', count: supply.length },
        { key: 'Available', label: 'Free', count: n('Available') },
        { key: 'In open lot', label: 'In lot', count: n('In open lot') },
        { key: 'Sold', label: 'Sold', count: n('Sold') },
      ]} />
      {filtered.length === 0 ? <Text style={s.meta}>Nothing matches this filter.</Text> : null}
      {rows.map((r) => {
        const st = status(r);
        return (
          <Card key={r.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name} numberOfLines={1}>{r.product} · {kg(r.weightKg)}</Text>
              <Badge label={st} tone={st === 'Available' ? 'success' : st === 'Sold' ? 'neutral' : 'warning'} />
            </View>
            <Text style={s.meta}>{[r.farmer, r.locality, r.point].filter(Boolean).join(' · ')}</Text>
            <Text style={s.meta}>Listed {new Date(r.createdAt).toLocaleDateString('en-GH')}</Text>
          </Card>
        );
      })}
      {more}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  gap: { gap: 12 },
  group: { padding: 0, overflow: 'hidden' as const },
  prod: { gap: 2, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: c.borderSubtle },
  item: { gap: 4, padding: 16 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  left: { fontFamily: fonts.sansBold, fontSize: 16, color: c.brandInk, fontVariant: ['tabular-nums' as const] },
  leftNote: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
