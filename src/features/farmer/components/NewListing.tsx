import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon, Input } from '../../../components/common';
import { Banner, Skeleton } from '../../../components/feedback';
import type { PickedImage } from '../../../services/catalogueImage';
import { estimateListing, MIN_PHOTOS, type Estimate } from '../../../services/farmer.service';
import { enqueueListing } from '../../../services/listingOutbox';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { posthog } from '../../../config/posthog';
import { posthogLog } from '../../../config/posthogLogs';
import { matchesSearch } from '../../../utils/search';
import { QUICK_ADD } from '../../../utils/units';
import { Sheet } from '../../ops/components/Sheet';
import { useProductOptions } from '../useProductOptions';
import { PhotoPicker } from './PhotoPicker';

const STEPS = ['Product', 'Quantity', 'Photos', 'Review'];

/** One button that opens a four-step sheet (product, quantity, photos, review). Pickup is always the farm address saved in the profile. Closing keeps the draft. */
export function NewListing({ pickup, onCreated }: { pickup: string; onCreated: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const { products: options, error: loadError } = useProductOptions(open);
  const [product, setProduct] = useState('');
  const [weight, setWeight] = useState('');
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [computed, setComputed] = useState<{ key: string; value: Estimate | null }>({ key: '', value: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [q, setQ] = useState('');

  const weightKg = Number(weight);
  const products = options.map((o) => o.name);
  const chosen = products.includes(product) ? product : (products[0] ?? '');
  // One unit per product: it follows the chosen product.
  const option = options.find((o) => o.name === chosen);
  const unit = option?.unit ?? '';
  const key = `${chosen}|${weightKg}|${unit}`;
  const validKg = Number.isFinite(weightKg) && weightKg > 0;
  const blockedOnPrice = options.length > 0 && !option;
  // Keep showing the last estimate while a new one loads so the card never unmounts and shifts the layout.
  const estimate = validKg && !blockedOnPrice ? computed.value : null;
  const pending = computed.key !== key;
  const photosShort = Math.max(0, MIN_PHOTOS - photos.length);
  const ready = chosen.length > 1 && validKg && photosShort === 0 && !blockedOnPrice;
  const hint = blockedOnPrice ? `No published price for ${chosen} yet. Pick another product.` : photosShort > 0 ? `Add ${photosShort} more photo${photosShort === 1 ? '' : 's'} to continue.` : !validKg ? 'Enter the quantity you have ready.' : null;

  useEffect(() => {
    if (!chosen || !validKg || blockedOnPrice) return;
    let stale = false;
    estimateListing(chosen, weightKg, unit).then(
      (value) => { if (!stale) setComputed({ key, value }); },
      () => undefined,
    );
    return () => { stale = true; };
  }, [chosen, weightKg, validKg, unit, key, blockedOnPrice]);

  const close = () => { setOpen(false); setError(null); };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await enqueueListing(chosen, weightKg, unit, photos);
      posthog?.capture('listing_created', { product: chosen, unit, quantity: weightKg, photo_count: photos.length });
      posthogLog.info('listing created', { event: 'listing_created', product: chosen, unit, quantity: weightKg, photo_count: photos.length });
      setWeight('');
      setPhotos([]);
      setStep(0);
      setOpen(false);
      await onCreated().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const canNext = [chosen.length > 1, validKg && !blockedOnPrice && options.length > 0, photosShort === 0][step] ?? false;
  const shownProducts = options.filter((o) => matchesSearch(q, o.name, o.aliases));
  const quick = QUICK_ADD[unit] ?? QUICK_ADD.piece;
  const bump = (n: number) => setWeight(String((validKg ? weightKg : 0) + n));

  if (!open) {
    return (
      <Button label={step > 0 || weight || photos.length ? 'Continue your listing' : 'New listing'} icon="package" size="lg" onPress={() => setOpen(true)} />
    );
  }

  const footer = (
    <>
      {step > 0 ? <Button label="Back" variant="ghost" onPress={() => setStep(step - 1)} /> : null}
      {step < 3 ? <Button label="Continue" onPress={() => setStep(step + 1)} disabled={!canNext} /> : <Button label="Add listing" onPress={submit} loading={busy} disabled={!ready} />}
    </>
  );

  return (
    <Sheet title="New listing" subtitle={`Step ${step + 1} of 4 · ${STEPS[step]}`} onClose={close} footer={footer}>
      <View style={s.progress} accessibilityLabel={`Step ${step + 1} of 4`}>
        {STEPS.map((x, i) => <View key={x} style={[s.seg, i <= step && s.segOn]} />)}
      </View>
      {error || loadError ? <Banner text={(error ?? loadError)!} /> : null}

      {step === 0 ? (
        <>
          <Text style={s.q}>What are you selling?</Text>
          {products.length > 0 ? <Input label="Search produce" value={q} onChangeText={setQ} placeholder="Name or local name, e.g. Tomato" autoCorrect={false} /> : null}
          {products.length === 0 ? (
            <View style={s.grid}>{[0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={s.cell}><Skeleton width="100%" height={56} radius={14} /></View>)}</View>
          ) : shownProducts.length === 0 ? (
            <Text style={s.meta}>No produce matches “{q}”.</Text>
          ) : (
            <View style={s.grid}>
              {shownProducts.map((o) => {
                const p = o.name;
                const on = p === chosen;
                return (
                  <View key={p} style={s.cell}>
                    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setProduct(p)} style={[s.tile, on && s.tileOn]}>
                      <Text style={[s.tileText, on && s.tileTextOn]} numberOfLines={2}>{p}</Text>
                      {on ? <Icon name="check" size={18} color={colors.brandInk} /> : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Text style={s.q}>How much {chosen} do you have ready?</Text>
          {option ? <Text style={s.meta}>Sold by the {option.unit}. You are paid about {ghs(option.price)} per {option.unit}.</Text> : null}
          <Input label={`Quantity (${unit || 'units'})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={unit === 'kg' ? '800' : '100'} />
          <View style={s.quick}>
            {quick.map((n) => (
              <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Add ${n} ${unit}`} onPress={() => bump(n)} style={s.add}>
                <Text style={s.addText}>+{n}</Text>
              </Pressable>
            ))}
          </View>
          <EstimateCard s={s} estimate={estimate} loading={validKg && !blockedOnPrice && pending} lines={2} detail={estimate ? `${ghs(estimate.pricePerKg)}/${unit}` : blockedOnPrice ? `No published price for ${chosen} yet. Go back and pick another product.` : 'Enter your quantity and we will show what you get.'} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Text style={s.q}>Show buyers your {chosen}</Text>
          <Text style={s.meta}>Add at least {MIN_PHOTOS} clear photos in daylight. {photos.length} of {MIN_PHOTOS} added.</Text>
          <PhotoPicker value={photos} onChange={setPhotos} />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Text style={s.q}>Check and add</Text>
          <View style={s.summary}>
            <Row label="Produce" value={`${chosen} · ${unit}`} s={s} />
            <Row label="Quantity" value={`${weightKg.toLocaleString('en-GH')} ${unit}`} s={s} />
            <Row label="Photos" value={String(photos.length)} s={s} last />
          </View>
          <EstimateCard s={s} estimate={estimate} loading={validKg && !blockedOnPrice && pending} lines={4} detail={estimate ? `${ghs(estimate.pricePerKg)}/${unit} · ${(estimate.feeRate * 100).toFixed(1)}% collection fee ${ghs(estimate.fee)}. Final amount follows the quantity recorded at collection.` : 'Final amount follows the quantity recorded at collection.'} />
          <View style={s.pickup}>
            <Icon name="pin" size={18} color={colors.brandInk} />
            <View style={s.pickupText}>
              <Text style={s.pickupLabel}>We collect from your farm</Text>
              <Text style={s.meta}>{pickup}</Text>
            </View>
          </View>
          {hint ? <Text style={s.meta}>{hint}</Text> : null}
        </>
      ) : null}
    </Sheet>
  );
}

/** Fixed-size card with three states in the same footprint: placeholder (no weight), skeleton (first load), value (dimmed while refreshing). */
function EstimateCard({ s, estimate, loading, detail, lines }: { s: ReturnType<typeof styles>; estimate: Estimate | null; loading: boolean; detail: string; lines: number }) {
  const first = loading && !estimate;
  return (
    <View style={s.estimate} accessibilityLiveRegion="polite">
      <Text style={s.meta}>You get about</Text>
      <View style={s.netBox}>
        {first ? <Skeleton width={150} height={30} radius={8} /> : <Text style={[s.net, !estimate && s.placeholder, loading && s.pending]}>{ghs(estimate ? estimate.net : 0)}</Text>}
      </View>
      <View style={{ height: lines * 18 }}>
        {first ? <><Skeleton width="70%" height={12} style={{ marginTop: 3 }} /><Skeleton width="45%" height={12} style={{ marginTop: 6 }} /></> : <Text style={[s.meta, loading && s.pending]} numberOfLines={lines}>{detail}</Text>}
      </View>
    </View>
  );
}

function Row({ label, value, s, last }: { label: string; value: string; s: ReturnType<typeof styles>; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.rowLine]}>
      <Text style={s.meta}>{label}</Text>
      <Text style={s.rowVal}>{value}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  progress: { flexDirection: 'row' as const, gap: 6 },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.surfaceSunken },
  segOn: { backgroundColor: c.brand500 },
  q: { fontFamily: fonts.heading, fontSize: 22, letterSpacing: -0.3, color: c.ink },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginHorizontal: -5 },
  cell: { width: '50%' as const, padding: 5 },
  tile: { minHeight: 56, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: c.borderSubtle, backgroundColor: c.surfaceCard },
  tileOn: { borderColor: c.brand500, backgroundColor: c.brandTint },
  tileText: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  tileTextOn: { color: c.brandInk },
  units: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  unitTile: { flexGrow: 1, flexBasis: '30%' as const, minHeight: 76, paddingHorizontal: 8, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 16, borderWidth: 1.5, borderColor: c.borderSubtle, backgroundColor: c.surfaceCard },
  unitName: { fontFamily: fonts.heading, fontSize: 20, color: c.ink },
  quick: { flexDirection: 'row' as const, gap: 8 },
  add: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken },
  addText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  estimate: { gap: 4, padding: 16, borderRadius: 16, backgroundColor: c.surfaceSunken },
  netBox: { height: 36, justifyContent: 'center' as const },
  placeholder: { opacity: 0.25 },
  pending: { opacity: 0.6 },
  net: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.5, color: c.ink, fontVariant: ['tabular-nums' as const] },
  summary: { borderRadius: 16, borderWidth: 1, borderColor: c.borderSubtle, paddingHorizontal: 16 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12, paddingVertical: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  rowVal: { flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink, textAlign: 'right' as const },
  pickup: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.brandTint },
  pickupText: { flex: 1, gap: 2 },
  pickupLabel: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
