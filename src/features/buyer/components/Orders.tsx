import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner, Dialog, SkeletonCard } from '../../../components/feedback';
import { useNearEnd } from '../../../components/layout';
import {
  cancelOrder,
  fetchSupportContact,
  orderStage,
  orderStatus,
  stillCollecting,
  type Order,
  type OrderStage,
  type SupportContact,
} from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { fmtQty, ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';
import { warmMap } from '../../../components/location/LiveMap';
import { callPhone } from '../../../services/truck.chat.service';
import { downloadReceipt } from '../../../services/invoice.service';
import { canReceipt } from '../../../utils/orderReceipt';
import { etaIn, OrderLiveMap, time, useOrderTracking } from './OrderLiveMap';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** How many of the five tracking steps are finished at each stage; the next one is "current". */
const DONE: Record<Exclude<OrderStage, 'cancelled'>, number> = {
  placed: 1,
  preparing: 2,
  on_the_way: 3,
  delivered: 5,
};

const STAGE_HINT: Record<Exclude<OrderStage, 'cancelled'>, (o: Order) => string> = {
  placed: () => 'Pay to start preparing your produce',
  preparing: () => 'Lining up farms near you',
  on_the_way: (o) =>
    stillCollecting(o)
      ? `${o.progress.pickupsDone} of ${o.progress.pickupsTotal} farm pickups collected`
      : 'Heading to your address',
  delivered: (o) =>
    o.progress.deliveredAt ? `Delivered ${stamp(o.progress.deliveredAt)}` : 'Delivered',
};

const summary = (o: Order) => {
  const names = [...new Set(o.items.map((i) => i.name))];
  return names.length > 2
    ? `${names.slice(0, 2).join(', ')} +${names.length - 2} more`
    : names.join(', ');
};

const NATIVE = Platform.OS !== 'web';

/** Eases a card in once as it mounts; the first few stagger, the rest appear at once. Skipped for reduced motion. */
function Reveal({ index = 0, children }: { index?: number; children: React.ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let run: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return v.setValue(1);
      run = Animated.timing(v, {
        toValue: 1,
        duration: 420,
        delay: Math.min(index, 6) * 55,
        easing: Easing.out(Easing.exp),
        useNativeDriver: NATIVE,
      });
      run.start();
    });
    return () => run?.stop();
  }, [v, index]);
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

