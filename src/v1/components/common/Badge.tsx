import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../theme';

export interface BadgeProps {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[tone]]}>
      <Text style={[styles.text, textStyles[tone]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  success: {
    backgroundColor: colors.successBg,
  },
  warning: {
    backgroundColor: colors.warningBg,
  },
  danger: {
    backgroundColor: colors.dangerBg,
  },
  info: {
    backgroundColor: colors.infoBg,
  },
  neutral: {
    backgroundColor: colors.steelLight,
  },
  text: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
  },
});

const textStyles = StyleSheet.create({
  success: { color: colors.success },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
  info: { color: colors.info },
  neutral: { color: colors.inkMuted },
});
