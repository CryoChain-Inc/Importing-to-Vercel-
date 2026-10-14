import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { CROPS } from '../../../data/prices';
import { createListing, deleteListing, type ProduceListing } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

export function ProduceListings({
  listings,
  onChange,
}: {
  listings: ProduceListing[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const [product, setProduct] = useState(CROPS[0] ?? '');
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weightKg = Number(weight);
  const ready = product.trim().length > 1 && Number.isFinite(weightKg) && weightKg > 0;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await createListing(product, weightKg);
      setWeight('');
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that listing.');
    } finally {
      setBusy(false);
    }
  };

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
      <Card>
        <Text style={s.title}>List produce</Text>
        <Text style={s.copy}>Add the product and the weight you have ready for collection.</Text>
        {error ? <Banner text={error} /> : null}
        <View style={s.form}>
          <ChoiceChips label="Product" options={CROPS} value={product} onChange={setProduct} />
          <Input
            label="Other product"
            value={CROPS.includes(product) ? '' : product}
            onChangeText={(text) => setProduct(text.trim() ? text : (CROPS[0] ?? ''))}
            hint="Leave blank to use the crop selected above."
          />
          <Input label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="800" />
          <Button label="Add listing" onPress={add} loading={busy} disabled={!ready} />
        </View>
      </Card>
      {listings.length === 0 ? (
        <Card>
          <Text style={s.empty}>No produce listed yet.</Text>
        </Card>
      ) : (
        listings.map((listing) => (
          <Card key={listing.id}>
            <View style={s.item}>
              <View style={s.itemText}>
                <Text style={s.product}>{listing.product}</Text>
                <Text style={s.meta}>
                  {listing.weightKg.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg
                </Text>
              </View>
              <Button label="Remove" variant="ghost" size="sm" onPress={() => remove(listing.id)} />
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
  empty: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  itemText: { flex: 1, gap: 2 },
  product: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
