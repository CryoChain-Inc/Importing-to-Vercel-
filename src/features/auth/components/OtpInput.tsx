import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

export const OTP_LENGTH = 6;

/** Six visible boxes backed by one hidden input: paste, SMS autofill and backspace all just work. */
export function OtpInput({ value, onChange, onSubmit, hasError }: { value: string; onChange: (v: string) => void; onSubmit?: () => void; hasError?: boolean }) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const s = useThemedStyles(styles);

  // autoFocus opens the keyboard before KeyboardAvoidingView has measured its frame, so the form never lifts; focus once the screen has settled.
  useEffect(() => {
    const id = setTimeout(() => ref.current?.focus(), 350);
    return () => clearTimeout(id);
  }, []);

  return (
    <Pressable onPress={() => ref.current?.focus()} style={s.row} accessibilityLabel="6-digit verification code">
      {Array.from({ length: OTP_LENGTH }, (_, i) => {
        const active = focused && i === Math.min(value.length, OTP_LENGTH - 1);
        return (
          <View key={i} style={[s.box, active && s.active, hasError && s.error]}>
            <Text style={s.digit}>{value[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[s.hidden, { outlineStyle: 'none' } as object]}
      />
    </Pressable>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  row: { flexDirection: 'row' as const, gap: 8, justifyContent: 'space-between' as const },
  box: {
    flex: 1,
    maxWidth: 64,
    aspectRatio: 0.85,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSunken,
  },
  active: { borderColor: c.focusRing, backgroundColor: c.surfaceCard },
  error: { borderColor: c.dangerInk },
  digit: { fontFamily: fonts.sansBold, fontSize: 26, color: c.ink },
  hidden: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
});
