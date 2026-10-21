import React, { useEffect, useState } from 'react';
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useThemedStyles, type ColorToken } from '../../theme';

/** Pulsing placeholder block. Compose it into the shape of the content that is loading. */
export function Skeleton({ height = 16, width = '100%', radius = 8, style }: { height?: number; width?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> }) {
  const s = useThemedStyles(styles);
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.block, { height, width, borderRadius: radius, opacity: pulse }, style]} />;
}

/** A card-shaped placeholder: an optional leading square, then text lines. */
export function SkeletonCard({ lines = 2, lead = false }: { lines?: number; lead?: boolean }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.card}>
      {lead ? <Skeleton width={56} height={56} radius={14} /> : null}
      <View style={s.lines}>
        <Skeleton width="55%" height={16} />
        {Array.from({ length: lines - 1 }, (_, i) => <Skeleton key={i} width={i % 2 ? '40%' : '80%'} height={12} />)}
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  block: { backgroundColor: c.borderSubtle },
  card: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, padding: 20, borderRadius: 16, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.cardEdge },
  lines: { flex: 1, gap: 10 },
});
