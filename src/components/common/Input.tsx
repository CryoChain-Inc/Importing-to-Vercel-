import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Icon } from './Icon';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';

export interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  /** Fixed text before the value, e.g. a country code. */
  prefix?: string;
}

export function Input({ label, error, hint, prefix, style, onFocus, onBlur, onChangeText, maxLength, secureTextEntry, placeholder, ...rest }: InputProps) {
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  // The label rests inside the field like a placeholder, then lifts to the top edge once there is something to label.
  const lifted = focused || !!(rest.value ?? rest.defaultValue) || !!rest.multiline;
  const [t] = useState(() => new Animated.Value(lifted ? 1 : 0));
  useEffect(() => {
    Animated.timing(t, { toValue: lifted ? 1 : 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [lifted, t]);

  return (
    <View style={s.container}>
      <View style={[s.field, focused && s.focused, error ? s.errored : null]}>
        <Animated.Text
          pointerEvents="none"
          numberOfLines={1}
          style={[
            s.label,
            { color: error ? colors.dangerInk : colors.inkMuted },
            { transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -13] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) }] },
          ]}
        >
          {label}
        </Animated.Text>
        {prefix && lifted ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          style={[s.input, rest.multiline ? s.multiline : null, { outlineStyle: 'none' } as object, style]}
          placeholder={lifted ? placeholder : undefined}
          placeholderTextColor={colors.inkMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          secureTextEntry={secureTextEntry && !shown}
          maxLength={maxLength}
          onChangeText={onChangeText ? (text) => onChangeText(maxLength != null ? text.slice(0, maxLength) : text) : undefined}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setShown((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'}>
            <Icon name={shown ? 'eyeOff' : 'eye'} size={20} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {!error && hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export const fieldStyles = (c: Record<ColorToken, string>) => ({
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 60,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: c.fieldBg,
  },
  focused: {},
  errored: { backgroundColor: c.dangerTint },
});

const styles = (c: Record<ColorToken, string>) => ({
  ...fieldStyles(c),
  container: { gap: 6, width: '100%' as const },
  label: { position: 'absolute' as const, left: 16, top: 19, fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 20, transformOrigin: 'left center' },
  prefix: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: c.inkMuted, marginRight: 8, paddingTop: 16 },
  input: { flex: 1, minHeight: 60, paddingTop: 22, paddingBottom: 6, fontSize: 16, fontFamily: fonts.sansMedium, color: c.ink },
  multiline: { minHeight: 96, paddingTop: 28, paddingBottom: 12, textAlignVertical: 'top' as const },
  error: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.dangerInk, paddingHorizontal: 4 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted, paddingHorizontal: 4 },
});
