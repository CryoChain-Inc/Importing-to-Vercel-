import React from 'react';
import { KeyboardAvoidingView, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Gradient } from '../common/Gradient';
import { Icon, type IconName } from '../common/Icon';
import { ThemeToggle } from '../common/ThemeToggle';
import { Brand } from '../common/Brand';
import { Pressable } from 'react-native';
import { useNav } from '../../navigation';
import { WIDE } from './Screen';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'leaf', text: 'Daily farm-gate prices, published every morning' },
  { icon: 'package', text: 'Every consignment weighed, graded and traceable' },
  { icon: 'shield', text: 'Paid per consignment, straight to your mobile wallet' },
];

/** Auth steps: brand panel beside the form on desktop, form only on phones. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const wide = useWindowDimensions().width >= WIDE;
  const { colors } = useTheme();
  const { canGoBack, back } = useNav();
  const s = useThemedStyles(styles);

  const form = (
    <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
      <View style={s.formCol}>
        <View style={s.bar}>
          {canGoBack ? (
            <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={s.back}>
              <Icon name="arrowLeft" size={20} color={colors.ink} />
            </Pressable>
          ) : <View />}
          <ThemeToggle />
        </View>
        {wide ? null : <Brand />}
        <View style={s.head}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior="padding">
      {wide ? (
        <View style={s.split}>
          <Gradient kind="card" style={s.panel}>
            <View style={s.panelInner}>
              <Brand size={44} light />
              <View style={s.panelBody}>
                <Text style={s.panelTitle}>Cold from the farm gate to your door.</Text>
                {POINTS.map((p) => (
                  <View key={p.text} style={s.point}>
                    <View style={s.pointIcon}><Icon name={p.icon} size={18} color={'#ffffff'} /></View>
                    <Text style={s.pointText}>{p.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Gradient>
          <View style={s.formSide}>{form}</View>
        </View>
      ) : (
        form
      )}
    </KeyboardAvoidingView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  split: { flex: 1, flexDirection: 'row' as const },
  panel: { flex: 1 },
  panelInner: { flex: 1, padding: 48, justifyContent: 'space-between' as const },
  panelBody: { gap: 24, maxWidth: 480 },
  panelTitle: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: '#ffffff' },
  point: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  pointIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.16)' },
  pointText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 22, color: '#ffffff' },
  formSide: { flex: 1 },
  formScroll: { flexGrow: 1, justifyContent: 'center' as const, padding: 16 },
  formCol: { width: '100%' as const, maxWidth: 440, alignSelf: 'center' as const, gap: 20, paddingVertical: 8 },
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  back: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  head: { gap: 6 },
  title: { fontFamily: fonts.sansBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: c.ink },
  subtitle: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: c.inkMuted },
});
