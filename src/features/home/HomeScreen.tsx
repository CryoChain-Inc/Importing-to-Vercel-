import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Gradient } from '../../components/common';
import { Screen, useIsWide } from '../../components/layout';
import { useNav } from '../../navigation';
import { fonts, useThemedStyles, type ColorToken } from '../../theme';
import type { Account, Role } from '../../types/auth';
import { PriceBoard } from '../farmer/components/PriceBoard';

/** Placeholder landing after sign-in; the real role workspaces replace this. */
export function HomeScreen({ account, role }: { account: Account; role: Role }) {
  const { reset } = useNav();
  const wide = useIsWide();
  const s = useThemedStyles(styles);

  const status =
    role === 'farmer' ? (
      <Badge label={account.payoutReady ? 'Payout wallet ready' : 'Payout wallet needed'} tone={account.payoutReady ? 'success' : 'warning'} />
    ) : role === 'buyer' ? (
      <Badge label={account.businessVerified ? 'Business verified' : 'Business verification pending'} tone={account.businessVerified ? 'success' : 'warning'} />
    ) : (
      <Badge label="Staff" tone="info" />
    );

  return (
    <Screen topRight={<Button label="Sign out" variant="outline" size="sm" onPress={() => reset({ name: 'landing' })} />}>
      <Gradient kind="card" style={s.welcome}>
        <Text style={s.overline}>{role.toUpperCase()}</Text>
        <Text style={s.welcomeTitle}>Welcome, {account.name}</Text>
        {status}
      </Gradient>

      <View style={[s.body, wide && s.bodyWide]}>
        {role === 'farmer' ? (
          <View style={s.main}><PriceBoard /></View>
        ) : null}
        <Card style={s.main}>
          <Text style={s.cardTitle}>
            {role === 'farmer' ? 'Next: list your produce' : role === 'buyer' ? 'Lots and prices' : 'Workspace'}
          </Text>
          <Text style={s.copy}>
            {role === 'farmer'
              ? 'Listing is coming in the next phase. Prices above update every morning.'
              : role === 'buyer'
                ? "Available lots and prices will appear here. We'll let you know when verification is complete."
                : `The ${role} workspace is coming in a later phase.`}
          </Text>
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
