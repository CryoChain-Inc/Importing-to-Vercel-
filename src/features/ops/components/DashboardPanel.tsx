import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Icon, type IconName } from '../../../components/common';
import { Reveal } from '../../../components/feedback';
import {
  fonts,
  focusRing,
  useTheme,
  useThemedStyles,
  type ColorToken,
  type PressState,
} from '../../../theme';
import type { DriverRoute } from '../../../services/ops.fulfilment.service';
import { ghs } from '../../../utils/format';
import { boardFilter, orderTrack } from '../orderTrack';
import type { OpsCore } from '../data';
import { Empty, Hero, Meter, SectionTitle, Stat, StatGrid, when } from './OpsBits';
import { ProductSupply } from './SupplyPanel';

const qty = (n: number) => n.toLocaleString('en-GH', { maximumFractionDigits: 2 });

/** Overview: money in, what needs doing, what is on the road and what farmers have listed. Every figure opens its list. */
export function DashboardPanel({
  data,
  drivers,
  onGo,
}: {
  data: OpsCore;
  /** Null until the second load lands. */
  drivers: DriverRoute[] | null;
  onGo: (tab: string, params?: Record<string, string>) => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const paid = data.orders.filter((o) => o.state === 'paid');
  const received = paid.reduce((n, o) => n + o.amount, 0);
  const awaiting = data.orders.filter((o) => o.state === 'awaiting_payment');
  const awaitingSum = awaiting.reduce((n, o) => n + o.amount, 0);
  const moving = data.board.filter((o) => boardFilter(o).stage === 'moving');
  const farmerWait = data.board.filter((o) => boardFilter(o).stage === 'farmers').length;
  const unallocated = data.board.filter((o) => boardFilter(o).stage === 'attention').length;
  const trucksOut = drivers?.filter((d) => d.stops.some((x) => x.state === 'pending')).length;
  const noListings = data.supply.length === 0;

  const todo: { tab: string; params?: Record<string, string>; icon: IconName; label: string; n: number }[] = [
    {
      tab: 'payments',
      params: { state: 'awaiting_payment' },
      icon: 'banknote',
      label: 'Orders awaiting payment',
      n: awaiting.length,
    },
    { tab: 'orders', params: { stage: 'moving' }, icon: 'truck', label: 'Orders on the road', n: moving.length },
    {
      tab: 'orders',
      params: { stage: 'farmers' },
      icon: 'leaf',
      label: 'Waiting for farmers to accept',
      n: farmerWait,
    },
    {
      tab: 'orders',
      params: { stage: 'attention' },
      icon: 'alert',
      label: 'Paid but not allocated',
      n: unallocated,
    },
  ];

  return (
    <View style={s.wrap}>
      <Hero
        label="Received from buyers"
        value={ghs(received)}
        cells={[
          { label: 'Awaiting payment', value: ghs(awaitingSum) },
          { label: 'Paid orders', value: String(paid.length) },
        ]}
      />
      <StatGrid>
        <Stat
          icon="banknote"
          label="Awaiting payment"
          value={String(awaiting.length)}
          tone={awaiting.length ? 'warn' : undefined}
          note={awaiting.length ? ghs(awaitingSum) + ' unpaid' : 'Nothing unpaid'}
          onPress={() => onGo('payments', { state: 'awaiting_payment' })}
        />
        <Stat
          icon="truck"
          label="On the road"
          value={String(moving.length)}
          tone={moving.length ? 'brand' : undefined}
          note={moving.length ? 'Being collected or delivered' : 'No trips right now'}
          onPress={() => onGo('orders', { stage: 'moving' })}
        />
        <Stat
          icon="users"
          label="Trucks out"
          value={trucksOut == null ? '–' : String(trucksOut)}
          note="Drivers with stops left"
          onPress={() => onGo('routes')}
        />
        <Stat
          icon="leaf"
          label="Listed by farmers"
          value={String(data.supply.length)}
          note={`${data.supply.filter((r) => r.remainingKg > 0).length} still to sell`}
          onPress={() => onGo('supply')}
        />
      </StatGrid>

      <View style={s.cols}>
        <View style={s.main}>
          <SectionTitle
            title="On the road"
            note="Where each trip is going and how much has been collected."
          />
          {moving.length === 0 ? (
            <Empty
              icon="truck"
              title="Nothing on the road"
              hint="Paid orders show here from the first pickup until they reach the buyer."
            />
          ) : (
            <>
              {moving.slice(0, 5).map((o, i) => {
                const t = orderTrack(o);
                const st = boardFilter(o);
                const pct = t.orderedKg > 0 ? (t.collectedKg / t.orderedKg) * 100 : 0;
                return (
                  <Reveal key={o.id} index={i}>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`Open order ${o.code}`}
                      onPress={() => onGo('orders', { order: o.id })}
                      style={({ hovered, pressed, focused }: PressState) => [
                        s.live,
                        hovered && s.hover,
                        pressed && s.press,
                        focused && focusRing(colors.focusRing),
                      ]}
                    >
                      <View style={s.liveTop}>
                        <View style={s.grow}>
                          <Text style={s.liveName} numberOfLines={1}>
                            {o.code} · {o.buyer}
                          </Text>
                          <Text style={s.liveMeta} numberOfLines={1}>
                            {o.driver?.name ? `Driver ${o.driver.name}` : 'No driver yet'}
                            {t.next ? ` · to ${t.next.label}` : ''}
                          </Text>
                        </View>
                        <Badge label={st.label} tone={st.tone} />
                      </View>
                      <Meter pct={pct} />
                      <View style={s.liveTop}>
                        <Text style={s.liveMeta}>
                          {qty(t.collectedKg)} of {qty(t.orderedKg)} {t.unit} collected
                        </Text>
                        <Text style={s.liveMeta}>
                          {o.driver?.seenAt ? `Seen ${when(o.driver.seenAt)}` : ghs(o.amount)}
                        </Text>
                      </View>
                    </Pressable>
                  </Reveal>
                );
              })}
              <Button
                variant="outline"
                label={
                  moving.length > 5
                    ? `View all ${moving.length} orders on the road`
                    : 'Open these in Orders'
                }
                onPress={() => onGo('orders', { stage: 'moving' })}
              />
            </>
          )}
        </View>

        <View style={s.side}>
          <SectionTitle title="Needs attention" />
          <View style={s.todo}>
            {todo.map((t, i) => (
              <Pressable
                key={t.label}
                accessibilityRole="button"
                accessibilityLabel={`${t.label}: ${t.n}`}
                onPress={() => onGo(t.tab, t.params)}
                style={({ hovered, pressed, focused }: PressState) => [
                  s.todoItem,
                  i === todo.length - 1 && s.todoLast,
                  hovered && s.hover,
                  pressed && s.press,
                  focused && focusRing(colors.focusRing),
                ]}
              >
                <View style={[s.todoIcon, t.n > 0 && s.todoIconOn]}>
                  <Icon
                    name={t.icon}
                    size={18}
                    color={t.n > 0 ? colors.harvestInk : colors.brandInk}
                  />
                </View>
                <Text style={s.todoLabel}>{t.label}</Text>
                <Badge label={String(t.n)} tone={t.n ? 'warning' : 'neutral'} />
                <Icon name="chevronRight" size={16} color={colors.inkMuted} />
              </Pressable>
            ))}
          </View>
          {noListings ? (
            <Empty
              icon="leaf"
              title="No produce listed yet"
              hint="Stock, quantities and products show up here once a farmer lists produce."
            />
          ) : (
            <>
              <SectionTitle title="Supply by product" note="Listed by farmers." />
              <ProductSupply supply={data.supply} page={4} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 16 },
  cols: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 20, alignItems: 'flex-start' as const },
  main: { flexGrow: 3, flexBasis: 420, gap: 12, minWidth: 280 },
  side: { flexGrow: 2, flexBasis: 320, gap: 12, minWidth: 280 },
  grow: { flex: 1, gap: 2 },
  todo: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.cardEdge,
    backgroundColor: c.surfaceCard,
    overflow: 'hidden' as const,
  },
  todoItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  todoLast: { borderBottomWidth: 0 },
  todoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  todoIconOn: { backgroundColor: c.harvestTint },
  todoLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  live: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.cardEdge,
    backgroundColor: c.surfaceCard,
  },
  liveTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
  },
  hover: { backgroundColor: c.surfaceSunken },
  press: { opacity: 0.85 },
  liveName: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  liveMeta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
