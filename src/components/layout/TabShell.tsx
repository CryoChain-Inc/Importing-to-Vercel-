import React, { createContext, useContext, useRef } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { type PressState, focusRing, fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Brand } from '../common/Brand';
import { Icon, type IconName } from '../common/Icon';
import { ThemeToggle } from '../common/ThemeToggle';
import { useIsWide } from './Screen';

const ScrollToContext = createContext<(node: View | null) => void>(() => undefined);

/** Returns a function that scrolls the tab content so the given view sits at the top. */
export const useScrollTo = () => useContext(ScrollToContext);

export interface TabDef<K extends string> {
  key: K;
  label: string;
  icon: IconName;
  /** Dot on the icon: something here needs attention. */
  alert?: boolean;
}

/** Bottom tab bar on phones, side rail on wide screens. Tab state lives in the caller, not a route. */
export function TabShell<K extends string>({ tabs, tab, onSelect, children }: {
  tabs: TabDef<K>[];
  tab: K;
  onSelect: (k: K) => void;
  children: React.ReactNode;
}) {
  const wide = useIsWide();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const scrollTo = (node: View | null) => {
    if (!node || !contentRef.current) return;
    // Wait a frame so a section that just expanded has its final position.
    setTimeout(() => node.measureLayout(contentRef.current!, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }), () => undefined), 60);
  };

  const button = (t: TabDef<K>, rail?: boolean) => {
    const on = t.key === tab;
    return (
      <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onSelect(t.key)}
        android_ripple={{ color: colors.brandTint, borderless: !rail }}
        style={({ pressed, hovered, focused }: PressState) => [
          rail ? s.railTab : s.barTab,
          on && rail ? s.railTabOn : null,
          hovered && !on ? s.tabHover : null,
          pressed ? s.tabPress : null,
          focused ? focusRing(colors.focusRing) : null,
        ]}>
        {on && !rail ? <View style={s.barPip} /> : null}
        <View>
          <Icon name={t.icon} size={22} color={on ? colors.brandInk : colors.inkMuted} />
          {t.alert ? <View style={s.alertDot} /> : null}
        </View>
        <Text style={[s.tabLabel, on && s.tabLabelOn]}>{t.label}</Text>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={[s.root, wide && s.rootWide]}>
      {wide ? (
        <View style={s.rail}>
          <Brand />
          <View style={s.railTabs}>{tabs.map((t) => button(t, true))}</View>
          <View style={s.railFoot}>
            <ThemeToggle />
          </View>
        </View>
      ) : null}
      <ScrollView ref={scrollRef} style={s.main} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {wide ? null : <View style={s.phoneTop}><Brand /><ThemeToggle /></View>}
        <View ref={contentRef} style={s.content}><ScrollToContext.Provider value={scrollTo}>{children}</ScrollToContext.Provider></View>
      </ScrollView>
      {wide ? null : <View style={s.bar} accessibilityRole="tablist">{tabs.map((t) => button(t))}</View>}
    </KeyboardAvoidingView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  rootWide: { flexDirection: 'row' as const },
  rail: { width: 248, padding: 20, gap: 24, justifyContent: 'space-between' as const, backgroundColor: c.surfaceCard, shadowColor: c.brand900, shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.05, shadowRadius: 16 },
  railTabs: { flex: 1, gap: 4 },
  railTab: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 12 },
  tabHover: { backgroundColor: c.surfaceSunken },
  tabPress: { opacity: 0.7 },
  barPip: { position: 'absolute' as const, top: 0, width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: c.brand600 },
  railTabOn: { backgroundColor: c.brandTint },
  railFoot: { gap: 12, alignItems: 'flex-start' as const },
  main: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  phoneTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  content: { width: '100%' as const, maxWidth: 960, alignSelf: 'center' as const, gap: 16 },
  bar: { flexDirection: 'row' as const, backgroundColor: c.surfaceCard, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  barTab: { flex: 1, minHeight: 60, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 2 },
  alertDot: { position: 'absolute' as const, top: -2, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: c.harvestFill, borderWidth: 1.5, borderColor: c.surfaceCard },
  tabLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  tabLabelOn: { fontFamily: fonts.sansBold, color: c.brandInk },
});
