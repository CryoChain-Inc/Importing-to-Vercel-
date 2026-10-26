import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, HeroCard, Icon } from '../../../components/common';
import type { Farmer, Sale } from '../../../services/farmer.service';
import { hasWallet } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';

const STATUS = {
  awaiting_delivery: { label: 'Awaiting delivery', tone: 'warning' },
  payable: { label: 'Delivered, payout due', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
} as const;

/** Payments tab: what each delivered order earned, what is waiting on delivery, and where it is paid. */
export function EarningsPanel({ sales, farmer, onWallet }: { sales: Sale[]; farmer: Farmer | null; onWallet: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const sum = (st: Sale['status']) => sales.filter((x) => x.status === st).reduce((a, x) => a + x.amount, 0);
  const saved = hasWallet(farmer);

  return (
    <View style={s.wrap}>
      <HeroCard style={s.hero}>
        <Text style={s.heroLabel}>Total paid</Text>
        <Text style={s.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{ghs(sum('paid'))}</Text>
        <View style={s.heroRow}>
          <View style={s.heroCell}>
            <Text style={s.heroSub}>Payout due</Text>
            <Text style={s.heroVal} numberOfLines={1} adjustsFontSizeToFit>{ghs(sum('payable'))}</Text>
          </View>
          <View style={s.heroCell}>
            <Text style={s.heroSub}>Awaiting delivery</Text>
            <Text style={s.heroVal} numberOfLines={1} adjustsFontSizeToFit>{ghs(sum('awaiting_delivery'))}</Text>
          </View>
        </View>
      </HeroCard>

      <Card style={s.wallet}>
        <View style={s.walletIcon}><Icon name="wallet" size={22} color={colors.brandInk} /></View>
        <View style={s.walletText}>
          <Text style={s.walletTitle}>{saved ? `${farmer?.momoNetwork ?? 'MoMo'} · ${formatPhone(farmer?.momoNumber)}` : 'No wallet yet'}</Text>
          <Text style={s.meta}>{saved ? farmer?.momoName || 'Payouts go to this wallet' : 'Add a MoMo wallet so we can pay you'}</Text>
        </View>
        {saved ? <Badge label={farmer?.walletVerified ? 'Verified' : 'Saved'} tone={farmer?.walletVerified ? 'success' : 'info'} /> : <Button label="Add" size="sm" onPress={onWallet} />}
      </Card>

      <Text style={s.section}>Your sales</Text>
      {sales.length === 0 ? (
        <Card style={s.empty}>
          <Text style={s.emptyTitle}>No sales yet</Text>
          <Text style={s.meta}>When a buyer pays for your produce, it shows here. You are paid for each order once it is delivered.</Text>
        </Card>
      ) : (
        sales.map((x) => {
          const st = STATUS[x.status];
          return (
            <Card key={x.id} style={s.row}>
              <View style={s.rowText}>
                <Text style={s.product}>{x.product} · Grade {x.grade}</Text>
                <Text style={s.meta}>{x.kg.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg at {ghs(x.pricePerKg)}/kg</Text>
                <Text style={s.meta}>
                  {x.status === 'paid' && x.paidAt ? `Paid ${new Date(x.paidAt).toLocaleDateString('en-GH')}` : x.deliveredAt ? `Delivered ${new Date(x.deliveredAt).toLocaleDateString('en-GH')}` : `Ordered ${new Date(x.createdAt).toLocaleDateString('en-GH')}`}
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
  heroAmount: { fontFamily: fonts.heading, fontSize: 36, lineHeight: 48, letterSpacing: -1, color: '#ffffff', fontVariant: ['tabular-nums' as const] },
  heroRow: { flexDirection: 'row' as const, gap: 12, marginTop: 14 },
  heroCell: { flex: 1, gap: 2 },
  heroSub: { fontFamily: fonts.sansMedium, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  heroVal: { fontFamily: fonts.sansBold, fontSize: 17, color: '#ffffff', fontVariant: ['tabular-nums' as const] },
  wallet: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 16 },
  walletIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  walletText: { flex: 1, gap: 2 },
  walletTitle: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  section: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, marginTop: 8 },
  empty: { gap: 4 },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12, padding: 16 },
  rowText: { flex: 1, gap: 2 },
  rowEnd: { alignItems: 'flex-end' as const, gap: 6 },
  product: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  amount: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
