import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { cancelOrder, fetchOrders, openPayment, startPayment, verifyPayment, type Order } from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';

const POLL_MS = 3000;
const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

type Phase = 'starting' | 'waiting' | 'paid' | 'error';

/**
 * The payment step: opens Paystack right away, then watches the order until the payment is confirmed.
 * The buyer only moves on to Orders once it is paid (or leaves on purpose).
 */
export function Payment({ orderId, onPaid, onLeave }: { orderId: string; onPaid: () => void; onLeave: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const ref = useRef<{ url: string; reference: string } | null>(null);
  const started = useRef(false);

  const begin = useCallback(async () => {
    setPhase('starting');
    setError(null);
    try {
      ref.current = await startPayment(orderId);
      setCheckoutUrl(ref.current.url);
      setPhase('waiting');
      await openPayment(ref.current.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the payment. Please try again.');
      setPhase('error');
    }
  }, [orderId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, [begin]);

  // While waiting, ask Paystack (via verify) and the database whether the payment went through.
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'starting') return;
    let live = true;
    const tick = async () => {
      if (ref.current) await verifyPayment(ref.current.reference).catch(() => undefined);
      const mine = (await fetchOrders().catch(() => [])).find((o) => o.id === orderId);
      if (!live || !mine) return;
      setOrder(mine);
      if (mine.state === 'paid') { setPhase('paid'); setTimeout(onPaid, 1200); }
      else if (mine.state === 'cancelled') onLeave();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, [phase, orderId, onPaid, onLeave]);

  const cancel = async () => {
    try { await cancelOrder(orderId); onLeave(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not cancel the order.'); }
  };

  return (
    <View style={s.wrap}>
      <Card style={s.hero}>
        {phase === 'paid' ? (
          <View style={s.badge}><Icon name="check" size={28} color="#ffffff" /></View>
        ) : phase === 'error' ? null : <ActivityIndicator size="large" color={colors.brand600} />}
        <Text style={s.title}>
          {phase === 'starting' ? 'Preparing your secure payment' : phase === 'paid' ? 'Payment confirmed' : phase === 'error' ? 'Payment did not start' : 'Complete your payment'}
        </Text>
        <Text style={s.meta}>
          {phase === 'starting' ? 'This takes a few seconds. Please keep this page open.'
            : phase === 'paid' ? 'Thank you. Taking you to your orders.'
            : phase === 'error' ? 'No money was taken.'
            : 'Finish paying in the Paystack window. This page updates as soon as we hear back, so you do not need to refresh.'}
        </Text>
        {order ? <Text style={s.total}>{ghs(order.amount)}</Text> : null}
      </Card>

      {error ? <Banner text={error} /> : null}

      {order && order.items.length > 0 ? (
        <Card style={s.lines}>
          {order.items.map((i) => (
            <View key={`${i.name}-${i.grade}`} style={s.row}>
              <Text style={s.k}>{i.name} · Grade {i.grade} · {kg(i.kg)}</Text>
              <Text style={s.v}>{ghs(i.lineTotal)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {phase === 'waiting' && checkoutUrl ? <Button variant="outline" label="Open payment window again" onPress={() => openPayment(checkoutUrl)} /> : null}
      {phase === 'error' ? <Button label="Try again" onPress={begin} /> : null}
      {phase !== 'paid' ? (
        <>
          <Button variant="ghost" label="Cancel order" onPress={cancel} />
          <Button variant="ghost" label="Pay later from Orders" onPress={onLeave} />
        </>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  hero: { gap: 12, alignItems: 'center' as const, paddingVertical: 28 },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brand600 },
  title: { fontFamily: fonts.heading, fontSize: 24, color: c.ink, textAlign: 'center' as const },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, textAlign: 'center' as const, maxWidth: 360 },
  total: { fontFamily: fonts.heading, fontSize: 32, color: c.ink, fontVariant: ['tabular-nums' as const] },
  lines: { gap: 8 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12 },
  k: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted, flexShrink: 1 },
  v: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
});
