import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const NATIVE = Platform.OS !== 'web';

/** Eases a block in once as it mounts; the first few stagger, the rest appear at once. Skipped for reduced motion. */
export function Reveal({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let run: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return v.setValue(1);
      run = Animated.timing(v, {
        toValue: 1,
        duration: 420,
        delay: Math.min(index, 6) * 55,
        easing: Easing.out(Easing.exp),
        useNativeDriver: NATIVE,
      });
      run.start();
    });
    return () => run?.stop();
  }, [v, index]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A soft ring that breathes around a live marker. Place it inside a 24px box behind the dot. */
export function Pulse({ color, size = 24 }: { color: string; size?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE,
      }),
    );
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => !reduce && loop.start());
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
      }}
    />
  );
}

/** A progress fill that grows to `pct` (0-100) when it appears and whenever the figure changes. */
export function GrowBar({
  pct,
  trackStyle,
  fillStyle,
  label,
}: {
  pct: number;
  trackStyle: object;
  fillStyle: object;
  label?: string;
}) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let run: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return v.setValue(pct);
      // Width can't use the native driver; this is one short, one-off tween per bar.
      run = Animated.timing(v, {
        toValue: pct,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      run.start();
    });
    return () => run?.stop();
  }, [v, pct]);
  return (
    <Animated.View style={[trackStyle, { overflow: 'hidden' }]} accessibilityLabel={label}>
      <Animated.View
        style={[
          fillStyle,
          {
            width: v.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
              extrapolate: 'clamp',
            }),
          },
        ]}
      />
    </Animated.View>
  );
}
