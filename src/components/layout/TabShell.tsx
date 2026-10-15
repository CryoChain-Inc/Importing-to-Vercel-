import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Brand } from '../common/Brand';
import { Button } from '../common/Button';
import { Icon, type IconName } from '../common/Icon';
import { ThemeToggle } from '../common/ThemeToggle';
import { useIsWide } from './Screen';

export interface TabDef<K extends string> {
  key: K;
  label: string;
  icon: IconName;
}

/** Bottom tab bar on phones, side rail on wide screens. Tab state lives in the caller, not a route. */
export function TabShell<K extends string>({ tabs, tab, onSelect, onSignOut, children }: {
  tabs: TabDef<K>[];
  tab: K;
  onSelect: (k: K) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const wide = useIsWide();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);

  const button = (t: TabDef<K>, rail?: boolean) => {
    const on = t.key === tab;
    return (
      <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onSelect(t.key)}
        style={[rail ? s.railTab : s.barTab, on && rail ? s.railTabOn : null]}>
        <Icon name={t.icon} size={22} color={on ? colors.brandInk : colors.inkMuted} />
        <Text style={[s.tabLabel, on && s.tabLabelOn]}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[s.root, wide && s.rootWide]}>
      {wide ? (
        <View style={s.rail}>
          <Brand />
          <View style={s.railTabs}>{tabs.map((t) => button(t, true))}</View>
          <View style={s.railFoot}>
            <ThemeToggle />
            <Button label="Sign out" variant="outline" size="sm" onPress={onSignOut} />
          </View>
        </View>
      ) : null}
      <ScrollView style={s.main} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.content}>{children}</View>
        {wide ? null : <Button label="Sign out" variant="ghost" size="sm" onPress={onSignOut} />}
      </ScrollView>
      {wide ? null : <View style={s.bar} accessibilityRole="tablist">{tabs.map((t) => button(t))}</View>}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  rootWide: { flexDirection: 'row' as const },
  rail: { width: 248, padding: 20, gap: 24, justifyContent: 'space-between' as const, backgroundColor: c.surfaceCard, borderRightWidth: 1, borderRightColor: c.borderSubtle },
  railTabs: { flex: 1, gap: 4 },
  railTab: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 12 },
  railTabOn: { backgroundColor: c.brandTint },
  railFoot: { gap: 12, alignItems: 'flex-start' as const },
  main: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  content: { width: '100%' as const, maxWidth: 720, alignSelf: 'center' as const, gap: 16 },
  bar: { flexDirection: 'row' as const, backgroundColor: c.surfaceCard, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  barTab: { flex: 1, minHeight: 60, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 2 },
  tabLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  tabLabelOn: { fontFamily: fonts.sansBold, color: c.brandInk },
});
