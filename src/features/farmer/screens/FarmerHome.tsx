import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, type IconName } from '../../../components/common';
import { Banner, Skeleton, SkeletonCard } from '../../../components/feedback';
import { TabShell } from '../../../components/layout';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import { fetchFarmer, fetchListings, hasWallet, type Farmer, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { EarningsPanel } from '../components/EarningsPanel';
import { MessagesPanel } from '../components/MessagesPanel';
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
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, l] = await Promise.all([fetchFarmer(), fetchListings()]);
      setFarmer(f);
      setListings(l);
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

  const addWallet = () => {
    setEditing('wallet');
    setTab('profile');
  };

  const editDetails = () => {
    setTab('profile');
    setEditing('details');
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
        {loaded && farmer && !walletReady ? <Badge label="Wallet needed" tone="warning" /> : null}
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
              <ProduceListings listings={listings} walletReady={walletReady} locality={farmer.locality} onAddWallet={addWallet} onOpenProfile={editDetails} onChange={load} />
            </>
          ) : null}
          {tab === 'messages' ? <MessagesPanel listings={listings} /> : null}
          {tab === 'payments' ? <EarningsPanel listings={listings} farmer={farmer} onWallet={addWallet} /> : null}
          {tab === 'profile' ? <FarmerProfileCard name={account.name} phone={account.phone} farmer={farmer} editing={editing} onEdit={setEditing} onSaved={load} onSignOut={signOut} /> : null}
        </>
      )}
    </TabShell>
  );
}

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
