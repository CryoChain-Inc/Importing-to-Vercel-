import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Text,
  View,
} from 'react-native';
import { posthog } from '../../../config/posthog';
import { posthogLog } from '../../../config/posthogLogs';
import { Button, Card, Icon } from '../../../components/common';
import { AuthLayout } from '../../../components/layout';
import { toAccount } from '../../../data/demoAuth';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import { fetchOrders, verifyPayment, type Order } from '../../../services/buyer.service';
import { verifyTruckPayment } from '../../../services/truck.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { fmtQty, ghs } from '../../../utils/format';
import { afterSignIn } from '../../auth/screens/VerifyScreen';

type Phase = 'checking' | 'paid' | 'failed' | 'mismatch' | 'pending' | 'signedOut' | 'error';

// Paystack can redirect before its webhook lands, so ask a few times before calling it "still processing".
const ATTEMPTS = 6;
const GAP_MS = 2500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const COPY: Record<Phase, { title: string; subtitle: string }> = {
  checking: {
    title: 'Confirming your payment',
    subtitle: 'Checking with Paystack. Please keep this page open.',
  },
  paid: {
    title: 'Payment received',
    subtitle: 'Thank you. Your payment went through and is confirmed.',
  },
  failed: { title: 'Payment not completed', subtitle: 'No money was taken from you.' },
  mismatch: {
    title: 'We need to look at this',
    subtitle: 'The amount we received did not match your order.',
  },
  pending: {
    title: 'Still processing',
    subtitle: 'Your bank or mobile money provider has not replied yet.',
  },
  signedOut: {
    title: 'Sign in to see your payment',
    subtitle: 'Your session ended while you were paying.',
  },
  error: { title: "We couldn't confirm it", subtitle: 'This is on our side. Your money is safe.' },
};

const native = Platform.OS !== 'web';

/** Fades and lifts its children in after `delay` ms; the receipt uses it to cascade line by line. */
function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** One soft ring that swells out of the badge and fades; two of them, staggered, make the "confirmed" pulse. */
function Ring({ delay, color }: { delay: number; color: string }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 1100,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start();
  }, [v, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        ringStyle,
        {
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
        },
      ]}
    />
  );
}
const ringStyle = {
  position: 'absolute' as const,
  width: 80,
  height: 80,
  borderRadius: 26,
  borderWidth: 2,
};

