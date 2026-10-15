import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { createListing, deleteListing, fetchCollectionPoints, fetchProductNames, type CollectionPoint, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

/** Listing form is locked until a wallet is saved (the database enforces this too). */
export function ProduceListings({
  listings,
  walletReady,
  onAddWallet,
  onChange,
}: {
  listings: ProduceListing[];
  walletReady: boolean;
  onAddWallet: () => void;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [points, setPoints] = useState<CollectionPoint[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [pointName, setPointName] = useState('');
  const [product, setProduct] = useState('');
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weightKg = Number(weight);
  const point = points.find((p) => p.name === pointName) ?? points[0];
  const chosen = products.includes(product) ? product : (products[0] ?? '');
  const ready = Boolean(point) && chosen.length > 1 && Number.isFinite(weightKg) && weightKg > 0;

  useEffect(() => {
    fetchCollectionPoints().then(setPoints, (e) => setError(e.message));
    fetchProductNames().then(setProducts, (e) => setError(e.message));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      {walletReady ? (
        <Card>
          <Text style={s.title}>List produce</Text>
          <Text style={s.copy}>Add the product and the weight you have ready for collection.</Text>
          {error ? <Banner text={error} /> : null}
          <View style={s.form}>
            {point ? (
              <>
                <ChoiceChips label="Collection point" options={points.map((p) => p.name)} value={point.name} onChange={setPointName} />
                <ChoiceChips label="Product" options={products} value={chosen} onChange={setProduct} />
              </>
            ) : (
              <Text style={s.meta}>No collection points are open yet. Check back soon.</Text>
            )}
            <Input label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="800" />
            <Button
              label="Add listing"
              onPress={() => run(async () => { await createListing(point!.id, chosen, weightKg); setWeight(''); })}
              loading={busy}
              disabled={!ready}
            />
          </View>
        </Card>
      ) : (
        <Card tone="tint" style={s.locked}>
          <View style={s.lockIcon}><Icon name="lock" size={22} color={colors.brandInk} /></View>
          <Text style={s.title}>Add your MoMo wallet to start listing</Text>
          <Text style={s.copy}>We need somewhere to send your payment before we can collect your produce.</Text>
          <Button label="Add wallet" icon="wallet" onPress={onAddWallet} />
        </Card>
      )}
      {listings.length === 0 ? (
        <Card style={s.emptyCard}>
          <Icon name="package" size={28} color={colors.inkMuted} />
          <Text style={s.empty}>No produce listed yet.</Text>
        </Card>
      ) : (
        listings.map((listing) => (
          <Card key={listing.id}>
            <View style={s.item}>
              <View style={s.itemText}>
                <Text style={s.product}>{listing.product}</Text>
                <Text style={s.meta}>{listing.weightKg.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg{listing.point ? ` · ${listing.point}` : ''}</Text>
              </View>
              <Button label="Remove" variant="ghost" size="sm" onPress={() => run(() => deleteListing(listing.id))} />
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, marginTop: 4, marginBottom: 14 },
  form: { gap: 14 },
  locked: { gap: 4, alignItems: 'flex-start' as const },
  lockIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceCard, marginBottom: 8 },
  emptyCard: { alignItems: 'center' as const, gap: 8, paddingVertical: 28 },
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  itemText: { flex: 1, gap: 2 },
  product: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
