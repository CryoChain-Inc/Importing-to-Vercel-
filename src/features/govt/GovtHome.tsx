import React from 'react';
import { Text, View } from 'react-native';
import { OpsShell } from '../../components/layout/OpsShell';
import { useNav } from '../../navigation';
import { authService } from '../../services/auth.service';
import { fonts, useThemedStyles, type ColorToken } from '../../theme';
import type { Account } from '../../types/auth';
import { FarmerReport } from '../report/FarmerReport';

/** The government site at /govt: one read-only report, in the same shell as the ops console. */
export function GovtHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  return (
    <OpsShell
      groups={[
        {
          title: 'Reports',
          items: [{ key: 'farmers', label: 'Farmer report', icon: 'clipboard' }],
        },
      ]}
      active="farmers"
      onSelect={() => undefined}
      name={account.name || 'Government'}
      onSignOut={() => authService.signOut().finally(() => reset({ name: 'govt' }))}
    >
      <View style={s.head}>
        <Text style={s.title}>Farmer and stock report</Text>
        <Text style={s.sub}>
          Farmers, what they have listed and where they farm. Search and filter, then download a PDF, Excel or CSV copy.
        </Text>
      </View>
      <FarmerReport />
    </OpsShell>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  head: { gap: 2, marginBottom: 4 },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: c.ink,
  },
  sub: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted },
});