/** Where Paystack sends the buyer after paying (/payment/verify?reference=...). Verifies the reference, then tells the buyer what happened. */
export function PaymentResultScreen({ reference }: { reference: string }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { reset } = useNav();
  const isTruck = reference.startsWith('TRK');
  const [phase, setPhase] = useState<Phase>('checking');
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  const [pop] = useState(() => new Animated.Value(0));

  const run = useCallback(async () => {
    try {
      if (!(await authService.getProfile().catch(() => null)))
        return live.current && setPhase('signedOut');
      for (let i = 0; i < ATTEMPTS; i++) {
        const status = await (
          isTruck ? verifyTruckPayment(reference) : verifyPayment(reference)
        ).catch(() => null);
        if (!live.current) return;
        if (status === 'success') {
          if (!isTruck)
            setOrder(
              (await fetchOrders().catch(() => [])).find((o) =>
                reference.startsWith(`${o.code}-`),
              ) ?? null,
            );
          return live.current && setPhase('paid');
        }
        if (status === 'failed' || status === 'abandoned') return setPhase('failed');
        if (status === 'mismatch') return setPhase('mismatch');
        if (i < ATTEMPTS - 1) await sleep(GAP_MS);
      }
      if (live.current) setPhase('pending');
    } catch {
      if (live.current) setPhase('error');
    }
  }, [reference, isTruck]);

  useEffect(() => {
    live.current = true;
    const t = setTimeout(run, 0);
    return () => {
      live.current = false;
      clearTimeout(t);
    };
  }, [run]);

  // Web pays on Paystack's page and lands here, so this is where a web payment is recorded.
  useEffect(() => {
    if (phase === 'paid') {
      posthog?.capture('payment_completed', { kind: isTruck ? 'truck' : 'order' });
      posthogLog.info('payment completed', {
        event: 'payment_completed',
        kind: isTruck ? 'truck' : 'order',
      });
    } else if (phase === 'failed' || phase === 'mismatch' || phase === 'error') {
      posthogLog.warn('payment not confirmed', {
        event: 'payment_not_confirmed',
        phase,
        kind: isTruck ? 'truck' : 'order',
      });
    }
  }, [phase, isTruck]);

  // Every settled phase lands with a spring; a failure also gives one short sideways shake.
  const [shake] = useState(() => new Animated.Value(0));
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setCalm, () => undefined);
  }, []);
  useEffect(() => {
    pop.setValue(0);
    if (phase === 'checking' || phase === 'pending') return;
    if (calm) return pop.setValue(1);
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: native,
    }).start();
    if (phase === 'paid') return;
    Animated.sequence(
      [8, -8, 5, -5, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 70, useNativeDriver: native }),
      ),
    ).start();
  }, [phase, pop, shake, calm]);

  const retry = () => {
    setPhase('checking');
    run();
  };
  const toApp = async (tab: string, openOrder?: string) => {
    setBusy(true);
    const p = await authService.getProfile().catch(() => null);
    if (!p || p.role === 'pending') return reset({ name: 'landing' });
    const next = afterSignIn(toAccount(p));
    reset(
      next.name === 'home' && next.role === 'buyer' ? { ...next, tab, order: openOrder } : next,
    );
  };
  const tab = isTruck ? 'truck' : 'orders';

  const badge =
    phase === 'checking' ? (
      <ActivityIndicator size="large" color={colors.brandInk} />
    ) : phase === 'paid' ? (
      <Icon name="check" size={36} color={colors.onBrand} />
    ) : phase === 'pending' ? (
      <ActivityIndicator size="large" color={colors.warningInk} />
    ) : (
      <Icon name={phase === 'signedOut' ? 'lock' : 'close'} size={32} color={colors.dangerInk} />
    );
  const badgeBg =
    phase === 'paid'
      ? colors.brand600
      : phase === 'checking'
        ? colors.brandTint
        : phase === 'pending'
          ? colors.harvestTint
          : colors.surfaceSunken;

  return (
    <AuthLayout
      title={COPY[phase].title}
      subtitle={COPY[phase].subtitle}
      lead={
        <View accessibilityLiveRegion="polite" style={s.center}>
          {phase === 'paid' && !calm ? (
            <>
              <Ring delay={0} color={colors.brand600} />
              <Ring delay={260} color={colors.brand600} />
            </>
          ) : null}
          <Animated.View
            style={[
              s.badge,
              { backgroundColor: badgeBg },
              phase === 'checking' || phase === 'pending'
                ? null
                : {
                    transform: [
                      { translateX: shake },
                      { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                    ],
                  },
            ]}
          >
            {badge}
          </Animated.View>
        </View>
      }
    >
      {phase === 'paid' ? (
        <>
          <Card style={s.receipt}>
            <Rise delay={250}>
              {order ? (
                <Text style={s.amount}>{ghs(order.amount)}</Text>
              ) : (
                <Text style={s.amount}>Cold truck booking</Text>
              )}
            </Rise>
            {order?.items.map((i, n) => (
              <Rise key={`${i.name}-${i.unit}`} delay={400 + n * 90}>
                <View style={s.row}>
                  <Text style={s.k}>
                    {i.name} · {fmtQty(i.kg, i.unit)}
                  </Text>
                  <Text style={s.v}>{ghs(i.lineTotal)}</Text>
                </View>
              </Rise>
            ))}
            <Rise delay={450 + (order?.items.length ?? 0) * 90}>
              <View style={s.receipt}>
                {order ? <Line k="Order" v={order.code} /> : null}
                {order?.paidAt ? <Line k="Paid" v={when(order.paidAt)} /> : null}
                <Line k="Reference" v={reference} />
              </View>
            </Rise>
          </Card>
          <Text style={s.copy}>
            {isTruck
              ? 'Your truck booking is paid. Follow it from the Truck tab.'
              : 'We are lining up farmers and a driver for your order now. Track pickups and delivery from Orders.'}
          </Text>
          <Button
            label={isTruck ? 'View my booking' : 'View my order'}
            size="lg"
            onPress={() => toApp(tab, order?.id)}
            loading={busy}
          />
        </>
      ) : null}

      {phase === 'failed' ? (
        <>
          <Text style={s.copy}>
            The payment was cancelled or declined. Your order is still saved, so you can pay again
            from Orders.
          </Text>
          <Button label="Back to my orders" size="lg" onPress={() => toApp(tab)} loading={busy} />
        </>
      ) : null}

      {phase === 'mismatch' ? (
        <>
          <Text style={s.copy}>
            Do not pay again. Quote this reference to CryoChain support and we will sort it out.
          </Text>
          <Line k="Reference" v={reference} />
          <Button
            label="Back to my orders"
            size="lg"
            variant="outline"
            onPress={() => toApp(tab)}
            loading={busy}
          />
        </>
      ) : null}

      {phase === 'pending' || phase === 'error' ? (
        <>
          <Text style={s.copy}>
            {phase === 'pending'
              ? 'If you approved the payment, it will show up in Orders in a few minutes. You do not need to pay again.'
              : 'Check again in a moment. If you already paid, your order updates by itself.'}
          </Text>
          <Button label="Check again" size="lg" onPress={retry} />
          <Button
            label="Go to my orders"
            variant="ghost"
            onPress={() => toApp(tab)}
            loading={busy}
          />
        </>
      ) : null}

      {phase === 'signedOut' ? (
        <>
          <Text style={s.copy}>
            If you finished paying, your order is safe. Sign in again and it will show as paid.
          </Text>
          <Button label="Sign in" size="lg" onPress={() => reset({ name: 'landing' })} />
        </>
      ) : null}
    </AuthLayout>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.row}>
      <Text style={s.k}>{k}</Text>
      <Text style={[s.v, s.mono]} selectable>
        {v}
      </Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  center: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: 80,
    height: 80,
  },
  badge: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  receipt: { gap: 10 },
  amount: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12 },
  k: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted, flexShrink: 1 },
  v: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: c.ink,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  mono: { fontVariant: ['tabular-nums' as const], fontSize: 12 },
  copy: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: c.inkMuted,
    textAlign: 'center' as const,
  },
});
