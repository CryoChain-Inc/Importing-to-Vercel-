import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { type PressState, fonts, TOUCH, useThemedStyles, type ColorToken } from '../../theme';

export interface ChoiceChipsProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

export function ChoiceChips({ label, options, value, onChange }: ChoiceChipsProps) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        {options.map((o) => {
          const on = o === value;
          return (
            <Pressable key={o} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o)} style={({ pressed, hovered }: PressState) => [s.chip, on && s.chipOn, hovered && !on ? s.chipHover : null, pressed ? s.chipPress : null]}>
              <Text style={[s.text, on && s.textOn]}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 8, width: '100%' as const },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: {
    minHeight: TOUCH - 6,
    paddingHorizontal: 16,
    justifyContent: 'center' as const,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceCard,
  },
  chipHover: { backgroundColor: c.surfaceSunken },
  chipPress: { transform: [{ scale: 0.97 }] },
  chipOn: { backgroundColor: c.brandTint, borderColor: c.brand600 },
  text: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  textOn: { color: c.brandInk, fontFamily: fonts.sansBold },
});
