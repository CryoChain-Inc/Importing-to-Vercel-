import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { Badge, Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { TabShell, type TabDef } from '../../../components/layout';
import { useNav, useRefreshAccount } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import * as buyer from '../../../services/buyer.service';
import { verifyTruckPayment } from '../../../services/truck.service';
import { useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { AccountFooter } from '../../auth/components/AccountFooter';
import { CartProvider, useCart } from '../cart/CartProvider';
import { BuyerAccount, buyerProfileComplete } from '../components/BuyerAccount';
import { Cart } from '../components/Cart';
import { Orders } from '../components/Orders';
import { Payment } from '../components/Payment';
import { Shop, ShopSkeleton } from '../components/Shop';
import { TruckBooking } from '../components/TruckBooking';

type Tab = 'shop' | 'cart' | 'orders' | 'truck' | 'account';

const TABS: TabDef<Tab>[] = [
  { key: 'shop', label: 'Shop', icon: 'leaf' },
  { key: 'cart', label: 'Cart', icon: 'cart' },
  { key: 'orders', label: 'Orders', icon: 'package' },
  { key: 'truck', label: 'Truck', icon: 'truck' },
  { key: 'account', label: 'Account', icon: 'user' },
];

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const TAB_KEYS = TABS.map((t) => t.key);
const tabFromUrl = (): Tab | undefined => TAB_KEYS.find((k) => k === window.location.pathname.split('/')[2]);

/** Current tab, mirrored into the URL as /buyer/<tab> on web so the address bar and Back/Forward follow the screen. Native keeps it in memory. */
function useTabRoute(first: Tab): [Tab, (t: Tab) => void] {
  const [tab, setTabState] = useState<Tab>(first);
  const current = useRef(first);
  useEffect(() => {
    if (!isWeb) return;
    window.history.replaceState(window.history.state, '', `/buyer/${first}`);
    const onPop = () => { current.current = tabFromUrl() ?? first; setTabState(current.current); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [first]);
  const setTab = useCallback((t: Tab) => {
    if (isWeb && current.current !== t) window.history.pushState(window.history.state, '', `/buyer/${t}`);
    current.current = t;
    setTabState(t);
  }, []);
  return [tab, setTab];
}

interface Data {
  catalogue: buyer.CatalogueItem[];
  orders: buyer.Order[];
  transfer: buyer.TransferDetails | null;
  details: buyer.BuyerDetails;
}

export function BuyerHome({ account, tab }: { account: Account; tab?: string }) {
  return <CartProvider><BuyerShell account={account} firstTab={TABS.find((t) => t.key === tab)?.key} /></CartProvider>;
}

function BuyerShell({ account, firstTab }: { account: Account; firstTab?: Tab }) {
  const { reset } = useNav();
  const refreshAccount = useRefreshAccount();
  const s = useThemedStyles(styles);
  const [tab, setTab] = useTabRoute(firstTab ?? 'shop');
  // The order being paid. While set, the payment page replaces the tabs' content.
  const [paying, setPaying] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [catalogue, orders, transfer, details] = await Promise.all([
        buyer.fetchCatalogue(), buyer.fetchOrders(), buyer.fetchTransferDetails(), buyer.fetchBuyerDetails(),
      ]);
      setData({ catalogue, orders, transfer, details });
      setError(null);
      await refreshAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your marketplace.');
    }
  }, [refreshAccount]);

  useEffect(() => {
    load();
  }, [load]);

  // Paystack sends the buyer back with ?reference=...; confirm it (the webhook may be slower) and refresh.
  useEffect(() => {
    const check = async (url: string | null) => {
      const ref = buyer.paymentReference(url);
      if (!ref) return;
      if (ref.startsWith('TRK')) await verifyTruckPayment(ref);
      else await buyer.verifyPayment(ref);
      setTab(ref.startsWith('TRK') ? 'truck' : 'orders');
      await load();
    };
    Linking.getInitialURL().then(check);
    const sub = Linking.addEventListener('url', (e) => check(e.url));
    return () => sub.remove();
  }, [load, setTab]);

  const { lines } = useCart();
  const donePaying = useCallback(() => { setPaying(null); setTab('orders'); load(); }, [load, setTab]);
  const leavePaying = useCallback(() => { setPaying(null); setTab('orders'); load(); }, [load, setTab]);
  const toPay = data?.orders.filter((o) => o.state === 'awaiting_payment').length ?? 0;

  // Paying takes over the whole screen: no side rail or bottom bar.
  if (paying) {
    return (
      <ScrollView style={s.full} contentContainerStyle={s.fullContent} keyboardShouldPersistTaps="handled">
        <View style={s.fullInner}><Payment orderId={paying} onPaid={donePaying} onLeave={leavePaying} /></View>
      </ScrollView>
    );
  }

  return (
    <TabShell tabs={TABS.map((t) => ((t.key === 'account' && data && !buyerProfileComplete(data.details)) || (t.key === 'cart' && lines.length > 0) ? { ...t, alert: true } : t))} tab={tab} onSelect={setTab}>
      <View style={s.header}>
        {toPay ? <Badge label={`${toPay} order${toPay === 1 ? '' : 's'} awaiting payment`} tone="warning" /> : null}
      </View>
      {error ? <Banner text={error} /> : null}
      {data ? (
        <>
          {tab === 'shop' ? (
            <Shop name={data.details.name || account.name || ''} items={data.catalogue} address={data.details.addresses.find((a) => a.isDefault)?.label ?? ''} onOpenCart={() => setTab('cart')} onPickAddress={() => setTab('account')} />
          ) : null}
          {tab === 'cart' ? (
            <Cart items={data.catalogue} addresses={data.details.addresses} onRefresh={load} onOrdered={setPaying} onShop={() => setTab('shop')} onAddAddress={() => setTab('account')} />
          ) : null}
          {tab === 'orders' ? <Orders orders={data.orders} onPay={setPaying} onRefresh={load} /> : null}
          {tab === 'truck' ? <TruckBooking transfer={data.transfer} /> : null}
          {tab === 'account' ? (
            <>
              <BuyerAccount details={data.details} onRefresh={load} />
              <Button label="Sign out" variant="ghost" icon="logOut" onPress={() => authService.signOut().finally(() => reset({ name: 'landing' }))} style={{ alignSelf: 'center' }} />
              <AccountFooter onDeleted={() => reset({ name: 'landing' })} />
            </>
          ) : null}
        </>
      ) : tab === 'shop' || tab === 'cart' ? <ShopSkeleton /> : null}
    </TabShell>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  full: { flex: 1, backgroundColor: c.bgApp },
  fullContent: { flexGrow: 1, padding: 16, paddingBottom: 32 },
  fullInner: { width: '100%' as const, maxWidth: 960, alignSelf: 'center' as const },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
});
