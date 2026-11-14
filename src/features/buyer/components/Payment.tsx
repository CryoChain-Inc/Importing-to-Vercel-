import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  cancelOrder,
  fetchOrders,
  openPayment,
  startPayment,
  verifyPayment,
  type Order,
} from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { fmtQty, ghs } from '../../../utils/format';
import { posthog } from '../../../config/posthog';
import { posthogLog } from '../../../config/posthogLogs';

const POLL_MS = 3000;

type Phase = 'starting' | 'waiting' | 'paid' | 'error';

/**
 * The payment step: opens Paystack right away, then watches the order until the payment is confirmed.
 * The buyer only moves on to Orders once it is paid (or leaves on purpose).
 */
export function Payment({
  orderId,
  onPaid,
  onLeave,
}: {
  orderId: string;
  onPaid: () => void;
  onLeave: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ref = useRef<{ url: string; reference: string } | null>(null);
  const started = useRef(false);
  const paymentCompleted = useRef(false);

  const begin = useCallback(async () => {
    setPhase('starting');
    setError(null);
    try {
      ref.current = await startPayment(orderId);
      posthog?.capture('payment_started');
      setCheckoutUrl(ref.current.url);
      setPhase('waiting');
      await openPayment(ref.current.url);
    } catch (e) {
      posthogLog.warn('payment start failed', { event: 'payment_start_failed' });
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
      if (mine.state === 'paid') {
        if (!paymentCompleted.current) {
          paymentCompleted.current = true;
          posthog?.capture('payment_completed', { item_count: mine.items.length });
          posthogLog.info('payment completed', {
            event: 'payment_completed',
            item_count: mine.items.length,
          });
        }
        setPhase('paid');
        setTimeout(onPaid, 1200);
      } else if (mine.state === 'cancelled') onLeave();
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [phase, orderId, onPaid, onLeave]);

  const cancel = async () => {
    try {
      await cancelOrder(orderId);
      posthog?.capture('order_cancelled');
      onLeave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel the order.');
    }
  };

  const at = phase === 'paid' ? 3 : 1;
  const ok = phase === 'paid';
  const bad = phase === 'error';

  return (
    <View style={s.wrap}>
      <Card style={s.hero}>
        <View style={[s.icon, ok && s.iconOk, bad && s.iconBad]}>
          <Icon
            name={ok ? 'check' : bad ? 'alert' : 'lock'}
            size={26}
            color={ok ? '#ffffff' : bad ? colors.dangerInk : colors.brandInk}
          />
        </View>
        <Text style={s.title}>
          {phase === 'starting'
            ? 'Preparing your secure payment'
            : ok
              ? 'Payment confirmed'
              : bad
                ? 'Payment did not start'
                : 'Complete your payment'}
        </Text>
        {order ? (
          <Text style={s.total} accessibilityLabel={`Amount to pay ${ghs(order.amount)}`}>
            {ghs(order.amount)}
          </Text>
        ) : null}
        <Text style={s.meta}>
          {phase === 'starting'
            ? 'This takes a few seconds. Please keep this page open.'
            : ok
              ? 'Thank you. Taking you to your orders.'
              : bad
                ? 'No money was taken.'
                : 'Finish paying in the Paystack window. This page updates as soon as we hear back, so you do not need to refresh.'}
        </Text>
        {!ok && !bad ? (
          <View style={s.live} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.brand600} />
            <Text style={s.liveText}>
              {phase === 'starting' ? 'Connecting to Paystack' : 'Waiting for your payment'}
            </Text>
          </View>
        ) : null}
      </Card>

      {!bad ? <Steps at={at} s={s} /> : null}

      {error ? <Banner text={error} /> : null}

      {order && order.items.length > 0 ? (
        <Card style={s.lines}>
          <Text style={s.head}>Your order</Text>
          {order.items.map((i) => (
            <View key={`${i.name}-${i.unit}`} style={s.row}>
              <Text style={s.k}>
                {i.name} · {fmtQty(i.kg, i.unit)}
              </Text>
              <Text style={s.v}>{ghs(i.lineTotal)}</Text>
            </View>
          ))}
          <View style={[s.row, s.sum]}>
            <Text style={s.sumK}>Total</Text>
            <Text style={s.sumV}>{ghs(order.amount)}</Text>
          </View>
        </Card>
      ) : null}

      {!ok ? (
        <View style={s.secure}>
          <Icon name="shield" size={16} color={colors.brandInk} />
          <Text style={s.secureText}>
            Paid securely through Paystack. We never see your card or MoMo PIN.
          </Text>
        </View>
      ) : null}

      {phase === 'waiting' && checkoutUrl ? (
        <Button
          icon="lock"
          size="lg"
          label="Open payment window"
          onPress={() => openPayment(checkoutUrl)}
        />
      ) : null}
      {bad ? <Button size="lg" label="Try again" onPress={begin} /> : null}
      {!ok ? (
        confirmCancel ? (
          <Card style={s.confirm}>
            <Text style={s.head}>Cancel this order?</Text>
            <Text style={s.meta}>Your items go back on sale and no money is taken.</Text>
            <Button variant="danger" label="Yes, cancel order" onPress={cancel} />
            <Button
              variant="outline"
              label="Keep my order"
              onPress={() => setConfirmCancel(false)}
            />
          </Card>
        ) : (
          <>
            <Button variant="outline" label="Pay later from Orders" onPress={onLeave} />
            <Button variant="ghost" label="Cancel order" onPress={() => setConfirmCancel(true)} />
          </>
        )
      ) : null}
    </View>
  );
}

const STEPS = ['Order placed', 'Pay', 'Confirmed'];

function Steps({ at, s }: { at: number; s: ReturnType<typeof styles> }) {
  return (
    <View
      style={s.steps}
      accessible
      accessibilityLabel={`Step ${Math.min(at, STEPS.length)} of ${STEPS.length}: ${STEPS[Math.min(at, STEPS.length) - 1]}`}
    >
      {STEPS.map((label, i) => (
        <View key={label} style={s.step}>
          <View style={s.stepLine}>
            <View style={[s.seam, i > 0 && i < at && s.seamOn, i === 0 && s.seamNone]} />
            <View style={[s.dot, i < at && s.dotOn, i === at - 1 && at < 3 && s.dotNow]} />
            <View style={[s.seam, i < at - 1 && s.seamOn, i === STEPS.length - 1 && s.seamNone]} />
          </View>
          <Text style={[s.stepText, i === at - 1 && s.stepNow]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  hero: { gap: 10, alignItems: 'center' as const, paddingVertical: 28, paddingHorizontal: 20 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  iconOk: { backgroundColor: c.brand600 },
  iconBad: { backgroundColor: c.dangerTint },
  title: { fontFamily: fonts.heading, fontSize: 22, color: c.ink, textAlign: 'center' as const },
  meta: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 20,
    color: c.inkMuted,
    textAlign: 'center' as const,
    maxWidth: 360,
  },
  total: {
    fontFamily: fonts.heading,
    fontSize: 40,
    letterSpacing: -0.8,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  live: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: c.brandTint,
  },
  liveText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.brandInk },
  steps: { flexDirection: 'row' as const, paddingHorizontal: 4 },
  step: { flex: 1, alignItems: 'center' as const, gap: 6 },
  stepLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    height: 18,
  },
  seam: { flex: 1, height: 2, backgroundColor: c.borderSubtle },
  seamOn: { backgroundColor: c.brand500 },
  seamNone: { backgroundColor: 'transparent' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.borderSubtle },
  dotOn: { backgroundColor: c.brand500 },
  dotNow: { borderWidth: 3, borderColor: c.brandTint, width: 18, height: 18, borderRadius: 9 },
  stepText: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  stepNow: { fontFamily: fonts.sansBold, color: c.ink },
  lines: { gap: 10 },
  head: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12 },
  k: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted, flexShrink: 1 },
  v: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  sum: { borderTopWidth: 1, borderTopColor: c.borderSubtle, paddingTop: 12, marginTop: 2 },
  sumK: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  sumV: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  secure: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 8,
  },
  secureText: { flexShrink: 1, fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  confirm: { gap: 12 },
});
