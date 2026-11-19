import React, { useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Icon } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

/** One setting on one line: label on the left, a small value box with its unit on the right. The help line shows only while the field is focused. */
export function SettingRow({
  label,
  help,
  unit,
  error,
  onFocus,
  onBlur,
  ...input
}: { label: string; help?: string; unit?: string; error?: string } & TextInputProps) {
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [focused, setFocused] = useState(false);
  const note = error ?? (focused ? help : undefined);
  return (
    <View style={s.row}>
      <View style={s.text}>
        <Text style={s.label}>{label}</Text>
        {note ? <Text style={error ? s.error : s.help}>{note}</Text> : null}
      </View>
      <View style={[s.box, error ? s.boxError : null]}>
        <TextInput
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.inkMuted}
          style={[s.input, { outlineStyle: 'none' } as object]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...input}
        />
        {unit ? <Text style={s.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** A collapsible group: title and a one-line summary of its current values; opens to show the rows. Stays open while `invalid`. */
export function SettingGroup({
  title,
  summary,
  invalid,
  children,
}: {
  title: string;
  summary: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [open, setOpen] = useState(false);
  const shown = open || !!invalid;
  return (
    <View style={[s.group, shown ? s.groupOpen : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: shown }}
        accessibilityLabel={`${title}, ${summary}`}
        onPress={() => setOpen(!shown)}
        style={({ pressed }) => [s.head, pressed ? s.pressed : null]}
      >
        <View style={s.headText}>
          <Text style={s.groupTitle}>{title}</Text>
          {shown ? null : (
            <Text style={s.summary} numberOfLines={1}>
              {summary}
            </Text>
          )}
        </View>
        <View style={s.action}>
          <Text style={s.actionText}>{shown ? 'Done' : 'Edit'}</Text>
          <Icon name={shown ? 'chevronUp' : 'chevronDown'} size={16} color={colors.brandInk} />
        </View>
      </Pressable>
      {shown ? <View style={s.body}>{children}</View> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  group: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    backgroundColor: c.surfaceSunken,
    overflow: 'hidden' as const,
  },
  groupOpen: { backgroundColor: c.surfaceCard, borderColor: c.brand500 },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.7 },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  body: { gap: 14, paddingHorizontal: 16, paddingBottom: 16 },
  groupTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  summary: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  action: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: c.brandTint,
  },
  actionText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.brandInk },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 19, color: c.ink },
  help: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted },
  error: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 17, color: c.dangerInk },
  box: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    width: 112,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: c.fieldBg,
  },
  boxError: { backgroundColor: c.dangerTint },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: c.ink,
    textAlign: 'right' as const,
    fontVariant: ['tabular-nums' as const],
  },
  unit: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.inkMuted,
    marginLeft: 6,
    minWidth: 22,
  },
});
