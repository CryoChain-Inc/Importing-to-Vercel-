import React from 'react';
import { Text, View } from 'react-native';
import { Card } from '../../../components/common';
import type { SupplyRow } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Listed (estimated) supply: totals per product, then each farmer's listing. */
export function SupplyPanel({ supply }: { supply: SupplyRow[] }) {
  const s = useThemedStyles(styles);
  if (!supply.length) return <Card><Text style={s.meta}>No produce listed yet.</Text></Card>;
  const totals = new Map<string, number>();
  supply.forEach((r) => totals.set(r.product, (totals.get(r.product) ?? 0) + r.weightKg));
  return (
    <View style={s.list}>
      <Card style={s.item}>
        <Text style={s.name}>Estimated supply</Text>
        {[...totals].map(([product, w]) => (
          <View key={product} style={s.top}>
            <Text style={s.meta}>{product}</Text>
            <Text style={s.value}>{kg(w)}</Text>
          </View>
        ))}
      </Card>
      {supply.map((r) => (
        <Card key={r.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{r.product}</Text>
            <Text style={s.value}>{kg(r.weightKg)}</Text>
          </View>
          <Text style={s.meta}>{[r.farmer, r.locality, r.point].filter(Boolean).join(' · ')}</Text>
          <Text style={s.meta}>Listed {new Date(r.createdAt).toLocaleDateString('en-GH')}</Text>
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 4 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  value: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
