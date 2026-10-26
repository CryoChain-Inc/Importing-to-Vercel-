import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { type PressState, fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Icon } from './Icon';

/** Past this many options, chips wrap into a wall; switch to a compact picker. */
const CHIP_MAX = 6;
const SEARCH_MIN = 9;

export interface ChoiceChipsProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

export function ChoiceChips({ label, options, value, onChange }: ChoiceChipsProps) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  if (options.length > CHIP_MAX) {
    const shown = options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));
    return (
      <View style={s.wrap}>
        <Text style={s.label}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={({ pressed, hovered }: PressState) => [s.trigger, open && s.chipOn, hovered ? s.chipHover : null, pressed ? s.chipPress : null]}>
          <Text style={[s.text, s.triggerText, !value && { color: colors.inkMuted }]} numberOfLines={1}>{value || 'Choose'}</Text>
          <Icon name="chevronDown" size={18} color={colors.inkMuted} />
        </Pressable>
        {open ? (
          <View style={s.list}>
            {options.length >= SEARCH_MIN ? <TextInput value={q} onChangeText={setQ} placeholder={`Search ${options.length}`} placeholderTextColor={colors.inkMuted} style={[s.search, { outlineStyle: 'none' } as object]} /> : null}
            <ScrollView style={s.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {shown.length === 0 ? <Text style={s.empty}>No match</Text> : shown.map((o) => {
                const on = o === value;
                return (
                  <Pressable key={o} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { onChange(o); setOpen(false); setQ(''); }} style={({ hovered }: PressState) => [s.item, on && s.itemOn, hovered && !on ? s.chipHover : null]}>
                    <Text style={[s.text, s.triggerText, on && s.textOn]} numberOfLines={1}>{o}</Text>
                    {on ? <Icon name="check" size={18} color={colors.brandInk} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  }
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
  trigger: { minHeight: TOUCH, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  triggerText: { flex: 1 },
  list: { borderRadius: 14, borderWidth: 1, borderColor: c.borderSubtle, backgroundColor: c.surfaceCard, overflow: 'hidden' as const },
  search: { minHeight: 44, paddingHorizontal: 14, fontFamily: fonts.sansRegular, fontSize: 15, color: c.ink, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  scroll: { maxHeight: 232 },
  item: { minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14 },
  itemOn: { backgroundColor: c.brandTint },
  empty: { padding: 14, fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted },
  text: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  textOn: { color: c.brandInk, fontFamily: fonts.sansBold },
});
