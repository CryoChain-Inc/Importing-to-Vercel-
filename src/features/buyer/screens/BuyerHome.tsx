import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Badge, Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { TabShell, type TabDef } from '../../../components/layout';
import { useNav, useRefreshAccount } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import * as buyer from '../../../services/buyer.service';
import { verifyTruckPayment } from '../../../services/truck.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
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

interface Data {
  catalogue: buyer.CatalogueItem[];
  orders: buyer.Order[];
  transfer: buyer.TransferDetails | null;
  details: buyer.BuyerDetails;
}

export function BuyerHome({ account }: { account: Account }) {
  return <CartProvider><BuyerShell account={account} /></CartProvider>;
}

function BuyerShell({ account }: { account: Account }) {
  const { reset } = useNav();
  const refreshAccount = useRefreshAccount();
  const s = useThemedStyles(styles);
  const [tab, setTab] = useState<Tab>('shop');
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
  }, [load]);

  const { lines } = useCart();
  const donePaying = useCallback(() => { setPaying(null); setTab('orders'); load(); }, [load]);
  const leavePaying = useCallback(() => { setPaying(null); setTab('orders'); load(); }, [load]);
  const toPay = data?.orders.filter((o) => o.state === 'awaiting_payment').length ?? 0;

  return (
    <TabShell tabs={TABS.map((t) => ((t.key === 'account' && data && !buyerProfileComplete(data.details)) || (t.key === 'cart' && lines.length > 0) ? { ...t, alert: true } : t))} tab={tab} onSelect={setTab}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.hello} numberOfLines={1}>Hello, {data?.details.name || account.name || 'buyer'}</Text>
          {toPay ? <Badge label={`${toPay} order${toPay === 1 ? '' : 's'} awaiting payment`} tone="warning" /> : null}
        </View>
      </View>
      {error ? <Banner text={error} /> : null}
      {data ? (
        paying ? <Payment orderId={paying} onPaid={donePaying} onLeave={leavePaying} /> : <>
          {tab === 'shop' ? (
            <Shop items={data.catalogue} address={data.details.addresses.find((a) => a.isDefault)?.label ?? ''} onOpenCart={() => setTab('cart')} onPickAddress={() => setTab('account')} />
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
            </>
          ) : null}
        </>
      ) : tab === 'shop' || tab === 'cart' ? <ShopSkeleton /> : null}
    </TabShell>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  headerText: { gap: 8, alignItems: 'flex-start' as const, flexShrink: 1 },
  hello: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: c.ink },
});
