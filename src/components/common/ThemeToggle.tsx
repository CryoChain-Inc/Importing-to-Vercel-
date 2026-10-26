import React from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from './Icon';

export function ThemeToggle() {
  const { isDark, toggle, colors } = useTheme();
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.borderSubtle }}
    >
      <Icon name={isDark ? 'sun' : 'moon'} size={20} color={colors.ink} />
    </Pressable>
  );
}
