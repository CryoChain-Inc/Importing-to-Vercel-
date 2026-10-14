import React from 'react';
import { Text, View } from 'react-native';
import { fonts, useThemedStyles, type ColorToken } from '../../theme';

export interface BadgeProps {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const s = useThemedStyles(styles);
  return (
    <View style={[s.badge, s[tone]]}>
      <Text style={[s.text, s[`${tone}Text` as const]]}>{label}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' as const },
  success: { backgroundColor: c.brandTint },
  warning: { backgroundColor: c.harvestTint },
  danger: { backgroundColor: c.dangerFill },
  info: { backgroundColor: c.brandTint },
  neutral: { backgroundColor: c.surfaceSunken },
  text: { fontFamily: fonts.sansBold, fontSize: 12 },
  successText: { color: c.brandInk },
  warningText: { color: c.harvestInk },
  dangerText: { color: c.onDanger },
  infoText: { color: c.brandInk },
  neutralText: { color: c.inkMuted },
});
