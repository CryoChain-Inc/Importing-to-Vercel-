import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Icon } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { KG_STEP } from '../cart/cart';

/**
 * Kg picker in one pill: step with − / +, or type an exact quantity. At the smallest step the − turns into a bin
 * that removes the line (onChange(0)), so a buyer always sees what the next tap does.
 */
export function KgStepper({ value, max, onChange, compact = false, removable = true }: { value: number; max: number; onChange: (kg: number) => void; compact?: boolean; removable?: boolean }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  // Typed text is a draft only while the field is focused; otherwise the cart value is shown.
  const [draft, setDraft] = useState<string | null>(null);

  // Where the quantity lands when it drops below one step: 0 removes the line; a draft (product page) stays at one step.
  const floor = removable ? 0 : Math.min(KG_STEP, max);
  const commit = (raw: string) => {
    setDraft(null);
    const n = Math.round(parseFloat(raw.replace(',', '.')) * 100) / 100;
    onChange(Number.isFinite(n) && n > 0 ? Math.min(n, max) : floor);
  };
  const step = (dir: 1 | -1) => {
    const next = value + dir * KG_STEP;
    onChange(next < KG_STEP ? floor : Math.min(next, max));
  };
  const removing = removable && value - KG_STEP < KG_STEP;
  const atMin = !removable && value <= floor;
  const size = compact ? 36 : 44;

  return (
    <View style={[s.pill, compact && s.pillCompact]}>
      <Pressable accessibilityRole="button" accessibilityLabel={removing ? 'Remove from cart' : 'Less'} disabled={atMin} onPress={() => step(-1)} hitSlop={6}
        style={({ pressed }) => [s.btn, { width: size, height: size }, atMin && s.off, pressed && s.pressed]}>
        {removing ? <Icon name="trash" size={compact ? 16 : 18} color={colors.dangerInk} /> : <Text style={s.sign}>−</Text>}
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
        style={[s.input, compact && s.inputCompact, { outlineStyle: 'none' } as object]}
      />
      <Text style={s.unit}>kg</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="More" disabled={value >= max} onPress={() => step(1)} hitSlop={6}
        style={({ pressed }) => [s.btn, { width: size, height: size }, value >= max && s.off, pressed && s.pressed]}>
        <Text style={s.sign}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  pill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, padding: 4, borderRadius: 16, backgroundColor: c.surfaceSunken, alignSelf: 'flex-start' as const },
  pillCompact: { padding: 2, borderRadius: 14, alignSelf: 'stretch' as const, justifyContent: 'space-between' as const },
  btn: { borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceCard },
  pressed: { opacity: 0.6 },
  off: { opacity: 0.35 },
  sign: { fontFamily: fonts.sansBold, fontSize: 22, lineHeight: 26, color: c.brandInk },
  input: { minWidth: 52, textAlign: 'center' as const, fontFamily: fonts.sansBold, fontSize: 17, color: c.ink, paddingVertical: 6, fontVariant: ['tabular-nums' as const] },
  inputCompact: { minWidth: 0, flex: 1, fontSize: 15 },
  unit: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted, marginLeft: -4, marginRight: 4 },
});
