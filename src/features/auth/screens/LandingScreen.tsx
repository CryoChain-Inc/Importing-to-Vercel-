import React from 'react';
import { Text, View } from 'react-native';
import { Icon, type IconName } from '../../../components/common';
import { Screen, useIsWide } from '../../../components/layout';
import { DEMO_HINT } from '../../../data/accounts';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { PriceBoard } from '../../farmer/components/PriceBoard';
import { EntryCard } from '../components/EntryCard';

const STEPS: { icon: IconName; title: string; copy: string }[] = [
  { icon: 'leaf', title: 'List what you will harvest', copy: 'Tell us the crop and rough quantity. It takes under a minute.' },
  { icon: 'package', title: 'We weigh, grade and collect', copy: 'An agent measures every consignment at your collection point.' },
  { icon: 'wallet', title: 'Get paid per consignment', copy: 'Payment goes straight to your mobile wallet.' },
];

export function LandingScreen() {
  const wide = useIsWide();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);

  const intro = (
    <View style={s.intro}>
      <View style={s.pill}>
        <View style={s.dot} />
        <Text style={s.pillText}>Live prices · updated every morning</Text>
      </View>
      <Text style={[s.h1, wide && s.h1Wide]}>Today's farm-gate prices, before you harvest.</Text>
      <Text style={s.lead}>
        See what your crop is worth today, then list it with CryoChain. We collect it cold and pay you per consignment.
      </Text>
      <EntryCard />
    </View>
  );

  return (
    <Screen hero>
      {wide ? (
        <View style={s.hero}>
          <View style={s.heroLeft}>{intro}</View>
          <View style={s.heroRight}>
            <PriceBoard />
          </View>
        </View>
      ) : (
        <>
          {intro}
          <PriceBoard />
        </>
      )}

      <View style={s.steps}>
        {STEPS.map((st, i) => (
          <View key={st.title} style={s.step}>
            <View style={s.stepIcon}>
              <Icon name={st.icon} size={20} color={colors.brandInk} />
            </View>
            <Text style={s.stepTitle}>{i + 1}. {st.title}</Text>
            <Text style={s.stepCopy}>{st.copy}</Text>
          </View>
        ))}
      </View>

      <View style={s.footer}>
        <Text style={s.footText}>Buying produce? Sign in or create a business account to see available lots and prices.</Text>
        <Text style={s.footText}>{DEMO_HINT}</Text>
      </View>
    </Screen>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  hero: { flexDirection: 'row' as const, gap: 48, alignItems: 'flex-start' as const, paddingTop: 16 },
  heroLeft: { flex: 1 },
  heroRight: { flex: 1.05 },
  intro: { gap: 16 },
  pill: { flexDirection: 'row' as const, alignItems: 'center' as const, alignSelf: 'flex-start' as const, gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.borderSubtle },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand500 },
  pillText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.brandInk },
  h1: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, color: c.ink },
  h1Wide: { fontSize: 48, lineHeight: 54, letterSpacing: -1.2 },
  lead: { fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 24, color: c.inkMuted },
  steps: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 16 },
  step: { flexGrow: 1, flexBasis: 260, gap: 8, padding: 20, borderRadius: 16, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.borderSubtle },
  stepIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  stepTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  stepCopy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  footer: { gap: 6, alignItems: 'center' as const },
  footText: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 18, color: c.inkMuted, textAlign: 'center' as const },
});
