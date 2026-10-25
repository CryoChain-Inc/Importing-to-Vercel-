import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { cancelOrder, orderStatus, type Order } from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });

/** The buyer's orders: what they bought, what it cost and where it stands. Unpaid orders can be paid or cancelled. */
export function Orders({ orders, onPay, onRefresh }: {
  orders: Order[];
  onPay: (orderId: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onRefresh);

  return (
    <View style={s.list}>
      <Text style={s.title}>My orders</Text>
      {error ? <Banner text={error} /> : null}
      {orders.length === 0 ? <Card><Text style={s.meta}>No orders yet. Add produce to your cart from the shop.</Text></Card> : null}
      {orders.map((o) => {
        const st = orderStatus(o);
        const unpaid = o.state === 'awaiting_payment';
        const retry = o.payment === 'failed' || o.payment === 'abandoned';
        return (
          <Card key={o.id} style={s.item}>
            <View style={s.top}>
              <View style={s.grow}>
                <Text style={s.name}>{o.code}</Text>
                <Text style={s.meta}>{when(o.createdAt)}</Text>
              </View>
              <Badge label={st.label} tone={st.tone} />
            </View>

            <View style={s.lines}>
              {o.items.map((i) => (
                <View key={`${i.name}-${i.grade}`} style={s.row}>
                  <Text style={s.k} numberOfLines={2}>{i.name} · Grade {i.grade} · {kg(i.kg)}</Text>
                  <Text style={s.v}>{ghs(i.lineTotal)}</Text>
                </View>
              ))}
            </View>

            <View style={s.row}>
              <Text style={s.label}>Total</Text>
              <Text style={s.total}>{ghs(o.amount)}</Text>
            </View>

            {o.deliveryAddress ? (
              <View style={s.addr}>
                <Icon name="pin" size={14} color={colors.inkMuted} />
                <Text style={s.meta} numberOfLines={2}>{o.deliveryAddress}</Text>
              </View>
            ) : null}

            {o.state !== 'cancelled' ? <Progress paid={o.state === 'paid'} s={s} /> : null}

            {unpaid ? (
              <>
                {retry ? <Banner text={o.payment === 'failed' ? 'Your last payment attempt failed. No money was taken; try again.' : 'Your last payment was not completed. Try again when you are ready.'} /> : null}
                {o.payment === 'pending' ? <Text style={s.meta}>A payment is in progress. If you already paid, it will show here shortly.</Text> : null}
                <Button label={retry ? 'Try payment again' : 'Pay now'} onPress={() => onPay(o.id)} />
                <Button size="sm" variant="outline" label="Cancel order" loading={busy} onPress={() => run(() => cancelOrder(o.id))} />
              </>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

/** Two steps the buyer controls and sees: the order is placed, then paid. */
function Progress({ paid, s }: { paid: boolean; s: ReturnType<typeof styles> }) {
  return (
    <View style={s.steps}>
      <Step s={s} label="Order placed" done />
      <View style={[s.bar, paid && s.barDone]} />
      <Step s={s} label={paid ? 'Payment received' : 'Awaiting payment'} done={paid} />
    </View>
  );
}

function Step({ s, label, done }: { s: ReturnType<typeof styles>; label: string; done: boolean }) {
  return (
    <View style={s.step}>
      <View style={[s.dot, done && s.dotDone]}>{done ? <Icon name="check" size={12} color="#ffffff" /> : null}</View>
      <Text style={[s.stepText, done && s.stepTextDone]}>{label}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 12 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  grow: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted, flexShrink: 1 },
  lines: { gap: 6, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.borderSubtle },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 12 },
  k: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.ink, flexShrink: 1 },
  v: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  label: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  total: { fontFamily: fonts.heading, fontSize: 22, color: c.ink, fontVariant: ['tabular-nums' as const] },
  addr: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  steps: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  step: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: c.borderStrong },
  dotDone: { backgroundColor: c.brand600, borderColor: c.brand600 },
  bar: { flex: 1, height: 2, borderRadius: 1, backgroundColor: c.borderSubtle },
  barDone: { backgroundColor: c.brand600 },
  stepText: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  stepTextDone: { color: c.ink },
});
