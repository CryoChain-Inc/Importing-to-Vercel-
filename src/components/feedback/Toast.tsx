import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Icon } from '../common';
import { fonts, useTheme } from '../../theme';

export type ToastTone = 'error' | 'success';

interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (text: string, tone?: ToastTone) => void;
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
  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((item) => item.id !== id));
  }, []);
  const show = useCallback((text: string, tone: ToastTone = 'error') => {
    const message = text.trim();
    if (!message) return;
    setItems((list) => {
      if (list.some((item) => item.text === message && item.tone === tone)) return list;
      const next = { id: ++seq.current, text: message, tone };
      return [...list, next].slice(-4);
    });
  }, []);

  return (
    <Ctx.Provider value={{ show, dismiss }}>
      <View style={{ flex: 1 }}>
        {children}
        <View style={host}>
          {items.map((item) => <ToastCard key={item.id} item={item} />)}
        </View>
      </View>
    </Ctx.Provider>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const { dismiss } = useToast();
  const { colors } = useTheme();
  const success = item.tone === 'success';
  const close = useCallback(() => dismiss(item.id), [dismiss, item.id]);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    const timer = setTimeout(close, success ? 4200 : 6000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [close, success]);

  return (
    <View
      accessibilityRole="alert"
      style={{
        transform: [{ translateX: entered ? 0 : 80 }],
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 10,
        borderRadius: 14,
        backgroundColor: colors.surfaceRaised,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        borderLeftWidth: 4,
        borderLeftColor: success ? colors.brand500 : colors.dangerFill,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
        elevation: 8,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: success ? colors.brand500 : colors.dangerFill }} />
      <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: colors.ink }}>{item.text}</Text>
      <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Icon name="close" size={16} color={colors.inkMuted} />
      </Pressable>
    </View>
  );
}

const host = {
  position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
  top: 20,
  right: 20,
  width: 320,
  maxWidth: '92%' as const,
  zIndex: 80,
  gap: 8,
  pointerEvents: 'box-none' as const,
};
