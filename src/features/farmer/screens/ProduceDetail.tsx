import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import { Banner, SkeletonCard } from '../../../components/feedback';
import { TabShell } from '../../../components/layout';
import { useNav } from '../../../navigation';
import { deleteListing, fetchListings, fetchSales, type ProduceListing, type Sale } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { ListingCard } from '../components/ListingCard';
import { TABS, type Tab } from './FarmerHome';

/** Every listing (grade) of one product, opened from its card on the farmer's Listings tab. */
export function ProduceDetail({ account, product }: { account: Account; product: string }) {
  const { back, reset } = useNav();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [listings, setListings] = useState<ProduceListing[] | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, sold] = await Promise.all([fetchListings(), fetchSales()]);
      setListings(l.filter((x) => x.product === product).sort((a, b) => a.grade.localeCompare(b.grade)));
      setSales(sold);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this produce.');
    }
  }, [product]);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    try {
      await deleteListing(id);
      if (listings?.length === 1) return back();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that listing.');
    }
  };

  return (
    <TabShell tabs={TABS} tab="listings" onSelect={(t: Tab) => (t === 'listings' ? back() : reset({ name: 'home', account, role: 'farmer', tab: t }))}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to listings" onPress={back} hitSlop={8} style={s.back}>
        <Icon name="arrowLeft" size={20} color={colors.ink} />
        <Text style={s.backText}>Your listings</Text>
      </Pressable>
      <Text style={s.title} accessibilityRole="header">{product}</Text>
      {error ? <Banner text={error} /> : null}
      {listings === null ? (
        error ? <Button label="Try again" variant="outline" onPress={load} /> : <><SkeletonCard lines={3} lead /><SkeletonCard lines={3} lead /></>
      ) : listings.length === 0 ? (
        <Text style={s.copy}>This produce has no listings any more.</Text>
      ) : (
        <View style={s.list}>
          {listings.map((l) => <ListingCard key={l.id} listing={l} sales={sales.filter((x) => x.listingId === l.id)} onRemove={remove} onSaved={load} />)}
        </View>
      )}
    </TabShell>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  back: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44, alignSelf: 'flex-start' as const },
  backText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink },
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: c.ink },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  list: { gap: 14 },
});
