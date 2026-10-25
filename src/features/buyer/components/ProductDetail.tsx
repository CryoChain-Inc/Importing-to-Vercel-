import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import type { CatalogueItem } from '../../../services/buyer.service';
import { imageUrl } from '../../../services/catalogueImage';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { KG_STEP } from '../cart/cart';
import { useCart } from '../cart/CartProvider';
import { KgStepper } from './KgStepper';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** One product: swipeable photos, details, and each grade with its price and stock, ready to add to the cart. */
export function ProductDetail({ grades, onBack, onOpenCart }: { grades: CatalogueItem[]; onBack: () => void; onOpenCart: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { lines, dispatch } = useCart();
  const [page, setPage] = useState(0);
  const p = grades[0];
  const photos = [p.image, ...p.images].map(imageUrl).filter((u): u is string => Boolean(u));
  const size = Math.min(width - 32, 520);
  const inCart = lines.length;

  return (
    <View style={s.wrap}>
      <View style={s.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to shop" onPress={onBack} hitSlop={8} style={s.back}>
          <Icon name="arrowLeft" size={20} color={colors.ink} />
          <Text style={s.backText}>Shop</Text>
        </Pressable>
        {inCart > 0 ? <Button size="sm" variant="tonal" icon="cart" label={`Cart · ${inCart}`} onPress={onOpenCart} /> : null}
      </View>

      <View style={[s.gallery, { width: size, height: size }]}>
        {photos.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / size))}>
            {photos.map((uri) => <Image key={uri} source={{ uri }} style={{ width: size, height: size }} accessibilityLabel={p.name} />)}
          </ScrollView>
        ) : <View style={s.noPhoto}><Icon name="leaf" size={48} color={colors.inkMuted} /></View>}
        {photos.length > 1 ? (
          <View style={s.dots} accessibilityLabel={`Photo ${page + 1} of ${photos.length}`}>
            {photos.map((u, i) => <View key={u} style={[s.dot, i === page && s.dotOn]} />)}
          </View>
        ) : null}
      </View>

      <View style={s.head}>
        <Text style={s.name}>{p.name}</Text>
        <Badge label={p.category} tone="neutral" />
      </View>
      {p.description ? <Text style={s.desc}>{p.description}</Text> : null}

      <Text style={s.section}>Grades</Text>
      {grades.map((g) => {
        const out = g.availableKg <= 0;
        const n = lines.find((l) => l.productId === g.productId && l.grade === g.grade)?.kg ?? 0;
        return (
          <Card key={g.grade} style={s.grade}>
            <View style={s.row}>
              <Text style={s.gradeName}>Grade {g.grade}</Text>
              {out ? <Badge label="Out of stock" tone="danger" /> : <Badge label={`${kg(g.availableKg)} left`} tone="success" />}
            </View>
            <Text style={s.price}>{ghs(g.price)}<Text style={s.meta}> / kg</Text></Text>
            {out ? null : (
              <AddToCart item={g} inCart={n} onSet={(next) => dispatch({ type: 'set', line: { productId: g.productId, grade: g.grade, kg: next } })} />
            )}
          </Card>
        );
      })}
    </View>
  );
}

const PRESETS = [10, 25, 50, 100, 200];

/** Pick an exact weight (type it, step it, or tap a preset) and see the price before adding. */
function AddToCart({ item, inCart, onSet }: { item: CatalogueItem; inCart: number; onSet: (kg: number) => void }) {
  const s = useThemedStyles(styles);
  const [qty, setQty] = useState(inCart || Math.min(KG_STEP, item.availableKg));
  const chips = [...PRESETS.filter((n) => n < item.availableKg), item.availableKg];
  const total = qty * item.price;
  return (
    <View style={s.add}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {chips.map((n, i) => (
          <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected: qty === n }} onPress={() => setQty(n)} style={[s.chip, qty === n && s.chipOn]}>
            <Text style={[s.chipText, qty === n && s.chipTextOn]}>{i === chips.length - 1 ? `All ${kg(n)}` : `${n} kg`}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <KgStepper value={qty} max={item.availableKg} onChange={setQty} />
      <Button
        icon="cart"
        label={qty > 0 ? `${inCart ? 'Update cart' : 'Add to cart'} · ${ghs(total)}` : 'Choose how many kg'}
        disabled={qty <= 0 || qty === inCart}
        onPress={() => onSet(qty)}
      />
      {inCart > 0 ? (
        <View style={s.inCart}>
          <Icon name="check" size={14} color="#2f7d4f" />
          <Text style={s.meta}>{kg(inCart)} in your cart</Text>
          <Pressable accessibilityRole="button" onPress={() => { onSet(0); setQty(Math.min(KG_STEP, item.availableKg)); }} hitSlop={8}><Text style={s.remove}>Remove</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 44 },
  back: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44 },
  backText: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  gallery: { alignSelf: 'center' as const, borderRadius: 20, overflow: 'hidden' as const, backgroundColor: c.surfaceSunken },
  noPhoto: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  dots: { position: 'absolute' as const, bottom: 10, alignSelf: 'center' as const, flexDirection: 'row' as const, gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { backgroundColor: '#ffffff' },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  name: { fontFamily: fonts.heading, fontSize: 26, color: c.ink, flexShrink: 1 },
  desc: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: c.ink, maxWidth: 560 },
  section: { fontFamily: fonts.sansBold, fontSize: 14, color: c.inkMuted, marginTop: 4 },
  grade: { gap: 8, alignItems: 'flex-start' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8, alignSelf: 'stretch' as const },
  gradeName: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  price: { fontFamily: fonts.heading, fontSize: 22, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  add: { gap: 10, alignSelf: 'stretch' as const },
  chips: { gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken, borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  chipTextOn: { color: c.ink, fontFamily: fonts.sansBold },
  inCart: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  remove: { fontFamily: fonts.sansBold, fontSize: 13, color: c.dangerInk },
});
