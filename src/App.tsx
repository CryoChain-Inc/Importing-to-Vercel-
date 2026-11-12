import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoadingScreen, ToastProvider, WelcomeDialog } from './components/feedback';
import { PaymentResultScreen } from './features/buyer/screens/PaymentResultScreen';
import { EmailVerifiedScreen } from './features/auth/screens/EmailVerifiedScreen';
import { LandingScreen } from './features/auth/screens/LandingScreen';
import { OpsLoginScreen } from './features/auth/screens/OpsLoginScreen';
import { RoleScreen } from './features/auth/screens/RoleScreen';
import { VerifyScreen, afterSignIn } from './features/auth/screens/VerifyScreen';
import { WorkspaceScreen } from './features/auth/screens/WorkspaceScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { NavigatorProvider, useNav } from './navigation';
import { toAccount } from './data/demoAuth';
import { authService } from './services/auth.service';
import { isSupabaseConfigured, supabase } from './services/supabase';
import { onPaymentReturn } from './services/checkout';
import { paymentReturnReference } from './utils/paymentReturn';
import { verifyLinkStatus } from './utils/verifyLink';
import { fontFiles, ThemeProvider, useTheme } from './theme';
import { PostHogProvider } from 'posthog-react-native';
import { posthog } from './config/posthog';

// Lazy so the farmer screens stay out of the main bundle for every other role.
const ProduceDetail = lazy(() => import('./features/farmer/screens/ProduceDetail').then((m) => ({ default: m.ProduceDetail })));

// Auth is Supabase (services/auth.service.ts); payout and review are still demo data.
function Routes() {
  const { route } = useNav();
  switch (route.name) {
    case 'landing':
      return <LandingScreen />;
    case 'ops':
      return <OpsLoginScreen />;
    case 'emailVerified':
      return <EmailVerifiedScreen ok={route.ok} />;
    case 'paymentResult':
      return <PaymentResultScreen reference={route.reference} />;
    case 'verify':
      return <VerifyScreen route={route} />;
    case 'role':
      return <RoleScreen />;
    case 'workspace':
      return <WorkspaceScreen account={route.account} />;
    case 'produce':
      return (
        <Suspense fallback={<LoadingScreen message="Loading..." />}>
          <ProduceDetail account={route.account} product={route.product} />
        </Suspense>
      );
    case 'home':
      return <HomeScreen account={route.account} role={route.role} tab={route.tab} />;
  }
}

function Shell() {
  const { colors, isDark } = useTheme();
  const { route, reset } = useNav();
  const [restoring, setRestoring] = useState(isSupabaseConfigured);
  const [startedOnVerified] = useState(route.name === 'emailVerified' || route.name === 'paymentResult');
  const identifiedAccountId = useRef<string | null>(null);

  // Resume a saved session so a reload doesn't send a signed-in user back to the login page.
  // The emailed confirmation link (web path or app deep link) shows its own screen instead.
  useEffect(() => {
    const resume = async () => {
      const link = await Linking.getInitialURL();
      if (startedOnVerified) return;
      const paid = link?.includes('payment/verify') ? paymentReturnReference(link) : null;
      if (paid) return reset({ name: 'paymentResult', reference: paid });
      const status = verifyLinkStatus(link);
      if (status) return reset({ name: 'emailVerified', ok: status === 'ok' });
      // A flaky network on launch must not look like a sign-out: the saved session is still valid, so retry before giving up.
      let p = null;
      for (let i = 0; ; i++) {
        try { p = await authService.getProfile(); break; } catch (e) {
          if (i === 3) throw e;
          await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
      }
      if (p && p.role !== 'pending') reset(afterSignIn(toAccount(p)));
    };
    if (!isSupabaseConfigured) return;
    resume().catch(() => undefined).finally(() => setRestoring(false));
    const sub = Linking.addEventListener('url', (e) => {
      const paid = e.url.includes('payment/verify') ? paymentReturnReference(e.url) : null;
      if (paid) return reset({ name: 'paymentResult', reference: paid });
      const status = verifyLinkStatus(e.url);
      if (status) reset({ name: 'emailVerified', ok: status === 'ok' });
    });
    const off = onPaymentReturn((reference) => reset({ name: 'paymentResult', reference }));
    return () => { sub.remove(); off(); };
  }, [reset, startedOnVerified]);

  // supabase-js has no foreground timer on native: refresh only while the app is active.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sub = AppState.addEventListener('change', (st) => (st === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
    supabase.auth.startAutoRefresh();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        posthog?.reset();
        identifiedAccountId.current = null;
      }
      if (__DEV__) console.log('auth', event);
    });
    return () => { sub.remove(); data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { posthog?.screen(route.name); }, [route.name]);

  // Identifies only after auth has returned the stable Supabase profile id. The SDK
  // then persists this identity for lifecycle events, captures, and exceptions.
  const account = route.name === 'home' || route.name === 'workspace' ? route.account : null;
  useEffect(() => {
    if (!account || !posthog || identifiedAccountId.current === account.id) return;

    posthog.identify(account.id, {
      $set: {
        role: account.roles[0],
        account_status: account.status,
        is_staff: account.staff,
        ...(account.name ? { name: account.name } : {}),
        ...(account.email ? { email: account.email } : {}),
        ...(account.phone ? { phone: account.phone } : {}),
      },
    });
    identifiedAccountId.current = account.id;
  }, [account]);

  // Greets each account once per device, right after its first sign-in or sign-up.
  const [welcome, setWelcome] = useState<string | null>(null);
  useEffect(() => {
    if (!account) return;
    const key = `welcomed:${account.id}`;
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (seen) return;
        setWelcome(account.name?.split(' ')[0] ?? '');
        return AsyncStorage.setItem(key, '1');
      })
      .catch(() => undefined);
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (restoring) return <LoadingScreen message="Loading CryoChain..." />;
  return (
    <SafeAreaView role="main" style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Routes />
      {welcome !== null ? <WelcomeDialog name={welcome} onClose={() => setWelcome(null)} /> : null}
    </SafeAreaView>
  );
}

export default function V1App() {
  const [fontsReady] = useFonts(fontFiles);
  // Web paints straight away and swaps fonts in; native keeps the splash until they load.
  if (!fontsReady && Platform.OS !== 'web') return <LoadingScreen message="Loading CryoChain..." />;
  const app = (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <NavigatorProvider>
            <Shell />
          </NavigatorProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );

  return posthog ? <PostHogProvider client={posthog}>{app}</PostHogProvider> : app;
}
