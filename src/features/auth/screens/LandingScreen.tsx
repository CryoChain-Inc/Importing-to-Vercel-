import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brand } from '../../../components/common/Brand';
import { ThemeToggle } from '../../../components/common/ThemeToggle';
import { useIsWide } from '../../../components/layout';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { EntryCard } from '../components/EntryCard';
import { StoryCarousel } from '../components/StoryCarousel';

const SHEET_OVERLAP = 28;
// Artwork left showing above the sheet while a field is in use.
const PEEK = 96;

export function LandingScreen() {
  const wide = useIsWide();
  const s = useThemedStyles(styles);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [sheetH, setSheetH] = useState(0);
  const [kb, setKb] = useState(0);
  const [lift] = useState(() => new Animated.Value(0));
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heroH = Math.max(360, Math.min(height * 0.56, 520));

  // The sheet is moved with a transform only, so nothing re-lays-out while the keyboard opens (that was the Android jitter).
  // Native: the keyboard events drive it once. Web has none, so field focus stands in, debounced across field switches.
  const go = useCallback(
    (open: boolean) => Animated.timing(lift, { toValue: open ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(),
    [lift],
  );
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Mobile browsers keep the field focused when the keyboard is dismissed, so no blur fires: lower the sheet when the viewport grows back.
      const vv = window.visualViewport;
      if (!vv) return;
      let full = vv.height;
      const onResize = () => {
        full = Math.max(full, vv.height);
        if (vv.height >= full - 80) {
          clearTimeout(blurTimer.current);
          go(false);
        }
      };
      vv.addEventListener('resize', onResize);
      return () => vv.removeEventListener('resize', onResize);
    }
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKb(e.endCoordinates.height);
      go(true);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => go(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [go]);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  const onFieldFocus = Platform.OS === 'web'
    ? (focused: boolean) => {
        clearTimeout(blurTimer.current);
        blurTimer.current = setTimeout(() => go(focused), focused ? 0 : 150);
      }
    : undefined;

  // Rise until the sheet's top sits PEEK below the status bar, but never so far that its bottom (the button) drops under the keyboard.
  const natural = heroH - SHEET_OVERLAP;
  const top = Math.min(natural, Math.max(insets.top + PEEK, height - (kb || 300) - sheetH));
  const rise = lift.interpolate({ inputRange: [0, 1], outputRange: [0, top - natural] });

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
    <View style={s.root}>
      <ScrollView style={s.root} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" bounces={false} overScrollMode="never">
        <View>
          <StoryCarousel style={{ height: heroH }} dotsBottom={SHEET_OVERLAP + 14} />
          <View pointerEvents="box-none" style={[s.topBar, { top: insets.top + 8 }]}>
            <ThemeToggle />
          </View>
        </View>
        <Animated.View onLayout={(e) => setSheetH(e.nativeEvent.layout.height)} style={[s.sheet, { transform: [{ translateY: rise }] }]}>
          <Text accessibilityRole="header" style={s.title}>Log in or sign up</Text>
          <EntryCard onFieldFocus={onFieldFocus} />
        </Animated.View>
      </ScrollView>
    </View>
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
