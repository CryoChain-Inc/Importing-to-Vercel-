import React from 'react';
import { Text, View } from 'react-native';
import { Card } from '../../../components/common';
import { fetchSupplyPage, type SupplyRow } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { supplyByProduct } from '../data';
import type { PageProps } from '../useOpsLocation';
import { fmtQty } from '../../../utils/format';
import { Empty, Hero, Pager, SectionTitle, usePaged, useServerPage } from './OpsBits';

/** One row per product and unit: quantity farmers have listed. Pages so a long catalogue stays short. */
export function ProductSupply({ supply, page = 5 }: { supply: SupplyRow[]; page?: number }) {
  const s = useThemedStyles(styles);
  const { rows, more } = usePaged(supplyByProduct(supply), 'products', page);
  return (
    <View style={s.gap}>
      <Card style={s.group}>
        {rows.map(({ product, unit, kg: listed, left }, i) => (
          <View key={`${product}|${unit}`} style={[s.prod, i > 0 && s.divider]}>
            <View style={s.top}>
              <Text style={s.name} numberOfLines={1}>{product} · {unit}</Text>
              <Text style={s.left}>{fmtQty(left, unit)} left of {fmtQty(listed, unit)}</Text>
            </View>
          </View>
        ))}
      </Card>
      {more}
    </View>
  );
}

/** Farmers' listings: the stock the shop sells from. */
export function SupplyPanel({ supply, params, setParams, rev }: { supply: SupplyRow[] } & PageProps) {
  const s = useThemedStyles(styles);
  const { rows, total, page, goPage, loading } = useServerPage(params, setParams, rev, fetchSupplyPage);
  if (!supply.length) return <Empty icon="leaf" title="No supply yet" hint="Farmers' listings appear here with their quantities." />;
  return (
    <View style={s.gap}>
      <Hero label="Listed by farmers" value={String(supply.length)} cells={[
        { label: 'Still to sell', value: String(supply.filter((r) => r.remainingKg > 0).length) },
        { label: 'Products', value: String(new Set(supply.map((r) => r.product)).size) },
      ]} />

      <SectionTitle title="By product" />
      <ProductSupply supply={supply} />

      <SectionTitle title="Farmer listings" note={`${supply.length} listings`} />
      <View style={[s.gap, loading && s.busy]}>
      {rows.map((r) => (
        <Card key={r.id} style={s.item}>
          <Text style={s.name} numberOfLines={1}>{r.product} · {fmtQty(r.remainingKg, r.unit)} left of {fmtQty(r.weightKg, r.unit)}</Text>
          <Text style={s.meta}>{[r.farmer, r.locality, r.point].filter(Boolean).join(' · ')}</Text>
          <Text style={s.meta}>Listed {new Date(r.createdAt).toLocaleDateString('en-GH')}</Text>
        </Card>
      ))}
      </View>
      <Pager page={page} total={total} onPage={goPage} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  gap: { gap: 12 },
  busy: { opacity: 0.6 },
  group: { padding: 0, overflow: 'hidden' as const },
  prod: { gap: 2, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: c.borderSubtle },
  item: { gap: 4, padding: 16 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  left: { fontFamily: fonts.sansBold, fontSize: 16, color: c.brandInk, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
