import React from 'react';
import { KeyboardAvoidingView, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand } from '../../../components/common/Brand';
import { ThemeToggle } from '../../../components/common/ThemeToggle';
import { useIsWide } from '../../../components/layout';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { EntryCard } from '../components/EntryCard';
import { StoryCarousel } from '../components/StoryCarousel';

const SHEET_OVERLAP = 28;

export function LandingScreen() {
  const wide = useIsWide();
  const s = useThemedStyles(styles);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (wide) {
    return (
      <View style={s.root}>
        <View style={s.wideCol}>
          <View style={s.wideForm}>
            <View style={s.wideBar}><Brand /><ThemeToggle /></View>
            <View style={s.wideBody}>
              <Text accessibilityRole="header" style={s.h1Wide}>Fresh from the farm to your business, kept cold all the way.</Text>
              <Text style={s.lead}>Log in or sign up to start. New here? We set up your account with your first code.</Text>
              <EntryCard />
            </View>
          </View>
          <StoryCarousel style={s.wideHero} dotsBottom={28} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior="padding">
      <ScrollView style={s.root} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" bounces={false} overScrollMode="never">
        <View>
          <StoryCarousel style={{ height: Math.max(360, Math.min(height * 0.56, 520)) }} dotsBottom={SHEET_OVERLAP + 14} />
          <View pointerEvents="box-none" style={[s.topBar, { top: insets.top + 8 }]}>
            <ThemeToggle />
          </View>
        </View>
        <View style={s.sheet}>
          <Text accessibilityRole="header" style={s.title}>Log in or sign up</Text>
          <EntryCard />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  scroll: { flexGrow: 1 },
  topBar: { position: 'absolute' as const, right: 16 },
  sheet: {
    flexGrow: 1,
    marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: c.bgApp,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    gap: 16,
  },
  title: { fontFamily: fonts.sansBold, fontSize: 18, lineHeight: 24, color: c.inkMuted, textAlign: 'center' as const },
  wideCol: { flex: 1, flexDirection: 'row' as const, width: '100%' as const, maxWidth: 1280, alignSelf: 'center' as const, padding: 32, gap: 64 },
  wideForm: { flex: 1, justifyContent: 'space-between' as const, paddingVertical: 8 },
  wideBody: { gap: 20, maxWidth: 460, paddingBottom: 24 },
  h1Wide: { fontFamily: fonts.heading, fontSize: 44, lineHeight: 48, letterSpacing: -1.3, color: c.ink },
  lead: { fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 24, color: c.inkMuted },
  wideHero: { flex: 1, minHeight: 560, borderRadius: 32 },
  wideBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
});
