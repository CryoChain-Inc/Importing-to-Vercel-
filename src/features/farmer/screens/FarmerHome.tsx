import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, type IconName } from '../../../components/common';
import { Banner, Skeleton, SkeletonCard } from '../../../components/feedback';
import { TabShell } from '../../../components/layout';
import { useNav } from '../../../navigation';
import { composeAddress } from '../../../services/maps.service';
import { authService } from '../../../services/auth.service';
import { detailsDone, fetchFarmer, fetchListings, fetchSales, hasWallet, type Farmer, type ProduceListing, type Sale } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { EarningsPanel } from '../components/EarningsPanel';
import { AccountFooter } from '../../auth/components/AccountFooter';
import { MessagesPanel } from '../components/MessagesPanel';
import { Offers } from '../components/Offers';
import { FarmerProfileCard } from '../components/FarmerProfileCard';
import { PriceBoard } from '../components/PriceBoard';
import { ProduceListings } from '../components/ProduceListings';

type Tab = 'listings' | 'messages' | 'payments' | 'profile';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'listings', label: 'Listings', icon: 'package' },
  { key: 'messages', label: 'Messages', icon: 'message' },
  { key: 'payments', label: 'Payments', icon: 'wallet' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];

/** Tab content for the farmer; TabShell supplies the phone bar and desktop rail. */
export function FarmerHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  const [tab, setTab] = useState<Tab>('listings');
  const [editing, setEditing] = useState<'details' | 'wallet' | null>(null);
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [listings, setListings] = useState<ProduceListing[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, l, sold] = await Promise.all([fetchFarmer(), fetchListings(), fetchSales()]);
      setFarmer(f);
      setListings(l);
      setSales(sold);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your farm.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const signOut = () => authService.signOut().finally(() => reset({ name: 'landing' }));
  const walletReady = hasWallet(farmer);
  const addressReady = detailsDone(farmer);

  const setup = (section: 'details' | 'wallet') => {
    setEditing(section);
    setTab('profile');
  };

  const select = (t: Tab) => {
    setTab(t);
    setEditing(null);
  };

  const first = (account.name || 'farmer').split(' ')[0];
  return (
    <TabShell tabs={TABS} tab={tab} onSelect={select}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.hello}>{tab === 'listings' ? `Hello, ${first}` : TABS.find((t) => t.key === tab)?.label}</Text>
          <Text style={s.sub}>{tab === 'listings' ? 'Your produce, from listing to payout.' : SUB[tab]}</Text>
        </View>
        {loaded && farmer && !(walletReady && addressReady) ? <Badge label={addressReady ? 'Wallet needed' : walletReady ? 'Address needed' : 'Setup needed'} tone="warning" /> : null}
      </View>
      {error ? <Banner text={error} /> : null}
      {!loaded ? (
        <Loading tab={tab} />
      ) : !farmer ? (
        <Button label="Try again" variant="outline" onPress={load} />
      ) : (
        <>
          {tab === 'listings' ? (
            <>
              <PriceBoard compact />
              <ProduceListings listings={listings} pickup={farmerPickup(farmer)} addressReady={addressReady} walletReady={walletReady} onSetup={setup} onChange={load} />
            </>
          ) : null}
          {tab === 'messages' ? <><Offers /><MessagesPanel listings={listings} /></> : null}
          {tab === 'payments' ? <EarningsPanel sales={sales} farmer={farmer} onWallet={() => setup('wallet')} /> : null}
          {tab === 'profile' ? (
            <>
              <FarmerProfileCard name={account.name} phone={account.phone} farmer={farmer} editing={editing} onEdit={setEditing} onSaved={load} onSignOut={signOut} />
              <AccountFooter onDeleted={() => reset({ name: 'landing' })} />
            </>
          ) : null}
        </>
      )}
    </TabShell>
  );
}

const farmerPickup = (f: Farmer) => (f.address ? composeAddress({ line1: f.line1 ?? '', address: f.address }) : '');

function Loading({ tab }: { tab: Tab }) {
  if (tab === 'payments') return <><Skeleton height={168} radius={24} /><SkeletonCard lines={2} lead /><SkeletonCard lines={2} /></>;
  if (tab === 'profile') return <><Skeleton height={104} radius={24} /><SkeletonCard lines={4} /><SkeletonCard lines={3} /></>;
  if (tab === 'messages') return <><SkeletonCard lines={3} /><SkeletonCard lines={3} /><SkeletonCard lines={3} /></>;
  return <><Skeleton height={92} radius={16} /><Skeleton height={52} radius={14} /><SkeletonCard lines={3} lead /><SkeletonCard lines={3} lead /></>;
}

const SUB: Record<Tab, string> = {
  listings: '',
  messages: 'Updates on your produce: orders, pickups and weighing.',
  payments: 'What you have earned and what is on its way.',
  profile: 'Your farm details and payout wallet.',
};

const styles = (c: Record<ColorToken, string>) => ({
  header: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: 12, paddingTop: 4 },
  headerText: { gap: 4, flexShrink: 1 },
  hello: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: c.ink },
  sub: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
