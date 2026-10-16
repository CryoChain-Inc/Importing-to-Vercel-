import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, ChoiceChips, ThemeToggle } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import * as buyers from '../../../services/ops.buyers.service';
import * as payouts from '../../../services/ops.payouts.service';
import * as ops from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { ghs } from '../../../utils/format';
import { ConfigPanel } from '../components/ConfigPanel';
import { FarmersPanel } from '../components/FarmersPanel';
import { LotsPanel, type LotDraft } from '../components/LotsPanel';
import { PaymentsPanel } from '../components/PaymentsPanel';
import { PayoutsPanel } from '../components/PayoutsPanel';
import { PointsPanel } from '../components/PointsPanel';
import { PricesPanel } from '../components/PricesPanel';
import { RequirementsPanel } from '../components/RequirementsPanel';
import { SupplyPanel } from '../components/SupplyPanel';
import { TeamPanel } from '../components/TeamPanel';
import { RoutesPanel } from '../components/RoutesPanel';

const TABS = ['Farmers', 'Supply', 'Requirements', 'Lots', 'Payments', 'Payouts', 'Prices', 'Collection points','Routes', 'Team', 'Settings'];

interface Data {
  farmers: ops.FarmerRow[];
  supply: ops.SupplyRow[];
  lots: ops.LotRow[];
  orders: buyers.OrderRow[];
  requirements: buyers.RequirementRow[];
  categories: ops.Category[];
  products: ops.Product[];
  prices: ops.PriceRow[];
  points: ops.PointRow[];
  team: ops.TeamMember[];
  config: ops.OpsConfig;
  settlements: payouts.SettlementRow[];
  runs: payouts.PayoutRun[];
}

export function OpsHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  const [tab, setTab] = useState(TABS[0]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<LotDraft | null>(null);

  const load = useCallback(async () => {
    try {
      const [farmers, supply, lots, orders, requirements, cat, points, team, config, settlements, runs] = await Promise.all([
        ops.fetchFarmers(), ops.fetchSupply(), ops.fetchLots(), buyers.fetchOrders(), buyers.fetchRequirements(),
        ops.fetchCatalogue(), ops.fetchPoints(), ops.fetchTeam(), ops.fetchConfig(), payouts.fetchSettlements(), payouts.fetchPayoutRuns(),
      ]);
      setData({ farmers, supply, lots, orders, requirements, categories: cat.categories, products: cat.products, prices: cat.prices, points, team, config, settlements, runs });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startLot = (r: buyers.RequirementRow) => {
    setDraft({ requirementId: r.id, product: r.product, price: r.maxPricePerKg, summary: `${r.buyer}, ${r.quantityKg.toLocaleString('en-GH')} kg ${r.product} up to ${ghs(r.maxPricePerKg)}/kg` });
    setTab('Lots');
  };

  // Count badges on the tabs that need action.
  const badge: Record<string, number> = {
    Payments: data?.orders.filter((o) => o.state === 'awaiting_payment').length ?? 0,
    Payouts: data?.settlements.filter((x) => x.status === 'payable' && !x.inRun).length ?? 0,
    Requirements: data?.requirements.filter((r) => r.state === 'open').length ?? 0,
  };
  const labels = TABS.map((t) => (badge[t] ? `${t} (${badge[t]})` : t));

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.content}>
        <View style={s.header}>
          <Text style={s.title}>Operations · {account.name || 'Ops'}</Text>
          <ThemeToggle />
        </View>
        <ChoiceChips label="Section" options={labels} value={labels[TABS.indexOf(tab)]} onChange={(l) => setTab(TABS[labels.indexOf(l)])} />
        {error ? <Banner text={error} /> : null}
        {data ? (
          <>
            {tab === 'Farmers' ? <FarmersPanel farmers={data.farmers} /> : null}
            {tab === 'Supply' ? <SupplyPanel supply={data.supply} /> : null}
            {tab === 'Lots' ? <LotsPanel key={draft?.requirementId ?? 'new'} supply={data.supply} lots={data.lots} products={data.products} prices={data.prices} draft={draft} onChange={load} /> : null}
            {tab === 'Requirements' ? <RequirementsPanel requirements={data.requirements} onCreateLot={startLot} onChange={load} /> : null}
            {tab === 'Payments' ? <PaymentsPanel orders={data.orders} onChange={load} /> : null}
            {tab === 'Payouts' ? <PayoutsPanel settlements={data.settlements} runs={data.runs} farmers={data.farmers} onChange={load} /> : null}
            {tab === 'Prices' ? <PricesPanel categories={data.categories} products={data.products} prices={data.prices} onChange={load} /> : null}
            {tab === 'Collection points' ? <PointsPanel points={data.points} onChange={load} /> : null}
            {tab === 'Routes' ? <RoutesPanel team={data.team} supply={data.supply} onChange={load} /> : null}
            {tab === 'Team' ? <TeamPanel team={data.team} onChange={load} /> : null}
            {tab === 'Settings' ? <ConfigPanel config={data.config} onChange={load} /> : null}
          </>
        ) : null}
        <Button label="Sign out" variant="ghost" size="sm" onPress={() => authService.signOut().finally(() => reset({ name: 'landing' }))} />
      </View>
    </ScrollView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  scroll: { padding: 16, paddingBottom: 32 },
  content: { width: '100%' as const, maxWidth: 840, alignSelf: 'center' as const, gap: 16 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  title: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: c.ink, flexShrink: 1 },
});
