import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Icon } from '../../../components/common';
import { useIsWide } from '../../../components/layout';
import { COUNTRIES, type Country } from '../../../data/countries';
import { fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

interface Props {
  country: Country;
  onCountry: (c: Country) => void;
  value: string;
  onChangeText: (v: string) => void;
  onSubmitEditing?: () => void;
  label?: string;
  error?: string;
}

/** Country-code picker (bottom sheet on phones, dialog on wide screens) plus the national number. */
export function PhoneField({ country, onCountry, value, onChangeText, onSubmitEditing, label = 'Mobile number', error }: Props) {
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const wide = useIsWide();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    return q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.iso.toLowerCase() === q || c.dial.startsWith(q)) : COUNTRIES;
  }, [query]);
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={s.container}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.field, focused && s.focused, error ? s.errored : null]}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Country code, ${country.name} plus ${country.dial}. Change`}
          style={({ pressed }) => [s.code, pressed && s.pressed]}
        >
          <Text style={s.flag}>{country.flag}</Text>
          <Text style={s.dial}>+{country.dial}</Text>
          <Icon name="chevronDown" size={16} color={colors.inkMuted} />
        </Pressable>
        <TextInput
          style={[s.input, { outlineStyle: 'none' } as object]}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          keyboardType="phone-pad"
          autoComplete="tel-national"
          accessibilityLabel={label}
          maxLength={15}
          placeholder={country.iso === 'GH' ? '24 123 4567' : 'Phone number'}
          placeholderTextColor={colors.inkMuted}
        />
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={close}>
        <KeyboardAvoidingView style={[s.overlay, wide && s.overlayWide]} behavior="padding">
          <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Close country list" />
          <View style={[s.sheet, wide && s.sheetWide]}>
            {wide ? null : <View style={s.grabber} />}
            <Text style={s.title}>Select country</Text>
            <TextInput
              style={[s.search, { outlineStyle: 'none' } as object]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or code"
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel="Search countries"
              autoCorrect={false}
            />
            <ScrollView style={s.list} contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
              {shown.map((c) => {
                const on = c.iso === country.iso;
                return (
                  <Pressable
                    key={c.iso}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      onCountry(c);
                      close();
                    }}
                    style={({ pressed }) => [s.row, on && s.rowOn, pressed && s.pressed]}
                  >
                    <Text style={s.rowFlag}>{c.flag}</Text>
                    <Text style={s.rowName}>{c.name}</Text>
                    <Text style={s.rowDial}>+{c.dial}</Text>
                    <View style={s.tick}>{on ? <Icon name="check" size={18} color={colors.brandInk} /> : null}</View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingRight: 14,
    backgroundColor: c.surfaceSunken,
  },
  focused: { borderColor: c.focusRing, backgroundColor: c.surfaceCard },
  errored: { borderColor: c.dangerInk },
  error: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.dangerInk },
  code: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    alignSelf: 'stretch' as const,
    paddingLeft: 12,
    paddingRight: 10,
    marginRight: 12,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    borderRightWidth: 1,
    borderRightColor: c.borderStrong,
  },
  pressed: { opacity: 0.6 },
  flag: { fontSize: 22 },
  dial: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  input: { flex: 1, minHeight: TOUCH, fontSize: 16, fontFamily: fonts.sansMedium, color: c.ink },
  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  overlayWide: { justifyContent: 'center' as const, alignItems: 'center' as const },
  backdrop: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,8,6,0.55)' },
  sheet: {
    maxHeight: '75%' as const,
    backgroundColor: c.surfaceCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 16,
  },
  sheetWide: { width: 400, borderRadius: 24, paddingTop: 22 },
  grabber: { alignSelf: 'center' as const, width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, marginBottom: 14 },
  title: { fontFamily: fonts.heading, fontSize: 20, letterSpacing: -0.3, color: c.ink, paddingHorizontal: 20, paddingBottom: 8 },
  search: {
    marginHorizontal: 20,
    marginBottom: 8,
    minHeight: TOUCH,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.surfaceSunken,
    fontSize: 16,
    fontFamily: fonts.sansMedium,
    color: c.ink,
  },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 8 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 52, paddingHorizontal: 12, borderRadius: 12 },
  rowOn: { backgroundColor: c.brandTint },
  rowFlag: { width: 30, fontSize: 22 },
  rowName: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  rowDial: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.inkMuted },
  tick: { width: 20, alignItems: 'center' as const },
});
