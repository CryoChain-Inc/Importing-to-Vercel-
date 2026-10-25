import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { deleteListing, fetchCollectionPoints, type CollectionPoint, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ListingCard } from './ListingCard';
import { NewListing } from './NewListing';

const PAGE = 4;
const FILTERS = [
  { key: 'active', label: 'On sale', has: (l: ProduceListing) => l.remainingKg > 0, empty: 'Nothing on sale right now.' },
  { key: 'sold', label: 'Sold out', has: (l: ProduceListing) => l.remainingKg <= 0, empty: 'Nothing has sold out yet.' },
] as const;

/** Listing form is locked until a wallet is saved (the database enforces this too). */
export function ProduceListings({ listings, walletReady, onAddWallet, onChange }: {
  listings: ProduceListing[];
  walletReady: boolean;
  onAddWallet: () => void;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [points, setPoints] = useState<CollectionPoint[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('active');
  const [shown, setShown] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);
  const active = FILTERS.find((f) => f.key === filter)!;
  const rows = listings.filter(active.has);

  useEffect(() => {
    fetchCollectionPoints().then(setPoints, (e) => setError(e.message));
  }, []);

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteListing(id);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that listing.');
    }
  };

  return (
    <View style={s.wrap}>
      {error ? <Banner text={error} /> : null}
      {walletReady ? (
        <NewListing points={points} onCreated={onChange} />
      ) : (
        <Card tone="tint" style={s.locked}>
          <View style={s.lockIcon}><Icon name="lock" size={22} color={colors.brandInk} /></View>
          <Text style={s.title}>Add your MoMo wallet to start listing</Text>
          <Text style={s.copy}>We need somewhere to send your payment before we can collect your produce.</Text>
          <Button label="Add wallet" icon="wallet" onPress={onAddWallet} />
        </Card>
      )}

      <View style={s.head}>
        <Text style={s.title}>Your listings</Text>
        <Text style={s.copy}>{listings.length} total</Text>
      </View>
      <View style={s.seg} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const n = listings.filter(f.has).length;
          const on = f.key === filter;
          return (
            <Pressable key={f.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { setFilter(f.key); setShown(PAGE); }} style={[s.segBtn, on && s.segOn]}>
              <Text style={[s.segText, on && s.segTextOn]}>{f.label} <Text style={s.segCount}>{n}</Text></Text>
            </Pressable>
          );
        })}
      </View>

      {rows.length === 0 ? (
        <Card style={s.emptyCard}>
          <Icon name="package" size={26} color={colors.inkMuted} />
          <Text style={s.copy}>{listings.length === 0 ? 'No produce listed yet.' : active.empty}</Text>
        </Card>
      ) : (
        <>
          {rows.slice(0, shown).map((l) => <ListingCard key={l.id} listing={l} onRemove={remove} onSaved={onChange} />)}
          {rows.length > shown ? <Button label={`Show ${Math.min(PAGE, rows.length - shown)} more of ${rows.length - shown}`} variant="outline" onPress={() => setShown(shown + PAGE)} /> : null}
        </>
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  head: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, marginTop: 6 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  seg: { flexDirection: 'row' as const, padding: 4, borderRadius: 14, backgroundColor: c.surfaceSunken },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 11 },
  segOn: { backgroundColor: c.surfaceCard, shadowColor: c.brand900, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 1 },
  segText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.inkMuted },
  segTextOn: { fontFamily: fonts.sansBold, color: c.ink },
  segCount: { fontVariant: ['tabular-nums' as const], color: c.inkMuted },
  locked: { gap: 4, alignItems: 'flex-start' as const },
  lockIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceCard, marginBottom: 8 },
  emptyCard: { alignItems: 'center' as const, gap: 8, paddingVertical: 28 },
});
