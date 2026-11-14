import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNearEnd } from '../../../components/layout';
import { Badge, Button, Card, HeroCard, Icon } from '../../../components/common';
import type { Farmer, Sale } from '../../../services/farmer.service';
import { hasWallet } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';

const PAGE = 10;

const STATUS = {
  awaiting_delivery: { label: 'Awaiting delivery', tone: 'warning' },
  payable: { label: 'Delivered, payout due', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
} as const;

/** Payments tab: what each delivered order earned, what is waiting on delivery, and where it is paid. */
export function EarningsPanel({
  sales,
  farmer,
  onWallet,
}: {
  sales: Sale[];
  farmer: Farmer | null;
  onWallet: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const sum = (st: Sale['status']) =>
    sales.filter((x) => x.status === st).reduce((a, x) => a + x.amount, 0);
  const saved = hasWallet(farmer);
  const [filter, setFilter] = useState<Sale['status'] | 'all'>('all');
  const [limit, setLimit] = useState(PAGE);
  const matching = filter === 'all' ? sales : sales.filter((x) => x.status === filter);
  const shown = matching.slice(0, limit);
  // Totals above need every sale, so all are loaded; the list only draws more as the farmer scrolls.
  useNearEnd(() => setLimit((n) => (n < matching.length ? n + PAGE : n)));
  const parts = [
    ['paid', sum('paid'), 1],
    ['payable', sum('payable'), 0.55],
    ['awaiting_delivery', sum('awaiting_delivery'), 0.25],
  ] as const;
  const total = parts.reduce((a, [, n]) => a + n, 0);
  const FILTERS = [
    ['all', 'All'],
    ['payable', 'Payout due'],
    ['awaiting_delivery', 'Awaiting'],
    ['paid', 'Paid'],
  ] as const;

  return (
    <View style={s.wrap}>
      <HeroCard style={s.hero}>
        <Text style={s.heroLabel}>Total paid</Text>
        <Text style={s.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
          {ghs(sum('paid'))}
        </Text>
        {total > 0 ? (
          <View
            style={s.bar}
            accessibilityLabel="Share of earnings: paid, payout due, awaiting delivery"
          >
            {parts.map(([k, n, a]) =>
              n > 0 ? (
                <View key={k} style={{ flex: n, backgroundColor: `rgba(255,255,255,${a})` }} />
              ) : null,
            )}
          </View>
        ) : null}
        <View style={s.heroRow}>
          <View style={s.heroCell}>
            <Text style={s.heroSub}>Payout due</Text>
            <Text style={s.heroVal} numberOfLines={1} adjustsFontSizeToFit>
              {ghs(sum('payable'))}
            </Text>
          </View>
          <View style={s.heroCell}>
            <Text style={s.heroSub}>Awaiting delivery</Text>
            <Text style={s.heroVal} numberOfLines={1} adjustsFontSizeToFit>
              {ghs(sum('awaiting_delivery'))}
            </Text>
          </View>
        </View>
      </HeroCard>

      <Pressable
        disabled={!saved}
        accessibilityRole="button"
        accessibilityLabel="Edit payout wallet in your profile"
        onPress={onWallet}
        style={({ pressed }) => pressed && s.pressed}
      >
        <Card style={s.wallet}>
          <View style={s.walletIcon}>
            <Icon name="wallet" size={22} color={colors.brandInk} />
          </View>
          <View style={s.walletText}>
            <Text style={s.walletTitle}>
              {saved
                ? `${farmer?.momoNetwork ?? 'MoMo'} · ${formatPhone(farmer?.momoNumber)}`
                : 'No wallet yet'}
            </Text>
            <Text style={s.meta}>
              {saved
                ? farmer?.momoName || 'Payouts go to this wallet'
                : 'Add a MoMo wallet so we can pay you'}
            </Text>
          </View>
          {saved ? (
            <View style={s.walletEnd}>
              <Badge
                label={farmer?.walletVerified ? '✓ Verified' : 'Not verified'}
                tone={farmer?.walletVerified ? 'success' : 'warning'}
              />
              <Icon name="chevronRight" size={18} color={colors.inkMuted} />
            </View>
          ) : (
            <Button label="Add" size="sm" onPress={onWallet} />
          )}
        </Card>
      </Pressable>

      <Text style={s.section}>Your sales</Text>
      {sales.length > 0 ? (
        <View style={s.seg} accessibilityRole="tablist">
          {FILTERS.map(([k, label]) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === k }}
              onPress={() => {
                setFilter(k);
                setLimit(PAGE);
              }}
              style={[s.segItem, filter === k && s.segOn]}
            >
              <Text style={[s.segText, filter === k && s.segTextOn]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {sales.length > 0 && shown.length === 0 ? (
        <Text style={[s.meta, s.none]}>Nothing in this list yet.</Text>
      ) : null}
      {sales.length === 0 ? (
        <Card style={s.empty}>
          <Text style={s.emptyTitle}>No sales yet</Text>
          <Text style={s.meta}>
            When a buyer pays for your produce, it shows here. You are paid for each order once it
            is delivered.
          </Text>
        </Card>
      ) : (
        shown.map((x) => {
          const st = STATUS[x.status];
          return (
            <Card key={x.id} style={s.row}>
              <View style={s.rowText}>
                <Text style={s.product}>
                  {x.product} · {x.unit}
                </Text>
                <Text style={s.meta}>
                  {x.kg.toLocaleString('en-GH', { maximumFractionDigits: 2 })} {x.unit} at{' '}
                  {ghs(x.pricePerKg)}/{x.unit}
                </Text>
                <Text style={s.meta}>
                  {x.status === 'paid' && x.paidAt
                    ? `Paid ${new Date(x.paidAt).toLocaleDateString('en-GH')}`
                    : x.deliveredAt
                      ? `Delivered ${new Date(x.deliveredAt).toLocaleDateString('en-GH')}`
                      : `Ordered ${new Date(x.createdAt).toLocaleDateString('en-GH')}`}
                </Text>
              </View>
              <View style={s.rowEnd}>
                <Text style={s.amount}>{ghs(x.amount)}</Text>
                <Badge label={st.label} tone={st.tone} />
              </View>
            </Card>
          );
        })
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  hero: { gap: 6, padding: 22 },
  heroLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  heroAmount: {
    fontFamily: fonts.heading,
    fontSize: 36,
    lineHeight: 48,
    letterSpacing: -1,
    color: '#ffffff',
    fontVariant: ['tabular-nums' as const],
  },
  heroRow: { flexDirection: 'row' as const, gap: 12, marginTop: 14 },
  heroCell: { flex: 1, gap: 2 },
  heroSub: { fontFamily: fonts.sansMedium, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  heroVal: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: '#ffffff',
    fontVariant: ['tabular-nums' as const],
  },
  bar: {
    flexDirection: 'row' as const,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden' as const,
    gap: 2,
    marginTop: 8,
  },
  seg: {
    flexDirection: 'row' as const,
    backgroundColor: c.surfaceSunken,
    borderRadius: 12,
    padding: 4,
  },
  segItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  segOn: { backgroundColor: c.surfaceCard },
  segText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  segTextOn: { color: c.ink },
  none: { textAlign: 'center' as const, paddingVertical: 16 },
  wallet: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 16 },
  walletIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  walletEnd: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  pressed: { opacity: 0.7 },
  walletText: { flex: 1, gap: 2 },
  walletTitle: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  section: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, marginTop: 8 },
  empty: { gap: 4 },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    padding: 16,
  },
  rowText: { flex: 1, gap: 2 },
  rowEnd: { alignItems: 'flex-end' as const, gap: 6 },
  product: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  amount: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
