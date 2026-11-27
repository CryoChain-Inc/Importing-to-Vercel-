import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Icon } from '../../components/common';
import {
  focusRing,
  fonts,
  useTheme,
  useThemedStyles,
  type ColorToken,
  type PressState,
} from '../../theme';
import { Sheet } from '../ops/components/Sheet';

export interface Option {
  value: string;
  label: string;
  /** Muted second line, e.g. a count. */
  hint?: string;
}

interface Props {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  /** Adds a first row that clears the choice (value ''). Leave out when one option must always be picked. */
  anyLabel?: string;
  /** Show a search box above the list; on by default once there are more than 8 options. */
  searchable?: boolean;
}

/** A labelled dropdown: a field that opens a searchable list (a dialog on desktop, a sheet on a phone). */
export function FilterSelect({ label, value, options, onChange, anyLabel, searchable }: Props) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const all: Option[] = anyLabel ? [{ value: '', label: anyLabel }, ...options] : options;
  const current = all.find((o) => o.value === value);
  const active = anyLabel !== undefined && value !== '';
  const withSearch = searchable ?? options.length > 8;
  const shown = find.trim()
    ? all.filter((o) => o.label.toLowerCase().includes(find.trim().toLowerCase()))
    : all;
  const close = () => {
    setOpen(false);
    setFind('');
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? value}`}
        accessibilityHint="Opens a list"
        onPress={() => setOpen(true)}
        style={({ hovered, pressed, focused }: PressState) => [
          s.field,
          active && s.fieldOn,
          hovered && s.hover,
          pressed && s.press,
          focused && focusRing(colors.focusRing),
        ]}
      >
        <View style={s.grow}>
          <Text style={s.label} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[s.value, active && s.valueOn]} numberOfLines={1}>
            {current?.label ?? anyLabel ?? '—'}
          </Text>
        </View>
        <Icon name="chevronDown" size={18} color={active ? colors.brandInk : colors.inkMuted} />
      </Pressable>
      {open ? (
        <Sheet title={label} onClose={close}>
          {withSearch ? (
            <View style={s.search}>
              <Icon name="search" size={18} color={colors.inkMuted} />
              <TextInput
                value={find}
                onChangeText={setFind}
                placeholder={`Find in ${label.toLowerCase()}`}
                placeholderTextColor={colors.inkMuted}
                autoCorrect={false}
                style={[s.searchInput, { outlineStyle: 'none' } as object]}
                accessibilityLabel={`Find in ${label}`}
              />
            </View>
          ) : null}
          <View accessibilityRole="radiogroup" style={s.list}>
            {shown.map((o) => {
              const on = o.value === value;
              return (
                <Pressable
                  key={o.value || '__any'}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    onChange(o.value);
                    close();
                  }}
                  style={({ hovered, pressed, focused }: PressState) => [
                    s.row,
                    on && s.rowOn,
                    hovered && !on && s.hover,
                    pressed && s.press,
                    focused && focusRing(colors.focusRing),
                  ]}
                >
                  <View style={s.grow}>
                    <Text style={[s.rowText, on && s.rowTextOn]} numberOfLines={1}>
                      {o.label}
                    </Text>
                    {o.hint ? <Text style={s.hint}>{o.hint}</Text> : null}
                  </View>
                  {on ? <Icon name="check" size={18} color={colors.brandInk} strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
            {shown.length === 0 ? <Text style={s.none}>Nothing matches “{find.trim()}”.</Text> : null}
          </View>
        </Sheet>
      ) : null}
    </>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  grow: { flex: 1, minWidth: 0 },
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: c.fieldBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  fieldOn: { backgroundColor: c.brandTint, borderColor: c.brand500 },
  hover: { backgroundColor: c.offBg },
  press: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  label: { fontFamily: fonts.sansMedium, fontSize: 11.5, color: c.inkMuted },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: c.ink, marginTop: 1 },
  valueOn: { color: c.brandInk },
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.fieldBg,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.ink,
    paddingVertical: 10,
  },
  list: { gap: 2 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  rowOn: { backgroundColor: c.brandTint },
  rowText: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  rowTextOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12.5, color: c.inkMuted },
  none: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted, padding: 16 },
});
