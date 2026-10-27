import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import type { CatalogueItem } from '../../../services/buyer.service';
import { imageUrl } from '../../../services/catalogueImage';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { KG_STEP } from '../cart/cart';
import { useCart } from '../cart/CartProvider';
import { KgStepper } from './KgStepper';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** One product: swipeable photos, details, a grade picker and one quantity panel, ready to add to the cart. */
export function ProductDetail({ grades, onBack, onOpenCart }: { grades: CatalogueItem[]; onBack: () => void; onOpenCart: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { lines, dispatch } = useCart();
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(0);
  const p = grades[0];
  const cheapest = (grades.filter((g) => g.availableKg > 0).sort((a, b) => a.price - b.price)[0] ?? grades[0]).grade;
  const [grade, setGrade] = useState<string>(cheapest);
  const photos = [p.image, ...p.images].map(imageUrl).filter((u): u is string => Boolean(u));
  const split = width >= 640;
  const size = split ? Math.min(440, Math.floor((width - 24) / 2)) : Math.min(width, 520);
  const sel = grades.find((g) => g.grade === grade) ?? grades[0];
  const inCart = (g: CatalogueItem) => lines.find((l) => l.productId === g.productId && l.grade === g.grade)?.kg ?? 0;
  const cartCount = lines.length;

  return (
    <View style={s.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={s.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to shop" onPress={onBack} hitSlop={8} style={s.back}>
          <Icon name="arrowLeft" size={20} color={colors.ink} />
          <Text style={s.backText}>Shop</Text>
        </Pressable>
        {cartCount > 0 ? <Button size="sm" variant="tonal" icon="cart" label={`Cart · ${cartCount}`} onPress={onOpenCart} /> : null}
      </View>

      {size > 0 ? (
        <View style={[s.layout, split && s.layoutSplit]}>
          <View style={[s.gallery, { width: size, height: size }]}>
            {photos.length > 0 ? (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / size))}>
                {photos.map((uri) => <Image key={uri} source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" accessibilityLabel={p.name} />)}
              </ScrollView>
            ) : <View style={s.noPhoto}><Icon name="leaf" size={48} color={colors.inkMuted} /></View>}
            {photos.length > 1 ? (
              <>
                <View style={s.counter}><Text style={s.counterText}>{page + 1} / {photos.length}</Text></View>
                <View style={s.dots} accessibilityLabel={`Photo ${page + 1} of ${photos.length}`}>
                  {photos.map((u, i) => <View key={u} style={[s.dot, i === page && s.dotOn]} />)}
                </View>
              </>
            ) : null}
          </View>

          <View style={s.info}>
            <Badge label={p.category} tone="info" />
            <Text style={s.name}>{p.name}</Text>
            {p.description ? <Text style={s.desc}>{p.description}</Text> : null}

            <Text style={s.section}>Choose a grade</Text>
            <View style={s.tiles}>
              {grades.map((g) => {
                const out = g.availableKg <= 0;
                const on = g.grade === sel.grade;
                const n = inCart(g);
                return (
                  <Pressable key={g.grade} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: out }} accessibilityLabel={`Grade ${g.grade}, ${ghs(g.price)} per kilogram, ${out ? 'sold out' : `${kg(g.availableKg)} left`}`}
                    disabled={out} onPress={() => setGrade(g.grade)} style={[s.tile, on && s.tileOn, out && s.tileOff]}>
                    <View style={s.tileTop}>
                      <Text style={[s.tileGrade, on && s.tileGradeOn]}>Grade {g.grade}</Text>
                      {on ? <Icon name="check" size={16} color={colors.brandInk} /> : null}
                    </View>
                    <Text style={s.tilePrice}>{ghs(g.price)}<Text style={s.unit}> / kg</Text></Text>
                    <Text style={[s.tileMeta, out && s.dangerText]}>{out ? 'Sold out' : n > 0 ? `${kg(n)} in cart` : `${kg(g.availableKg)} left`}</Text>
                  </Pressable>
                );
              })}
            </View>

            {sel.availableKg > 0 ? (
              <AddToCart key={sel.grade} item={sel} inCart={inCart(sel)} onOpenCart={onOpenCart}
                onSet={(next) => dispatch({ type: 'set', line: { productId: sel.productId, grade: sel.grade, kg: next } })} />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const PRESETS = [10, 25, 50, 100, 200];

/** Pick an exact weight (type it, step it, or tap a preset), see the price, then add, update or remove. */
function AddToCart({ item, inCart, onSet, onOpenCart }: { item: CatalogueItem; inCart: number; onSet: (kg: number) => void; onOpenCart: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const start = Math.min(KG_STEP, item.availableKg);
  const [qty, setQty] = useState(inCart || start);
  const chips = [...PRESETS.filter((n) => n < item.availableKg), item.availableKg];
  const total = qty * item.price;
  const changed = qty !== inCart;

  return (
    <Card style={s.add}>
      <View style={s.addHead}>
        <Text style={s.addTitle}>How many kg?</Text>
        <Text style={s.meta}>{kg(item.availableKg)} available</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {chips.map((n, i) => (
          <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected: qty === n }} onPress={() => setQty(n)} style={[s.chip, qty === n && s.chipOn]}>
            <Text style={[s.chipText, qty === n && s.chipTextOn]}>{i === chips.length - 1 && chips.length > 1 ? `All ${kg(n)}` : `${n} kg`}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.qtyRow}>
        <KgStepper removable={false} value={qty} max={item.availableKg} onChange={setQty} />
        <View style={s.totalBox}>
          <Text style={s.meta}>{kg(qty)} × {ghs(item.price)}</Text>
          <Text style={s.total}>{ghs(total)}</Text>
        </View>
      </View>
      <Button icon="cart" size="lg" label={`${inCart ? 'Update cart' : 'Add to cart'} · ${ghs(total)}`} disabled={!changed} onPress={() => onSet(qty)} />
      {inCart > 0 ? (
        <View style={s.inCart}>
          <View style={s.inCartText}>
            <Icon name="check" size={16} color={colors.brandInk} />
            <Text style={s.inCartLabel}>{kg(inCart)} in your cart</Text>
          </View>
          <View style={s.inCartActions}>
            <Button size="sm" variant="ghost" label="View cart" onPress={onOpenCart} />
            <Button size="sm" variant="outline" icon="trash" label="Remove" onPress={() => { onSet(0); setQty(start); }} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, minHeight: 44 },
  back: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44 },
  backText: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  layout: { gap: 18 },
  layoutSplit: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 24 },
  gallery: { borderRadius: 22, overflow: 'hidden' as const, backgroundColor: c.surfaceSunken },
  noPhoto: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  counter: { position: 'absolute' as const, top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)' },
  counterText: { fontFamily: fonts.sansBold, fontSize: 12, color: '#ffffff' },
  dots: { position: 'absolute' as const, bottom: 12, alignSelf: 'center' as const, flexDirection: 'row' as const, gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { backgroundColor: '#ffffff', width: 18 },
  info: { flex: 1, gap: 12 },
  name: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: c.ink },
  desc: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 23, color: c.inkMuted, maxWidth: 560 },
  section: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink, marginTop: 6 },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  tile: { flexGrow: 1, flexBasis: 104, gap: 3, padding: 12, borderRadius: 16, backgroundColor: c.surfaceCard, borderWidth: 1.5, borderColor: c.cardEdge },
  tileOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  tileOff: { opacity: 0.5 },
  tileTop: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  tileGrade: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  tileGradeOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  tilePrice: { fontFamily: fonts.heading, fontSize: 19, color: c.ink, fontVariant: ['tabular-nums' as const] },
  tileMeta: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
  dangerText: { color: c.dangerInk },
  unit: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  add: { gap: 14, padding: 16 },
  addHead: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, gap: 8 },
  addTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  chips: { gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken, borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  chipTextOn: { color: c.ink, fontFamily: fonts.sansBold },
  qtyRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, flexWrap: 'wrap' as const, gap: 12 },
  totalBox: { alignItems: 'flex-end' as const, gap: 2 },
  total: { fontFamily: fonts.heading, fontSize: 24, color: c.ink, fontVariant: ['tabular-nums' as const] },
  inCart: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  inCartText: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  inCartLabel: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  inCartActions: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
});
