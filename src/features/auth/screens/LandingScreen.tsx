import React from 'react';
import { Text, View } from 'react-native';
import { Icon, type IconName } from '../../../components/common';
import { Screen, useIsWide } from '../../../components/layout';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { PriceBoard } from '../../farmer/components/PriceBoard';
import { EntryCard } from '../components/EntryCard';

const ABOUT: { icon: IconName; title: string; copy: string }[] = [
  {
    icon: 'package',
    title: 'Collected and graded',
    copy: 'An agent weighs and grades every consignment at the farm gate.',
  },
  {
    icon: 'shield',
    title: 'Cold all the way',
    copy: 'Produce is kept cold from collection to delivery, so it arrives fresh.',
  },
  {
    icon: 'wallet',
    title: 'Fair, fast payment',
    copy: 'Farmers are paid per consignment. Buyers pay one clear price.',
  },
];

const AUDIENCES: { icon: IconName; who: string; headline: string; points: string[] }[] = [
  {
    icon: 'leaf',
    who: 'For farmers',
    headline: 'Know your price before you harvest',
    points: [
      "See today's farm-gate prices",
      'List your crop in under a minute',
      'We collect it and pay you per consignment',
    ],
  },
  {
    icon: 'shield',
    who: 'For buyers',
    headline: 'Fresh, graded produce on demand',
    points: [
      'Browse available lots and live prices',
      'Every lot is weighed, graded and kept cold',
      'Order in bulk straight from the farm',
    ],
  },
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
      <Text style={[s.h1, wide && s.h1Wide]}>
        Fresh from the farm to your business, kept cold all the way.
      </Text>
      <Text style={s.lead}>
        CryoChain links farmers and buyers. Farmers see today&apos;s prices and sell without the
        middleman; buyers get graded, cold-chain produce. Sign in or create an account to start.
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
            <PriceBoard gradeAOnly />
          </View>
        </View>
      ) : (
        <>
          {intro}
          <PriceBoard gradeAOnly />
        </>
      )}

      {wide ? (
        <>
          <View style={s.grid}>
            {AUDIENCES.map((a) => (
              <View key={a.who} style={s.aud}>
                <View style={s.stepIcon}>
                  <Icon name={a.icon} size={20} color={colors.brandInk} />
                </View>
                <Text style={s.who}>{a.who}</Text>
                <Text style={s.stepTitle}>{a.headline}</Text>
                {a.points.map((p) => (
                  <View key={p} style={s.point}>
                    <Icon name="check" size={16} color={colors.brandInk} />
                    <Text style={s.stepCopy}>{p}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          <Text style={s.h2}>What is CryoChain?</Text>
          <Text style={s.lead}>
            A cold-chain marketplace that connects farmers directly to buyers, with every step
            handled and tracked.
          </Text>
          <View style={s.grid}>
            {ABOUT.map((st) => (
              <View key={st.title} style={s.step}>
                <View style={s.stepIcon}>
                  <Icon name={st.icon} size={20} color={colors.brandInk} />
                </View>
                <Text style={s.stepTitle}>{st.title}</Text>
                <Text style={s.stepCopy}>{st.copy}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  hero: {
    flexDirection: 'row' as const,
    gap: 48,
    alignItems: 'flex-start' as const,
    paddingTop: 16,
  },
  heroLeft: { flex: 1 },
  heroRight: { flex: 1.05 },
  intro: { gap: 16 },
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: c.surfaceCard,
    borderWidth: 1,
    borderColor: c.borderSubtle,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand500 },
  pillText: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.brandInk },
  h1: {
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: c.ink,
  },
  h1Wide: { fontSize: 48, lineHeight: 54, letterSpacing: -1.2 },
  lead: { fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 24, color: c.inkMuted },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 16 },
  aud: {
    flexGrow: 1,
    flexBasis: 300,
    gap: 10,
    padding: 24,
    borderRadius: 20,
    backgroundColor: c.surfaceCard,
    borderWidth: 1,
    borderColor: c.brand500,
  },
  who: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: c.brandInk,
  },
  point: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  h2: {
    fontFamily: fonts.heading,
    fontSize: 24,
    letterSpacing: -0.4,
    color: c.ink,
    textAlign: 'center' as const,
  },
  step: {
    flexGrow: 1,
    flexBasis: 260,
    gap: 8,
    padding: 20,
    borderRadius: 16,
    backgroundColor: c.surfaceCard,
    borderWidth: 1,
    borderColor: c.borderSubtle,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  stepTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  stepCopy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
