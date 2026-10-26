import React from 'react';
import { KeyboardAvoidingView, ScrollView, useWindowDimensions, View } from 'react-native';
import { useThemedStyles, type ColorToken } from '../../theme';
import { Gradient } from '../common/Gradient';
import { TopBar } from './TopBar';

export const WIDE = 960;
export const useIsWide = () => useWindowDimensions().width >= WIDE;

export interface ScreenProps {
  children: React.ReactNode;
  topRight?: React.ReactNode;
  /** Soft green backdrop that runs edge to edge, so wide windows aren't empty. */
  hero?: boolean;
  maxWidth?: number;
}

/** Full-bleed page, content centered in a capped column. Same content on phone and desktop. */
export function Screen({ children, topRight, hero, maxWidth = 1200 }: ScreenProps) {
  const s = useThemedStyles(styles);
  const wide = useIsWide();
  const pad = wide ? 40 : 16;
  return (
    <KeyboardAvoidingView style={s.root} behavior="padding">
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {hero ? <Gradient kind="tint" style={s.backdrop} /> : null}
        <View style={[s.col, { maxWidth, paddingHorizontal: pad, gap: wide ? 40 : 24 }]}>
          <TopBar right={topRight} />
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  scroll: { flexGrow: 1, paddingBottom: 48 },
  backdrop: { position: 'absolute' as const, top: 0, left: 0, right: 0, height: 560 },
  col: { width: '100%' as const, alignSelf: 'center' as const },
});
