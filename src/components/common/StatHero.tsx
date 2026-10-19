import React from 'react';
import { Text, View } from 'react-native';
import { fonts, useThemedStyles, type ColorToken } from '../../theme';
import { HeroCard } from './HeroCard';

/** Green headline panel: one big figure and up to three supporting figures. */
export function StatHero({ label, value, cells }: { label: string; value: string; cells: { label: string; value: string }[] }) {
  const s = useThemedStyles(styles);
  return (
    <HeroCard style={s.hero}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <View style={s.row}>
        {cells.map((c) => (
          <View key={c.label} style={s.cell}>
            <Text style={s.sub}>{c.label}</Text>
            <Text style={s.val} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
          </View>
        ))}
      </View>
    </HeroCard>
  );
}

const styles = (_c: Record<ColorToken, string>) => ({
  hero: { gap: 6, padding: 22 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  amount: { fontFamily: fonts.heading, fontSize: 36, lineHeight: 48, letterSpacing: -1, color: '#ffffff', fontVariant: ['tabular-nums' as const] },
  row: { flexDirection: 'row' as const, gap: 12, marginTop: 14 },
  cell: { flex: 1, gap: 2 },
  sub: { fontFamily: fonts.sansMedium, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  val: { fontFamily: fonts.sansBold, fontSize: 17, color: '#ffffff', fontVariant: ['tabular-nums' as const] },
});
