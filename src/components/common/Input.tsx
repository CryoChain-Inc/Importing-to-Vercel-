import React, { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../theme';

export interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  /** Fixed text before the value, e.g. a country code. */
  prefix?: string;
}

export function Input({ label, error, hint, prefix, style, onFocus, onBlur, ...rest }: InputProps) {
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [focused, setFocused] = useState(false);

  return (
    <View style={s.container}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.field, focused && s.focused, error ? s.errored : null]}>
        {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput
          style={[s.input, { outlineStyle: 'none' } as object, style]}
          placeholderTextColor={colors.inkMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {!error && hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  container: { gap: 6, width: '100%' as const },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: TOUCH + 4,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: c.surfaceSunken,
  },
  focused: { borderColor: c.focusRing, backgroundColor: c.surfaceCard },
  errored: { borderColor: c.dangerInk },
  prefix: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.inkMuted, marginRight: 8 },
  input: { flex: 1, minHeight: TOUCH, fontSize: 15, fontFamily: fonts.sansMedium, color: c.ink },
  error: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.dangerInk },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
});
