import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, HeroCard, Icon } from '../../../components/common';
import type { Farmer, ProduceListing } from '../../../services/farmer.service';
import { hasWallet } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';

const STATUS = {
  pending: { label: 'Pending delivery', tone: 'warning' },
  payable: { label: 'Ready to pay', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
} as const;

/** Payments tab: what the farmer has earned, what is on its way, and where it is paid. */
export function EarningsPanel({ listings, farmer, onWallet }: { listings: ProduceListing[]; farmer: Farmer | null; onWallet: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const rows = listings.filter((l) => l.payoutNet != null && l.payoutStatus);
  const sum = (st: string) => rows.filter((l) => l.payoutStatus === st).reduce((a, l) => a + (l.payoutNet ?? 0), 0);
  const paid = sum('paid');
  const coming = sum('pending') + sum('payable');
  const expected = listings.filter((l) => l.payoutNet == null && l.estNet != null).reduce((a, l) => a + (l.estNet ?? 0), 0);
  const saved = hasWallet(farmer);

  return (
    <View style={s.wrap}>
      <HeroCard style={s.hero}>
        <Text style={s.heroLabel}>Total earned</Text>
        <Text style={s.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{ghs(paid)}</Text>
        <View style={s.heroRow}>
          <View style={s.heroCell}>
            <Text style={s.heroSub}>On its way</Text>
            <Text style={s.heroVal} numberOfLines={1} adjustsFontSizeToFit>{ghs(coming)}</Text>
          </View>
          <View style={s.heroCell}>
            <Text style={s.heroSub}>Expected</Text>
            <Text style={s.heroVal} numberOfLines={1} adjustsFontSizeToFit>{ghs(expected)}</Text>
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

      <Text style={s.section}>Payout history</Text>
      {rows.length === 0 ? (
        <Card style={s.empty}>
          <Text style={s.emptyTitle}>No payouts yet</Text>
          <Text style={s.meta}>Each consignment is paid once it has been weighed, graded and delivered to the buyer.</Text>
        </Card>
      ) : (
        rows.map((l) => {
          const st = STATUS[l.payoutStatus!];
          return (
            <Card key={l.id} style={s.row}>
              <View style={s.rowText}>
                <Text style={s.product}>{l.product} · Grade {l.recordedGrade ?? l.grade}</Text>
                <Text style={s.meta}>{(l.recordedKg ?? l.weightKg).toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg{l.point ? ` · ${l.point}` : ''}</Text>
              </View>
              <View style={s.rowEnd}>
                <Text style={s.amount}>{ghs(l.payoutNet!)}</Text>
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
