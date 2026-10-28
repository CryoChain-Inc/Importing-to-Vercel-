import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Icon, type IconName } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { supplyByProduct, type OpsData } from '../data';
import { Empty, Hero, kg, SectionTitle, Stat, StatGrid } from './OpsBits';
import { ProductSupply } from './SupplyPanel';

/** Overview: supply listed, money in, and what needs doing next. */
export function DashboardPanel({ data, onGo }: { data: OpsData; onGo: (tab: string) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const listed = data.supply.reduce((n, r) => n + r.weightKg, 0);
  const received = data.orders.filter((o) => o.state === 'paid').reduce((n, o) => n + o.amount, 0);
  const todo: { tab: string; icon: IconName; label: string; n: number }[] = [
    { tab: 'payments', icon: 'banknote', label: 'Orders awaiting payment', n: data.orders.filter((o) => o.state === 'awaiting_payment').length },
  ];

  const noListings = data.supply.length === 0;

  return (
    <View style={s.wrap}>
      {noListings ? (
        <Empty icon="leaf" title="No produce listed yet" hint="No farmer has listed produce. Stock, kilos and products will show up here when they do." />
      ) : (
        <Hero label="Listed by farmers" value={kg(listed)} cells={[
          { label: 'Products', value: String(supplyByProduct(data.supply).length) },
          { label: 'Listings', value: String(data.supply.length) },
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
});
