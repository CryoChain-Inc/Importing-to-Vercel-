import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Card } from '../../../components/common';
import type { FarmerRow } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone } from '../../../utils/format';

export function FarmersPanel({ farmers }: { farmers: FarmerRow[] }) {
  const s = useThemedStyles(styles);
  if (!farmers.length) return <Card><Text style={s.meta}>No farmers registered yet.</Text></Card>;
  return (
    <View style={s.list}>
      <Text style={s.meta}>{farmers.length} registered</Text>
      {farmers.map((f) => (
        <Card key={f.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{f.name}</Text>
            <Badge label={f.walletVerified ? 'Wallet verified' : f.walletReady ? 'Wallet saved' : 'No wallet'} tone={f.walletVerified ? 'success' : f.walletReady ? 'info' : 'warning'} />
          </View>
          <Text style={s.meta}>{[formatPhone(f.phone), f.locality, f.address].filter(Boolean).join(' · ') || 'Details not completed'}</Text>
          <Text style={s.meta}>Joined {new Date(f.joinedAt).toLocaleDateString('en-GH')}</Text>
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 4 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
