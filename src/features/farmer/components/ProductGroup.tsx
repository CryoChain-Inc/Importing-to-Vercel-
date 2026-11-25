import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Badge, Card, Icon } from '../../../components/common';
import { produceImageUrl, type ProduceListing } from '../../../services/farmer.service';
import { fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { inStock, qtyByUnit, soldShare } from './qty';

export interface Group {
  product: string;
  category?: string;
  listings: ProduceListing[];
}

/** One crop with all its batches rolled up. Tapping opens the crop's detail page. */
export function ProductGroup({ group: g, onOpen }: { group: Group; onOpen: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const live = g.listings.filter(inStock);
  const out = live.length === 0;
  const sold = soldShare(g.listings);
  // Money already earned on sold quantity, plus the estimate for batches with no sales yet.
  const money = g.listings.reduce((a, l) => a + (l.earned > 0 ? l.earned : (l.estNet ?? 0)), 0);
  const photo = g.listings.find((l) => l.imagePaths[0])?.imagePaths[0];
  const n = g.listings.length;
  const batches = `${n} ${n === 1 ? 'batch' : 'batches'}`;
  const headline = out
    ? qtyByUnit(g.listings, (l) => l.soldKg)
    : qtyByUnit(live, (l) => l.remainingKg);
  const label = `${g.product}, ${out ? 'sold out' : `${headline} in stock`}, ${qtyByUnit(g.listings, (l) => l.soldKg)} sold, ${batches}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onOpen}>
      <Card style={s.card}>
        <View style={s.top}>
          <View style={s.thumb}>
            {photo ? (
              <Image
                source={{ uri: produceImageUrl(photo, 200) }}
                style={s.img}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Icon name="leaf" size={26} color={colors.brandInk} />
            )}
          </View>
          <View style={s.main}>
            <Text style={s.product} numberOfLines={1}>
              {g.product}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {g.category ? `${g.category} · ` : ''}
              {batches}
            </Text>
            <Badge
              label={
                out ? 'Sold out' : live.length < n ? `${live.length} of ${n} in stock` : 'In stock'
              }
              tone={out ? 'neutral' : 'success'}
            />
          </View>
          <Icon name="chevronRight" size={22} color={colors.inkMuted} />
        </View>
        <View style={s.hero}>
          <Text style={s.heroVal} numberOfLines={1}>
            {headline}
          </Text>
          <Text style={s.meta}>{out ? 'sold' : 'in stock'}</Text>
        </View>
        <View
          style={s.bar}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[s.fill, { width: `${Math.min(100, sold * 100)}%` }]} />
        </View>
        <View style={s.legend}>
          <Stat label="Sold" value={`${Math.round(Math.min(100, sold * 100))}%`} s={s} />
          <Stat
            label={sold > 0 ? 'Earned' : 'Expected'}
            value={money > 0 ? `${sold > 0 ? '' : '~'}${ghs(money)}` : '—'}
            s={s}
            strong
          />
        </View>
      </Card>
    </Pressable>
  );
}

function Stat({
  label,
  value,
  s,
  strong,
}: {
  label: string;
  value: string;
  s: ReturnType<typeof styles>;
  strong?: boolean;
}) {
  return (
    <View style={s.stat}>
      <Text style={s.meta}>{label}</Text>
      <Text style={[s.statVal, strong && s.statStrong]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 14, minHeight: TOUCH },
  top: { flexDirection: 'row' as const, gap: 14, alignItems: 'center' as const },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 16,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  img: { width: 72, height: 72 },
  main: { flex: 1, gap: 4 },
  hero: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 8 },
  heroVal: {
    flexShrink: 1,
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  product: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  bar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden' as const,
    backgroundColor: c.surfaceSunken,
  },
  fill: { position: 'absolute' as const, top: 0, bottom: 0, left: 0, backgroundColor: c.brand500 },
  legend: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 16 },
  stat: { gap: 2, flexShrink: 1 },
  statVal: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  statStrong: { fontFamily: fonts.sansBold },
});
