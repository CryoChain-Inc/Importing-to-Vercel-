import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { SkeletonCard } from '../../../components/feedback';
import type { CatalogueItem } from '../../../services/buyer.service';
import { imageUrl } from '../../../services/catalogueImage';
import { fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useCart } from '../cart/CartProvider';
import { AddToCartSheet } from './AddToCartSheet';
import { KgStepper } from './KgStepper';
import { ProductDetail } from './ProductDetail';

const ALL = 'all';
const GAP = 12;
const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Marketplace home: search, category pills and a grid of products (newest first) that can be added to the cart by the kilogram. */
export function Shop({ name, items, address, onOpenCart, onPickAddress }: {
  name: string;
  items: CatalogueItem[];
  address: string;
  onOpenCart: () => void;
  onPickAddress: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { lines, dispatch } = useCart();
  const [category, setCategory] = useState(ALL);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  // Measured, not guessed: the shop sits beside a rail on wide screens and full width on phones.
  const [width, setWidth] = useState(0);

  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; image: string | null }>();
    items.forEach((i) => seen.has(i.categoryId) || seen.set(i.categoryId, { id: i.categoryId, name: i.category, image: i.categoryImage }));
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const products = useMemo(() => {
    const byProduct = new Map<string, CatalogueItem[]>();
    items
      .filter((i) => (category === ALL || i.categoryId === category) && i.name.toLowerCase().includes(q.trim().toLowerCase()))
      .forEach((i) => byProduct.set(i.productId, [...(byProduct.get(i.productId) ?? []), i]));
    // The catalogue arrives newest product first; in-stock first is a stable sort so that order holds in each group.
    return [...byProduct.values()].sort((a, b) => Number(b.some((i) => i.availableKg > 0)) - Number(a.some((i) => i.availableKg > 0)));
  }, [items, category, q]);
  const opened = items.filter((i) => i.productId === open);
  const cartTotal = lines.reduce((sum, l) => sum + l.kg * (items.find((i) => i.productId === l.productId && i.grade === l.grade)?.price ?? 0), 0);

  if (opened.length > 0) return <ProductDetail grades={opened} onBack={() => setOpen(null)} onOpenCart={onOpenCart} />;

  const cols = width >= 720 ? 4 : width >= 520 ? 3 : 2;
  const cardW = width > 0 ? Math.floor((width - GAP * (cols - 1)) / cols) : 0;

  return (
    <View style={s.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text style={s.hello} numberOfLines={1}>{name ? `Hello, ${name}` : 'Welcome'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Change delivery address" onPress={onPickAddress} style={s.address}>
        <View style={s.addressIcon}><Icon name="pin" size={16} color={colors.brandInk} /></View>
        <View style={s.addressBody}>
          <Text style={s.addressLabel}>Deliver to</Text>
          <Text style={s.addressText} numberOfLines={1}>{address || 'Add a delivery address'}</Text>
        </View>
        <Icon name="chevronRight" size={16} color={colors.inkMuted} />
      </Pressable>

      <View style={s.search}>
        <Icon name="search" size={18} color={colors.inkMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search produce" placeholderTextColor={colors.inkMuted} accessibilityLabel="Search produce" style={[s.searchInput, { outlineStyle: 'none' } as object]} />
        {q ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQ('')} hitSlop={10}>
            <Icon name="close" size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
        {[{ id: ALL, name: 'All' }, ...categories].map((c) => {
          const on = c.id === category;
          return (
            <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setCategory(c.id)} style={[s.pill, on && s.pillOn]}>
              <Text style={[s.pillText, on && s.pillTextOn]}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {lines.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="View cart" onPress={onOpenCart} style={({ pressed }) => [s.cartBar, pressed && s.pressed]}>
          <Icon name="cart" size={20} color="#ffffff" />
          <Text style={s.cartBarText}>{lines.length} item{lines.length === 1 ? '' : 's'} · {ghs(cartTotal)}</Text>
          <Text style={s.cartBarCta}>View cart</Text>
          <Icon name="arrowRight" size={16} color="#ffffff" />
        </Pressable>
      ) : null}

      {products.length === 0 ? (
        <Card style={s.emptyCard}>
          <Icon name="leaf" size={28} color={colors.inkMuted} />
          <Text style={s.emptyTitle}>{items.length === 0 ? 'Nothing for sale yet' : 'No produce matches'}</Text>
          <Text style={s.meta}>{items.length === 0 ? 'Produce appears here as soon as it is priced. Check back soon.' : 'Try a different word or pick another category.'}</Text>
          {items.length > 0 ? <Button size="sm" variant="tonal" label="Clear filters" onPress={() => { setQ(''); setCategory(ALL); }} /> : null}
        </Card>
      ) : null}

      <View style={s.grid}>
        {cardW > 0 ? products.map((g) => {
          const p = g[0];
          const uri = imageUrl(p.image);
          const stocked = g.filter((i) => i.availableKg > 0);
          const from = Math.min(...(stocked.length ? stocked : g).map((i) => i.price));
          const only = stocked.length === 1 ? stocked[0] : null;
          const inCart = only ? lines.find((l) => l.productId === only.productId && l.grade === only.grade)?.kg ?? 0 : 0;
          const setKg = (item: CatalogueItem, next: number) => dispatch({ type: 'set', line: { productId: item.productId, grade: item.grade, kg: next } });
          return (
            <View key={p.productId} style={[s.card, { width: cardW }, stocked.length === 0 && s.dim]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${p.name}, view details`} onPress={() => setOpen(p.productId)} style={({ pressed }) => pressed && s.pressed}>
                <View style={[s.photo, { height: Math.round(cardW * 0.82) }]}>
                  {uri ? <Image source={{ uri }} style={s.photoImg} resizeMode="cover" accessibilityLabel={p.name} /> : <Icon name="leaf" size={32} color={colors.inkMuted} />}
                  {stocked.length === 0 ? <View style={s.soldOut}><Text style={s.soldOutText}>Sold out</Text></View> : null}
                </View>
                <View style={s.info}>
                  <Text style={s.category} numberOfLines={1}>{p.category}</Text>
                  <Text style={s.name} numberOfLines={2}>{p.name}</Text>
                  <Text style={s.price}>{stocked.length > 1 ? 'From ' : ''}{ghs(from)}<Text style={s.unit}> / kg</Text></Text>
                  <Text style={s.meta} numberOfLines={1}>
                    {stocked.length === 0 ? 'Back soon' : `${kg(stocked.reduce((t, i) => t + i.availableKg, 0))} left${g.length > 1 ? ` · ${g.length} grades` : ` · Grade ${g[0].grade}`}`}
                  </Text>
                </View>
              </Pressable>
              <View style={s.action}>
                {stocked.length === 0 ? <Badge label="Out of stock" tone="danger" />
                  : only && inCart > 0 ? <KgStepper compact value={inCart} max={only.availableKg} onChange={(n) => setKg(only, n)} />
                  : <Button size="sm" variant="tonal" icon="cart" label="Add" onPress={() => setChoosing(p.productId)} style={s.addBtn} />}
              </View>
            </View>
          );
        }) : null}
      </View>
      {choosing ? <AddToCartSheet grades={items.filter((i) => i.productId === choosing)} onClose={() => setChoosing(null)} /> : null}
    </View>
  );
}

export function ShopSkeleton() {
  return <View style={{ gap: 10 }}><SkeletonCard lead lines={2} /><SkeletonCard lead lines={2} /><SkeletonCard lead lines={2} /></View>;
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  hello: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: c.ink },
  pressed: { opacity: 0.75 },
  address: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: TOUCH + 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.cardEdge },
  addressIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  addressBody: { flex: 1 },
  addressLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  addressText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  search: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: TOUCH, paddingHorizontal: 14, borderRadius: 16, backgroundColor: c.surfaceSunken },
  searchInput: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 15, color: c.ink, paddingVertical: 10 },
  pills: { gap: 8, paddingVertical: 2 },
  pill: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' as const, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.cardEdge },
  pillOn: { backgroundColor: c.brand600, borderColor: c.brand600 },
  pillText: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.inkMuted },
  pillTextOn: { fontFamily: fonts.sansBold, color: '#ffffff' },
  cartBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: TOUCH + 4, paddingHorizontal: 16, borderRadius: 16, backgroundColor: c.brand700 },
  cartBarText: { flex: 1, fontFamily: fonts.sansBold, fontSize: 15, color: '#ffffff', fontVariant: ['tabular-nums' as const] },
  cartBarCta: { fontFamily: fonts.sansBold, fontSize: 14, color: '#ffffff' },
  emptyCard: { alignItems: 'center' as const, gap: 8, paddingVertical: 32 },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: GAP },
  card: { borderRadius: 18, overflow: 'hidden' as const, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.cardEdge, elevation: 1 },
  dim: { opacity: 0.65 },
  photo: { width: '100%' as const, backgroundColor: c.surfaceSunken, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  photoImg: { width: '100%' as const, height: '100%' as const },
  soldOut: { position: 'absolute' as const, left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.65)' },
  soldOutText: { fontFamily: fonts.sansBold, fontSize: 11, color: '#ffffff' },
  info: { gap: 2, paddingHorizontal: 12, paddingTop: 10 },
  category: { fontFamily: fonts.sansMedium, fontSize: 11, color: c.brandInk },
  name: { fontFamily: fonts.sansBold, fontSize: 15, lineHeight: 20, color: c.ink, minHeight: 40 },
  price: { fontFamily: fonts.heading, fontSize: 18, color: c.ink, fontVariant: ['tabular-nums' as const], marginTop: 2 },
  unit: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  meta: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted },
  action: { padding: 12, paddingTop: 10, minHeight: 58, justifyContent: 'center' as const },
  addBtn: { alignSelf: 'stretch' as const },
});
