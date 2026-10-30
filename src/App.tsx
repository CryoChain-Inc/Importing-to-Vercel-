import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LoadingScreen, ToastProvider } from './components/feedback';
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
import { isSupabaseConfigured } from './services/supabase';
import { onPaymentReturn } from './services/checkout';
import { paymentReturnReference } from './utils/paymentReturn';
import { verifyLinkStatus } from './utils/verifyLink';
import { fontFiles, ThemeProvider, useTheme } from './theme';

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
    case 'home':
      return <HomeScreen account={route.account} role={route.role} tab={route.tab} />;
  }
}

function Shell() {
  const { colors, isDark } = useTheme();
  const { route, reset } = useNav();
  const [restoring, setRestoring] = useState(isSupabaseConfigured);
  const [startedOnVerified] = useState(route.name === 'emailVerified' || route.name === 'paymentResult');

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
      const p = await authService.getProfile();
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

  if (restoring) return <LoadingScreen message="Loading CryoChain..." />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Routes />
    </SafeAreaView>
  );
}

export default function V1App() {
  const [fontsReady] = useFonts(fontFiles);
  if (!fontsReady) return <LoadingScreen message="Loading CryoChain..." />;
  return (
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
}
