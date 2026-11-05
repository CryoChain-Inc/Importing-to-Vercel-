import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon, Input } from '../../../components/common';
import { Banner, Skeleton } from '../../../components/feedback';
import type { PickedImage } from '../../../services/catalogueImage';
import { estimateListing, GRADES, MIN_PHOTOS, type Estimate } from '../../../services/farmer.service';
import { enqueueListing } from '../../../services/listingOutbox';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { Sheet } from '../../ops/components/Sheet';
import { useProductOptions } from '../useProductOptions';
import { PhotoPicker } from './PhotoPicker';

const STEPS = ['Product', 'Grade and weight', 'Photos', 'Review'];

/** One button that opens a four-step sheet (product, grade and weight, photos, review). Pickup is always the farm address saved in the profile. Closing keeps the draft. */
export function NewListing({ pickup, onCreated }: { pickup: string; onCreated: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const { products, priced, pricesFailed, error: loadError } = useProductOptions(open);
  const [product, setProduct] = useState('');
  const [gradePick, setGrade] = useState('A');
  const [weight, setWeight] = useState('');
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [computed, setComputed] = useState<{ key: string; value: Estimate | null }>({ key: '', value: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [q, setQ] = useState('');

  const weightKg = Number(weight);
  const chosen = products.includes(product) ? product : (products[0] ?? '');
  const gradeOptions = priced ? (priced[chosen] ?? []) : GRADES;
  const grade = gradeOptions.length > 0 && !gradeOptions.includes(gradePick) ? gradeOptions[0] : gradePick;
  const key = `${chosen}|${weightKg}|${grade}`;
  const validKg = Number.isFinite(weightKg) && weightKg > 0;
  const estimate = computed.key === key ? computed.value : null;
  const blockedOnPrice = priced ? !gradeOptions.includes(grade) : false;
  const photosShort = Math.max(0, MIN_PHOTOS - photos.length);
  const ready = chosen.length > 1 && validKg && photosShort === 0 && !blockedOnPrice && (priced !== null || pricesFailed);
  const hint = blockedOnPrice ? `No published price for ${chosen} yet. Pick another product.` : photosShort > 0 ? `Add ${photosShort} more photo${photosShort === 1 ? '' : 's'} to continue.` : !validKg ? 'Enter the weight you have ready.' : null;

  useEffect(() => {
    if (!chosen || !validKg || blockedOnPrice) return;
    let stale = false;
    estimateListing(chosen, weightKg, grade).then(
      (value) => { if (!stale) setComputed({ key, value }); },
      () => undefined,
    );
    return () => { stale = true; };
  }, [chosen, weightKg, validKg, grade, key, blockedOnPrice]);

  const close = () => { setOpen(false); setError(null); };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await enqueueListing(chosen, weightKg, grade, photos);
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

  const pricesReady = priced !== null || pricesFailed;
  const canNext = [chosen.length > 1, validKg && !blockedOnPrice && pricesReady, photosShort === 0][step] ?? false;
  const shownProducts = products.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase()));
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
          {products.length > 8 ? <Input label="Search produce" value={q} onChangeText={setQ} placeholder="e.g. Tomato" autoCorrect={false} /> : null}
          {products.length === 0 ? (
            <View style={s.grid}>{[0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={s.cell}><Skeleton width="100%" height={56} radius={14} /></View>)}</View>
          ) : shownProducts.length === 0 ? (
            <Text style={s.meta}>No produce matches “{q}”.</Text>
          ) : (
            <View style={s.grid}>
              {shownProducts.map((p) => {
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
          {gradeOptions.length > 0 ? (
            <View style={s.grades} accessibilityRole="radiogroup">
              {gradeOptions.map((g) => {
                const on = g === grade;
                return (
                  <Pressable key={g} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setGrade(g)} style={[s.gradeTile, on && s.tileOn]}>
                    <Text style={[s.gradeLetter, on && s.tileTextOn]}>{g}</Text>
                    <Text style={s.meta}>Grade</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {blockedOnPrice ? <Text style={s.meta}>No published price for {chosen} yet. Go back and pick another product.</Text> : null}
          <Input label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="800" />
          <View style={s.quick}>
            {[50, 100, 500].map((n) => (
              <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Add ${n} kilograms`} onPress={() => bump(n)} style={s.add}>
                <Text style={s.addText}>+{n} kg</Text>
              </Pressable>
            ))}
          </View>
          {estimate ? (
            <View style={s.estimate}>
              <Text style={s.meta}>You get about</Text>
              <Text style={s.net}>{ghs(estimate.net)}</Text>
              <Text style={s.meta}>{ghs(estimate.pricePerKg)}/kg</Text>
            </View>
          ) : null}
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
            <Row label="Produce" value={`${chosen} · Grade ${grade}`} s={s} />
            <Row label="Weight" value={`${weightKg.toLocaleString('en-GH')} kg`} s={s} />
            <Row label="Photos" value={String(photos.length)} s={s} last />
          </View>
          {estimate ? (
            <View style={s.estimate}>
              <Text style={s.meta}>You get about</Text>
              <Text style={s.net}>{ghs(estimate.net)}</Text>
              <Text style={s.meta}>{ghs(estimate.pricePerKg)}/kg · {(estimate.feeRate * 100).toFixed(1)}% collection fee {ghs(estimate.fee)}. Final amount follows the weight and grade recorded at collection.</Text>
            </View>
          ) : null}
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
  grades: { flexDirection: 'row' as const, gap: 10 },
  gradeTile: { flex: 1, minHeight: 76, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 16, borderWidth: 1.5, borderColor: c.borderSubtle, backgroundColor: c.surfaceCard },
  gradeLetter: { fontFamily: fonts.heading, fontSize: 28, color: c.ink },
  quick: { flexDirection: 'row' as const, gap: 8 },
  add: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken },
  addText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  estimate: { gap: 2, padding: 16, borderRadius: 16, backgroundColor: c.surfaceSunken },
  net: { fontFamily: fonts.heading, fontSize: 30, letterSpacing: -0.5, color: c.ink, fontVariant: ['tabular-nums' as const] },
  summary: { borderRadius: 16, borderWidth: 1, borderColor: c.borderSubtle, paddingHorizontal: 16 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12, paddingVertical: 14 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  rowVal: { flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink, textAlign: 'right' as const },
  pickup: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.brandTint },
  pickupText: { flex: 1, gap: 2 },
  pickupLabel: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
