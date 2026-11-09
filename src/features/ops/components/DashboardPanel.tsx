import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Icon, type IconName } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { boardFilter, orderTrack } from '../orderTrack';
import type { OpsCore } from '../data';
import { Empty, Hero, SectionTitle, Stat, StatGrid, when } from './OpsBits';
import { ProductSupply } from './SupplyPanel';

/** Overview: supply listed, money in, and what needs doing next. */
export function DashboardPanel({ data, onGo }: { data: OpsCore; onGo: (tab: string) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const received = data.orders.filter((o) => o.state === 'paid').reduce((n, o) => n + o.amount, 0);
  const moving = data.board.filter((o) => boardFilter(o).stage === 'moving');
  const todo: { tab: string; icon: IconName; label: string; n: number }[] = [
    { tab: 'payments', icon: 'banknote', label: 'Orders awaiting payment', n: data.orders.filter((o) => o.state === 'awaiting_payment').length },
    { tab: 'orders', icon: 'truck', label: 'Orders on the road', n: moving.length },
  ];

  const noListings = data.supply.length === 0;

  return (
    <View style={s.wrap}>
      {noListings ? (
        <Empty icon="leaf" title="No produce listed yet" hint="No farmer has listed produce. Stock, quantities and products will show up here when they do." />
      ) : (
        <Hero label="Listed by farmers" value={String(data.supply.length)} cells={[
          { label: 'Products', value: String(new Set(data.supply.map((r) => r.product)).size) },
          { label: 'Still to sell', value: String(data.supply.filter((r) => r.remainingKg > 0).length) },
        ]} />
      )}
      <StatGrid>
        <Stat label="Received from buyers" value={ghs(received)} tone="brand" note="Paid through Paystack" />
      </StatGrid>

      <SectionTitle title="Needs attention" />
      <View style={s.todo}>
        {todo.map((t) => (
          <Pressable key={t.tab} accessibilityRole="button" onPress={() => onGo(t.tab)} style={s.todoItem}>
            <View style={s.todoIcon}><Icon name={t.icon} size={18} color={colors.brandInk} /></View>
            <Text style={s.todoLabel}>{t.label}</Text>
            <Badge label={String(t.n)} tone={t.n ? 'warning' : 'neutral'} />
            <Icon name="chevronRight" size={16} color={colors.inkMuted} />
          </Pressable>
        ))}
      </View>

      {moving.length > 0 ? (
        <>
          <SectionTitle title="On the road" note="Where each driver is going, and how much has been collected." />
          {moving.slice(0, 4).map((o) => {
            const t = orderTrack(o);
            return (
              <Pressable key={o.id} accessibilityRole="button" onPress={() => onGo('orders')} style={s.live}>
                <View style={s.liveText}>
                  <Text style={s.liveName}>{o.code} · {o.buyer}</Text>
                  <Text style={s.liveMeta}>
                    {o.driver?.name ? `Driver ${o.driver.name}` : 'No driver yet'}
                    {t.next ? ` · going to ${t.next.label}` : ''}
                    {` · ${t.collectedKg.toLocaleString('en-GH', { maximumFractionDigits: 2 })} of ${t.orderedKg.toLocaleString('en-GH', { maximumFractionDigits: 2 })} taken`}
                  </Text>
                  {o.driver?.seenAt ? <Text style={s.liveMeta}>Last seen {when(o.driver.seenAt)}</Text> : null}
                </View>
                <Icon name="chevronRight" size={16} color={colors.inkMuted} />
              </Pressable>
            );
          })}
        </>
      ) : null}

      {noListings ? null : (
        <>
          <SectionTitle title="Supply by product" note="Kilos listed by farmers." />
          <ProductSupply supply={data.supply} page={4} />
        </>
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  todo: { borderRadius: 16, borderWidth: 1, borderColor: c.cardEdge, backgroundColor: c.surfaceCard, overflow: 'hidden' as const },
  todoItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 56, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  todoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  todoLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  live: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.cardEdge, backgroundColor: c.surfaceCard },
  liveText: { flex: 1, gap: 2 },
  liveName: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  liveMeta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
