import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import type { Account, Role } from '../types/auth';
import { paymentReturnReference } from '../utils/paymentReturn';
import { verifyLinkStatus } from '../utils/verifyLink';

export type Route =
  | { name: 'landing' }
  | { name: 'ops' }
  | { name: 'emailVerified'; ok: boolean }
  | { name: 'paymentResult'; reference: string }
  | { name: 'verify'; identifier: string; kind: 'otp' }
  | { name: 'role'; identifier: string }
  | { name: 'workspace'; account: Account }
  | { name: 'home'; account: Account; role: Role; tab?: string };

interface Nav {
  route: Route;
  canGoBack: boolean;
  push: (r: Route) => void;
  /** Replace the whole history, e.g. after sign-in so Back doesn't return to the OTP page. */
  reset: (r: Route) => void;
  /** Update the signed-in person on the current screen without leaving it. */
  patchAccount: (patch: Partial<Account>) => void;
  back: () => void;
}

const Ctx = createContext<Nav | null>(null);
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
// Params live in memory, so a deep link never lands signed in: /ops and /ops/* go to the ops login, anything else to the landing page.
const START: Route = !isWeb
  ? { name: 'landing' }
  : /^\/ops(\/|$)/.test(window.location.pathname) || window.location.hostname.startsWith('ops.')
    ? { name: 'ops' }
    : window.location.pathname === '/email-verified' && verifyLinkStatus(window.location.href)
      ? { name: 'emailVerified', ok: verifyLinkStatus(window.location.href) === 'ok' }
      : window.location.pathname === '/payment/verify' && paymentReturnReference(window.location.href)
        ? { name: 'paymentResult', reference: paymentReturnReference(window.location.href)! }
        : { name: 'landing' };
const PATH: Record<Route['name'], string> = { landing: '/', ops: '/ops', emailVerified: '/email-verified', paymentResult: '/payment/verify', verify: '/verify', role: '/role', workspace: '/workspace', home: '/home' };
/** The ops console owns its URL (/ops/<section>?page=2), so entering it, or reloading on a deep link, keeps the address as is. */
const pathFor = (r: Route) => (r.name === 'home' && r.role === 'ops' ? window.location.pathname + window.location.search : PATH[r.name]);

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
    if (isWeb) window.history.replaceState({ idx: 0 }, '', START.name === 'ops' ? window.location.pathname + window.location.search : PATH[START.name]);
  }, []);

  const push = useCallback((r: Route) => {
    const next = [...stackRef.current, r];
    setStack(next);
    if (isWeb) window.history.pushState({ idx: next.length - 1 }, '', pathFor(r));
  }, []);

  const reset = useCallback((r: Route) => {
    setStack([r]);
    if (isWeb) window.history.replaceState({ idx: 0 }, '', pathFor(r));
  }, []);

  const patchAccount = useCallback((patch: Partial<Account>) => {
    setStack((s) => {
      const i = s.length - 1;
      const top = s[i];
      if (!top || (top.name !== 'home' && top.name !== 'workspace')) return s;
      const account = { ...top.account, ...patch };
      if (account.name === top.account.name && account.phone === top.account.phone && account.email === top.account.email) return s;
      const next = s.slice();
      next[i] = { ...top, account };
      return next;
    });
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

  const value: Nav = { route: stack[stack.length - 1], canGoBack: stack.length > 1, push, reset, patchAccount, back };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav must be used inside NavigatorProvider');
  return v;
}
