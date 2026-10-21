import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { createLot, LOT_MAX_KG, LOT_MIN_KG, STOP_MIN_VALUE_GHS, type PriceRow, type Product, type SupplyRow } from '../../../services/ops.service';
import { produceImageUrl } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { kg, usePaged } from './OpsBits';
import { useAction } from './useAction';

/** Seeds the builder from a buyer requirement: preselects the product and ties the new lot to it. */
export interface LotDraft {
  requirementId: string;
  product: string;
  price: number;
  /** Kilos the buyer asked for, shown as the target to reach. */
  wantedKg: number;
  summary: string;
}

/** One listing in the picker: tap the row to add it, open its photos to judge quality before picking. */
function ListingPick({ r, on, onToggle }: { r: SupplyRow; on: boolean; onToggle: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [photos, setPhotos] = useState(false);
  const first = r.imagePaths[0];
  return (
    <View style={[s.pick, on && s.pickOn]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${r.farmer}, ${kg(r.weightKg)}`} onPress={onToggle} style={s.pickRow}>
        <View style={[s.box, on && s.boxOn]}>{on ? <Icon name="check" size={14} color="#ffffff" /> : null}</View>
        {first ? <Image source={{ uri: produceImageUrl(first) }} style={s.thumb} accessibilityLabel={`${r.product} from ${r.farmer}`} /> : <View style={[s.thumb, s.noThumb]}><Icon name="leaf" size={18} color={colors.inkMuted} /></View>}
        <View style={s.grow}>
          <Text style={s.value} numberOfLines={1}>{r.farmer} · {kg(r.weightKg)}</Text>
          <Text style={s.meta} numberOfLines={1}>{r.point}{r.locality ? ` · ${r.locality}` : ''}</Text>
        </View>
      </Pressable>
      {r.imagePaths.length ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: photos }} onPress={() => setPhotos(!photos)} style={s.photoBtn}>
          <Icon name="camera" size={14} color={colors.brandInk} />
          <Text style={s.photoBtnText}>{photos ? 'Hide photos' : `View ${r.imagePaths.length} photo${r.imagePaths.length === 1 ? '' : 's'}`}</Text>
        </Pressable>
      ) : <Text style={[s.meta, s.noPhotos]}>No photos on this listing</Text>}
      {photos ? (
        <View style={s.gallery}>
          {r.imagePaths.map((p) => <Image key={p} source={{ uri: produceImageUrl(p) }} style={s.shot} accessibilityLabel={`${r.product} photo from ${r.farmer}`} />)}
        </View>
      ) : null}
    </View>
  );
}

/** Build a lot from unallocated listings of one product. Used on the Lots tab and inline when matching a requirement. */
export function LotBuilder({ supply, products, prices, draft, onChange, onDone }: {
  supply: SupplyRow[];
  products: Product[];
  prices: PriceRow[];
  draft?: LotDraft;
  onChange: () => Promise<void>;
  onDone?: () => void;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [picked, setPicked] = useState<string[]>([]);
  const [productName, setProductName] = useState(draft?.product ?? '');
  const [gradeName, setGradeName] = useState('');
  const [price, setPrice] = useState(draft ? String(draft.price) : '');
  const [requirementId, setRequirementId] = useState<string | undefined>(draft?.requirementId);

  const pool = supply.filter((r) => !r.lotId);
  const names = draft ? [draft.product] : [...new Set(pool.map((r) => r.product))].sort();
  const product = names.includes(productName) ? productName : names[0];
  const ofProduct = pool.filter((r) => r.product === product);
  const grades = [...new Set(ofProduct.map((r) => r.grade))].sort();
  const grade = grades.includes(gradeName as 'A') ? gradeName : grades[0];
  const candidates = ofProduct.filter((r) => r.grade === grade);
  const selected = candidates.filter((r) => picked.includes(r.id));
  const total = selected.reduce((a, r) => a + r.weightKg, 0);
  const target = draft?.wantedKg ?? LOT_MIN_KG;
  const { rows: pageRows, more } = usePaged(candidates, `${product}|${grade}`, 5);

  // Listings carry no grade yet, so stop value is estimated at the Grade A price.
  const productId = products.find((p) => p.name === product)?.id;
  const priceA = prices.find((r) => r.productId === productId && r.grade === 'A')?.price;
  const stops = new Map<string, { name: string; kg: number }>();
  selected.forEach((r) => {
    const k = r.pointId ?? 'none';
    stops.set(k, { name: r.point, kg: (stops.get(k)?.kg ?? 0) + r.weightKg });
  });

  const over = total > LOT_MAX_KG;
  const sellPrice = Number(price);
  const warnings = [
    total > 0 && total < LOT_MIN_KG ? `Under ${kg(LOT_MIN_KG)}: the truck won't be full.` : null,
    ...[...stops.values()].map((st) => (priceA && st.kg * priceA < STOP_MIN_VALUE_GHS ? `${st.name}: ${ghs(st.kg * priceA)} is under the ${ghs(STOP_MIN_VALUE_GHS)} stop minimum.` : null)),
    selected.length > 0 && !priceA ? "No Grade A price set, so stop value can't be checked." : null,
  ].filter(Boolean) as string[];

  const autoPick = () => {
    const ids: string[] = [];
    let sum = 0;
    for (const r of [...candidates].sort((a, b) => b.weightKg - a.weightKg)) {
      if (sum >= target || sum + r.weightKg > LOT_MAX_KG) continue;
      ids.push(r.id);
      sum += r.weightKg;
    }
    setPicked(ids);
  };

  return (
    <Card style={s.form}>
      <Text style={s.title}>{draft ? 'Match this requirement' : 'Create lot'}</Text>
      <Text style={s.meta}>One product and one grade per lot, up to {kg(LOT_MAX_KG)} (one truck). Aim for {kg(LOT_MIN_KG)}+ across 2–3 stops.</Text>
      {draft ? <Banner tone="info" text={`${draft.summary}. Creating the lot marks it matched.`} /> : null}
      {error ? <Banner text={error} /> : null}
      {names.length && candidates.length ? (
        <>
          {draft ? null : <ChoiceChips label="Product" options={names} value={product} onChange={(n) => { setProductName(n); setGradeName(''); setPicked([]); setRequirementId(undefined); }} />}
          <ChoiceChips label="Grade" options={grades} value={grade} onChange={(g) => { setGradeName(g); setPicked([]); }} />
          <Text style={s.meta}>A lot holds one grade. Other grades of {product} go in their own lot.</Text>
          <View style={s.row}>
            <Text style={s.value}>{kg(total)} of {kg(target)}{draft ? ' wanted' : ' target'}</Text>
            <Button label="Suggest listings" variant="outline" size="sm" onPress={autoPick} />
          </View>
          <Text style={s.label}>Grade {grade} {product} listings · {candidates.length}</Text>
          {pageRows.map((r) => (
            <ListingPick key={r.id} r={r} on={picked.includes(r.id)} onToggle={() => setPicked(picked.includes(r.id) ? picked.filter((k) => k !== r.id) : [...picked, r.id])} />
          ))}
          {more}
          {over ? <Text style={s.bad}>Over the vehicle capacity. Remove some listings.</Text> : null}
          {warnings.map((w) => <Text key={w} style={s.meta}>⚠ {w}</Text>)}
          <Input label="Price buyers pay (GH₵ per kg)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint={priceA ? `Farmer Grade A price is ${ghs(priceA)}/kg.` : undefined} />
          <Button label="Create lot" loading={busy} disabled={!selected.length || over || !(sellPrice > 0)}
            onPress={() => run(async () => {
              await createLot(selected.map((r) => r.id), sellPrice, requirementId);
              setPicked([]);
              setRequirementId(undefined);
              onDone?.();
            })} />
        </>
      ) : <Text style={s.meta}>{draft ? `No unallocated ${draft.product} supply yet. Ask farmers to list it, then match again.` : 'No unallocated supply. Listings appear here once farmers list produce.'}</Text>}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 12 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.ink },
  grow: { flex: 1, gap: 2 },
  pick: { borderRadius: 14, borderWidth: 1, borderColor: c.cardEdge, backgroundColor: c.surfaceCard, overflow: 'hidden' as const },
  pickOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  pickRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 12, minHeight: 64 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: c.borderSubtle, alignItems: 'center' as const, justifyContent: 'center' as const },
  boxOn: { backgroundColor: c.brand600, borderColor: c.brand600 },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: c.surfaceSunken },
  noThumb: { alignItems: 'center' as const, justifyContent: 'center' as const },
  photoBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  photoBtnText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.brandInk },
  noPhotos: { paddingHorizontal: 14, paddingBottom: 10 },
  gallery: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, padding: 12, paddingTop: 4 },
  shot: { width: 112, height: 112, borderRadius: 12, backgroundColor: c.surfaceSunken },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  value: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  bad: { fontFamily: fonts.sansBold, fontSize: 13, color: c.dangerInk },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
