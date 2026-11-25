import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner, Skeleton } from '../../../components/feedback';
import type { PickedImage } from '../../../services/catalogueImage';
import {
  MIN_PHOTOS,
  produceImageUrl,
  reportShortage,
  updateListing,
  updateListingPhotos,
  type ProduceListing,
} from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { posthog } from '../../../config/posthog';
import { useProductOptions } from '../useProductOptions';
import { EditSheet } from './EditSheet';
import { PhotoPicker } from './PhotoPicker';

/** Full-screen editor for product, quantity and photos (the unit comes with the product). The collection point stays as listed. */
export function EditListing({
  listing,
  onDone,
  onSaved,
}: {
  listing: ProduceListing;
  onDone: () => void;
  onSaved: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [shortOpen, setShortOpen] = useState(false);
  const { products: options, error: loadError } = useProductOptions(true);
  const [product, setProduct] = useState(listing.product);
  const [weight, setWeight] = useState(String(listing.weightKg));
  // Stored photos are shown by their public URL; this maps each one back to its storage path on save.
  const [stored] = useState(() => new Map(listing.imagePaths.map((p) => [produceImageUrl(p), p])));
  const [photos, setPhotos] = useState<PickedImage[]>(() =>
    [...stored.keys()].map((uri) => ({ uri })),
  );
  const [canSupply, setCanSupply] = useState('');
  const [confirmShort, setConfirmShort] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const products = options.map((o) => o.name);
  const names =
    products.includes(product) || products.length === 0 ? products : [product, ...products];
  // One unit per product: it follows the chosen product.
  const option = options.find((o) => o.name === product);
  const unit = option?.unit ?? listing.unit;
  const kg = Number(weight);
  // The server refuses a weight below what is already sold or declined, and a product/unit change once anything sold.
  const floor = listing.soldKg + listing.withdrawnKg;
  const locked = floor > 0;
  const valid =
    Number.isFinite(kg) &&
    kg > 0 &&
    kg >= floor &&
    (option !== undefined || product === listing.product) &&
    photos.length >= MIN_PHOTOS;
  const fieldsChanged =
    product !== listing.product || unit !== listing.unit || kg !== listing.weightKg;
  const photosChanged = photos.length !== stored.size || photos.some((p) => !stored.has(p.uri));
  const changed = fieldsChanged || photosChanged;
  const delta = kg - listing.weightKg;
  const fmt = (n: number) => n.toLocaleString('en-GH');

  const supply = Number(canSupply);
  const shortOk =
    canSupply.trim() !== '' &&
    Number.isFinite(supply) &&
    supply >= 0 &&
    supply < listing.reservedKg;
  const reportShort = async () => {
    setBusy(true);
    setError(null);
    try {
      await reportShortage(listing.id, supply);
      posthog?.capture('listing_shortage_reported', {
        unit: listing.unit,
        available_quantity: supply,
        reserved_quantity: listing.reservedKg,
      });
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
        await updateListingPhotos(
          listing.id,
          photos.flatMap((p) => stored.get(p.uri) ?? []),
          photos.filter((p) => !stored.has(p.uri)),
        );
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

  const cover = photos[0]?.uri;
  return (
    <EditSheet
      visible
      title="Edit listing"
      onClose={onDone}
      onSave={save}
      saveLabel={changed ? 'Save changes' : 'No changes yet'}
      busy={busy}
      canSave={valid && changed}
    >
      <View style={s.wrap}>
        {error || loadError ? <Banner text={(error ?? loadError)!} /> : null}

        <View style={s.summary}>
          <View style={s.thumb}>
            {cover ? (
              <Image source={{ uri: cover }} style={s.img} accessibilityIgnoresInvertColors />
            ) : (
              <Icon name="leaf" size={22} color={colors.brandInk} />
            )}
          </View>
          <View style={s.flex}>
            <Text style={s.title} numberOfLines={1}>
              {listing.product}
            </Text>
            <Text style={s.meta}>
              {fmt(listing.weightKg)} {listing.unit} listed · {fmt(listing.reservedKg)} reserved
            </Text>
          </View>
        </View>

        <View style={s.section}>
          {locked ? (
            <View style={s.note}>
              <Icon name="lock" size={16} color={colors.inkMuted} />
              <Text style={[s.meta, s.flex]}>
                {listing.product} · {listing.unit} is fixed because part of it has sold. You can
                still change the quantity, down to {fmt(floor)} {listing.unit}.
              </Text>
            </View>
          ) : names.length ? (
            <ChoiceChips label="Product" options={names} value={product} onChange={setProduct} />
          ) : (
            <View style={s.skel}>
              {[88, 72, 104].map((w) => (
                <Skeleton key={w} width={w} height={42} radius={21} />
              ))}
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.heading}>Quantity</Text>
          <Input
            label={`Quantity (${unit})`}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            hint={
              floor > 0
                ? `Minimum ${fmt(floor)} ${unit}, already reserved or declined.`
                : delta !== 0 && Number.isFinite(delta)
                  ? `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))} ${unit} from now.`
                  : undefined
            }
            error={
              kg > 0 && kg < floor
                ? `At least ${fmt(floor)} ${unit}, which is already reserved.`
                : undefined
            }
          />
        </View>

        <View style={s.section}>
          <Text style={s.heading}>Photos</Text>
          <PhotoPicker
            value={photos}
            onChange={setPhotos}
            canRemove={locked ? (img) => !stored.has(img.uri) : undefined}
          />
          <Text style={s.meta}>
            {locked
              ? 'You can add photos but not remove them, because part of this produce is reserved.'
              : `At least ${MIN_PHOTOS} photos. The first one is the cover.`}
          </Text>
        </View>

        {listing.reservedKg > 0 ? (
          <View style={s.short}>
            <Pressable
              onPress={() => setShortOpen(!shortOpen)}
              accessibilityRole="button"
              accessibilityState={{ expanded: shortOpen }}
              style={s.shortHead}
            >
              <Icon name="alert" size={20} color={colors.dangerInk} />
              <Text style={[s.heading, s.flex, { color: colors.dangerInk }]}>
                Cannot supply everything reserved?
              </Text>
              <Icon
                name={shortOpen ? 'chevronUp' : 'chevronDown'}
                size={20}
                color={colors.inkMuted}
              />
            </Pressable>
            {shortOpen ? (
              <>
                <Text style={s.meta}>
                  {fmt(listing.reservedKg)} {listing.unit} is reserved for orders and waiting for
                  our truck. If you have less, tell us now so we can find the rest elsewhere. You
                  are paid for what you supply, and this listing is closed to new orders.
                </Text>
                <Input
                  label={`How much can you supply? (${listing.unit})`}
                  value={canSupply}
                  onChangeText={(v) => {
                    setCanSupply(v);
                    setConfirmShort(false);
                  }}
                  keyboardType="decimal-pad"
                  error={
                    canSupply.trim() && !shortOk
                      ? `Enter less than ${fmt(listing.reservedKg)} ${listing.unit}. Enter 0 if you have none.`
                      : undefined
                  }
                />
                {confirmShort ? (
                  <Button
                    label={`Confirm: I can only supply ${fmt(supply)} ${listing.unit}`}
                    variant="danger"
                    onPress={reportShort}
                    loading={busy}
                    disabled={!shortOk}
                  />
                ) : (
                  <Button
                    label="Report shortage"
                    variant="outline"
                    onPress={() => setConfirmShort(true)}
                    disabled={!shortOk}
                  />
                )}
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </EditSheet>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 24 },
  flex: { flex: 1 },
  summary: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: c.brandTint,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.surfaceCard,
  },
  img: { width: 52, height: 52 },
  section: { gap: 10 },
  heading: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  note: {
    flexDirection: 'row' as const,
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: c.surfaceSunken,
  },
  short: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: c.dangerTint,
  },
  shortHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    minHeight: 44,
  },
  skel: { flexDirection: 'row' as const, gap: 8 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
