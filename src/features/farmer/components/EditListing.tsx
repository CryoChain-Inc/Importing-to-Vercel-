import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ChoiceChips, Input } from '../../../components/common';
import { Banner, Skeleton } from '../../../components/feedback';
import type { PickedImage } from '../../../services/catalogueImage';
import { MIN_PHOTOS, produceImageUrl, reportShortage, updateListing, updateListingPhotos, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { posthog } from '../../../config/posthog';
import { useProductOptions } from '../useProductOptions';
import { PhotoPicker } from './PhotoPicker';

/** Inline editor for product, quantity and photos (the unit comes with the product). The collection point stays as listed. */
export function EditListing({ listing, onDone, onSaved }: { listing: ProduceListing; onDone: () => void; onSaved: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { products: options, error: loadError } = useProductOptions(true);
  const [product, setProduct] = useState(listing.product);
  const [weight, setWeight] = useState(String(listing.weightKg));
  // Stored photos are shown by their public URL; this maps each one back to its storage path on save.
  const [stored] = useState(() => new Map(listing.imagePaths.map((p) => [produceImageUrl(p), p])));
  const [photos, setPhotos] = useState<PickedImage[]>(() => [...stored.keys()].map((uri) => ({ uri })));
  const [canSupply, setCanSupply] = useState('');
  const [confirmShort, setConfirmShort] = useState(false);
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
  const valid = Number.isFinite(kg) && kg > 0 && kg >= floor && (option !== undefined || product === listing.product) && photos.length >= MIN_PHOTOS;
  const fieldsChanged = product !== listing.product || unit !== listing.unit || kg !== listing.weightKg;
  const photosChanged = photos.length !== stored.size || photos.some((p) => !stored.has(p.uri));
  const changed = fieldsChanged || photosChanged;

  const supply = Number(canSupply);
  const shortOk = canSupply.trim() !== '' && Number.isFinite(supply) && supply >= 0 && supply < listing.reservedKg;
  const reportShort = async () => {
    setBusy(true);
    setError(null);
    try {
      await reportShortage(listing.id, supply);
      posthog?.capture('listing_shortage_reported', { unit: listing.unit, available_quantity: supply, reserved_quantity: listing.reservedKg });
      await onSaved();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not report the shortage.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (fieldsChanged) await updateListing(listing.id, product, kg, unit);
      if (photosChanged) {
        await updateListingPhotos(listing.id, photos.flatMap((p) => stored.get(p.uri) ?? []), photos.filter((p) => !stored.has(p.uri)));
      }
      posthog?.capture('listing_updated', {
        fields_changed: fieldsChanged,
        photos_changed: photosChanged,
        unit,
        quantity: kg,
        photo_count: photos.length,
      });
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
      
      <Input label={`Quantity (${unit})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" error={kg > 0 && kg < floor ? `At least ${floor.toLocaleString('en-GH')} ${unit}, which is already reserved.` : undefined} />
      <PhotoPicker value={photos} onChange={setPhotos} canRemove={locked ? (img) => !stored.has(img.uri) : undefined} />
      {locked ? <Text style={s.meta}>Photos can be added but not removed, because part of this produce is reserved.</Text> : null}
      {listing.reservedKg > 0 ? (
        <View style={s.short}>
          <Text style={s.title}>Cannot supply everything reserved?</Text>
          <Text style={s.meta}>{listing.reservedKg.toLocaleString('en-GH')} {listing.unit} is reserved for orders and waiting for our truck. If you have less, tell us now so we can find the rest elsewhere. You are paid for what you supply, and this listing is closed to new orders.</Text>
          <Input label={`How much of it can you supply? (${listing.unit})`} value={canSupply} onChangeText={(v) => { setCanSupply(v); setConfirmShort(false); }} keyboardType="decimal-pad"
            error={canSupply.trim() && !shortOk ? `Enter less than ${listing.reservedKg.toLocaleString('en-GH')} ${listing.unit}. Enter 0 if you have none.` : undefined} />
          {confirmShort
            ? <Button label={`Confirm: I can only supply ${supply.toLocaleString('en-GH')} ${listing.unit}`} variant="danger" onPress={reportShort} loading={busy} disabled={!shortOk} />
            : <Button label="Report shortage" variant="outline" onPress={() => setConfirmShort(true)} disabled={!shortOk} />}
        </View>
      ) : null}
      <View style={s.actions}>
        <Button label="Cancel" variant="outline" onPress={onDone} style={s.action} />
        <Button label="Save changes" onPress={save} loading={busy} disabled={!valid || !changed} style={s.action} />
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 16 },
  short: { gap: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  skel: { flexDirection: 'row' as const, gap: 8 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
});
