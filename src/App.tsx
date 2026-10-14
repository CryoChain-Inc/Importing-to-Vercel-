import React, { useEffect, useState } from 'react';
import { useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LoadingScreen } from './components/feedback';
import { LandingScreen } from './features/auth/screens/LandingScreen';
import { OnboardingScreen } from './features/auth/screens/OnboardingScreen';
import { RoleScreen } from './features/auth/screens/RoleScreen';
import { VerifyScreen, afterSignIn } from './features/auth/screens/VerifyScreen';
import { WorkspaceScreen } from './features/auth/screens/WorkspaceScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { NavigatorProvider, useNav } from './navigation';
import { toAccount } from './data/demoAuth';
import { authService } from './services/auth.service';
import { fetchFarmer } from './services/farmer.service';
import { isSupabaseConfigured } from './services/supabase';
import { fontFiles, ThemeProvider, useTheme } from './theme';

// Auth is Supabase (services/auth.service.ts); payout and review are still demo data.
function Routes() {
  const { route } = useNav();
  switch (route.name) {
    case 'landing':
      return <LandingScreen />;
    case 'verify':
      return <VerifyScreen route={route} />;
    case 'role':
      return <RoleScreen identifier={route.identifier} />;
    case 'onboarding':
      return <OnboardingScreen identifier={route.identifier} role={route.role} />;
    case 'workspace':
      return <WorkspaceScreen account={route.account} />;
    case 'home':
      return <HomeScreen account={route.account} role={route.role} />;
  }
}

function Shell() {
  const { colors, isDark } = useTheme();
  const { reset } = useNav();
  const [restoring, setRestoring] = useState(isSupabaseConfigured);

  // Resume a saved session so a reload doesn't send a signed-in user back to the login page.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    authService
      .getProfile()
      .then(async (p) => {
        if (!p) return;
        if (p.role === 'pending') return;
        // A farmer who left onboarding early resumes at the wizard.
        if (p.role === 'farmer' && !(await fetchFarmer())?.address) {
          reset({ name: 'onboarding', identifier: p.email ?? p.phone ?? '', role: 'farmer' });
          return;
        }
        reset(afterSignIn(toAccount(p)));
      })
      .catch(() => undefined)
      .finally(() => setRestoring(false));
  }, [reset]);

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
        <NavigatorProvider>
          <Shell />
        </NavigatorProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
