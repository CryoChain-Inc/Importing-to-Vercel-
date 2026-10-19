import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Badge, Icon } from '../../../components/common';
import { Skeleton } from '../../../components/feedback';
import { fetchPrices, type PriceBoardData } from '../../../services/prices.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import type { CropPrice } from '../../../types/auth';
import { ghs } from '../../../utils/format';

function Delta({ pct }: { pct: number }) {
  const s = useThemedStyles(styles);
  if (pct === 0) return <Text style={s.flat}>No change</Text>;
  // Arrow and sign: direction never relies on colour alone.
  const up = pct > 0;
  return (
    <Text style={[s.delta, up ? s.up : s.down]}>
      {up ? '↗ +' : '↘ '}
      {pct.toFixed(1)}%
    </Text>
  );
}

function Row({ p, first }: { p: CropPrice; first: boolean }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <View style={[s.row, !first && s.rowBorder]}>
      <View style={s.leaf}>
        {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={s.photo} accessibilityLabel={p.crop} /> : <Icon name="leaf" size={18} color={colors.brandInk} />}
      </View>
      <View style={s.name}>
        <View style={s.cropRow}>
          <Text style={s.crop}>{p.crop}</Text>
          <Badge label={`Grade ${p.grade}`} tone={p.grade === 'A' ? 'success' : p.grade === 'B' ? 'warning' : 'neutral'} />
        </View>
        <Text style={s.window}>{p.category}</Text>
      </View>
      <View style={s.price}>
        <Text style={s.amount}>
          {ghs(p.price)}
          <Text style={s.unit}> /{p.unit}</Text>
        </Text>
        <Delta pct={p.changePct} />
      </View>
    </View>
  );
}

/** Public daily farmer prices, safe to show before sign-in. Buyer prices live elsewhere. */
export function PriceBoard({ gradeAOnly = false, compact = false }: { gradeAOnly?: boolean; compact?: boolean }) {
  const s = useThemedStyles(styles);
  const [data, setData] = useState<PriceBoardData | null>(null);
  useEffect(() => {
    fetchPrices(gradeAOnly).then(setData, () => setData({ prices: [], updatedAt: null }));
  }, [gradeAOnly]);
  if (!data) return compact ? <View style={s.strip}><Skeleton width={140} height={20} /><View style={s.chips}><Skeleton width={148} height={84} radius={16} /><Skeleton width={148} height={84} radius={16} /></View></View> : <Skeleton height={220} radius={20} />;
  if (compact) {
    return (
      <View style={s.strip} accessibilityLabel="Today's crop prices for farmers">
        <View style={s.stripHead}>
          <Text style={s.stripTitle}>Today&apos;s prices</Text>
          <Text style={s.window}>{data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' })}` : 'Prices coming soon'}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {data.prices.map((p) => (
            <View key={p.id} style={s.chip}>
              <Text style={s.chipCrop} numberOfLines={1}>{p.crop} · {p.grade}</Text>
              <Text style={s.amount}>{ghs(p.price)}<Text style={s.unit}> /{p.unit}</Text></Text>
              <Delta pct={p.changePct} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={s.board} accessibilityLabel="Today's crop prices for farmers">
      <View style={s.head}>
        <View>
          <Text style={s.title}>Today&apos;s prices</Text>
          <Text style={s.window}>{data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short' })}` : 'Prices coming soon'}</Text>
        </View>
        <Badge label="Farmers" tone="info" />
      </View>
      {data.prices.map((p, i) => (
        <Row key={p.id} p={p} first={i === 0} />
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  board: {
    backgroundColor: c.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    shadowColor: '#0a3d24',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  strip: { gap: 10 },
  stripHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const },
  stripTitle: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  chips: { flexDirection: 'row' as const, gap: 10, paddingRight: 4 },
  chip: { minWidth: 148, gap: 2, padding: 14, borderRadius: 16, backgroundColor: c.brandTint },
  chipCrop: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.brandInk },
  head: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingBottom: 10 },
  title: { fontFamily: fonts.sansBold, fontSize: 20, color: c.ink },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.borderSubtle },
  leaf: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brandTint, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  photo: { width: 36, height: 36 },
  name: { flex: 1, gap: 2 },
  cropRow: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: 6 },
  crop: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  window: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
  price: { alignItems: 'flex-end' as const, minWidth: 80 },
  amount: { fontVariant: ['tabular-nums' as const], fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  unit: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  delta: { fontFamily: fonts.sansBold, fontSize: 12 },
  up: { color: c.brandInk },
  down: { color: c.dangerInk },
  flat: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
});
