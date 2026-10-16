import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { cancelOrder, orderStatus, payOnline, type Order, type TransferDetails } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
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
            {o.state === 'awaiting_payment' ? (
              <>
                {o.payment === 'failed' || o.payment === 'abandoned' ? (
                  <Banner text={o.payment === 'failed' ? 'Your last payment attempt failed. No money was taken; try again.' : 'Your last payment was not completed. Try again when you are ready.'} />
                ) : null}
                {o.payment === 'pending' ? <Text style={s.meta}>A payment is in progress. If you already paid, it will show here shortly.</Text> : null}
                <Button label={o.payment === 'failed' || o.payment === 'abandoned' ? 'Try again with Paystack' : 'Pay online (mobile money or bank)'} loading={busy} onPress={() => run(() => payOnline(o.id))} />
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
                <Button size="sm" variant="outline" label="Cancel order" loading={busy} onPress={() => run(() => cancelOrder(o.id))} />
              </>
            ) : null}
          </Card>
        );
      })}
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
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12 },
  k: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  v: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink, flexShrink: 1, textAlign: 'right' as const },
});
