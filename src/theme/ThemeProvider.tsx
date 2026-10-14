import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorToken } from './colors';
import { darkGradients, lightGradients } from './gradients';

type Mode = 'light' | 'dark';
type Palette = Record<ColorToken, string>;

interface ThemeValue {
  mode: Mode;
  isDark: boolean;
  colors: Palette;
  gradients: typeof lightGradients;
  toggle: () => void;
}

const KEY = 'cryochain.v1.theme';
const Ctx = createContext<ThemeValue | null>(null);

/** Follows the OS until the user flips the toggle; their choice is then remembered. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<Mode | null>(null);
  const mode: Mode = override ?? (system === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => (v === 'light' || v === 'dark') && setOverride(v))
      .catch(() => undefined);
  }, []);

  const toggle = useCallback(() => {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    setOverride(next);
    AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, [mode]);

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      isDark: mode === 'dark',
      colors: mode === 'dark' ? darkColors : lightColors,
      gradients: mode === 'dark' ? darkGradients : lightGradients,
      toggle,
    }),
    [mode, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}

/** Pass a module-level factory so styles are rebuilt only when the theme flips. */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Palette) => T) {
  const { colors } = useTheme();
  return useMemo(() => StyleSheet.create(factory(colors)), [factory, colors]);
}
