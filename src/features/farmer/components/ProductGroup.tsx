import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Badge, Card, Icon } from '../../../components/common';
import { produceImageUrl, type ProduceListing } from '../../../services/farmer.service';
import { fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';

const kgText = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

export interface Group {
  product: string;
  category?: string;
  listings: ProduceListing[];
}

/** One product with all its grades rolled up. Tapping toggles the per-listing detail rendered by the parent. */
export function ProductGroup({ group: g, open, onToggle }: { group: Group; open: boolean; onToggle: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const sum = (f: (l: ProduceListing) => number) => g.listings.reduce((a, l) => a + f(l), 0);
  const listed = sum((l) => l.weightKg);
  const sold = sum((l) => l.soldKg);
  const left = sum((l) => l.remainingKg);
  // Money already earned on sold kg, plus the estimate for what is still unsold on listings with no sales yet.
  const money = sum((l) => (l.earned > 0 ? l.earned : l.estNet ?? 0));
  const photo = g.listings.find((l) => l.imagePaths[0])?.imagePaths[0];
  const grades = [...new Set(g.listings.map((l) => l.grade))].sort();
  const label = `${g.product}, ${kgText(left)} left of ${kgText(listed)}, ${g.listings.length} ${g.listings.length === 1 ? 'listing' : 'listings'}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={onToggle}>
      <Card style={s.card}>
        <View style={s.top}>
          <View style={s.thumb}>
            {photo ? <Image source={{ uri: produceImageUrl(photo) }} style={s.img} accessibilityIgnoresInvertColors /> : <Icon name="leaf" size={24} color={colors.brandInk} />}
          </View>
          <View style={s.main}>
            <Text style={s.product} numberOfLines={1}>{g.product}</Text>
            <Text style={s.meta} numberOfLines={1}>{g.category ? `${g.category} · ` : ''}{g.listings.length} {g.listings.length === 1 ? 'listing' : 'listings'}</Text>
            <View style={s.grades}>{grades.map((x) => <Badge key={x} label={`Grade ${x}`} tone="success" />)}</View>
          </View>
          <View style={open ? s.chevOpen : undefined}><Icon name="chevronDown" size={22} color={colors.inkMuted} /></View>
        </View>
        <View style={s.bar}><View style={[s.fill, { width: `${listed > 0 ? Math.min(100, (sold / listed) * 100) : 0}%` }]} /></View>
        <View style={s.legend}>
          <Stat label="Left" value={kgText(left)} s={s} strong />
          <Stat label="Sold" value={kgText(sold)} s={s} />
          <Stat label={sold > 0 ? 'Earned' : 'Expected'} value={money > 0 ? `${sold > 0 ? '' : '~'}${ghs(money)}` : '—'} s={s} />
        </View>
      </Card>
    </Pressable>
  );
}

function Stat({ label, value, s, strong }: { label: string; value: string; s: ReturnType<typeof styles>; strong?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={s.meta}>{label}</Text>
      <Text style={[s.statVal, strong && s.statStrong]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 14, minHeight: TOUCH },
  top: { flexDirection: 'row' as const, gap: 14, alignItems: 'center' as const },
  thumb: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  img: { width: 64, height: 64 },
  main: { flex: 1, gap: 3 },
  product: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  grades: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 2 },
  chevOpen: { transform: [{ rotate: '180deg' }] },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' as const, backgroundColor: c.surfaceSunken },
  fill: { position: 'absolute' as const, top: 0, bottom: 0, left: 0, backgroundColor: c.brand500 },
  legend: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8 },
  stat: { gap: 2, flexShrink: 1 },
  statVal: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  statStrong: { fontFamily: fonts.sansBold },
});
