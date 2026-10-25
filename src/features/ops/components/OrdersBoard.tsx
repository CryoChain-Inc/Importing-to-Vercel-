import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { retryAllocation, type AllocationStatus, type BoardOrder } from '../../../services/ops.fulfilment.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { Empty, Segmented, usePaged, when } from './OpsBits';
import { useAction } from './useAction';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type Stage = 'attention' | 'farmers' | 'moving' | 'done' | 'closed';

const kgText = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;
const ACTIVE: AllocationStatus[] = ['offered', 'accepted', 'collected'];

/** Where an order stands, from payment through farmers and drivers to the buyer's door. */
export function stageOf(o: BoardOrder): { stage: Stage; label: string; tone: Tone } {
  if (o.state === 'cancelled') return { stage: 'closed', label: 'Cancelled', tone: 'neutral' };
  if (o.state === 'awaiting_payment') return { stage: 'closed', label: 'Awaiting payment', tone: 'warning' };
  const live = o.allocations.filter((a) => ACTIVE.includes(a.status));
  const need = o.items.length;
  if (o.stops.some((s) => s.kind === 'dropoff' && s.state === 'done')) return { stage: 'done', label: 'Delivered', tone: 'success' };
  if (live.length === 0 && need > 0) return { stage: 'attention', label: 'Not allocated', tone: 'danger' };
  if (live.some((a) => a.status === 'collected')) return { stage: 'moving', label: 'Being collected', tone: 'info' };
  if (live.every((a) => a.status === 'accepted')) return { stage: 'moving', label: 'Farmers confirmed', tone: 'success' };
  return { stage: 'farmers', label: 'Waiting for farmers', tone: 'warning' };
}

const ALLOC_TONE: Record<AllocationStatus, Tone> = { offered: 'warning', accepted: 'success', collected: 'info', declined: 'danger', expired: 'danger', cancelled: 'neutral' };

/** Paid orders with who supplies each kilo, what we pay them, and the driver's stops. All of it is automatic; this is the view. */
export function OrdersBoard({ orders, onChange }: { orders: BoardOrder[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onChange);
  const [filter, setFilter] = useState<'all' | Stage>('all');
  const [open, setOpen] = useState<string | null>(null);
  const withStage = orders.map((o) => ({ o, st: stageOf(o) }));
  const count = (f: Stage) => withStage.filter((x) => x.st.stage === f).length;
  const shown = withStage.filter((x) => filter === 'all' || x.st.stage === filter);
  const { rows, more } = usePaged(shown, filter, 6);

  if (orders.length === 0) return <Empty icon="package" title="No orders yet" hint="Orders appear here as soon as a buyer checks out. Paid orders are allocated to farmers and routed automatically." />;
  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Segmented value={filter} onChange={setFilter} options={[
        { key: 'all', label: 'All', count: orders.length },
        { key: 'attention', label: 'Attention', count: count('attention') },
        { key: 'farmers', label: 'Farmers', count: count('farmers') },
        { key: 'moving', label: 'Moving', count: count('moving') },
        { key: 'done', label: 'Delivered', count: count('done') },
      ]} />
      {rows.length === 0 ? <Text style={s.meta}>Nothing here.</Text> : null}
      {rows.map(({ o, st }) => {
        const on = open === o.id;
        const payout = o.allocations.filter((a) => ACTIVE.includes(a.status)).reduce((n, a) => n + a.amount, 0);
        return (
          <Card key={o.id} style={s.item}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : o.id)} style={s.head}>
              <View style={s.grow}>
                <Text style={s.name}>{o.code} · {o.buyer}</Text>
                <Text style={s.meta} numberOfLines={on ? undefined : 1}>{o.items.join(', ')}</Text>
              </View>
              <View style={s.right}>
                <Text style={s.amount}>{ghs(o.amount)}</Text>
                <Badge label={st.label} tone={st.tone} />
              </View>
              <Icon name="chevronRight" size={16} color={colors.inkMuted} />
            </Pressable>

            {on ? (
              <View style={s.body}>
                <Text style={s.meta}>{when(o.createdAt)} · {o.address || 'No address'}</Text>

                <Text style={s.sub}>Farmers</Text>
                {o.allocations.length === 0 ? <Text style={s.meta}>No farmer allocated yet.</Text> : o.allocations.map((a) => (
                  <View key={a.id} style={s.row}>
                    <View style={s.grow}>
                      <Text style={s.value}>{a.farmer} · {kgText(a.kg)} {a.product} {a.grade}</Text>
                      <Text style={s.meta}>We pay {ghs(a.amount)}{a.kmToBuyer != null ? ` · ${a.kmToBuyer} km from buyer` : ''}{a.status === 'offered' ? ` · answer by ${when(a.expiresAt)}` : ''}</Text>
                    </View>
                    <Badge label={a.status} tone={ALLOC_TONE[a.status]} />
                  </View>
                ))}
                {payout > 0 ? <Text style={s.meta}>Farmer cost {ghs(payout)} · margin {ghs(o.amount - payout)}</Text> : null}

                <Text style={s.sub}>Route</Text>
                {o.stops.length === 0 ? <Text style={s.meta}>No stops planned yet.</Text> : o.stops.map((p) => (
                  <View key={p.id} style={s.row}>
                    <View style={s.grow}>
                      <Text style={s.value}>{p.seq ? `${p.seq}. ` : ''}{p.label}</Text>
                      <Text style={s.meta}>{p.driver ? `Driver ${p.driver}` : 'No driver yet'}</Text>
                    </View>
                    <Badge label={p.state === 'done' ? 'Done' : 'Pending'} tone={p.state === 'done' ? 'success' : 'neutral'} />
                  </View>
                ))}

                {o.state === 'paid' && st.stage !== 'done' ? (
                  <Button size="sm" variant="outline" label="Re-run allocation" loading={busy} onPress={() => run(() => retryAllocation(o.id))} />
                ) : null}
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
  list: { gap: 12 },
  item: { gap: 10, padding: 16 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  grow: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end' as const, gap: 4 },
  body: { gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10 },
  name: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  value: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  sub: { fontFamily: fonts.sansBold, fontSize: 13, color: c.inkMuted, marginTop: 4 },
  amount: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted, flexShrink: 1 },
});
