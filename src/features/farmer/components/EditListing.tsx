import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ChoiceChips, Input } from '../../../components/common';
import { Banner, Skeleton } from '../../../components/feedback';
import { updateListing, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { useProductOptions } from '../useProductOptions';

/** Inline editor for product and quantity (the unit comes with the product). Photos and collection point stay as listed. */
export function EditListing({ listing, onDone, onSaved }: { listing: ProduceListing; onDone: () => void; onSaved: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { products: options, error: loadError } = useProductOptions(true);
  const [product, setProduct] = useState(listing.product);
  const [weight, setWeight] = useState(String(listing.weightKg));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const products = options.map((o) => o.name);
  const names = products.includes(product) || products.length === 0 ? products : [product, ...products];
  // One unit per product: it follows the chosen product.
  const option = options.find((o) => o.name === product);
  const unit = option?.unit ?? listing.unit;
  const kg = Number(weight);
  // The server refuses a weight below what is already sold or declined, and a product/unit change once anything sold.
  const floor = listing.soldKg + listing.withdrawnKg;
  const locked = floor > 0;
  const valid = Number.isFinite(kg) && kg > 0 && kg >= floor && (option !== undefined || product === listing.product);
  const changed = product !== listing.product || unit !== listing.unit || kg !== listing.weightKg;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateListing(listing.id, product, kg, unit);
      await onSaved();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Edit listing</Text>
      {error || loadError ? <Banner text={(error ?? loadError)!} /> : null}
      {locked ? <Text style={s.meta}>{listing.product} · {listing.unit} cannot change because part of it has sold. You can change the quantity, down to {floor.toLocaleString('en-GH')} {listing.unit}.</Text> : names.length ? (
        <ChoiceChips label="Product" options={names} value={product} onChange={setProduct} />
      ) : (
        <View style={s.skel}>{[88, 72, 104].map((w) => <Skeleton key={w} width={w} height={42} radius={21} />)}</View>
      )}
      
      <Input label={`Quantity (${unit})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" error={kg > 0 && kg < floor ? `At least ${floor.toLocaleString('en-GH')} ${unit}, which is already sold.` : undefined} />
      <View style={s.actions}>
        <Button label="Cancel" variant="outline" onPress={onDone} style={s.action} />
        <Button label="Save changes" onPress={save} loading={busy} disabled={!valid || !changed} style={s.action} />
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 16 },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  skel: { flexDirection: 'row' as const, gap: 8 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
});
