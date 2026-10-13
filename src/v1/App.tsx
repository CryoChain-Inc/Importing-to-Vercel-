import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from './theme';
import { authService, type UserProfile } from './services/auth.service';
import { LoginScreen } from './features/auth/screens/LoginScreen';
import { BuyerCatalogScreen } from './features/buyer/screens/BuyerCatalogScreen';
import { LoadingScreen } from './components/feedback';
import type { Session } from '@supabase/supabase-js';

export default function V1App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // Check initial auth session
    void (async () => {
      try {
        const initialSession = await authService.getSession();
        setSession(initialSession);
        if (initialSession?.user) {
          const prof = await authService.getProfile(initialSession.user.id);
          setProfile(prof);
        }
      } finally {
        setLoading(false);
      }
    })();

    // Listen for auth state changes
    const { data: authListener } = authService.onAuthStateChange(async (nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        const prof = await authService.getProfile(nextSession.user.id);
        setProfile(prof);
      } else {
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await authService.signOut();
  };

  if (loading) {
    return <LoadingScreen message="Loading CryoChain..." />;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        {!session ? (
          <LoginScreen />
        ) : (
          <BuyerCatalogScreen onSignOut={handleSignOut} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
