import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { fonts, TOUCH, useThemedStyles, type ColorToken } from '../../../theme';
import { KG_STEP } from '../cart/cart';

/** Kg picker: step with − / +, or type an exact quantity. Going below one step removes the line (onChange(0)). */
export function KgStepper({ value, max, onChange }: { value: number; max: number; onChange: (kg: number) => void }) {
  const s = useThemedStyles(styles);
  // Typed text is a draft only while the field is focused; otherwise the cart value is shown.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    setDraft(null);
    const n = Math.round(parseFloat(raw.replace(',', '.')) * 100) / 100;
    onChange(Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0);
  };
  const step = (dir: 1 | -1) => {
    const next = value + dir * KG_STEP;
    onChange(next < KG_STEP ? 0 : Math.min(next, max));
  };

  return (
    <View style={s.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Less" onPress={() => step(-1)} style={s.btn}>
        <Text style={s.sign}>−</Text>
      </Pressable>
      <TextInput
        accessibilityLabel="Kilograms"
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChangeText={setDraft}
        onBlur={() => draft !== null && commit(draft)}
        onSubmitEditing={() => draft !== null && commit(draft)}
        keyboardType="decimal-pad"
        selectTextOnFocus
        style={[s.input, { outlineStyle: 'none' } as object]}
      />
      <Text style={s.unit}>kg</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="More" disabled={value >= max} onPress={() => step(1)} style={[s.btn, value >= max && s.off]}>
        <Text style={s.sign}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  btn: { width: TOUCH - 8, height: TOUCH - 8, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  off: { opacity: 0.4 },
  sign: { fontFamily: fonts.sansBold, fontSize: 22, lineHeight: 26, color: c.brandInk },
  input: { minWidth: 48, textAlign: 'center' as const, fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, paddingVertical: 6, fontVariant: ['tabular-nums' as const] },
  unit: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted, marginLeft: -2, marginRight: 2 },
});
