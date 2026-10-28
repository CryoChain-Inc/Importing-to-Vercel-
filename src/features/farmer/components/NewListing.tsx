import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner, Skeleton } from '../../../components/feedback';
import type { PickedImage } from '../../../services/catalogueImage';
import { createListing, estimateListing, GRADES, MIN_PHOTOS, type Estimate } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useProductOptions } from '../useProductOptions';
import { PhotoPicker } from './PhotoPicker';

/** Collapsed to one button until needed. Pickup is always the farm address saved in the profile. */
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
      await createListing(chosen, weightKg, grade, photos);
      setWeight('');
      setPhotos([]);
      await onCreated();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return <Button label="New listing" icon="package" size="lg" onPress={() => setOpen(true)} />;

  return (
    <Card style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>New listing</Text>
        <Button label="Close" variant="ghost" size="sm" onPress={close} />
      </View>
      {error || loadError ? <Banner text={(error ?? loadError)!} /> : null}

      <Step n={1} label="What are you selling?">
        {products.length ? <ChoiceChips label="Product" options={products} value={chosen} onChange={setProduct} /> : <View style={s.chipsSkel}>{[88, 72, 104, 80].map((w) => <Skeleton key={w} width={w} height={42} radius={21} />)}</View>}
      </Step>

      <Step n={2} label="Grade and weight">
        {gradeOptions.length > 0 ? <ChoiceChips label="Grade" options={gradeOptions} value={grade} onChange={setGrade} /> : null}
        <Input label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="800" />
      </Step>

      <Step n={3} label="Photos">
        <PhotoPicker value={photos} onChange={setPhotos} />
      </Step>

      <View style={s.pickup}>
        <Icon name="pin" size={18} color={colors.brandInk} />
        <View style={s.pickupText}>
          <Text style={s.pickupLabel}>We collect from your farm</Text>
          <Text style={s.meta}>{pickup}</Text>
        </View>
      </View>

      <View style={s.review}>
        {estimate ? (
          <View style={s.estimate}>
            <Text style={s.net}>You get about {ghs(estimate.net)}</Text>
            <Text style={s.meta}>{ghs(estimate.pricePerKg)}/kg · {(estimate.feeRate * 100).toFixed(1)}% collection fee {ghs(estimate.fee)}. Final amount follows the weight and grade recorded at collection.</Text>
          </View>
        ) : null}
        {hint ? <Text style={s.meta}>{hint}</Text> : null}
        <Button label="Add listing" onPress={submit} loading={busy} disabled={!ready} />
      </View>
    </Card>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.step}>
      <View style={s.stepHead}>
        <View style={s.num}><Text style={s.numText}>{n}</Text></View>
        <Text style={s.stepLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 20 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  title: { fontFamily: fonts.heading, fontSize: 20, letterSpacing: -0.3, color: c.ink },
  step: { gap: 12 },
  chipsSkel: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  stepHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  num: { width: 24, height: 24, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  numText: { fontFamily: fonts.sansBold, fontSize: 12, color: c.brandInk },
  stepLabel: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  pickup: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.brandTint },
  pickupText: { flex: 1, gap: 2 },
  pickupLabel: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  review: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: c.surfaceSunken },
  estimate: { gap: 2 },
  net: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
