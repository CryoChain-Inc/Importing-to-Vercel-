import React from 'react';
import { Text, View } from 'react-native';
import { fonts, useThemedStyles, type ColorToken } from '../../theme';

export function Banner({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'info' }) {
  const s = useThemedStyles(styles);
  const info = tone === 'info';
  return (
    <View accessibilityRole="alert" style={[s.box, info ? s.info : s.danger]}>
      <Text style={[s.text, info ? s.infoText : s.dangerText]}>{text}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  box: { padding: 12, borderRadius: 12, borderWidth: 1 },
  info: { backgroundColor: c.brandTint, borderColor: c.brand500 },
  danger: { backgroundColor: c.surfaceSunken, borderColor: c.dangerInk },
  text: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  infoText: { color: c.brandInk },
  dangerText: { color: c.dangerInk },
});
