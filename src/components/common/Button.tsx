import React from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { type PressState, focusRing, fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
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
  const isPrimary = variant === 'primary';
  // A disabled button goes quiet; a loading one keeps its colour so the press still reads as accepted.
  const quiet = disabled && !loading;
  const textColor = quiet ? colors.inkMuted : (colors[TEXT[variant]] ?? colors.ink);

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed, hovered, focused }: PressState) => [
        s.base,
        size === 'sm' ? s.sm : size === 'lg' ? s.lg : s.md,
        isPrimary && !quiet ? s.fill : null,
        isPrimary && !quiet ? s.glow : null,
        variant === 'tonal' || variant === 'secondary' ? s.tonal : null,
        variant === 'outline' ? s.outline : null,
        variant === 'danger' ? s.danger : null,
        quiet ? s.off : null,
        hovered && !off ? s.hovered : null,
        pressed && !off ? s.pressed : null,
        focused ? focusRing(colors.focusRing) : null,
        style,
      ]}
    >
      {isPrimary && !quiet ? <View pointerEvents="none" style={s.sheen} /> : null}
      <View style={s.row}>
        {loading ? <ActivityIndicator size="small" color={textColor} /> : null}
        <Text style={[s.text, size === 'sm' && s.textSm, size === 'lg' && s.textLg, { color: textColor }]}>{label}</Text>
        {!loading && icon ? (
          size === 'sm' ? (
            <Icon name={icon} size={16} color={textColor} />
          ) : (
            <View style={[s.chip, { backgroundColor: isPrimary && !quiet ? 'rgba(255,255,255,0.2)' : colors.borderSubtle }]}>
              <Icon name={icon} size={16} color={textColor} />
            </View>
          )
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  base: { borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  sm: { minHeight: 36, paddingHorizontal: 16 },
  md: { minHeight: 48, paddingHorizontal: 22 },
  lg: { minHeight: 58, paddingHorizontal: 24 },
  fill: { backgroundColor: c.brand600 },
  glow: { shadowColor: c.brand700, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 16, elevation: 5 },
  sheen: { position: 'absolute' as const, top: 0, left: 0, right: 0, height: '50%' as const, backgroundColor: 'rgba(255,255,255,0.1)' },
  tonal: { backgroundColor: c.brandTint },
  outline: { borderWidth: 1.5, borderColor: c.borderStrong },
  danger: { backgroundColor: c.dangerFill },
  off: { backgroundColor: c.offBg, opacity: 1, shadowOpacity: 0, elevation: 0 },
  hovered: { transform: [{ translateY: -1 }] },
  pressed: { transform: [{ scale: 0.97 }] },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  chip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const },
  text: { fontFamily: fonts.sansBold, fontSize: 15, letterSpacing: 0.1 },
  textSm: { fontSize: 13 },
  textLg: { fontSize: 17, flexShrink: 1 },
});
