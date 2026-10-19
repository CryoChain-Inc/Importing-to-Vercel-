import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Icon, type IconName } from '../../../components/common';
import { isSold } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { supplySplit, type OpsData } from '../data';
import { Empty, Hero, kg, SectionTitle, Stat, StatGrid } from './OpsBits';
import { ProductSupply } from './SupplyPanel';

/** Overview: supply left to sell, money in and out, and what needs doing next. */
export function DashboardPanel({ data, onGo }: { data: OpsData; onGo: (tab: string) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const split = supplySplit(data.supply, isSold);
  const received = data.orders.filter((o) => o.state === 'paid').reduce((n, o) => n + o.amount, 0);
  const sentOut = data.runs.flatMap((r) => r.transfers).filter((t) => t.status === 'succeeded').reduce((n, t) => n + t.amount, 0);
  const todo: { tab: string; icon: IconName; label: string; n: number }[] = [
    { tab: 'payments', icon: 'banknote', label: 'Orders awaiting payment', n: data.orders.filter((o) => o.state === 'awaiting_payment').length },
    { tab: 'requirements', icon: 'clipboard', label: 'Open buyer requirements', n: data.requirements.filter((r) => r.state === 'open').length },
    { tab: 'payouts', icon: 'wallet', label: 'Farmer settlements ready to pay', n: data.settlements.filter((x) => x.status === 'payable' && !x.inRun).length },
    { tab: 'routes', icon: 'truck', label: 'Lots in transit or collecting', n: data.lots.filter((l) => l.state === 'collecting' || l.state === 'in_transit').length },
  ];

  return (
    <View style={s.wrap}>
      <Hero label="Left to sell" value={kg(split.left)} cells={[
        { label: 'Estimated', value: kg(split.total) },
        { label: 'Sold (paid)', value: kg(split.sold) },
      ]} />
      <StatGrid>
        <Stat label="Received from buyers" value={ghs(received)} tone="brand" note="Confirmed bank transfers" />
        <Stat label="Paid to farmers" value={ghs(sentOut)} note="Mobile money transfers that landed" />
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

      <SectionTitle title="Supply by product" note="Estimated kilos listed by farmers, less lots a buyer has paid for." />
      {data.supply.length === 0 ? (
        <Empty icon="leaf" title="No produce listed yet" hint="When farmers list produce, the stock shows up here, split into left to sell and sold." />
      ) : <ProductSupply supply={data.supply} page={4} />}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  todo: { borderRadius: 16, borderWidth: 1, borderColor: c.cardEdge, backgroundColor: c.surfaceCard, overflow: 'hidden' as const },
  todoItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 56, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  todoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  todoLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
});
