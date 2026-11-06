import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../theme';
import type { LoadingScreenProps } from './LoadingScreen';

// Android-only. Metro picks this file over LoadingScreen.tsx on Android.
// Keep the brand artwork untouched; animate only the surrounding cold-chain motif.

const LOGO = require('../../../assets/logo.png');
const ORBITS = 3;
const ORBIT_MS = 3200;

function Orbit({ index, still }: { index: number; still: boolean }) {
  const t = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * (ORBIT_MS / ORBITS)),
        Animated.timing(t, {
          toValue: 1,
          duration: ORBIT_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [index, still, t]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.orbit,
        {
          opacity: t.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.46, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.66, 1.55] }) }],
        },
      ]}
    />
  );
}

export function LoadingScreen({ message = 'Loading CryoChain...', detail }: LoadingScreenProps) {
  const [still, setStill] = useState(false);
  const reveal = useState(() => new Animated.Value(0))[0];
  const drift = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setStill(v));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (still) {
      reveal.setValue(1);
      return;
    }
    Animated.timing(reveal, {
      toValue: 1,
      duration: 700,
      delay: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const motion = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    motion.start();
    return () => motion.stop();
  }, [still, drift, reveal]);

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={message}>
      <View style={styles.stage} pointerEvents="none">
        <View style={styles.glow} />
        {Array.from({ length: ORBITS }, (_, i) => (
          <Orbit key={i} index={i} still={still} />
        ))}
        <Animated.Image
          source={LOGO}
          resizeMode="contain"
          style={[
            styles.logo,
            {
              transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }],
            },
          ]}
        />
        <View style={styles.specks}>
          <View style={[styles.speck, styles.speckOne]} />
          <View style={[styles.speck, styles.speckTwo]} />
          <View style={[styles.speck, styles.speckThree]} />
          <View style={[styles.speck, styles.speckFour]} />
        </View>
      </View>

      <Animated.View
        style={[
          styles.caption,
          {
            opacity: reveal,
            transform: [
              { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          },
        ]}
      >
        <Text style={styles.subtitle}>Cold from the farm gate to your door.</Text>
        <Text style={styles.message}>{message}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7F4', overflow: 'hidden' },
  stage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 324, height: 112 },
  glow: {
    position: 'absolute', width: 250, height: 250, borderRadius: 125,
    backgroundColor: '#E8F1E5', opacity: 0.72,
  },
  orbit: {
    position: 'absolute',
    width: 210, height: 210, borderRadius: 105,
    borderWidth: 1.5, borderColor: '#A9CDA0',
  },
  specks: { position: 'absolute', width: 284, height: 284 },
  speck: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#2B7DB8' },
  speckOne: { top: 28, left: 49 },
  speckTwo: { top: 76, right: 20, width: 5, height: 5, backgroundColor: '#76A940' },
  speckThree: { bottom: 30, left: 27, width: 5, height: 5, backgroundColor: '#76A940' },
  speckFour: { bottom: 54, right: 36 },
  caption: {
    position: 'absolute',
    left: 32,
    right: 32,
    bottom: '13%',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: '#547062',
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
  },
  detail: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
});

export default LoadingScreen;
