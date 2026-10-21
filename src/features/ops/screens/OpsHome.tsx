import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { OpsShell, type NavGroup } from '../../../components/layout/OpsShell';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import * as buyers from '../../../services/ops.buyers.service';
import * as payouts from '../../../services/ops.payouts.service';
import * as ops from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { BuyersPanel } from '../components/BuyersPanel';
import { ConfigPanel } from '../components/ConfigPanel';
import { DashboardPanel } from '../components/DashboardPanel';
import { FarmersPanel } from '../components/FarmersPanel';
import { LotsPanel } from '../components/LotsPanel';
import { PaymentsPanel } from '../components/PaymentsPanel';
import { PayoutsPanel } from '../components/PayoutsPanel';
import { PointsPanel } from '../components/PointsPanel';
import { PricesPanel } from '../components/PricesPanel';
import { RequirementsPanel } from '../components/RequirementsPanel';
import { RoutesPanel } from '../components/RoutesPanel';
import { SupplyPanel } from '../components/SupplyPanel';
import { TeamPanel } from '../components/TeamPanel';
import { PanelSkeleton } from '../components/OpsBits';
import type { OpsData } from '../data';

const TITLES: Record<string, [string, string]> = {
  dashboard: ['Dashboard', 'Supply, money and what needs doing today.'],
  supply: ['Supply', 'What farmers have listed, what is in lots and what has sold.'],
  farmers: ['Farmers', 'Contact details, wallets and listings.'],
  buyers: ['Buyers', 'Who is buying, where it goes and what they have ordered.'],
  requirements: ['Requirements', 'Buyer demand, matched against available supply.'],
  lots: ['Lots', 'Build lots and follow each one to delivery.'],
  payments: ['Payments', 'Money received from buyers.'],
  payouts: ['Payouts', 'Money sent to farmers.'],
  routes: ['Routes', 'Collection and delivery runs with photo records.'],
  prices: ['Catalogue and prices', 'Categories, products, images and farm-gate prices.'],
  points: ['Collection points', 'Where agents collect produce.'],
  team: ['Team', 'Field agents, drivers and operations staff.'],
  settings: ['Settings', 'Temperature limits, payout rules and support contact.'],
};

export function OpsHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState<OpsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [farmers, buyerRows, supply, lots, orders, requirements, cat, points, team, config, settlements, runs] = await Promise.all([
        ops.fetchFarmers(), ops.fetchBuyers(), ops.fetchSupply(), ops.fetchLots(), buyers.fetchOrders(), buyers.fetchRequirements(),
        ops.fetchCatalogue(), ops.fetchPoints(), ops.fetchTeam(), ops.fetchConfig(), payouts.fetchSettlements(), payouts.fetchPayoutRuns(),
      ]);
      setData({ farmers, buyers: buyerRows, supply, lots, orders, requirements, categories: cat.categories, products: cat.products, prices: cat.prices, points, team, config, settlements, runs });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const n = {
    payments: data?.orders.filter((o) => o.state === 'awaiting_payment').length ?? 0,
    payouts: data?.settlements.filter((x) => x.status === 'payable' && !x.inRun).length ?? 0,
    requirements: data?.requirements.filter((r) => r.state === 'open').length ?? 0,
  };
  const groups: NavGroup[] = [
    { title: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'grid' }] },
    { title: 'Supply', items: [
      { key: 'supply', label: 'Supply', icon: 'leaf' },
      { key: 'farmers', label: 'Farmers', icon: 'users' },
    ] },
    { title: 'Sales', items: [
      { key: 'buyers', label: 'Buyers', icon: 'user' },
      { key: 'requirements', label: 'Requirements', icon: 'clipboard', badge: n.requirements },
      { key: 'lots', label: 'Lots', icon: 'package' },
    ] },
    { title: 'Money', items: [
      { key: 'payments', label: 'Payments in', icon: 'arrowDownLeft', badge: n.payments },
      { key: 'payouts', label: 'Payouts out', icon: 'arrowUpRight', badge: n.payouts },
    ] },
    { title: 'Logistics', items: [{ key: 'routes', label: 'Routes', icon: 'truck' }, { key: 'points', label: 'Collection points', icon: 'pin' }] },
    { title: 'Catalogue', items: [{ key: 'prices', label: 'Prices and products', icon: 'tag' }] },
    { title: 'Admin', items: [{ key: 'team', label: 'Team', icon: 'shield' }, { key: 'settings', label: 'Settings', icon: 'sliders' }] },
  ];
  const [title, sub] = TITLES[tab];

  return (
    <OpsShell groups={groups} active={tab} onSelect={setTab} name={account.name} onSignOut={() => authService.signOut().finally(() => reset({ name: 'ops' }))}>
      <View style={s.header}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
      {error ? (
        <>
          <Banner text={error} />
          {data ? null : <Button label="Try again" variant="outline" onPress={load} />}
        </>
      ) : null}
      {data ? (
        <>
          {tab === 'dashboard' ? <DashboardPanel data={data} onGo={setTab} /> : null}
          {tab === 'supply' ? <SupplyPanel supply={data.supply} /> : null}
          {tab === 'farmers' ? <FarmersPanel farmers={data.farmers} supply={data.supply} /> : null}
          {tab === 'buyers' ? <BuyersPanel buyers={data.buyers} orders={data.orders} /> : null}
          {tab === 'requirements' ? <RequirementsPanel requirements={data.requirements} supply={data.supply} products={data.products} prices={data.prices} onChange={load} /> : null}
          {tab === 'lots' ? <LotsPanel supply={data.supply} lots={data.lots} products={data.products} prices={data.prices} onChange={load} /> : null}
          {tab === 'payments' ? <PaymentsPanel orders={data.orders} onChange={load} /> : null}
          {tab === 'payouts' ? <PayoutsPanel settlements={data.settlements} runs={data.runs} farmers={data.farmers} onChange={load} /> : null}
          {tab === 'routes' ? <RoutesPanel team={data.team} supply={data.supply} onChange={load} /> : null}
          {tab === 'prices' ? <PricesPanel categories={data.categories} products={data.products} prices={data.prices} onChange={load} /> : null}
          {tab === 'points' ? <PointsPanel points={data.points} onChange={load} /> : null}
          {tab === 'team' ? <TeamPanel team={data.team} onChange={load} /> : null}
          {tab === 'settings' ? <ConfigPanel config={data.config} onChange={load} /> : null}
        </>
      ) : error ? null : (
        <PanelSkeleton />
      )}
    </OpsShell>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  header: { gap: 2, marginBottom: 4 },
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: c.ink },
  sub: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted },
});
