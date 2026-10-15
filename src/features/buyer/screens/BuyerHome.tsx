import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, ThemeToggle } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { TabShell, type TabDef } from '../../../components/layout';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import * as buyer from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { BuyerAccount } from '../components/BuyerAccount';
import { Orders } from '../components/Orders';
import { Requirements } from '../components/Requirements';
import { TodayLots } from '../components/TodayLots';

type Tab = 'today' | 'orders' | 'requests' | 'account';

const TABS: TabDef<Tab>[] = [
  { key: 'today', label: 'Today', icon: 'package' },
  { key: 'orders', label: 'Orders', icon: 'wallet' },
  { key: 'requests', label: 'Requests', icon: 'message' },
  { key: 'account', label: 'Account', icon: 'user' },
];

interface Data {
  lots: buyer.TodayLot[];
  orders: buyer.Order[];
  transfer: buyer.TransferDetails | null;
  requirements: buyer.Requirement[];
  products: string[];
  details: buyer.BuyerDetails;
}

export function BuyerHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  const [tab, setTab] = useState<Tab>('today');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lots, orders, transfer, requirements, products, details] = await Promise.all([
        buyer.fetchTodayLots(), buyer.fetchOrders(), buyer.fetchTransferDetails(),
        buyer.fetchRequirements(), buyer.fetchProductNames(), buyer.fetchBuyerDetails(),
      ]);
      setData({ lots, orders, transfer, requirements, products, details });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your marketplace.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toPay = data?.orders.filter((o) => o.state === 'awaiting_payment').length ?? 0;

  return (
    <TabShell tabs={TABS} tab={tab} onSelect={setTab} onSignOut={() => authService.signOut().finally(() => reset({ name: 'landing' }))}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.hello}>Hello, {account.name || 'buyer'}</Text>
          {toPay ? <Badge label={`${toPay} order${toPay === 1 ? '' : 's'} awaiting payment`} tone="warning" /> : null}
        </View>
        <ThemeToggle />
      </View>
      {error ? <Banner text={error} /> : null}
      {data ? (
        <>
          {tab === 'today' ? <TodayLots lots={data.lots} onRefresh={load} onOrdered={() => setTab('orders')} /> : null}
          {tab === 'orders' ? <Orders orders={data.orders} transfer={data.transfer} onRefresh={load} /> : null}
          {tab === 'requests' ? <Requirements requirements={data.requirements} products={data.products} location={data.details.location} onRefresh={load} /> : null}
          {tab === 'account' ? <BuyerAccount details={data.details} onRefresh={load} /> : null}
        </>
      ) : null}
    </TabShell>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  headerText: { gap: 8, alignItems: 'flex-start' as const, flexShrink: 1 },
  hello: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: c.ink },
});
