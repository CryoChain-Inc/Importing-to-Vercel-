import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { cancelOrder, confirmPayment, type OrderRow } from '../../../services/ops.buyers.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';
import { Empty, Hero, Segmented, usePaged } from './OpsBits';
import { useAction } from './useAction';

const TONE = { awaiting_payment: 'warning', paid: 'success', cancelled: 'neutral' } as const;
type Tab = OrderRow['state'];

/** Money in. Bank-transfer orders: confirm only once the money is visible in the account, matched by the order code. */
export function PaymentsPanel({ orders, onChange }: { orders: OrderRow[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const by = (st: Tab) => orders.filter((o) => o.state === st);
  const sum = (st: Tab) => by(st).reduce((n, o) => n + o.amount, 0);
  const [tab, setTab] = useState<Tab>(by('awaiting_payment').length ? 'awaiting_payment' : 'paid');
  const { rows, more } = usePaged(by(tab), tab);

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Hero label="Received into the account" value={ghs(sum('paid'))} cells={[
        { label: 'Awaiting payment', value: ghs(sum('awaiting_payment')) },
        { label: 'Confirmed transfers', value: String(by('paid').length) },
      ]} />
      <Segmented value={tab} onChange={setTab} options={[
        { key: 'awaiting_payment', label: 'Awaiting', count: by('awaiting_payment').length },
        { key: 'paid', label: 'Received', count: by('paid').length },
        { key: 'cancelled', label: 'Cancelled', count: by('cancelled').length },
      ]} />
      {tab === 'awaiting_payment' && by(tab).length ? <Text style={s.meta}>Match each transfer to its order code in the bank narration before confirming.</Text> : null}
      {rows.length === 0 ? (
        <Empty icon="banknote" title={orders.length ? 'Nothing here' : 'No orders yet'}
          hint={orders.length ? 'No orders in this list.' : 'Orders appear here when a buyer reserves a lot. Confirm each once the transfer is in the bank.'} />
      ) : null}
      {rows.map((o) => (
        <Card key={o.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name} numberOfLines={1}>{o.buyer}</Text>
            <Text style={s.amount}>{ghs(o.amount)}</Text>
          </View>
          <View style={s.top}>
            <Text style={s.meta} numberOfLines={1}>{o.code} · {o.lotCode} · {o.product} · {o.totalKg.toLocaleString('en-GH')} kg</Text>
            <Badge label={o.state.replace('_', ' ')} tone={TONE[o.state]} />
          </View>
          <Text style={s.meta}>
            {o.buyerPhone ? `${formatPhone(o.buyerPhone)} · ` : ''}{o.paidAt ? `Paid ${new Date(o.paidAt).toLocaleString('en-GH')}` : `Ordered ${new Date(o.createdAt).toLocaleString('en-GH')}`}
          </Text>
          {o.state === 'awaiting_payment' ? (
            <View style={s.actions}>
              <Button size="sm" label="Confirm payment" loading={busy} onPress={() => run(() => confirmPayment(o.id))} />
              <Button size="sm" variant="outline" label="Cancel order" disabled={busy} onPress={() => run(() => cancelOrder(o.id))} />
            </View>
          ) : null}
        </Card>
      ))}
      {more}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 6, padding: 16 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 4 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  amount: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted, flexShrink: 1 },
});
