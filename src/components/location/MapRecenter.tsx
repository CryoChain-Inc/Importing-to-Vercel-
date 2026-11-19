import React from 'react';
import { Pressable } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useThemedStyles, useTheme, type ColorToken } from '../../theme';

/** Floating button that brings the truck and the places back into view after the map has been panned or zoomed. */
export function MapRecenter({ onPress }: { onPress: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Recenter map"
      hitSlop={6}
      style={({ pressed }) => [s.btn, pressed && s.pressed]}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={7} stroke={colors.brandInk} strokeWidth={2} />
        <Circle cx={12} cy={12} r={2.6} fill={colors.brandInk} />
        <Path
          d="M12 2v3M12 19v3M2 12h3M19 12h3"
          stroke={colors.brandInk}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  btn: {
    position: 'absolute' as const,
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.surfaceCard,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    shadowColor: '#0a3d24',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },
});
