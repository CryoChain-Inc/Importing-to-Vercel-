import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Gradient } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { Screen, useIsWide } from '../../../components/layout';
import { useNav } from '../../../navigation';
import {
  fetchListings,
  fetchMyProfile,
  signOutFarmer,
  type FarmerProfile,
  type ProduceListing,
} from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { PriceBoard } from '../components/PriceBoard';
import { FarmerProfileCard } from '../components/FarmerProfileCard';
import { ProduceListings } from '../components/ProduceListings';

export function FarmerHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const wide = useIsWide();
  const s = useThemedStyles(styles);
  const [profile, setProfile] = useState<FarmerProfile | null>(null);
  const [listings, setListings] = useState<ProduceListing[]>([]);
  const [error, setError] = useState<string | null>(null);

  const linked = /^[0-9a-f-]{36}$/i.test(account.id);

  const load = useCallback(async () => {
    if (!linked) return;
    try {
      const [nextProfile, nextListings] = await Promise.all([fetchMyProfile(), fetchListings()]);
      setProfile(nextProfile);
      setListings(nextListings);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your farm.');
    }
  }, [linked]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const signOut = async () => {
    await signOutFarmer();
    reset({ name: 'landing' });
  };

  const name = profile?.displayName || account.name;
  const bankReady = Boolean(profile?.accountNumber);

  return (
    <Screen topRight={<Button label="Sign out" variant="outline" size="sm" onPress={signOut} />}>
      <Gradient kind="card" style={s.welcome}>
        <Text style={s.overline}>FARMER</Text>
        <Text style={s.welcomeTitle}>Welcome, {name}</Text>
        <Badge label={bankReady ? 'Bank account saved' : 'Bank account needed'} tone={bankReady ? 'success' : 'warning'} />
      </Gradient>
      {error ? <Banner text={error} /> : null}
      {!linked ? (
        <Banner text="This demo sign-in is not stored in Supabase. Register with a new phone number to save your profile and listings." />
      ) : null}
      <PriceBoard />
      {linked ? (
        <View style={[s.columns, wide && s.columnsWide]}>
          {profile ? (
            <View style={wide ? s.col : undefined}>
              <FarmerProfileCard profile={profile} onSaved={setProfile} />
            </View>
          ) : null}
          <View style={wide ? s.col : undefined}>
            <ProduceListings listings={listings} onChange={load} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  welcome: { borderRadius: 24, padding: 28, gap: 10 },
  overline: { fontFamily: fonts.sansSemiBold, fontSize: 11, letterSpacing: 0.8, color: 'rgba(255,255,255,0.75)' },
  welcomeTitle: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: '#ffffff' },
  columns: { gap: 20 },
  columnsWide: { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
  col: { flex: 1 },
});
