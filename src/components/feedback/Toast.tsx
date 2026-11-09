import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { Icon } from '../common';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, useTheme } from '../../theme';

export type ToastTone = 'error' | 'success';
export interface ToastAction { label: string; onPress: () => void }

interface ToastItem {
  id: number;
  stamp: number;
  text: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastApi {
  show: (text: string, tone?: ToastTone, action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/** Slide-in notices. Call from anywhere under this provider. */
export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('Toast is not available.');
  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();
  // Edge-to-edge Android doesn't resize for the keyboard, so lift the snackbar above it ourselves.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (!android) return;
    const a = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { a.remove(); b.remove(); };
  }, []);
  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((item) => item.id !== id));
  }, []);
  const show = useCallback((text: string, tone: ToastTone = 'error', action?: ToastAction) => {
    const message = text.trim();
    if (!message) return;
    setItems((list) => {
      // The same notice again restarts the visible one (new stamp) instead of being dropped, so a repeat failure is never silent.
      if (list.some((item) => item.text === message && item.tone === tone)) {
        return list.map((item) => (item.text === message && item.tone === tone ? { ...item, stamp: item.stamp + 1 } : item));
      }
      return [...list, { id: ++seq.current, stamp: 0, text: message, tone, action }].slice(-3);
    });
  }, []);

  return (
    <Ctx.Provider value={{ show, dismiss }}>
      <View style={{ flex: 1 }}>
        {children}
        <View style={android ? [host, { top: undefined, bottom: kb > 0 ? kb + 36 : insets.bottom + 84, left: 12, right: 12, width: undefined, maxWidth: undefined }] : host}>
          {items.map((item) => <ToastCard key={item.id} item={item} />)}
        </View>
      </View>
    </Ctx.Provider>
  );
}

const native = Platform.OS !== 'web';
const android = Platform.OS === 'android';

// Android snackbar palette: deep cold-chain green in both themes so it reads as the brand, not a system dialog.
const SNACK = { bg: '#0f2a1e', edge: 'rgba(255,255,255,0.08)', text: '#eef6f0', ok: '#6fe0a0', err: '#ffb0a6' };

function ToastCard({ item }: { item: ToastItem }) {
  const { dismiss } = useToast();
  const { colors } = useTheme();
  const success = item.tone === 'success';
  const duration = success ? 4200 : 7000;
  const accent = android ? (success ? SNACK.ok : SNACK.err) : success ? colors.brand500 : colors.dangerFill;
  const ink = success ? colors.brandInk : colors.dangerInk;
  const [enter] = useState(() => new Animated.Value(0));
  const [clock] = useState(() => new Animated.Value(1));
  const [nudge] = useState(() => new Animated.Value(0));
  const close = useCallback(() => dismiss(item.id), [dismiss, item.id]);

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, damping: 18, stiffness: 220, mass: 0.8, useNativeDriver: native }).start();
  }, [enter]);

  // Runs on mount and again whenever the same notice is repeated.
  useEffect(() => {
    clock.setValue(1);
    const run = Animated.timing(clock, { toValue: 0, duration, easing: Easing.linear, useNativeDriver: native });
    run.start(({ finished }) => finished && close());
    if (item.stamp > 0) {
      nudge.setValue(1);
      Animated.spring(nudge, { toValue: 0, damping: 6, stiffness: 300, useNativeDriver: native }).start();
    }
    return () => run.stop();
  }, [item.stamp, duration, clock, nudge, close]);

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [android ? 24 : -16, 0] }) },
          { translateX: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
        ],
        borderRadius: android ? 14 : 16,
        overflow: 'hidden',
        backgroundColor: android ? SNACK.bg : colors.surfaceRaised,
        borderWidth: 1,
        borderColor: android ? SNACK.edge : colors.borderSubtle,
        shadowColor: '#0b1f14',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
        elevation: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 8 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}${android ? '2e' : '26'}` }}>
          {success ? (
            <Icon name="check" size={16} color={android ? accent : ink} strokeWidth={2.6} />
          ) : (
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, lineHeight: 20, color: android ? accent : ink }}>!</Text>
          )}
        </View>
        <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: android ? SNACK.text : colors.ink }}>{item.text}</Text>
        {item.action ? (
          <Pressable
            onPress={() => { close(); item.action?.onPress(); }}
            hitSlop={8}
            accessibilityRole="button"
            android_ripple={android ? { color: `${accent}33`, borderless: false } : undefined}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: android ? accent : ink }}>{item.action.label}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" style={{ padding: 6 }}>
            <Icon name="close" size={16} color={android ? SNACK.text : colors.inkMuted} />
          </Pressable>
        )}
      </View>
      <Animated.View
        style={{ height: 3, backgroundColor: accent, opacity: 0.7, transform: [{ scaleX: clock }], transformOrigin: 'left' } as object}
      />
    </Animated.View>
  );
}

const host = {
  position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
  top: Platform.OS === 'web' ? 20 : 56,
  right: 16,
  width: 360,
  maxWidth: '92%' as const,
  zIndex: 80,
  gap: 8,
  pointerEvents: 'box-none' as const,
};
