import React from 'react';
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
import { fontFiles, ThemeProvider, useTheme } from './theme';

// Demo-data build: no backend. Auth lives in data/demoAuth.ts and swaps for Supabase later.
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
