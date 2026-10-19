import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme, type GradientKind } from '../../theme';

export interface GradientProps {
  kind: GradientKind;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** SVG-backed so it renders identically on Android and web, and follows the theme. */
export function Gradient({ kind, style, children }: GradientProps) {
  const { gradients } = useTheme();
  const g = gradients[kind];
  const id = useId().replace(/:/g, '');
  const rad = (g.angle * Math.PI) / 180;
  // CSS angle -> unit-square vector (0deg = up, 90deg = right).
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: g.colors[Math.floor((g.colors.length - 1) / 2)] }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
            {g.colors.map((c, i) => (
              <Stop key={i} offset={g.stops?.[i] ?? i / (g.colors.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}
