import React from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { type PressState, fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Brand } from '../common/Brand';
import { Button } from '../common/Button';
import { Icon, type IconName } from '../common/Icon';
import { ThemeToggle } from '../common/ThemeToggle';
import { useIsWide } from './Screen';

export interface NavItem { key: string; label: string; icon: IconName; badge?: number }
export interface NavGroup { title: string; items: NavItem[] }

/** Grouped sidebar on wide screens; on phones a header plus a swipeable strip of sections (eleven won't fit a tab bar). */
export function OpsShell({ groups, active, onSelect, name, onSignOut, children }: {
  groups: NavGroup[];
  active: string;
  onSelect: (k: string) => void;
  name: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const wide = useIsWide();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);

  const item = (it: NavItem, rail: boolean) => {
    const on = it.key === active;
    return (
      <Pressable key={it.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onSelect(it.key)}
        style={({ pressed, hovered, focused }: PressState) => [
          rail ? s.railItem : s.pill,
          on && (rail ? s.railOn : s.pillOn),
          hovered && !on ? s.hover : null,
          pressed ? s.press : null,
          focused ? s.focused : null,
        ]}>
        <Icon name={it.icon} size={18} color={on ? colors.brandInk : colors.inkMuted} />
        <Text style={[s.label, on && s.labelOn]} numberOfLines={1}>{it.label}</Text>
        {it.badge ? <View style={s.badge}><Text style={s.badgeText}>{it.badge > 99 ? '99+' : it.badge}</Text></View> : null}
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[s.root, wide && s.rootWide]}>
      {wide ? (
        <View style={s.rail}>
          <Brand />
          <ScrollView style={s.railScroll} contentContainerStyle={s.railList} showsVerticalScrollIndicator={false}>
            {groups.map((g) => (
              <View key={g.title} style={s.group}>
                <Text style={s.groupTitle}>{g.title}</Text>
                {g.items.map((it) => item(it, true))}
              </View>
            ))}
          </ScrollView>
          <View style={s.foot}>
            <View style={s.who}>
              <View style={s.avatar}><Text style={s.avatarText}>{(name || 'O').slice(0, 1).toUpperCase()}</Text></View>
              <View style={s.whoText}>
                <Text style={s.whoName} numberOfLines={1}>{name || 'Operations'}</Text>
                <Text style={s.groupTitle}>Operations</Text>
              </View>
              <ThemeToggle />
            </View>
            <Button label="Sign out" icon="logOut" variant="ghost" size="sm" onPress={onSignOut} />
          </View>
        </View>
      ) : (
        <View style={s.top}>
          <View style={s.topRow}>
            <Brand />
            <ThemeToggle />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip} accessibilityRole="tablist">
            {groups.flatMap((g) => g.items).map((it) => item(it, false))}
          </ScrollView>
        </View>
      )}
      <ScrollView style={s.main} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.content}>{children}</View>
        {wide ? null : <Button label="Sign out" icon="logOut" variant="ghost" size="sm" onPress={onSignOut} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  rootWide: { flexDirection: 'row' as const },
  rail: { width: 264, padding: 20, gap: 20, backgroundColor: c.surfaceCard, borderRightWidth: 1, borderRightColor: c.cardEdge },
  railScroll: { flex: 1 },
  railList: { gap: 18, overflow: 'visible' as const },
  group: { gap: 6, overflow: 'visible' as const },
  groupTitle: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: c.inkMuted, paddingHorizontal: 12, marginBottom: 2 },
  railItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 42, paddingHorizontal: 12, borderRadius: 10 },
  railOn: { backgroundColor: c.brandTint },
  hover: { backgroundColor: c.surfaceSunken },
  press: { opacity: 0.7 },
  focused: { outlineStyle: 'solid' as const, outlineWidth: 2, outlineOffset: -2, outlineColor: c.focusRing, zIndex: 1 },
  label: { flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: c.inkMuted },
  labelOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.harvestFill, marginLeft: 'auto' as const },
  badgeText: { fontFamily: fonts.sansBold, fontSize: 11, color: c.onHarvest },
  foot: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  who: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  whoText: { flex: 1 },
  whoName: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink, paddingHorizontal: 12 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  avatarText: { fontFamily: fonts.sansBold, fontSize: 16, color: c.brandInk },
  top: { paddingTop: 8, gap: 4, backgroundColor: c.surfaceCard, borderBottomWidth: 1, borderBottomColor: c.cardEdge },
  topRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16 },
  strip: { gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  pill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.surfaceSunken },
  pillOn: { backgroundColor: c.brandTint },
  main: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  content: { width: '100%' as const, maxWidth: 1040, alignSelf: 'center' as const, gap: 16 },
});
