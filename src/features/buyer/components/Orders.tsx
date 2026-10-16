import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { cancelOrder, fetchTracking, orderStatus, payOnline, type Order, type OrderTracking, type TransferDetails } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { fmtWindow, ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Order status; unpaid orders can be paid online with Paystack (retry after a failure) or by bank transfer using the reference. */
export function Orders({ orders, transfer, onRefresh }: {
  orders: Order[];
  transfer: TransferDetails | null;
  onRefresh: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onRefresh);
  const [tracking, setTracking] = useState<Record<string, OrderTracking>>({});
  useEffect(() => {
    fetchTracking().then(setTracking, () => undefined);
  }, [orders]);

  return (
    <View style={s.list}>
      <Text style={s.title}>My orders</Text>
      {error ? <Banner text={error} /> : null}
      {orders.length === 0 ? <Card><Text style={s.meta}>No orders yet. Pick a lot from Today.</Text></Card> : null}
      {orders.map((o) => {
        const st = orderStatus(o);
        return (
          <Card key={o.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name}>{o.code} · {o.product}</Text>
              <Badge label={st.label} tone={st.tone} />
            </View>
            <Text style={s.meta}>{o.lotCode} · {kg(o.totalKg)} · {new Date(o.createdAt).toLocaleDateString('en-GH')}</Text>
            <Text style={s.total}>{ghs(o.amount)}</Text>
            {o.state === 'paid' && tracking[o.id] ? <Tracking t={tracking[o.id]} s={s} /> : null}
            {o.state === 'awaiting_payment' ? (
              <>
                {o.payment === 'failed' || o.payment === 'abandoned' ? (
                  <Banner text={o.payment === 'failed' ? 'Your last payment attempt failed. No money was taken; try again.' : 'Your last payment was not completed. Try again when you are ready.'} />
                ) : null}
                {o.payment === 'pending' ? <Text style={s.meta}>A payment is in progress. If you already paid, it will show here shortly. You can still cancel if you have not paid.</Text> : null}
                <Button label={o.payment === 'failed' || o.payment === 'abandoned' ? 'Try again with Paystack' : 'Pay online (mobile money or bank)'} loading={busy} onPress={() => run(() => payOnline(o.id))} />
                <Button size="sm" variant="outline" label="Cancel order" loading={busy} onPress={() => run(() => cancelOrder(o.id))} />
                <View style={s.box}>
                  <Text style={s.boxTitle}>Or pay by bank transfer</Text>
                  {transfer ? (
                    <>
                      <Row s={s} k="Bank" v={transfer.bankName} />
                      <Row s={s} k="Account name" v={transfer.accountName} />
                      <Row s={s} k="Account number" v={transfer.accountNumber} />
                      <Row s={s} k="Amount" v={ghs(o.amount)} />
                      <Row s={s} k="Reference" v={o.code} />
                      <Text style={s.meta}>Use the reference so we can match your payment. We confirm it within one working day{transfer.supportPhone ? `; questions: ${transfer.supportPhone}` : ''}.</Text>
                    </>
                  ) : <Text style={s.meta}>Bank details aren’t available yet. Please contact support.</Text>}
                </View>
              </>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const STEPS = ['Paid', 'Pickup scheduled', 'Being collected', 'On the way', 'Delivered'];

/** Where the lot is, from the farm gate to the buyer. */
function Tracking({ t, s }: { t: OrderTracking; s: ReturnType<typeof styles> }) {
  const step = t.deliveredAt ? 4 : t.lotState === 'in_transit' ? 3 : t.captured > 0 ? 2 : t.pickupStart ? 1 : 0;
  return (
    <View style={s.box}>
      <Text style={s.boxTitle}>{STEPS[step]}</Text>
      <Text style={s.meta}>{STEPS.map((label, i) => `${i <= step ? '●' : '○'} ${label}`).join('   ')}</Text>
      {t.pickupStart && !t.captured ? <Text style={s.meta}>Pickup: {fmtWindow(t.pickupStart, t.pickupEnd)}</Text> : null}
      {t.deliveryStart && !t.deliveredAt ? <Text style={s.meta}>Arrives: {fmtWindow(t.deliveryStart, t.deliveryEnd)}</Text> : null}
      <Text style={s.meta}>Expected {kg(t.expectedKg)} from {t.farmers} farmer{t.farmers === 1 ? '' : 's'}.</Text>
      {t.captured > 0 ? <Text style={s.meta}>Weighed so far: {kg(t.capturedKg)} ({t.captured} of {t.farmers} farmers)</Text> : null}
      {t.captures.some((c) => c.url) ? (
        <ScrollView horizontal contentContainerStyle={s.photos}>
          {t.captures.filter((c) => c.url).map((c, i) => (
            <View key={i} style={s.photo}>
              <Image source={{ uri: c.url! }} style={s.image} accessibilityLabel={`Captured produce, ${kg(c.kg)}, grade ${c.grade}`} />
              <Text style={s.meta}>{kg(c.kg)} · {c.grade}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {t.deliveredAt ? <Text style={s.meta}>Delivered {new Date(t.deliveredAt).toLocaleString('en-GH')}.</Text> : null}
    </View>
  );
}

function Row({ s, k, v }: { s: ReturnType<typeof styles>; k: string; v: string }) {
  return (
    <View style={s.row}>
      <Text style={s.k}>{k}</Text>
      <Text selectable style={s.v}>{v}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 8 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  total: { fontFamily: fonts.heading, fontSize: 22, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  box: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: c.surfaceSunken },
  boxTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  photos: { gap: 10 },
  photo: { gap: 4 },
  image: { width: 120, height: 90, borderRadius: 8 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12 },
  k: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  v: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink, flexShrink: 1, textAlign: 'right' as const },
});
