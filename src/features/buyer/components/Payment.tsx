import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  cancelOrder,
  fetchBuyerDetails,
  fetchOrders,
  openPayment,
  startPayment,
  submitPaymentOtp,
  verifyPayment,
  type Order,
  type PayMethod,
} from '../../../services/buyer.service';
import { PaymentMethod } from './PaymentMethod';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { fmtQty, ghs } from '../../../utils/format';
import { posthog } from '../../../config/posthog';
import { posthogLog } from '../../../config/posthogLogs';

const POLL_MS = 3000;

/** A MoMo prompt that Paystack expires after a few minutes; Resend unlocks after this wait. */
const RESEND_AFTER_S = 60;

type Phase = 'choose' | 'starting' | 'waiting' | 'paid' | 'error';
type Momo = { phone: string; method: PayMethod; status: string; hint: string | null; at: number };

/**
 * The payment step: the buyer picks Mobile Money or Card, then we watch the order until the payment is confirmed.
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
  const [phase, setPhase] = useState<Phase>('choose');
  const [momo, setMomo] = useState<Momo | null>(null);
  const [otp, setOtp] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [profilePhone, setProfilePhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ref = useRef<{ url?: string; reference: string } | null>(null);
  const paymentCompleted = useRef(false);

  const begin = useCallback(
    async (method: PayMethod) => {
      setPhase('starting');
      setError(null);
      setOtp('');
      try {
        const r = await startPayment(orderId, method);
        ref.current = r;
        posthog?.capture('payment_started', { channel: method.channel });
        if (method.channel === 'card' && r.url) {
          setCheckoutUrl(r.url);
          setMomo(null);
          setPhase('waiting');
          await openPayment(r.url);
        } else if (method.channel === 'mobile_money') {
          setNow(Date.now());
          setMomo({
            phone: method.phone,
            method,
            status: r.status ?? 'pay_offline',
            hint: r.hint ?? null,
            at: Date.now(),
          });
          setPhase('waiting');
        }
      } catch (e) {
        posthogLog.warn('payment start failed', { event: 'payment_start_failed' });
        setError(e instanceof Error ? e.message : 'Could not start the payment. Please try again.');
        setPhase('error');
      }
    },
    [orderId],
  );

  // Load the amount and the buyer's number for the method picker.
  useEffect(() => {
    let live = true;
    fetchOrders()
      .then((all) => live && setOrder(all.find((o) => o.id === orderId) ?? null))
      .catch(() => undefined);
    fetchBuyerDetails()
      .then((d) => live && setProfilePhone(d.phone))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [orderId]);

  // Ticks the Resend countdown while a MoMo prompt is out.
  useEffect(() => {
    if (!momo || phase !== 'waiting') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [momo, phase]);

  const sendOtp = async () => {
    if (!ref.current || !otp.trim()) return;
    try {
      const r = await submitPaymentOtp(orderId, ref.current.reference, otp);
      setOtp('');
      setMomo((m) => (m ? { ...m, status: r.status ?? 'pending', hint: null } : m));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code was not accepted.');
    }
  };

  // While waiting, ask Paystack (via verify) and the database whether the payment went through.
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'starting') return;
    let live = true;
    const tick = async () => {
      const st = ref.current ? await verifyPayment(ref.current.reference).catch(() => null) : null;
      if (live && (st === 'failed' || st === 'abandoned') && momo) {
        setError('The payment was declined or timed out. No money was taken.');
        setPhase('error');
        return;
      }
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
  }, [phase, orderId, onPaid, onLeave, momo]);

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
          {phase === 'choose'
            ? 'How would you like to pay?'
            : phase === 'starting'
              ? 'Preparing your secure payment'
              : ok
                ? 'Payment confirmed'
                : bad
                  ? 'Payment did not go through'
                  : momo
                    ? 'Approve on your phone'
                    : 'Complete your payment'}
        </Text>
        {order ? (
          <Text style={s.total} accessibilityLabel={`Amount to pay ${ghs(order.amount)}`}>
            {ghs(order.amount)}
          </Text>
        ) : null}
        <Text style={s.meta}>
          {phase === 'choose'
            ? 'Choose a method. You can change it any time before you pay.'
            : phase === 'starting'
              ? 'This takes a few seconds. Please keep this page open.'
              : ok
                ? 'Thank you. Taking you to your orders.'
                : bad
                  ? 'No money was taken.'
                  : momo
                    ? `We sent a prompt to ${momo.phone}. Enter your MoMo PIN to approve. This page updates as soon as we hear back.`
                    : 'Finish paying in the Paystack window. This page updates as soon as we hear back, so you do not need to refresh.'}
        </Text>
        {!ok && !bad && phase !== 'choose' ? (
          <View style={s.live} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.brand600} />
            <Text style={s.liveText}>
              {phase === 'starting'
                ? 'Connecting to Paystack'
                : momo
                  ? 'Waiting for your approval'
                  : 'Waiting for your payment'}
            </Text>
          </View>
        ) : null}
      </Card>

      {!bad ? <Steps at={at} s={s} /> : null}

      {phase === 'choose' && order ? (
        <PaymentMethod amount={order.amount} phone={profilePhone} busy={false} onPay={begin} />
      ) : null}

      {phase === 'waiting' && momo ? (
        <Card style={s.confirm}>
          {momo.status === 'send_otp' ? (
            <>
              <Text style={s.head}>Enter the code</Text>
              <Text style={s.meta}>
                {momo.hint || 'Enter the voucher or OTP code from your network to continue.'}
              </Text>
              <Input label="Code" value={otp} onChangeText={setOtp} keyboardType="number-pad" />
              <Button label="Confirm code" onPress={sendOtp} disabled={!otp.trim()} />
            </>
          ) : (
            <Text style={s.meta}>
              No prompt? Check that {momo.phone} is the number for the network you chose and has
              signal.
            </Text>
          )}
          <Button
            variant="outline"
            label={
              now - momo.at < RESEND_AFTER_S * 1000
                ? `Resend prompt in ${Math.ceil((RESEND_AFTER_S * 1000 - (now - momo.at)) / 1000)}s`
                : 'Resend prompt'
            }
            disabled={now - momo.at < RESEND_AFTER_S * 1000}
            onPress={() => begin(momo.method)}
          />
          <Button variant="ghost" label="Change method" onPress={() => setPhase('choose')} />
        </Card>
      ) : null}

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

      {!ok && phase !== 'choose' ? (
        <View style={s.secure}>
          <Icon name="shield" size={16} color={colors.brandInk} />
          <Text style={s.secureText}>
            Paid securely through Paystack. We never see your card or MoMo PIN.
          </Text>
        </View>
      ) : null}

      {phase === 'waiting' && !momo && checkoutUrl ? (
        <Button
          icon="lock"
          size="lg"
          label="Open payment window"
          onPress={() => openPayment(checkoutUrl)}
        />
      ) : null}
      {bad ? <Button size="lg" label="Choose a method" onPress={() => setPhase('choose')} /> : null}
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
