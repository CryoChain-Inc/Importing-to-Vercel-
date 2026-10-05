import { useEffect } from 'react';
import { useFonts, Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { StatusBar } from 'expo-status-bar';
import { Platform, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavProvider, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './domain/store';
import { remoteEnabled } from './backend/config';
import {
  AccountBar,
  AuthProvider,
  AuthScreen,
  MissingProfile,
  PendingAccess,
  SetPasswordScreen,
  SetupScreen,
  useAuth,
} from './backend/gate';
import BuyerApp from './roles/buyer/Buyer';
import FarmerApp from './roles/farmer/Farmer';
import AgentApp from './roles/agent/Agent';
import DriverApp from './roles/driver/Driver';
import OpsApp from './roles/ops/Ops';
import { colors } from './ui/theme';
import type { ReactNode } from 'react';

// Workaround: React Native Web defaults can prevent automatic word breaking inside flex containers.
function useWebTextWrap() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'cc-text-wrap';
    const css = '#root [dir="auto"]{overflow-wrap:break-word;white-space:normal;}';
    const node = document.getElementById(id) ?? document.createElement('style');
    node.id = id;
    node.textContent = css;
    if (!node.parentElement) document.head.appendChild(node);
  }, []);
}

function RoleHome() {
  const { profile } = useAuth();
  const to =
    profile?.role === 'buyer'
      ? '/buyer'
      : profile?.role === 'farmer'
        ? '/farmer'
        : profile?.role === 'agent'
          ? '/agent'
          : profile?.role === 'driver'
            ? '/driver'
            : '/ops';
  return <Navigate to={to} replace />;
}

function Wait({ text }: { text: string }) {
  return (
    <View style={{ flex: 1, padding: 28, justifyContent: 'center', backgroundColor: colors.paper }}>
      <Text style={{ fontSize: 16, lineHeight: 24, color: colors.ink }}>{text}</Text>
    </View>
  );
}

/**
 * RBAC route guard. Verifies that the authenticated user matches the required role
 * and has their requisite operational device, farmer profile, or ops credentials provisioned.
 */
function RoleOnly({
  role,
  children,
}: {
  role: 'buyer' | 'farmer' | 'agent' | 'driver' | 'ops';
  children: ReactNode;
}) {
  const { profile } = useAuth();
  const { state } = useStore();
  if (profile?.role !== role) return <Navigate to="/" replace />;
  if (role === 'farmer' && !state.farmers.some((farmer) => farmer.id === state.session.farmerId))
    return (
      <Wait text="Operations has not linked this login to a farmer record. They do that from Team access, after a field agent registers the farmer." />
    );
  if (
    role === 'agent' &&
    !state.devices.some(
      (device) => device.id === state.session.agentDeviceId && device.role === 'agent',
    )
  )
    return (
      <Wait text="Operations has not attached a handset to this agent. They do that from Team access." />
    );
  if (
    role === 'driver' &&
    !state.devices.some(
      (device) => device.id === state.session.driverDeviceId && device.role === 'driver',
    )
  )
    return (
      <Wait text="Operations has not attached a handset to this driver. They do that from Team access." />
    );
  if (role === 'ops' && !state.opsUsers.some((user) => user.id === state.session.opsUserId))
    return <Wait text="This operations login is not on the node record yet." />;
  return children;
}

function SyncBanner() {
  const { syncNote } = useStore();
  if (!syncNote) return null;
  return (
    <Text
      style={{
        backgroundColor: '#F4E4C8',
        color: colors.ink,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      {syncNote}
    </Text>
  );
}

function Workspace() {
  return (
    <StoreProvider>
      <NavProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
          <StatusBar style="dark" />
          <AccountBar />
          <SyncBanner />
          <View style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<RoleHome />} />
              <Route
                path="/buyer/*"
                element={
                  <RoleOnly role="buyer">
                    <BuyerApp />
                  </RoleOnly>
                }
              />
              <Route
                path="/farmer/*"
                element={
                  <RoleOnly role="farmer">
                    <FarmerApp />
                  </RoleOnly>
                }
              />
              <Route
                path="/agent/*"
                element={
                  <RoleOnly role="agent">
                    <AgentApp />
                  </RoleOnly>
                }
              />
              <Route
                path="/driver/*"
                element={
                  <RoleOnly role="driver">
                    <DriverApp />
                  </RoleOnly>
                }
              />
              <Route
                path="/ops/*"
                element={
                  <RoleOnly role="ops">
                    <OpsApp />
                  </RoleOnly>
                }
              />
            </Routes>
          </View>
        </SafeAreaView>
      </NavProvider>
    </StoreProvider>
  );
}

function SignedIn() {
  const { ready, session, profile, mustSetPassword } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  if (!session) return <AuthScreen />;
  if (mustSetPassword) return <SetPasswordScreen />;
  if (!profile) return <MissingProfile />;
  if (profile.role === 'pending') return <PendingAccess />;
  return <Workspace />;
}

export default function App() {
  useWebTextWrap();
  const [ready] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_400Regular,
  });
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  if (!remoteEnabled)
    return (
      <SafeAreaProvider>
        <SetupScreen />
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SignedIn />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
