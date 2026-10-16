import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Brand, Button, Icon, ThemeToggle, type IconName } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { useIsWide } from '../../../components/layout';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import { fetchFarmer, fetchListings, hasWallet, type Farmer, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { ComingSoon } from '../components/ComingSoon';
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

/** Bottom tab bar on phones, side rail on wide screens. Tab state is local, not a route. */
export function FarmerHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const wide = useIsWide();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [tab, setTab] = useState<Tab>('listings');
  const [editing, setEditing] = useState<'details' | 'wallet' | null>(null);
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [listings, setListings] = useState<ProduceListing[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, l] = await Promise.all([fetchFarmer(), fetchListings()]);
      setFarmer(f);
      setListings(l);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your farm.');
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

  const content = (
    <View style={s.content}>
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.hello}>Hello, {account.name || 'farmer'}</Text>
          <Badge label={walletReady ? 'Wallet saved' : 'Wallet needed'} tone={walletReady ? 'success' : 'warning'} />
        </View>
        {wide ? null : <ThemeToggle />}
      </View>
      {error ? <Banner text={error} /> : null}
      {tab === 'listings' ? (
        <>
          <ProduceListings listings={listings} walletReady={walletReady} onAddWallet={addWallet} onChange={load} />
          <PriceBoard />
        </>
      ) : null}
      {tab === 'messages' ? (
        <ComingSoon icon="message" title="Messages" copy="Chat with your collection agent about pickups and quality." points={['Pickup time updates', 'Quality feedback after grading', 'Support from the CryoChain team']} />
      ) : null}
      {tab === 'payments' ? (
        <ComingSoon icon="wallet" title="Payments" copy="Every payout for your collected produce, with the weight it was based on." points={['Paid per consignment to your MoMo wallet', 'Weight, grade and fee on every payout', 'Settlement history']} />
      ) : null}
      {tab === 'profile' && farmer ? (
        <FarmerProfileCard name={account.name} farmer={farmer} editing={editing} onEdit={setEditing} onSaved={load} />
      ) : null}
    </View>
  );

  const select = (t: Tab) => {
    setTab(t);
    setEditing(null);
  };

  return (
    <View style={[s.root, wide && s.rootWide]}>
      {wide ? (
        <View style={s.rail}>
          <Brand />
          <View style={s.railTabs}>
            {TABS.map((t) => (
              <TabButton key={t.key} tab={t} on={tab === t.key} onPress={() => select(t.key)} rail />
            ))}
          </View>
          <View style={s.railFoot}>
            <ThemeToggle />
            <Button label="Sign out" variant="outline" size="sm" onPress={signOut} />
          </View>
        </View>
      ) : null}
      <ScrollView style={s.main} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {content}
        {wide ? null : <Button label="Sign out" variant="ghost" size="sm" onPress={signOut} />}
      </ScrollView>
      {wide ? null : (
        <View style={s.bar} accessibilityRole="tablist">
          {TABS.map((t) => (
            <TabButton key={t.key} tab={t} on={tab === t.key} onPress={() => select(t.key)} />
          ))}
        </View>
      )}
    </View>
  );

  function TabButton({ tab: t, on, onPress, rail }: { tab: (typeof TABS)[number]; on: boolean; onPress: () => void; rail?: boolean }) {
    return (
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={onPress} style={[rail ? s.railTab : s.barTab, on && (rail ? s.railTabOn : null)]}>
        <Icon name={t.icon} size={22} color={on ? colors.brandInk : colors.inkMuted} />
        <Text style={[s.tabLabel, on && s.tabLabelOn]}>{t.label}</Text>
      </Pressable>
    );
  }
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  rootWide: { flexDirection: 'row' as const },
  rail: { width: 248, padding: 20, gap: 24, justifyContent: 'space-between' as const, backgroundColor: c.surfaceCard, borderRightWidth: 1, borderRightColor: c.borderSubtle },
  railTabs: { flex: 1, gap: 4 },
  railTab: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 12 },
  railTabOn: { backgroundColor: c.brandTint },
  railFoot: { gap: 12, alignItems: 'flex-start' as const },
  main: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  content: { width: '100%' as const, maxWidth: 720, alignSelf: 'center' as const, gap: 16 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  headerText: { gap: 8, alignItems: 'flex-start' as const, flexShrink: 1 },
  hello: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: c.ink },
  bar: { flexDirection: 'row' as const, backgroundColor: c.surfaceCard, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  barTab: { flex: 1, minHeight: 60, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 2 },
  tabLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  tabLabelOn: { fontFamily: fonts.sansBold, color: c.brandInk },
});
