import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { SkeletonCard } from '../../../components/feedback';
import type { CatalogueItem } from '../../../services/buyer.service';
import { imageUrl } from '../../../services/catalogueImage';
import { fonts, TOUCH, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useCart } from '../cart/CartProvider';
import { ProductDetail } from './ProductDetail';

const ALL = 'all';
const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Marketplace home: category rail, search, and products you can add to the cart by the kilogram. */
export function Shop({ items, address, onOpenCart, onPickAddress }: {
  items: CatalogueItem[];
  address: string;
  onOpenCart: () => void;
  onPickAddress: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { lines } = useCart();
  const [category, setCategory] = useState(ALL);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; image: string | null }>();
    items.forEach((i) => seen.has(i.categoryId) || seen.set(i.categoryId, { id: i.categoryId, name: i.category, image: i.categoryImage }));
    return [...seen.values()];
  }, [items]);

  const products = useMemo(() => {
    const byProduct = new Map<string, CatalogueItem[]>();
    items
      .filter((i) => (category === ALL || i.categoryId === category) && i.name.toLowerCase().includes(q.trim().toLowerCase()))
      .forEach((i) => byProduct.set(i.productId, [...(byProduct.get(i.productId) ?? []), i]));
    // In-stock products first; the sort is stable so catalogue order holds within each group.
    return [...byProduct.values()].sort((a, b) => Number(b.some((i) => i.availableKg > 0)) - Number(a.some((i) => i.availableKg > 0)));
  }, [items, category, q]);
  const opened = items.filter((i) => i.productId === open);
  const cartTotal = lines.reduce((sum, l) => sum + l.kg * (items.find((i) => i.productId === l.productId && i.grade === l.grade)?.price ?? 0), 0);

  if (opened.length > 0) return <ProductDetail grades={opened} onBack={() => setOpen(null)} onOpenCart={onOpenCart} />;

  return (
    <View style={s.wrap}>
      <Pressable accessibilityRole="button" onPress={onPickAddress} style={s.address}>
        <Icon name="pin" size={16} color={colors.brandInk} />
        <Text style={s.addressText} numberOfLines={1}>{address ? `Deliver to ${address}` : 'Add a delivery address'}</Text>
        <Icon name="chevronRight" size={16} color={colors.inkMuted} />
      </Pressable>

      <View style={s.search}>
        <Icon name="search" size={18} color={colors.inkMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search produce" placeholderTextColor={colors.inkMuted} accessibilityLabel="Search produce" style={[s.searchInput, { outlineStyle: 'none' } as object]} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
        {[{ id: ALL, name: 'All', image: null }, ...categories].map((c) => {
          const on = c.id === category;
          const uri = imageUrl(c.image);
          return (
            <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setCategory(c.id)} style={s.cat}>
              <View style={[s.catImage, on && s.catOn]}>
                {uri ? <Image source={{ uri }} style={s.catPhoto} accessibilityIgnoresInvertColors /> : <Icon name={c.id === ALL ? 'grid' : 'leaf'} size={22} color={on ? colors.brandInk : colors.inkMuted} />}
              </View>
              <Text style={[s.catName, on && s.catNameOn]} numberOfLines={1}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {lines.length > 0 ? (
        <Button icon="cart" label={`View cart · ${lines.length} item${lines.length === 1 ? '' : 's'} · ${ghs(cartTotal)}`} onPress={onOpenCart} />
      ) : null}

      {products.length === 0 ? (
        <Card><Text style={s.meta}>{items.length === 0 ? 'No produce is priced yet. Check back soon.' : 'No produce matches that search.'}</Text></Card>
      ) : null}

      {products.map((g) => {
        const p = g[0];
        const uri = imageUrl(p.image);
        const stocked = g.filter((i) => i.availableKg > 0);
        const from = Math.min(...(stocked.length ? stocked : g).map((i) => i.price));
        return (
          <Pressable key={p.productId} accessibilityRole="button" accessibilityLabel={`${p.name}, view details`} onPress={() => setOpen(p.productId)}>
            <Card style={[s.item, stocked.length === 0 && s.dim]}>
              <View style={s.photo}>
                {uri ? <Image source={{ uri }} style={s.photoImg} accessibilityLabel={p.name} /> : <Icon name="leaf" size={28} color={colors.inkMuted} />}
              </View>
              <View style={s.body}>
                <Text style={s.name} numberOfLines={1}>{p.name}</Text>
                <Text style={s.meta}>{p.category} · {g.length} grade{g.length === 1 ? '' : 's'}</Text>
                <Text style={s.price}>{stocked.length > 1 ? 'From ' : ''}{ghs(from)}<Text style={s.meta}> / kg</Text></Text>
                {stocked.length === 0 ? <Badge label="Out of stock" tone="danger" /> : <Text style={s.meta}>{kg(stocked.reduce((t, i) => t + i.availableKg, 0))} available</Text>}
              </View>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ShopSkeleton() {
  return <View style={{ gap: 10 }}><SkeletonCard lead lines={2} /><SkeletonCard lead lines={2} /><SkeletonCard lead lines={2} /></View>;
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  address: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 40 },
  addressText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  search: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: TOUCH, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.surfaceSunken },
  searchInput: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 15, color: c.ink, paddingVertical: 10 },
  rail: { gap: 14, paddingVertical: 4 },
  cat: { width: 68, alignItems: 'center' as const, gap: 6 },
  catImage: { width: 56, height: 56, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken, overflow: 'hidden' as const, borderWidth: 2, borderColor: 'transparent' },
  catOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  catPhoto: { width: '100%' as const, height: '100%' as const },
  catName: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  catNameOn: { color: c.ink, fontFamily: fonts.sansBold },
  item: { flexDirection: 'row' as const, gap: 14, padding: 14 },
  dim: { opacity: 0.6 },
  photo: { width: 88, height: 88, borderRadius: 14, backgroundColor: c.surfaceSunken, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  photoImg: { width: '100%' as const, height: '100%' as const },
  body: { flex: 1, gap: 6, alignItems: 'flex-start' as const },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  price: { fontFamily: fonts.heading, fontSize: 20, color: c.ink, fontVariant: ['tabular-nums' as const] },
});
