import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Gradient } from '../../components/common';
import { Screen, useIsWide } from '../../components/layout';
import { useNav } from '../../navigation';
import { authService } from '../../services/auth.service';
import { fonts, useThemedStyles, type ColorToken } from '../../theme';
import type { Account, Role } from '../../types/auth';
import { OpsHome } from '../ops/screens/OpsHome';
import { BuyerHome } from '../buyer/screens/BuyerHome';
import { FarmerHome } from '../farmer/screens/FarmerHome';

/** Placeholder landing after sign-in; the real role workspaces replace this. */
export function HomeScreen({ account, role }: { account: Account; role: Role }) {
  const { reset } = useNav();
  const wide = useIsWide();
  const s = useThemedStyles(styles);

  if (role === 'farmer') return <FarmerHome account={account} />;
  if (role === 'buyer') return <BuyerHome account={account} />;
  if (role === 'ops') return <OpsHome account={account} />;

  return (
    <Screen topRight={<Button label="Sign out" variant="outline" size="sm" onPress={() => authService.signOut().finally(() => reset({ name: 'landing' }))} />}>
      <Gradient kind="card" style={s.welcome}>
        <Text style={s.overline}>{role.toUpperCase()}</Text>
        <Text style={s.welcomeTitle}>Welcome, {account.name}</Text>
        <Badge label="Staff" tone="info" />
      </Gradient>

      <View style={[s.body, wide && s.bodyWide]}>
        <Card style={s.main}>
          <Text style={s.cardTitle}>Workspace</Text>
          <Text style={s.copy}>The {role} workspace is coming in a later phase.</Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  welcome: { borderRadius: 24, padding: 28, gap: 10 },
  overline: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.8, color: 'rgba(255,255,255,0.75)' },
  welcomeTitle: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: '#ffffff' },
  body: { gap: 20 },
  bodyWide: { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
  main: { flex: 1 },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, marginBottom: 6 },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
