import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Card, Icon, Input } from '../../../components/common';
import type { OrderRow } from '../../../services/ops.buyers.service';
import type { BuyerRow } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';
import { Empty, kg, usePaged } from './OpsBits';

const TONE = { awaiting_payment: 'warning', paid: 'success', cancelled: 'neutral' } as const;

/** Buyers with their delivery point, contact details and order history. */
export function BuyersPanel({ buyers, orders }: { buyers: BuyerRow[]; orders: OrderRow[] }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const filtered = buyers.filter((b) => !needle || `${b.name} ${b.phone} ${b.location}`.toLowerCase().includes(needle));
  const { rows, more } = usePaged(filtered, needle, 8);

  if (!buyers.length) return <Empty icon="users" title="No buyers yet" hint="Buyers appear here once they register. Open one to see their contact details, delivery location and orders." />;
  return (
    <View style={s.list}>
      <Input label="Search buyers" value={q} onChangeText={setQ} placeholder="Business, phone or location" />
      {filtered.length === 0 ? <Text style={s.meta}>No buyer matches “{q}”.</Text> : null}
      {rows.map((b) => {
        const mine = orders.filter((o) => o.buyerId === b.id);
        const spent = mine.filter((o) => o.state === 'paid').reduce((n, o) => n + o.amount, 0);
        const on = open === b.id;
        return (
          <Card key={b.id} style={s.item}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : b.id)} style={s.head}>
              <View style={s.avatar}><Text style={s.avatarText}>{b.name.slice(0, 1).toUpperCase()}</Text></View>
              <View style={s.grow}>
                <Text style={s.name} numberOfLines={1}>{b.name}</Text>
                <Text style={s.meta} numberOfLines={1}>{[b.location, `${mine.length} order${mine.length === 1 ? '' : 's'}`, ghs(spent)].filter(Boolean).join(' · ')}</Text>
              </View>
              <Icon name="chevronDown" size={18} color={colors.inkMuted} />
            </Pressable>
            {on ? (
              <View style={s.body}>
                <View><Text style={s.meta}>Phone</Text><Text style={s.value}>{formatPhone(b.phone) || '—'}</Text></View>
                <View><Text style={s.meta}>Email</Text><Text style={s.value}>{b.email || '—'}</Text></View>
                <View><Text style={s.meta}>Delivery location</Text><Text style={s.value}>{b.location || '—'}</Text></View>
                <View><Text style={s.meta}>Joined</Text><Text style={s.value}>{new Date(b.joinedAt).toLocaleDateString('en-GH')}</Text></View>
                <Text style={s.sub}>Orders</Text>
                {mine.length === 0 ? <Text style={s.meta}>No orders yet.</Text> : mine.slice(0, 5).map((o) => (
                  <View key={o.id} style={s.order}>
                    <View style={s.grow}>
                      <Text style={s.value}>{o.code} · {ghs(o.amount)}</Text>
                      <Text style={s.meta}>{o.lotCode} · {o.product} · {kg(o.totalKg)}</Text>
                    </View>
                    <Badge label={o.state.replace('_', ' ')} tone={TONE[o.state]} />
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
      {more}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { padding: 0, overflow: 'hidden' as const },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14, minHeight: 64 },
  grow: { flex: 1, gap: 2 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.harvestTint },
  avatarText: { fontFamily: fonts.sansBold, fontSize: 16, color: c.harvestInk },
  body: { gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  order: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  sub: { fontFamily: fonts.sansBold, fontSize: 13, color: c.ink, marginTop: 4 },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
