import React from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/common';
import { Skeleton } from '../../../components/feedback';
import { useThemedStyles, type ColorToken } from '../../../theme';

/** Placeholder for the product/category list: a bordered table of photo + two lines + switch + button. */
export function ListRowsSkeleton({ rows = 6 }: { rows?: number }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.table} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={s.row}>
          <Skeleton width={56} height={56} radius={14} />
          <View style={s.lines}>
            <Skeleton width={i % 2 ? '38%' : '52%'} height={15} />
            <Skeleton width="24%" height={12} />
          </View>
          <Skeleton width={96} height={28} radius={14} />
          <Skeleton width={56} height={36} radius={12} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder shaped like a price card: product header, then the grade table. */
export function PriceCardsSkeleton({ cards = 3 }: { cards?: number }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.cards} accessibilityLabel="Loading">
      {Array.from({ length: cards }, (_, i) => (
        <Card key={i} style={s.card}>
          <View style={s.head}>
            <Skeleton width={56} height={56} radius={14} />
            <View style={s.lines}>
              <Skeleton width="45%" height={17} />
              <Skeleton width="22%" height={12} />
            </View>
            <Skeleton width={96} height={36} radius={12} />
          </View>
          <View style={s.grid}>
            {[0, 1, 2].map((r) => (
              <View key={r} style={s.gridRow}>
                <Skeleton width={28} height={20} />
                <Skeleton width="26%" height={15} />
                <Skeleton width="26%" height={15} />
                <Skeleton width="18%" height={15} />
              </View>
            ))}
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  table: { borderRadius: 16, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.borderSubtle, overflow: 'hidden' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  lines: { flex: 1, gap: 8 },
  cards: { gap: 14 },
  card: { gap: 14, padding: 16 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grid: { borderRadius: 12, backgroundColor: c.surfaceSunken, paddingHorizontal: 12 },
  gridRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10, height: 48 },
});
