import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, useThemedStyles, type ColorToken } from '../../theme';

/** Solid brand panel for headline numbers. Plain Views only, so Android lays it out like every other card. */
export function HeroCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { gradients } = useTheme();
  const s = useThemedStyles(styles);
  return (
    <View style={[s.card, { backgroundColor: gradients.card.colors[1] }, style]}>
      <View style={s.glow} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = (_c: Record<ColorToken, string>) => ({
  card: { borderRadius: 24, padding: 20, overflow: 'hidden' as const },
  glow: { position: 'absolute' as const, top: -60, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)' },
});
