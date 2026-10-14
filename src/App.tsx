import React, { useEffect, useState } from 'react';
import { useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LoadingScreen } from './components/feedback';
import { LandingScreen } from './features/auth/screens/LandingScreen';
import { OnboardingScreen } from './features/auth/screens/OnboardingScreen';
import { RoleScreen } from './features/auth/screens/RoleScreen';
import { VerifyScreen } from './features/auth/screens/VerifyScreen';
import { WorkspaceScreen } from './features/auth/screens/WorkspaceScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { NavigatorProvider, useNav } from './navigation';
import { fetchMyProfile, toAccount } from './services/farmer.service';
import { isSupabaseConfigured, supabase } from './services/supabase';
import { fontFiles, ThemeProvider, useTheme } from './theme';

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

function SessionGate() {
  const { reset } = useNav();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!isSupabaseConfigured) return;
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const profile = await fetchMyProfile();
        if (profile?.displayName && (profile.role === 'farmer' || profile.role === 'pending')) {
          reset({ name: 'home', account: toAccount(profile), role: 'farmer' });
        }
      } catch {
        // A failed session check leaves the farmer on the landing page.
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [reset]);

  if (!ready) return <LoadingScreen message="Loading CryoChain..." />;
  return <Routes />;
}

function Shell() {
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgApp }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SessionGate />
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