/** A soft ring that breathes around the step an order is on right now. */
function Pulse({ color }: { color: string }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE,
      }),
    );
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => !reduce && loop.start());
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
      }}
    />
  );
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** The buyer's orders as a list with live status; tap one for the full tracking timeline and receipt. */
export function Orders({
  orders,
  openId,
  onOpen,
  hasMore,
  loadingMore,
  onLoadMore,
  onPay,
  onRefresh,
}: {
  orders: Order[];
  openId: string | null;
  onOpen: (id: string | null) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onPay: (orderId: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  useEffect(warmMap, []);
  const { busy, error, run } = useAction(onRefresh);

  const isPast = (o: Order) => ['cancelled', 'delivered'].includes(orderStage(o));
  const shown = orders.filter((o) => (tab === 'past') === isPast(o));
  useNearEnd(onLoadMore);
  // A tab with few matches may not scroll, so the scroll trigger never fires; fill it from the backend.
  useEffect(() => {
    if (!openId && hasMore && !loadingMore && shown.length < 5) onLoadMore();
  });

  const opened = orders.find((o) => o.id === openId);
  if (opened)
    return (
      <OrderDetail
        order={opened}
        busy={busy}
        error={error}
        onBack={() => onOpen(null)}
        onPay={onPay}
        onCancel={() => run(() => cancelOrder(opened.id))}
      />
    );

  return (
    <View style={s.list}>
      <View style={s.headRow}>
        <Text style={s.heading}>My orders</Text>
        {orders.length > 0 ? (
          <Text style={s.meta}>
            {orders.length}
            {hasMore ? '+' : ''} total
          </Text>
        ) : null}
      </View>
      <View style={s.seg} accessibilityRole="tablist">
        {(['active', 'past'] as const).map((k) => (
          <Pressable
            key={k}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
            onPress={() => setTab(k)}
            style={[s.segBtn, tab === k && s.segOn]}
          >
            <Text style={[s.segText, tab === k && s.segTextOn]}>
              {k === 'active' ? 'In progress' : 'Delivered & cancelled'}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Banner text={error} /> : null}

      {shown.length === 0 ? (
        <Card style={s.empty}>
          <View style={s.emptyIcon}>
            <Icon name="package" size={26} color={colors.brandInk} />
          </View>
          <Text style={s.title}>
            {orders.length === 0
              ? 'No orders yet'
              : tab === 'active'
                ? 'Nothing in progress'
                : 'No past orders'}
          </Text>
          <Text style={s.emptyText}>
            {orders.length === 0
              ? 'Add produce to your cart from the shop and your orders will be tracked here.'
              : tab === 'active'
                ? 'Orders you place show up here until they are delivered.'
                : 'Delivered and cancelled orders are kept here.'}
          </Text>
        </Card>
      ) : null}

      {shown.map((o, idx) => {
        const st = orderStatus(o);
        const stage = orderStage(o);
        const unpaid = o.state === 'awaiting_payment';
        return (
          <Reveal key={o.id} index={idx}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Order ${o.code}, ${st.label}, view details`}
              onPress={() => onOpen(o.id)}
            >
              {({ pressed }) => (
                <Card style={[s.item, pressed && s.pressed]}>
                  <View style={s.top}>
                    <View style={s.grow}>
                      <Text style={s.name} numberOfLines={2}>
                        {summary(o)}
                      </Text>
                      <Text style={s.meta}>
                        {o.code} · {day(o.createdAt)} · {o.items.length} item
                        {o.items.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Badge label={st.label} tone={st.tone} />
                  </View>
                  {o.refunds.length > 0 ? <ShortageNote o={o} compact /> : null}
                  {stage !== 'cancelled' ? (
                    <View style={s.progress}>
                      <MiniTrack stage={stage} s={s} />
                      <Text style={s.hint}>{STAGE_HINT[stage](o)}</Text>
                    </View>
                  ) : null}
                  <View style={s.foot}>
                    <Text style={s.total}>{ghs(o.amount)}</Text>
                    {unpaid ? (
                      <Button size="sm" label="Pay now" onPress={() => onPay(o.id)} />
                    ) : (
                      <View style={s.more}>
                        <Text style={s.moreText}>
                          {stage === 'delivered'
                            ? 'View receipt'
                            : stage === 'cancelled'
                              ? 'View order'
                              : 'Track order'}
                        </Text>
                        <Icon name="chevronRight" size={16} color={colors.brandInk} />
                      </View>
                    )}
                  </View>
                </Card>
              )}
            </Pressable>
          </Reveal>
        );
      })}
      {loadingMore ? <SkeletonCard /> : null}
      {!hasMore && orders.length > 0 ? <Text style={s.end}>All your orders are shown</Text> : null}
    </View>
  );
}

/** Flags an order we could not fully supply, with the money owed back and where that refund stands. */
function ShortageNote({ o, compact }: { o: Order; compact?: boolean }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const total = o.refunds.reduce((n, r) => n + r.amount, 0);
  const paid = o.refunds.every((r) => r.refunded);
  const text = `${ghs(total)} ${paid ? 'refunded' : 'refund on its way'}`;
  return (
    <View
      style={s.alert}
      accessibilityRole="alert"
      accessibilityLabel={`Some produce was short. ${text}`}
    >
      <Icon name="alert" size={compact ? 16 : 20} color={colors.warningInk} />
      <View style={s.grow}>
        <Text style={s.alertTitle}>
          {compact ? `Short supply · ${text}` : 'Some of your produce was short'}
        </Text>
        {compact ? null : (
          <Text style={s.meta}>
            We could not supply everything you ordered.{' '}
            {paid
              ? 'The money for it has been returned to you'
              : 'The money for it is being returned to you'}
            : {text}.
          </Text>
        )}
      </View>
    </View>
  );
}

/** Five segments, one per tracking step, so a card shows progress at a glance. */
function MiniTrack({
  stage,
  s,
}: {
  stage: Exclude<OrderStage, 'cancelled'>;
  s: ReturnType<typeof styles>;
}) {
  return (
    <View style={s.mini} accessibilityLabel={`${DONE[stage]} of 5 steps done`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[s.seg5, i < DONE[stage] && s.seg5Done, i === DONE[stage] && s.seg5Now]}
        />
      ))}
    </View>
  );
}

/** The headline of an order in transit: what is happening, when it arrives and how far along it is. */
function OrderHero({
  o,
  stage,
  eta,
}: {
  o: Order;
  stage: 'preparing' | 'on_the_way';
  eta: string | null;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const headline =
    stage === 'preparing'
      ? 'Preparing your order'
      : stillCollecting(o)
        ? 'On a truck'
        : 'On the way to you';
  return (
    <View style={s.hero} accessibilityLabel={`${headline}. ${eta ? `Arriving ${etaIn(eta)}` : ''}`}>
      <View style={s.heroTop}>
        <Icon name="truck" size={18} color={colors.brandInk} />
        <Text style={s.heroKicker}>{headline}</Text>
      </View>
      <Text style={s.heroEta}>{eta ? etaIn(eta) : 'Arrival time soon'}</Text>
      <Text style={s.heroSub}>
        {eta ? `Expected around ${time(eta)}` : 'We will show the time once a truck is assigned'}
      </Text>
      <View style={s.mini}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[s.heroSeg, i < DONE[stage] && s.heroSegDone, i === DONE[stage] && s.heroSegNow]}
          />
        ))}
      </View>
    </View>
  );
}

function OrderDetail({
  order: o,
  busy,
  error,
  onBack,
  onPay,
  onCancel,
}: {
  order: Order;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onPay: (id: string) => void;
  onCancel: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const st = orderStatus(o);
  const stage = orderStage(o);
  const unpaid = o.state === 'awaiting_payment';
  const retry = o.payment === 'failed' || o.payment === 'abandoned';
  const { pickupsTotal, deliveredAt } = o.progress;
  const live = o.state === 'paid' && !deliveredAt;
  const track = useOrderTracking(live ? o.id : null);
  const [support, setSupport] = useState<SupportContact | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    fetchSupportContact().then(setSupport, () => undefined);
  }, []);
  const driver = live ? track?.driver : null;

  const steps: { title: string; note: string }[] = [
    { title: 'Order placed', note: stamp(o.createdAt) },
    {
      title: 'Payment',
      note: o.paidAt ? `Received ${stamp(o.paidAt)}` : 'Waiting for your payment',
    },
    {
      title: 'Preparing your produce',
      note:
        stage === 'preparing'
          ? 'We are lining up farms near you'
          : pickupsTotal > 0
            ? 'Matched with farms near you'
            : 'Farms are matched once you have paid',
    },
    {
      title: 'On the way',
      note:
        stage === 'on_the_way'
          ? stillCollecting(o)
            ? `${o.progress.pickupsDone} of ${pickupsTotal} farm pickups collected`
            : 'Heading to you'
          : 'A driver collects it and brings it to you',
    },
    {
      title: 'Delivered',
      note: deliveredAt ? stamp(deliveredAt) : 'Arrives at your delivery address',
    },
  ];
  const done = stage === 'cancelled' ? 0 : DONE[stage];

  return (
    <View style={s.list}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to orders"
        onPress={onBack}
        hitSlop={8}
        style={s.back}
      >
        <Icon name="arrowLeft" size={20} color={colors.ink} />
        <Text style={s.backText}>My orders</Text>
      </Pressable>

      <View style={s.top}>
        <View style={s.grow}>
          <Text style={s.heading}>{o.code}</Text>
          <Text style={s.meta}>
            Placed {day(o.createdAt)} · {summary(o)}
          </Text>
        </View>
        <Badge label={st.label} tone={st.tone} />
      </View>
      {error || saveError ? <Banner text={(error ?? saveError)!} /> : null}

      {unpaid ? (
        <Card tone="tint" style={s.box}>
          <Text style={s.title}>
            {retry ? 'Payment did not go through' : 'Waiting for payment'}
          </Text>
          <Text style={s.meta}>
            {o.payment === 'failed'
              ? 'Your last payment attempt failed. No money was taken; try again.'
              : o.payment === 'abandoned'
                ? 'Your last payment was not completed. Try again when you are ready.'
                : o.payment === 'pending'
                  ? 'A payment is in progress. If you already paid, it will show here shortly.'
                  : 'Your produce is held for you while you pay. Unpaid orders are released after 30 minutes.'}
          </Text>
          <Button label={retry ? 'Try payment again' : 'Pay now'} onPress={() => onPay(o.id)} />
          <Button
            size="sm"
            variant="outline"
            label="Cancel order"
            loading={busy}
            onPress={() => setConfirmCancel(true)}
          />
        </Card>
      ) : null}
      {confirmCancel ? (
        <Dialog
          title="Cancel this order?"
          subtitle={`Order ${o.code} will be cancelled and the produce held for you goes back on sale. This can't be undone.`}
          onClose={() => setConfirmCancel(false)}
          footer={
            <View style={s.confirmRow}>
              <Button
                label="Keep order"
                variant="outline"
                style={s.confirmBtn}
                onPress={() => setConfirmCancel(false)}
              />
              <Button
                label="Yes, cancel order"
                variant="danger"
                style={s.confirmBtn}
                onPress={() => {
                  setConfirmCancel(false);
                  onCancel();
                }}
              />
            </View>
          }
        >
          <View />
        </Dialog>
      ) : null}

      {o.refunds.length > 0 ? <ShortageNote o={o} /> : null}

      {live ? (
        <OrderHero o={o} stage={stage as 'preparing' | 'on_the_way'} eta={track?.eta ?? null} />
      ) : null}

      {live ? <OrderLiveMap t={track} preparing={stage === 'preparing'} /> : null}

      {stage === 'delivered' ? (
        <View style={s.done} accessibilityLabel="Order delivered">
          <View style={s.doneIcon}>
            <Icon name="check" size={22} color="#ffffff" strokeWidth={3} />
          </View>
          <View style={s.grow}>
            <Text style={s.doneTitle}>Delivered</Text>
            <Text style={s.doneSub}>
              {deliveredAt ? stamp(deliveredAt) : 'Your produce has arrived'}
            </Text>
          </View>
        </View>
      ) : null}

      {driver ? (
        <Card style={s.box}>
          <View style={s.person}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials(driver.name) || '?'}</Text>
            </View>
            <View style={s.grow}>
              <Text style={s.meta}>Your driver</Text>
              <Text style={s.k}>{driver.name}</Text>
              {driver.plate ? <Text style={s.meta}>Truck {driver.plate}</Text> : null}
            </View>
            {driver.phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Call ${driver.name}`}
                onPress={() => callPhone(driver.phone).catch(() => undefined)}
                style={({ pressed }) => [s.callBtn, pressed && s.pressed]}
              >
                <Icon name="phone" size={20} color="#ffffff" />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ) : null}

      {stage === 'cancelled' ? (
        <Card style={s.box}>
          <Text style={s.title}>This order was cancelled</Text>
          <Text style={s.meta}>
            Nothing was charged for it. Browse the shop to place a new one.
          </Text>
        </Card>
      ) : (
        <Card style={s.box}>
          <Text style={s.title}>Tracking</Text>
          <View>
            {steps.map((step, i) => {
              const isDone = i < done;
              const now = i === done;
              return (
                <View key={step.title} style={s.stepRow}>
                  <View style={s.rail}>
                    <View style={[s.dot, isDone && s.dotDone, now && s.dotNow]}>
                      {isDone ? (
                        <Icon name="check" size={13} color="#ffffff" strokeWidth={3} />
                      ) : now ? (
                        <>
                          <Pulse color={colors.harvestFill} />
                          <View style={s.dotPulse} />
                        </>
                      ) : null}
                    </View>
                    {i < steps.length - 1 ? <View style={[s.line, isDone && s.lineDone]} /> : null}
                  </View>
                  <View style={s.stepBody}>
                    <Text style={[s.stepTitle, !isDone && !now && s.stepIdle]}>{step.title}</Text>
                    <Text style={[s.meta, !isDone && !now && s.stepIdle]}>{step.note}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      )}

      <Card style={s.box}>
        <Text style={s.title}>Items · {o.items.length}</Text>
        {o.items.map((i) => (
          <View key={`${i.name}-${i.unit}`} style={s.row}>
            <View style={s.grow}>
              <Text style={s.k}>{i.name}</Text>
              <Text style={s.meta}>
                {fmtQty(i.kg, i.unit)} × {ghs(i.lineTotal / (i.kg || 1))}
              </Text>
            </View>
            <Text style={s.v}>{ghs(i.lineTotal)}</Text>
          </View>
        ))}
        <View style={s.divider} />
        <View style={s.row}>
          <Text style={s.label}>Total</Text>
          <Text style={s.total}>{ghs(o.amount)}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.meta}>Payment</Text>
          <Text style={s.v}>
            {o.state === 'paid'
              ? o.paidAt
                ? `Paid ${day(o.paidAt)}`
                : 'Paid'
              : o.state === 'cancelled'
                ? 'Not charged'
                : 'Not paid yet'}
          </Text>
        </View>
        {o.refunds.map((r, i) => (
          <View key={i} style={s.row}>
            <Text style={s.meta}>Refund for what we could not supply</Text>
            <Text style={s.v}>
              {ghs(r.amount)} · {r.refunded ? 'Refunded' : 'Being processed'}
            </Text>
          </View>
        ))}
        {canReceipt(o) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Download receipt as PDF"
            accessibilityState={{ busy: saving }}
            disabled={saving}
            onPress={() => {
              setSaving(true);
              setSaveError(null);
              downloadReceipt(o)
                .catch((e) =>
                  setSaveError(e instanceof Error ? e.message : 'Could not make the receipt.'),
                )
                .finally(() => setSaving(false));
            }}
            style={({ pressed }) => [s.receipt, (pressed || saving) && s.pressed]}
          >
            <View style={s.receiptIcon}>
              <Icon name="clipboard" size={20} color="#ffffff" />
            </View>
            <View style={s.grow}>
              <Text style={s.k}>Receipt</Text>
              <Text style={s.meta}>{saving ? 'Preparing your PDF…' : 'Save or share as PDF'}</Text>
            </View>
            <View style={s.receiptGo}>
              <Icon name="download" size={18} color={colors.brandInk} />
            </View>
          </Pressable>
        ) : null}
      </Card>

      {o.deliveryAddress ? (
        <Card style={s.box}>
          <Text style={s.title}>Delivery address</Text>
          <View style={s.addr}>
            <Icon name="pin" size={16} color={colors.brandInk} />
            <Text style={s.addrText}>{o.deliveryAddress}</Text>
          </View>
        </Card>
      ) : null}

      {support && (support.phone || support.email) ? (
        <Card style={s.box}>
          <Text style={s.title}>Need help with this order?</Text>
          <Text style={s.meta}>Quote {o.code} when you reach us.</Text>
          <View style={s.tiles}>
            {support.phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Call support on +${support.phone}`}
                onPress={() => callPhone(`+${support.phone}`).catch(() => undefined)}
                style={({ pressed }) => [s.tile, pressed && s.pressed]}
              >
                <Icon name="phone" size={20} color={colors.brandInk} />
                <Text style={s.tileTitle}>Call</Text>
                <Text style={s.meta} numberOfLines={1}>
                  +{support.phone}
                </Text>
              </Pressable>
            ) : null}
            {support.email ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Email support at ${support.email}`}
                onPress={() =>
                  Linking.openURL(
                    `mailto:${support.email}?subject=${encodeURIComponent(`Order ${o.code}`)}`,
                  ).catch(() => undefined)
                }
                style={({ pressed }) => [s.tile, pressed && s.pressed]}
              >
                <Icon name="mail" size={20} color={colors.brandInk} />
                <Text style={s.tileTitle}>Email</Text>
                <Text style={s.meta} numberOfLines={1}>
                  {support.email}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  confirmRow: { flexDirection: 'row' as const, gap: 10 },
  confirmBtn: { flex: 1 },
  list: { gap: 14 },
  headRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
  },
  progress: { gap: 8 },
  foot: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  done: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: c.brand900,
  },
  doneIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand600,
  },
  doneTitle: { fontFamily: fonts.heading, fontSize: 22, letterSpacing: -0.3, color: '#ffffff' },
  doneSub: { fontFamily: fonts.sansMedium, fontSize: 14, color: '#bfe9cf' },
  person: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  avatarText: { fontFamily: fonts.heading, fontSize: 18, color: c.brandInk },
  callBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand600,
  },
  tiles: { flexDirection: 'row' as const, gap: 10, flexWrap: 'wrap' as const },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 88,
    gap: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: c.surfaceSunken,
  },
  tileTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  heading: { fontFamily: fonts.heading, fontSize: 26, letterSpacing: -0.4, color: c.ink },
  seg: {
    flexDirection: 'row' as const,
    padding: 4,
    borderRadius: 14,
    backgroundColor: c.surfaceSunken,
  },
  segBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 11,
  },
  segOn: { backgroundColor: c.surfaceCard },
  segText: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  segTextOn: { fontFamily: fonts.sansBold, color: c.ink },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 32 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  emptyText: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 20,
    color: c.inkMuted,
    textAlign: 'center' as const,
    maxWidth: 300,
  },
  item: { gap: 12, padding: 16 },
  pressed: { opacity: 0.8 },
  box: { gap: 12, padding: 16 },
  top: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  grow: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  name: { fontFamily: fonts.heading, fontSize: 18, letterSpacing: -0.2, color: c.ink },
  meta: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: c.inkMuted,
    flexShrink: 1,
  },
  more: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  moreText: { fontFamily: fonts.sansBold, fontSize: 13, color: c.brandInk },
  alert: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: c.harvestTint,
  },
  alertTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  end: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.inkMuted,
    textAlign: 'center' as const,
    paddingVertical: 8,
  },
  hint: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  hero: { gap: 6, padding: 20, borderRadius: 20, backgroundColor: c.brand900 },
  heroTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  heroKicker: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  heroEta: { fontFamily: fonts.heading, fontSize: 34, letterSpacing: -0.6, color: '#ffffff' },
  heroSub: { fontFamily: fonts.sansMedium, fontSize: 14, color: '#bfe9cf', marginBottom: 8 },
  heroSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  heroSegDone: { backgroundColor: c.brand500 },
  heroSegNow: { backgroundColor: c.harvestFill },
  mini: { flexDirection: 'row' as const, gap: 4 },
  seg5: { flex: 1, height: 5, borderRadius: 3, backgroundColor: c.borderSubtle },
  seg5Done: { backgroundColor: c.brand600 },
  seg5Now: { backgroundColor: c.harvestFill },
  back: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 44,
    alignSelf: 'flex-start' as const,
  },
  backText: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  stepRow: { flexDirection: 'row' as const, gap: 14 },
  rail: { alignItems: 'center' as const, width: 24 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceCard,
  },
  dotDone: { backgroundColor: c.brand600, borderColor: c.brand600 },
  dotNow: { borderColor: c.harvestFill },
  dotPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.harvestFill },
  line: { flex: 1, width: 2, minHeight: 22, backgroundColor: c.borderSubtle },
  lineDone: { backgroundColor: c.brand600 },
  stepBody: { flex: 1, gap: 2, paddingBottom: 18 },
  stepTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  stepIdle: { color: c.inkMuted, opacity: 0.8 },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  k: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, flexShrink: 1 },
  v: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  label: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  total: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  receipt: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 64,
    padding: 12,
    borderRadius: 16,
    backgroundColor: c.brandTint,
  },
  receiptIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand600,
  },
  receiptGo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.surfaceCard,
  },
  divider: { height: 1, backgroundColor: c.borderSubtle },
  addr: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8 },
  addrText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.ink },
});
