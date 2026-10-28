import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { checkoutCart, type BuyerAddress, type CartLine, type CatalogueItem, type Shortfall } from '../../../services/buyer.service';
import { imageUrl } from '../../../services/catalogueImage';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';
import { useCart } from '../cart/CartProvider';
import { KgStepper } from './KgStepper';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Review the cart, pick where it goes, then check supply and pay. Stock is only held once every line fits. */
export function Cart({ items, addresses, onOrdered, onRefresh, onAddAddress, onShop }: {
  items: CatalogueItem[];
  addresses: BuyerAddress[];
  /** Called with the new order's id once stock is held; the payment page takes over from here. */
  onOrdered: (orderId: string) => void;
  onRefresh: () => Promise<void>;
  onAddAddress: () => void;
  onShop: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const { lines, dispatch } = useCart();
  const { busy, error, run } = useAction(onRefresh);
  const pinned = addresses.filter((a) => a.latitude != null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [shortfalls, setShortfalls] = useState<Shortfall[]>([]);
  const address = pinned.find((a) => a.id === addressId) ?? pinned.find((a) => a.isDefault) ?? pinned[0];

  const rows = lines.map((l) => {
    const item = items.find((i) => i.productId === l.productId && i.grade === l.grade);
    const short = shortfalls.find((x) => x.productId === l.productId && x.grade === l.grade);
    const available = short?.availableKg ?? item?.availableKg ?? 0;
    return { line: l, item, available, over: l.kg > available };
  });
  const blocked = rows.some((r) => r.over);
  const total = rows.reduce((sum, r) => sum + (r.item ? r.line.kg * r.item.price : 0), 0);

  const set = (productId: string, grade: CatalogueItem['grade'], next: number) => {
    setShortfalls([]);
    dispatch({ type: 'set', line: { productId, grade, kg: next } });
  };

  const submit = (cartLines: CartLine[]) => run(async () => {
    if (!address) throw new Error('Add a delivery address first.');
    const res = await checkoutCart(cartLines, address.id);
    if (!res.ok) {
      setShortfalls(res.shortfalls);
      return;
    }
    dispatch({ type: 'clear' });
    setShortfalls([]);
    onOrdered(res.orderId);
  });

  // What the buyer would get if they accept the stock that is left: lines trimmed to it, sold-out lines dropped.
  const trimmed = lines
    .map((l) => ({ ...l, kg: Math.min(l.kg, shortfalls.find((x) => x.productId === l.productId && x.grade === l.grade)?.availableKg ?? l.kg) }))
    .filter((l) => l.kg > 0);
  const trimmedTotal = trimmed.reduce((sum, l) => sum + l.kg * (items.find((i) => i.productId === l.productId && i.grade === l.grade)?.price ?? 0), 0);
  const acceptAvailable = () => {
    lines.forEach((l) => dispatch({ type: 'set', line: { ...l, kg: trimmed.find((t) => t.productId === l.productId && t.grade === l.grade)?.kg ?? 0 } }));
    submit(trimmed);
  };

  if (lines.length === 0) {
    return (
      <Card style={s.empty}>
        <View style={s.emptyIcon}><Icon name="cart" size={28} color={colors.brandInk} /></View>
        <Text style={s.title}>Your cart is empty</Text>
        <Text style={s.metaCenter}>Pick produce from the shop and choose how many kilograms you need.</Text>
        <Button label="Browse produce" onPress={onShop} />
      </Card>
    );
  }

  const split = width >= 720;
  const kgTotal = lines.reduce((sum, l) => sum + l.kg, 0);

  const itemsList = (
    <View style={s.col}>
      {rows.map(({ line, item, available, over }) => {
        const uri = imageUrl(item?.image ?? null);
        return (
          <Card key={`${line.productId}-${line.grade}`} style={[s.item, over && s.itemOver]}>
            <View style={s.top}>
              <View style={s.thumb}>
                {uri ? <Image source={{ uri }} style={s.thumbImg} resizeMode="cover" accessibilityLabel={item?.name ?? 'Item'} /> : <Icon name="leaf" size={22} color={colors.inkMuted} />}
              </View>
              <View style={s.grow}>
                <Text style={s.name} numberOfLines={2}>{item?.name ?? 'Unavailable item'}</Text>
                <View style={s.tags}>
                  <Badge label={`Grade ${line.grade}`} tone="neutral" />
                  {item ? <Text style={s.meta}>{ghs(item.price)} / kg</Text> : null}
                </View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item?.name ?? 'item'} from cart`} onPress={() => set(line.productId, line.grade, 0)} hitSlop={8} style={({ pressed }) => [s.trash, pressed && s.pressed]}>
                <Icon name="trash" size={18} color={colors.inkMuted} />
              </Pressable>
            </View>
            {!item ? <Text style={s.warn}>No longer in stock. Remove it to continue.</Text> : null}
            {over && item ? <Text style={s.warn}>{available > 0 ? `Only ${kg(available)} left.` : 'Out of stock. Remove it to continue.'}</Text> : null}
            <View style={s.bottom}>
              {item ? <KgStepper value={line.kg} max={Math.max(available, line.kg)} onChange={(n) => set(line.productId, line.grade, n)} /> : <View />}
              <Text style={s.line}>{item ? ghs(line.kg * item.price) : ''}</Text>
            </View>
            {over && item && available > 0 ? <Button size="sm" variant="tonal" label={`Reduce to ${kg(available)}`} onPress={() => set(line.productId, line.grade, available)} /> : null}
          </Card>
        );
      })}
    </View>
  );

  const checkout = (
    <View style={s.col}>
      <Card style={s.box}>
        <Text style={s.label}>Deliver to</Text>
        {pinned.length === 0 ? (
          <>
            <Text style={s.meta}>Add a delivery address and pin it on the map so we can find the nearest farms.</Text>
            <Button size="sm" variant="tonal" label="Add address" onPress={onAddAddress} />
          </>
        ) : pinned.map((a) => {
          const on = a.id === address?.id;
          return (
            <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setAddressId(a.id)} style={[s.addr, on && s.addrOn]}>
              <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
              <View style={s.grow}>
                <Text style={s.name}>{a.label}</Text>
                <Text style={s.meta} numberOfLines={2}>{a.address}</Text>
              </View>
            </Pressable>
          );
        })}
      </Card>

      <Card tone="tint" style={s.box}>
        <Text style={s.label}>Order summary</Text>
        <View style={s.sumRow}><Text style={s.meta}>{lines.length} item{lines.length === 1 ? '' : 's'} · {kg(kgTotal)}</Text><Text style={s.sumValue}>{ghs(total)}</Text></View>
        <View style={s.divider} />
        <View style={s.bottom}>
          <Text style={s.label}>Total</Text>
          <Text style={s.total}>{ghs(total)}</Text>
        </View>
        <Button size="lg" label="Check availability & pay" loading={busy} disabled={blocked || !address || total <= 0} onPress={() => submit(lines)} />
        {blocked ? <Text style={s.warn}>Fix the highlighted items to continue.</Text> : !address ? <Text style={s.warn}>Add a pinned delivery address to continue.</Text> : null}
        <Text style={s.fine}>We check stock first. If everything is available we hold it for 30 minutes while you pay with mobile money, card or bank through Paystack.</Text>
      </Card>
    </View>
  );

  return (
    <View style={s.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text style={s.heading}>Your cart</Text>
      {error ? <Banner text={error} /> : null}
      {shortfalls.length > 0 ? (
        <Card tone="tint" style={s.item}>
          <Text style={s.title}>Not enough stock for everything</Text>
          {shortfalls.map((x) => {
            const it = items.find((i) => i.productId === x.productId && i.grade === x.grade);
            return (
              <Text key={`${x.productId}-${x.grade}`} style={s.meta}>
                {it?.name ?? 'Item'} · Grade {x.grade}: you asked for {kg(x.requestedKg)}, {x.availableKg > 0 ? `only ${kg(x.availableKg)} is available` : 'none is available now'}.
              </Text>
            );
          })}
          <Text style={s.meta}>Nothing has been charged or reserved yet. Continue with what is available, or go back and change your cart.</Text>
          {trimmed.length > 0 ? <Button label={`Continue with available · ${ghs(trimmedTotal)}`} loading={busy} onPress={acceptAvailable} /> : null}
          <Button variant="ghost" label="Review my cart" onPress={() => setShortfalls([])} />
        </Card>
      ) : null}

      {split ? <View style={s.split}><View style={s.splitMain}>{itemsList}</View><View style={s.splitSide}>{checkout}</View></View> : <>{itemsList}{checkout}</>}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 14 },
  col: { gap: 12 },
  split: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 20 },
  splitMain: { flex: 3 },
  splitSide: { flex: 2 },
  empty: { gap: 12, alignItems: 'center' as const, paddingVertical: 36 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  heading: { fontFamily: fonts.heading, fontSize: 26, letterSpacing: -0.4, color: c.ink },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  item: { gap: 12, padding: 14 },
  itemOver: { borderColor: c.dangerInk },
  box: { gap: 12, padding: 16 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1, gap: 4 },
  tags: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
  thumb: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken },
  thumbImg: { width: '100%' as const, height: '100%' as const },
  trash: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken },
  pressed: { opacity: 0.6 },
  bottom: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8, flexWrap: 'wrap' as const },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  metaCenter: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, textAlign: 'center' as const, maxWidth: 320 },
  fine: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted },
  warn: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.dangerInk },
  label: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  line: { fontFamily: fonts.heading, fontSize: 18, color: c.ink, fontVariant: ['tabular-nums' as const] },
  total: { fontFamily: fonts.heading, fontSize: 28, color: c.ink, fontVariant: ['tabular-nums' as const] },
  sumRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  sumValue: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  divider: { height: 1, backgroundColor: c.borderSubtle },
  addr: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: c.borderSubtle },
  addrOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  radioOn: { borderColor: c.brand600 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand600 },
});
