import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Badge, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import type { PickedImage } from '../../../services/catalogueImage';
import { createListing, deleteListing, estimateListing, fetchCollectionPoints, fetchPricedGrades, fetchProductNames, GRADES, MIN_PHOTOS, type CollectionPoint, type Estimate, type ListingStage, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { PhotoPicker } from './PhotoPicker';

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
  const [priced, setPriced] = useState<Record<string, string[]> | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  const [pointName, setPointName] = useState('');
  const [product, setProduct] = useState('');
  const [grade, setGrade] = useState('A');
  const [weight, setWeight] = useState('');
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [computed, setComputed] = useState<{ key: string; value: Estimate | null }>({ key: '', value: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weightKg = Number(weight);
  const point = points.find((p) => p.name === pointName) ?? points[0];
  const chosen = products.includes(product) ? product : (products[0] ?? '');
  const gradeOptions = priced ? (priced[chosen] ?? []) : GRADES;
  const key = `${chosen}|${weightKg}|${grade}`;
  const validKg = Number.isFinite(weightKg) && weightKg > 0;
  const estimate = computed.key === key ? computed.value : null;
  const priceKnown = priced ? gradeOptions.includes(grade) : null;
  const blockedOnPrice = priceKnown === false;
  const photosShort = Math.max(0, MIN_PHOTOS - photos.length);
  const ready = Boolean(point) && chosen.length > 1 && validKg && photosShort === 0 && !blockedOnPrice && (priced !== null || pricesFailed);
  const blockReason = !point
    ? null
    : blockedOnPrice
      ? `No published price for ${chosen} yet. Pick another product.`
      : !validKg
        ? null
        : photosShort > 0
          ? `Add ${photosShort} more photo${photosShort === 1 ? '' : 's'} (at least ${MIN_PHOTOS}).`
          : null;

  useEffect(() => {
    fetchCollectionPoints().then(setPoints, (e) => setError(e.message));
    fetchProductNames().then(setProducts, (e) => setError(e.message));
    fetchPricedGrades().then(setPriced, () => setPricesFailed(true));
  }, []);

  useEffect(() => {
    if (!priced || !chosen) return;
    const options = priced[chosen] ?? [];
    if (options.length > 0 && !options.includes(grade)) setGrade(options[0]);
  }, [priced, chosen, grade]);

  useEffect(() => {
    if (!chosen || !validKg || blockedOnPrice) return;
    let stale = false;
    estimateListing(chosen, weightKg, grade).then(
      (value) => {
        if (!stale) setComputed({ key, value });
      },
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [chosen, weightKg, validKg, grade, key, blockedOnPrice]);

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
      {error ? <Banner text={error} /> : null}
      {walletReady ? (
        <Card>
          <Text style={s.title}>List produce</Text>
          <Text style={s.copy}>Add the product and the weight you have ready for collection.</Text>
          <View style={s.form}>
            {point ? (
              <>
                <ChoiceChips label="Collection point" options={points.map((p) => p.name)} value={point.name} onChange={setPointName} />
                <ChoiceChips label="Product" options={products} value={chosen} onChange={setProduct} />
                {gradeOptions.length > 0 ? <ChoiceChips label="Grade" options={gradeOptions} value={grade} onChange={setGrade} /> : null}
              </>
            ) : (
              <Text style={s.meta}>No collection points are open yet. Check back soon.</Text>
            )}
            <Input label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="800" />
            {estimate ? (
              <View style={s.estimate}>
                <Text style={s.meta}>Expected value · {ghs(estimate.pricePerKg)}/kg (Grade {grade})</Text>
                <Text style={s.meta}>Collection fee ({(estimate.feeRate * 100).toFixed(1)}%) · −{ghs(estimate.fee)}</Text>
                <Text style={s.net}>You get about {ghs(estimate.net)}</Text>
                <Text style={s.meta}>Final amount is set by the weight and grade recorded at collection.</Text>
              </View>
            ) : null}
            <PhotoPicker value={photos} onChange={setPhotos} />
            {blockReason ? <Text style={s.meta}>{blockReason}</Text> : null}
            <Button
              label="Add listing"
              onPress={() => run(async () => { await createListing(point!.id, chosen, weightKg, grade, photos); setWeight(''); setPhotos([]); })}
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
        <>
          <ListingGroup
            title="Available listings"
            listings={listings.filter((listing) => listing.stage === 'available')}
            empty="No produce waiting for collection."
            onRemove={(id) => run(() => deleteListing(id))}
          />
          <ListingGroup
            title="Collected listings"
            listings={listings.filter((listing) => listing.stage !== 'available')}
            empty="Nothing has been collected yet."
            onRemove={(id) => run(() => deleteListing(id))}
          />
        </>
      )}
    </View>
  );
}

const STAGE: Record<ListingStage, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  available: { label: 'Waiting for collection', tone: 'neutral' },
  captured: { label: 'Captured', tone: 'info' },
  loaded: { label: 'Loaded', tone: 'warning' },
  delivered: { label: 'Delivered', tone: 'success' },
};

function ListingGroup({
  title,
  listings,
  empty,
  onRemove,
}: {
  title: string;
  listings: ProduceListing[];
  empty: string;
  onRemove?: (id: string) => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.group}>
      <Text style={s.section}>{title}</Text>
      {listings.length === 0 ? <Text style={s.meta}>{empty}</Text> : listings.map((listing) => {
        const stage = STAGE[listing.stage];
        const kg = listing.recordedKg ?? listing.weightKg;
        return (
          <Card key={listing.id}>
            <View style={s.item}>
              <View style={s.itemText}>
                <Text style={s.product}>{listing.product} · Grade {listing.grade}</Text>
                <Text style={s.meta}>
                  {kg.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg{listing.recordedKg != null ? ' recorded' : ''}{listing.point ? ` · ${listing.point}` : ''}
                </Text>
                {listing.recordedKg != null && listing.recordedKg !== listing.weightKg ? (
                  <Text style={s.meta}>Listed {listing.weightKg.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg</Text>
                ) : null}
                {listing.stage === 'available' && listing.estNet != null ? <Text style={s.meta}>Expected {ghs(listing.estNet)} after {ghs(listing.estFee ?? 0)} fee</Text> : null}
                <View style={s.badges}>
                  <Badge label={stage.label} tone={stage.tone} />
                  <Badge label={listing.inLot ? (listing.lotCode ? `In lot ${listing.lotCode}` : 'In a lot') : 'Not in a lot'} tone={listing.inLot ? 'warning' : 'neutral'} />
                </View>
                <Text style={s.meta}>
                  {listing.inLot
                    ? 'Ops added this to a lot, so buyers can see it. It can no longer be removed.'
                    : 'Not added to a lot yet. You can still remove it.'}
                </Text>
              </View>
              {onRemove && !listing.inLot ? <Button label="Remove" variant="ghost" size="sm" onPress={() => onRemove(listing.id)} /> : null}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  group: { gap: 12 },
  section: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, marginTop: 4, marginBottom: 14 },
  form: { gap: 14 },
  locked: { gap: 4, alignItems: 'flex-start' as const },
  lockIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceCard, marginBottom: 8 },
  emptyCard: { alignItems: 'center' as const, gap: 8, paddingVertical: 28 },
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  itemText: { flex: 1, gap: 2 },
  badges: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  product: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  estimate: { gap: 2, padding: 12, borderRadius: 12, backgroundColor: c.surfaceSunken },
  net: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
