import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { type PressState, focusRing, fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Icon, type IconName } from './Icon';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'tonal' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TEXT: Record<string, ColorToken> = {
  primary: 'onBrand',
  secondary: 'brandInk',
  tonal: 'brandInk',
  outline: 'ink',
  ghost: 'brandInk',
  danger: 'onDanger',
};

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, loading = false, disabled = false, style }: ButtonProps) {
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const off = disabled || loading;
  const textColor = off ? colors.inkMuted : colors[TEXT[variant]];
  const fill = variant === 'primary' && !off;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      android_ripple={off ? undefined : { color: 'rgba(255,255,255,0.18)' }}
      style={({ pressed, hovered, focused }: PressState) => [
        s.base,
        size === 'sm' ? s.sm : size === 'lg' ? s.lg : s.md,
        fill ? s.fill : null,
        variant === 'tonal' || variant === 'secondary' ? s.tonal : null,
        variant === 'outline' ? s.outline : null,
        variant === 'danger' ? s.danger : null,
        off ? s.off : null,
        hovered && !off ? s.hovered : null,
        pressed && !off ? s.pressed : null,
        focused ? focusRing(colors.focusRing) : null,
        style,
      ]}
    >
      <View style={s.row}>
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <>
            <Text style={[s.text, size === 'sm' && s.textSm, { color: textColor }]}>{label}</Text>
            {icon ? <Icon name={icon} size={18} color={textColor} /> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  base: { borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  sm: { minHeight: 36, paddingHorizontal: 14 },
  md: { minHeight: TOUCH, paddingHorizontal: 20 },
  lg: { minHeight: 56, paddingHorizontal: 24, borderRadius: 14 },
  fill: { backgroundColor: c.brand600 },
  tonal: { backgroundColor: c.brandTint },
  outline: { borderWidth: 1.5, borderColor: c.borderStrong },
  danger: { backgroundColor: c.dangerFill },
  off: { backgroundColor: c.surfaceSunken, borderWidth: 1, borderColor: c.borderSubtle },
  hovered: { opacity: 0.92, transform: [{ translateY: -1 }] },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  text: { fontFamily: fonts.sansBold, fontSize: 15 },
  textSm: { fontSize: 13 },
});
