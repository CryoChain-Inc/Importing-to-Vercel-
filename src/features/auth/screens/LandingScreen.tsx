import React, { useEffect, useState } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Icon, type IconName } from '../../../components/common';
import { TopBar, useIsWide } from '../../../components/layout';
import { FOOD_ASSETS } from '../../../assets/food';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { EntryCard } from '../components/EntryCard';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'package', text: 'Weighed and graded at the farm gate' },
  { icon: 'shield', text: 'Kept cold from collection to delivery' },
  { icon: 'wallet', text: 'Farmers paid per consignment' },
];

// The artwork is 2:3 with the van in its lower half; keep that band in view at any crop.
const PHOTO_MIN = 240;
const IMG_RATIO = 1.5;
const FOCUS = 0.68;

function Photo({ wide }: { wide: boolean }) {
  const s = useThemedStyles(styles);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const imgH = box.w * IMG_RATIO;
  const top = Math.min(0, Math.max(box.h - imgH, box.h * 0.55 - imgH * FOCUS));
  return (
    <View style={[s.photo, wide ? s.photoWide : s.photoNarrow]} onLayout={onLayout}>
      {box.w > 0 ? (
        <Image
          source={FOOD_ASSETS.coldChainTrackingHero}
          accessibilityLabel="A refrigerated van carrying fresh vegetables along a glowing route between farms"
          style={{ position: 'absolute', left: 0, width: box.w, height: imgH, top }}
        />
      ) : null}
      {wide ? (
        <>
          <Svg style={s.scrim} width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.55" stopColor="#050806" stopOpacity="0" />
                <Stop offset="1" stopColor="#050806" stopOpacity="0.9" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#scrim)" />
          </Svg>
          <View style={s.points}>
            {POINTS.map((p) => (
              <View key={p.text} style={s.point}>
                <Icon name={p.icon} size={18} color="#7cf0a8" />
                <Text style={s.pointText}>{p.text}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** True while the keyboard is up; the form card then rides up over the artwork. */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const on = (v: boolean) => () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOpen(v);
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', on(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', on(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

export function LandingScreen() {
  const wide = useIsWide();
  const typing = useKeyboardOpen();
  const s = useThemedStyles(styles);

  const headline = (
    <Text style={[s.h1, wide && s.h1Wide]}>
      Fresh from the farm to your business, kept cold all the way.
    </Text>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.root}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        <View style={[s.col, wide && s.colWide]}>
          <TopBar />
          {wide ? (
            <View style={s.split}>
              <View style={s.left}>
                {headline}
                <Text style={s.lead}>
                  CryoChain links farmers and buyers. Sign in or create an account to start.
                </Text>
                <EntryCard />
              </View>
              <Photo wide />
            </View>
          ) : (
            <>
              {headline}
              <Photo wide={false} />
              <View style={[s.cardLift, typing && s.cardLifted]}>
                <EntryCard />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  scroll: { flexGrow: 1 },
  col: {
    flex: 1,
    width: '100%' as const,
    maxWidth: 1200,
    alignSelf: 'center' as const,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
  },
  colWide: { paddingHorizontal: 40, paddingBottom: 40, gap: 24 },
  split: { flex: 1, flexDirection: 'row' as const, gap: 56, minHeight: 520 },
  left: { flex: 1, justifyContent: 'center' as const, gap: 20, maxWidth: 520 },
  h1: {
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.6,
    color: c.ink,
  },
  h1Wide: { fontSize: 48, lineHeight: 52, letterSpacing: -1.4 },
  lead: { fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 24, color: c.inkMuted },
  photo: { overflow: 'hidden' as const, backgroundColor: '#0b0f0d' },
  photoNarrow: { flex: 1, minHeight: PHOTO_MIN, borderRadius: 20 },
  cardLift: { zIndex: 1 },
  cardLifted: { marginTop: -PHOTO_MIN / 2 },
  photoWide: { flex: 1.1, borderRadius: 32 },
  scrim: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  points: { position: 'absolute' as const, left: 28, right: 28, bottom: 28, gap: 10 },
  point: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  pointText: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: '#f1f5f2' },
});
