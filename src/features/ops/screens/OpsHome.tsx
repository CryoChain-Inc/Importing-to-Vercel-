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
import { PaymentsPanel } from '../components/PaymentsPanel';
import { PayoutsPanel } from '../components/PayoutsPanel';
import { PricesPanel } from '../components/PricesPanel';
import { SupplyPanel } from '../components/SupplyPanel';
import { TeamPanel } from '../components/TeamPanel';
import { TrucksPanel } from '../components/TrucksPanel';
import { Empty, PanelSkeleton } from '../components/OpsBits';
import type { OpsData } from '../data';

const TITLES: Record<string, [string, string]> = {
  dashboard: ['Dashboard', 'Supply, money and what needs doing today.'],
  supply: ['Supply', 'What farmers have listed and what has sold.'],
  farmers: ['Farmers', 'Contact details, wallets and listings.'],
  buyers: ['Buyers', 'Who is buying, where it goes and what they have ordered.'],
  orders: ['Orders', 'Buyer orders from request to delivery.'],
  payments: ['Payments', 'Money received from buyers.'],
  payouts: ['Payouts', 'Money sent to farmers.'],
  routes: ['Routes', 'Planning collection and delivery runs.'],
  trucks: ['Cold trucks', 'Bookings, the price per kilometre, and the driver assigned to each trip.'],
  prices: ['Catalogue and prices', 'Categories, products, images and the farmer and buyer price for each.'],
  team: ['Team', 'Drivers and operations staff.'],
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
      const [farmers, buyerRows, supply, orders, cat, team, config, settlements, runs] = await Promise.all([
        ops.fetchFarmers(), ops.fetchBuyers(), ops.fetchSupply(), buyers.fetchOrders(),
        ops.fetchCatalogue(), ops.fetchTeam(), ops.fetchConfig(), payouts.fetchSettlements(), payouts.fetchPayoutRuns(),
      ]);
      setData({ farmers, buyers: buyerRows, supply, orders, categories: cat.categories, products: cat.products, prices: cat.prices, team, config, settlements, runs });
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
  };
  const groups: NavGroup[] = [
    { title: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: 'grid' }] },
    { title: 'Supply', items: [
      { key: 'supply', label: 'Supply', icon: 'leaf' },
      { key: 'farmers', label: 'Farmers', icon: 'users' },
    ] },
    { title: 'Sales', items: [
      { key: 'buyers', label: 'Buyers', icon: 'user' },
      { key: 'orders', label: 'Orders', icon: 'package' },
    ] },
    { title: 'Money', items: [
      { key: 'payments', label: 'Payments in', icon: 'arrowDownLeft', badge: n.payments },
      { key: 'payouts', label: 'Payouts out', icon: 'arrowUpRight', badge: n.payouts },
    ] },
    { title: 'Logistics', items: [
      { key: 'routes', label: 'Routes', icon: 'truck' },
      { key: 'trucks', label: 'Cold trucks', icon: 'truck' },
    ] },
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
          {tab === 'orders' ? <Empty icon="package" title="Orders are coming soon" hint="Buyer orders will be followed from request to delivery here." /> : null}
          {tab === 'routes' ? <Empty icon="truck" title="Route planning is coming soon" hint="Collection and delivery runs will be planned here." /> : null}
          {tab === 'payments' ? <PaymentsPanel orders={data.orders} onChange={load} /> : null}
          {tab === 'payouts' ? <PayoutsPanel settlements={data.settlements} runs={data.runs} farmers={data.farmers} onChange={load} /> : null}
          {tab === 'trucks' ? <TrucksPanel /> : null}
          {tab === 'prices' ? <PricesPanel categories={data.categories} products={data.products} prices={data.prices} onChange={load} /> : null}
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
