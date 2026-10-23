import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { Account, Role } from '../types/auth';
import { verifyLinkStatus } from '../utils/verifyLink';

export type Route =
  | { name: 'landing' }
  | { name: 'ops' }
  | { name: 'emailVerified'; ok: boolean }
  | { name: 'verify'; identifier: string; kind: 'otp' }
  | { name: 'role'; identifier: string }
  | { name: 'workspace'; account: Account }
  | { name: 'home'; account: Account; role: Role };

interface Nav {
  route: Route;
  canGoBack: boolean;
  push: (r: Route) => void;
  /** Replace the whole history, e.g. after sign-in so Back doesn't return to the OTP page. */
  reset: (r: Route) => void;
  back: () => void;
}

const Ctx = createContext<Nav | null>(null);
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
// Params live in memory, so a deep link never lands signed in: /ops and /ops/* go to the ops login, anything else to the landing page.
const START: Route = !isWeb
  ? { name: 'landing' }
  : /^\/ops(\/|$)/.test(window.location.pathname)
    ? { name: 'ops' }
    : window.location.pathname === '/email-verified' && verifyLinkStatus(window.location.href)
      ? { name: 'emailVerified', ok: verifyLinkStatus(window.location.href) === 'ok' }
      : { name: 'landing' };
const PATH: Record<Route['name'], string> = { landing: '/', ops: '/ops', emailVerified: '/email-verified', verify: '/verify', role: '/role', workspace: '/workspace', home: '/home' };

/**
 * Route stack mirrored into the browser history on web (URL changes, Back/Forward work)
 * and into the hardware Back button on Android.
 * shortcut: params live in memory, so a reload on a deep URL returns to the landing page.
 */
export function NavigatorProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([START]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useEffect(() => {
    if (isWeb) window.history.replaceState({ idx: 0 }, '', PATH[START.name]);
  }, []);

  const push = useCallback((r: Route) => {
    const next = [...stackRef.current, r];
    setStack(next);
    if (isWeb) window.history.pushState({ idx: next.length - 1 }, '', PATH[r.name]);
  }, []);

  const reset = useCallback((r: Route) => {
    setStack([r]);
    if (isWeb) window.history.replaceState({ idx: 0 }, '', PATH[r.name]);
  }, []);

  const back = useCallback(() => {
    if (stackRef.current.length < 2) return;
    if (isWeb) window.history.back(); // popstate below trims the stack
    else setStack((s) => s.slice(0, -1));
  }, []);

  useEffect(() => {
    if (isWeb) {
      const onPop = (e: PopStateEvent) => {
        const idx: number = e.state?.idx ?? 0;
        setStack((s) => (idx < s.length ? s.slice(0, idx + 1) : s));
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stackRef.current.length < 2) return false; // let Android leave the app
      setStack((s) => s.slice(0, -1));
      return true;
    });
    return () => sub.remove();
  }, []);

  const value: Nav = { route: stack[stack.length - 1], canGoBack: stack.length > 1, push, reset, back };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav must be used inside NavigatorProvider');
  return v;
}
