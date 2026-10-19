import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Card, Icon, Input } from '../../../components/common';
import { isSold, type FarmerRow, type SupplyRow } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone } from '../../../utils/format';
import { supplySplit } from '../data';
import { Empty, kg, usePaged } from './OpsBits';

/** Farmers with a search box; open one for contact details, wallet state and everything they have listed. */
export function FarmersPanel({ farmers, supply }: { farmers: FarmerRow[]; supply: SupplyRow[] }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const filtered = farmers.filter((f) => !needle || `${f.name} ${f.phone} ${f.locality}`.toLowerCase().includes(needle));
  const { rows, more } = usePaged(filtered, needle, 8);

  if (!farmers.length) return <Empty icon="users" title="No farmers yet" hint="Farmers appear here after they sign up. You will see their contact details, wallet status and listings." />;
  return (
    <View style={s.list}>
      <Input label="Search farmers" value={q} onChangeText={setQ} placeholder="Name, phone or town" />
      {filtered.length === 0 ? <Text style={s.meta}>No farmer matches “{q}”.</Text> : null}
      {rows.map((f) => {
        const mine = supply.filter((r) => r.farmerId === f.id);
        const sp = supplySplit(mine, isSold);
        const on = open === f.id;
        return (
          <Card key={f.id} style={s.item}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : f.id)} style={s.head}>
              <View style={s.avatar}><Text style={s.avatarText}>{f.name.slice(0, 1).toUpperCase()}</Text></View>
              <View style={s.grow}>
                <Text style={s.name} numberOfLines={1}>{f.name}</Text>
                <Text style={s.meta} numberOfLines={1}>{[f.locality, `${mine.length} listing${mine.length === 1 ? '' : 's'}`, kg(sp.total)].filter(Boolean).join(' · ')}</Text>
              </View>
              <Badge label={f.walletVerified ? 'Wallet verified' : f.walletReady ? 'Wallet saved' : 'No wallet'} tone={f.walletVerified ? 'success' : f.walletReady ? 'info' : 'warning'} />
              <Icon name="chevronDown" size={18} color={colors.inkMuted} />
            </Pressable>
            {on ? (
              <View style={s.body}>
                <Detail k="Phone" v={formatPhone(f.phone) || '—'} />
                <Detail k="Nearest collection point" v={f.locality || '—'} />
                <Detail k="Farm address" v={f.address || '—'} />
                <Detail k="Joined" v={new Date(f.joinedAt).toLocaleDateString('en-GH')} />
                <Text style={s.sub}>Listings</Text>
                {mine.length === 0 ? <Text style={s.meta}>Nothing listed yet.</Text> : mine.slice(0, 5).map((r) => (
                  <View key={r.id} style={s.listing}>
                    <Text style={s.value}>{r.product} · {kg(r.weightKg)}</Text>
                    <Badge label={!r.lotId ? 'Available' : isSold(r) ? 'Sold' : 'In open lot'} tone={!r.lotId ? 'success' : isSold(r) ? 'neutral' : 'warning'} />
                  </View>
                ))}
                {mine.length > 5 ? <Text style={s.meta}>and {mine.length - 5} more. See the Supply page for the full list.</Text> : null}
              </View>
            ) : null}
          </Card>
        );
      })}
      {more}
    </View>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.detail}>
      <Text style={s.meta}>{k}</Text>
      <Text style={s.value}>{v}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { padding: 0, overflow: 'hidden' as const },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14, minHeight: 64 },
  grow: { flex: 1, gap: 2 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  avatarText: { fontFamily: fonts.sansBold, fontSize: 16, color: c.brandInk },
  body: { gap: 8, padding: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle, alignItems: 'flex-start' as const },
  detail: { gap: 1 },
  listing: { alignSelf: 'stretch' as const, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  sub: { fontFamily: fonts.sansBold, fontSize: 13, color: c.ink, marginTop: 6 },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
