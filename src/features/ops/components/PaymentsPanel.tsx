import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { cancelOrder, confirmPayment, type OrderRow } from '../../../services/ops.buyers.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';
import { useAction } from './useAction';

const TONE = { awaiting_payment: 'warning', paid: 'success', cancelled: 'neutral' } as const;

/** Bank-transfer orders. Confirm only after the money is visible in the bank account, matched by the order code. */
export function PaymentsPanel({ orders, onChange }: { orders: OrderRow[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const awaiting = orders.filter((o) => o.state === 'awaiting_payment').length;

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Text style={s.meta}>{awaiting} awaiting payment. Match each transfer to its order code in the bank narration.</Text>
      {orders.length === 0 ? <Card><Text style={s.meta}>No orders yet.</Text></Card> : null}
      {orders.map((o) => (
        <Card key={o.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{o.code} · {ghs(o.amount)}</Text>
            <Badge label={o.state.replace('_', ' ')} tone={TONE[o.state]} />
          </View>
          <Text style={s.meta}>{o.buyer}{o.buyerPhone ? ` · ${formatPhone(o.buyerPhone)}` : ''}</Text>
          <Text style={s.meta}>{o.lotCode} · {o.product} · {o.totalKg.toLocaleString('en-GH')} kg · {new Date(o.createdAt).toLocaleString('en-GH')}</Text>
          {o.state === 'awaiting_payment' ? (
            <View style={s.actions}>
              <Button size="sm" label="Confirm payment" loading={busy} onPress={() => run(() => confirmPayment(o.id))} />
              <Button size="sm" variant="outline" label="Cancel order" disabled={busy} onPress={() => run(() => cancelOrder(o.id))} />
            </View>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 6, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
