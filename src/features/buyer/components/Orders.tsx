import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { cancelOrder, orderStage, orderStatus, type Order, type OrderStage } from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });
const stamp = (iso: string) => new Date(iso).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** How many of the five tracking steps are finished at each stage; the next one is "current". */
const DONE: Record<Exclude<OrderStage, 'cancelled'>, number> = { placed: 1, preparing: 2, on_the_way: 3, delivered: 5 };

const summary = (o: Order) => {
  const names = [...new Set(o.items.map((i) => i.name))];
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2} more` : names.join(', ');
};

/** The buyer's orders as a list with live status; tap one for the full tracking timeline and receipt. */
export function Orders({ orders, onPay, onRefresh }: {
  orders: Order[];
  onPay: (orderId: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [openId, setOpenId] = useState<string | null>(null);
  const { busy, error, run } = useAction(onRefresh);

  const opened = orders.find((o) => o.id === openId);
  if (opened) return <OrderDetail order={opened} busy={busy} error={error} onBack={() => setOpenId(null)} onPay={onPay} onCancel={() => run(() => cancelOrder(opened.id))} />;

  const isPast = (o: Order) => ['cancelled', 'delivered'].includes(orderStage(o));
  const shown = orders.filter((o) => (tab === 'past') === isPast(o));

  return (
    <View style={s.list}>
      <Text style={s.heading}>My orders</Text>
      <View style={s.seg} accessibilityRole="tablist">
        {(['active', 'past'] as const).map((k) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[s.segBtn, tab === k && s.segOn]}>
            <Text style={[s.segText, tab === k && s.segTextOn]}>{k === 'active' ? 'In progress' : 'Delivered & cancelled'}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Banner text={error} /> : null}

      {shown.length === 0 ? (
        <Card style={s.empty}>
          <View style={s.emptyIcon}><Icon name="package" size={26} color={colors.brandInk} /></View>
          <Text style={s.title}>{orders.length === 0 ? 'No orders yet' : tab === 'active' ? 'Nothing in progress' : 'No past orders'}</Text>
          <Text style={s.emptyText}>{orders.length === 0 ? 'Add produce to your cart from the shop and your orders will be tracked here.' : tab === 'active' ? 'Orders you place show up here until they are delivered.' : 'Delivered and cancelled orders are kept here.'}</Text>
        </Card>
      ) : null}

      {shown.map((o) => {
        const st = orderStatus(o);
        const stage = orderStage(o);
        const unpaid = o.state === 'awaiting_payment';
        return (
          <Pressable key={o.id} accessibilityRole="button" accessibilityLabel={`Order ${o.code}, ${st.label}, view details`} onPress={() => setOpenId(o.id)}>
            {({ pressed }) => (
              <Card style={[s.item, pressed && s.pressed]}>
                <View style={s.top}>
                  <View style={s.grow}>
                    <Text style={s.name}>{o.code}</Text>
                    <Text style={s.meta}>{day(o.createdAt)} · {o.items.length} item{o.items.length === 1 ? '' : 's'}</Text>
                  </View>
                  <Badge label={st.label} tone={st.tone} />
                </View>
                <Text style={s.summary} numberOfLines={1}>{summary(o)}</Text>
                {stage !== 'cancelled' ? <MiniTrack stage={stage} s={s} /> : null}
                <View style={s.top}>
                  <Text style={s.total}>{ghs(o.amount)}</Text>
                  {unpaid ? <Button size="sm" label="Pay now" onPress={() => onPay(o.id)} /> : (
                    <View style={s.more}><Text style={s.moreText}>Track order</Text><Icon name="chevronRight" size={16} color={colors.brandInk} /></View>
                  )}
                </View>
              </Card>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Five segments, one per tracking step, so a card shows progress at a glance. */
function MiniTrack({ stage, s }: { stage: Exclude<OrderStage, 'cancelled'>; s: ReturnType<typeof styles> }) {
  return (
    <View style={s.mini} accessibilityLabel={`${DONE[stage]} of 5 steps done`}>
      {[0, 1, 2, 3, 4].map((i) => <View key={i} style={[s.seg5, i < DONE[stage] && s.seg5Done, i === DONE[stage] && s.seg5Now]} />)}
    </View>
  );
}

function OrderDetail({ order: o, busy, error, onBack, onPay, onCancel }: {
  order: Order; busy: boolean; error: string | null; onBack: () => void; onPay: (id: string) => void; onCancel: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const st = orderStatus(o);
  const stage = orderStage(o);
  const unpaid = o.state === 'awaiting_payment';
  const retry = o.payment === 'failed' || o.payment === 'abandoned';
  const { pickupsTotal, pickupsDone, deliveredAt } = o.progress;
  const totalKg = o.items.reduce((sum, i) => sum + i.kg, 0);

  const steps: { title: string; note: string }[] = [
    { title: 'Order placed', note: stamp(o.createdAt) },
    { title: 'Payment', note: o.paidAt ? `Received ${stamp(o.paidAt)}` : 'Waiting for your payment' },
    { title: 'Preparing your produce', note: stage === 'preparing' ? 'We are lining up farms near you' : pickupsTotal > 0 ? `${pickupsDone} of ${pickupsTotal} farm pickups collected` : 'Farms are matched once you have paid' },
    { title: 'On the way', note: stage === 'on_the_way' ? `${pickupsDone} of ${pickupsTotal} farm pickups collected, heading to you` : 'A driver collects it from the farms and brings it to you' },
    { title: 'Delivered', note: deliveredAt ? stamp(deliveredAt) : 'Arrives at your delivery address' },
  ];
  const done = stage === 'cancelled' ? 0 : DONE[stage];

  return (
    <View style={s.list}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to orders" onPress={onBack} hitSlop={8} style={s.back}>
        <Icon name="arrowLeft" size={20} color={colors.ink} />
        <Text style={s.backText}>My orders</Text>
      </Pressable>

      <View style={s.top}>
        <View style={s.grow}>
          <Text style={s.heading}>{o.code}</Text>
          <Text style={s.meta}>Placed {day(o.createdAt)}</Text>
        </View>
        <Badge label={st.label} tone={st.tone} />
      </View>
      {error ? <Banner text={error} /> : null}

      {unpaid ? (
        <Card tone="tint" style={s.box}>
          <Text style={s.title}>{retry ? 'Payment did not go through' : 'Waiting for payment'}</Text>
          <Text style={s.meta}>
            {o.payment === 'failed' ? 'Your last payment attempt failed. No money was taken; try again.'
              : o.payment === 'abandoned' ? 'Your last payment was not completed. Try again when you are ready.'
              : o.payment === 'pending' ? 'A payment is in progress. If you already paid, it will show here shortly.'
              : 'Your produce is held for you while you pay. Unpaid orders are released after 30 minutes.'}
          </Text>
          <Button label={retry ? 'Try payment again' : 'Pay now'} onPress={() => onPay(o.id)} />
          <Button size="sm" variant="outline" label="Cancel order" loading={busy} onPress={onCancel} />
        </Card>
      ) : null}

      {stage === 'cancelled' ? (
        <Card style={s.box}>
          <Text style={s.title}>This order was cancelled</Text>
          <Text style={s.meta}>Nothing was charged for it. Browse the shop to place a new one.</Text>
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
                    <View style={[s.dot, isDone && s.dotDone, now && s.dotNow]}>{isDone ? <Icon name="check" size={13} color="#ffffff" strokeWidth={3} /> : now ? <View style={s.dotPulse} /> : null}</View>
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
        <Text style={s.title}>Items · {kg(totalKg)}</Text>
        {o.items.map((i) => (
          <View key={`${i.name}-${i.grade}`} style={s.row}>
            <View style={s.grow}>
              <Text style={s.k}>{i.name}</Text>
              <Text style={s.meta}>Grade {i.grade} · {kg(i.kg)} × {ghs(i.lineTotal / (i.kg || 1))}</Text>
            </View>
            <Text style={s.v}>{ghs(i.lineTotal)}</Text>
          </View>
        ))}
        <View style={s.divider} />
        <View style={s.row}><Text style={s.label}>Total</Text><Text style={s.total}>{ghs(o.amount)}</Text></View>
        <View style={s.row}>
          <Text style={s.meta}>Payment</Text>
          <Text style={s.v}>{o.state === 'paid' ? (o.paidAt ? `Paid ${day(o.paidAt)}` : 'Paid') : o.state === 'cancelled' ? 'Not charged' : 'Not paid yet'}</Text>
        </View>
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
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  heading: { fontFamily: fonts.heading, fontSize: 26, letterSpacing: -0.4, color: c.ink },
  seg: { flexDirection: 'row' as const, padding: 4, borderRadius: 14, backgroundColor: c.surfaceSunken },
  segBtn: { flex: 1, minHeight: 40, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 11 },
  segOn: { backgroundColor: c.surfaceCard },
  segText: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  segTextOn: { fontFamily: fonts.sansBold, color: c.ink },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 32 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  emptyText: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, textAlign: 'center' as const, maxWidth: 300 },
  item: { gap: 12, padding: 16 },
  pressed: { opacity: 0.8 },
  box: { gap: 12, padding: 16 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  grow: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  summary: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted, flexShrink: 1 },
  more: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 },
  moreText: { fontFamily: fonts.sansBold, fontSize: 13, color: c.brandInk },
  mini: { flexDirection: 'row' as const, gap: 4 },
  seg5: { flex: 1, height: 5, borderRadius: 3, backgroundColor: c.borderSubtle },
  seg5Done: { backgroundColor: c.brand600 },
  seg5Now: { backgroundColor: c.harvestFill },
  back: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44, alignSelf: 'flex-start' as const },
  backText: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  stepRow: { flexDirection: 'row' as const, gap: 14 },
  rail: { alignItems: 'center' as const, width: 24 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  dotDone: { backgroundColor: c.brand600, borderColor: c.brand600 },
  dotNow: { borderColor: c.harvestFill },
  dotPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.harvestFill },
  line: { flex: 1, width: 2, minHeight: 22, backgroundColor: c.borderSubtle },
  lineDone: { backgroundColor: c.brand600 },
  stepBody: { flex: 1, gap: 2, paddingBottom: 18 },
  stepTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  stepIdle: { color: c.inkMuted, opacity: 0.8 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 12 },
  k: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, flexShrink: 1 },
  v: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  label: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  total: { fontFamily: fonts.heading, fontSize: 22, color: c.ink, fontVariant: ['tabular-nums' as const] },
  divider: { height: 1, backgroundColor: c.borderSubtle },
  addr: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8 },
  addrText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.ink },
});
