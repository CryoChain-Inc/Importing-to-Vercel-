import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { checkoutCart, type BuyerAddress, type CartLine, type CatalogueItem, type Shortfall } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
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
        <Text style={s.title}>Your cart is empty</Text>
        <Text style={s.meta}>Pick produce from the shop and choose how many kilograms you need.</Text>
        <Button label="Browse produce" onPress={onShop} />
      </Card>
    );
  }

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Cart</Text>
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

      {rows.map(({ line, item, available, over }) => (
        <Card key={`${line.productId}-${line.grade}`} style={s.item}>
          <View style={s.top}>
            <Text style={s.name} numberOfLines={1}>{item?.name ?? 'Unavailable item'}</Text>
            <Badge label={`Grade ${line.grade}`} tone="neutral" />
          </View>
          {item ? <Text style={s.meta}>{ghs(item.price)} / kg · {kg(available)} available</Text> : <Text style={s.warn}>No longer in stock.</Text>}
          {over && item ? <Text style={s.warn}>{available > 0 ? `Only ${kg(available)} left.` : 'Out of stock. Remove it to continue.'}</Text> : null}
          <View style={s.bottom}>
            {item ? <KgStepper value={line.kg} max={Math.max(available, line.kg)} onChange={(n) => set(line.productId, line.grade, n)} /> : <View />}
            <Text style={s.line}>{item ? ghs(line.kg * item.price) : ''}</Text>
          </View>
          <View style={s.actions}>
            {over && item && available > 0 ? <Button size="sm" variant="tonal" label={`Reduce to ${kg(available)}`} onPress={() => set(line.productId, line.grade, available)} /> : null}
            <Button size="sm" variant="ghost" label="Remove" onPress={() => set(line.productId, line.grade, 0)} />
          </View>
        </Card>
      ))}

      <Card style={s.item}>
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
              <Text style={s.name}>{a.label}</Text>
              <Text style={s.meta} numberOfLines={2}>{a.address}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Card tone="tint" style={s.item}>
        <View style={s.bottom}>
          <Text style={s.label}>Total</Text>
          <Text style={s.total}>{ghs(total)}</Text>
        </View>
        <Text style={s.meta}>We check stock first. If everything is available we hold it for 30 minutes while you pay with mobile money, card or bank through Paystack.</Text>
        <Button label="Check availability & pay" loading={busy} disabled={blocked || !address || total <= 0} onPress={() => submit(lines)} />
      </Card>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  empty: { gap: 12, alignItems: 'flex-start' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  item: { gap: 8 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  bottom: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  warn: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.dangerInk },
  label: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  line: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, fontVariant: ['tabular-nums' as const] },
  total: { fontFamily: fonts.heading, fontSize: 26, color: c.ink, fontVariant: ['tabular-nums' as const] },
  addr: { gap: 2, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderSubtle },
  addrOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
});
