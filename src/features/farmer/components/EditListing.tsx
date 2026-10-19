import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ChoiceChips, Input } from '../../../components/common';
import { Banner, Skeleton } from '../../../components/feedback';
import { GRADES, updateListing, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { useProductOptions } from '../useProductOptions';

/** Inline editor for product, grade and weight. Photos and collection point stay as listed. */
export function EditListing({ listing, onDone, onSaved }: { listing: ProduceListing; onDone: () => void; onSaved: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { products, priced, error: loadError } = useProductOptions(true);
  const [product, setProduct] = useState(listing.product);
  const [gradePick, setGrade] = useState(listing.grade);
  const [weight, setWeight] = useState(String(listing.weightKg));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = products.includes(product) || products.length === 0 ? products : [product, ...products];
  const grades = priced ? (priced[product] ?? []) : GRADES;
  const grade = grades.length > 0 && !grades.includes(gradePick) ? grades[0] : gradePick;
  const kg = Number(weight);
  const valid = Number.isFinite(kg) && kg > 0 && grades.length > 0;
  const changed = product !== listing.product || grade !== listing.grade || kg !== listing.weightKg;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateListing(listing.id, product, kg, grade);
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
      {names.length ? (
        <ChoiceChips label="Product" options={names} value={product} onChange={setProduct} />
      ) : (
        <View style={s.skel}>{[88, 72, 104].map((w) => <Skeleton key={w} width={w} height={42} radius={21} />)}</View>
      )}
      {grades.length > 0 ? <ChoiceChips label="Grade" options={grades} value={grade} onChange={setGrade} /> : <Text style={s.meta}>No published price for this product yet.</Text>}
      <Input label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
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
