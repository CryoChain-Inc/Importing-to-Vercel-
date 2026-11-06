import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import type { CatalogueItem } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { fmtQty, ghs } from '../../../utils/format';
import { Sheet } from '../../ops/components/Sheet';
import { stepFor } from '../cart/cart';
import { useCart } from '../cart/CartProvider';
import { QtyStepper } from './QtyStepper';

/** Pick a unit and a quantity for a product that is sold in several units. Dialog on web, bottom sheet on phones. */
export function AddToCartSheet({ units, onClose }: { units: CatalogueItem[]; onClose: () => void }) {
  const s = useThemedStyles(styles);
  const { lines, dispatch } = useCart();
  const p = units[0];
  const inCart = (g: CatalogueItem) => lines.find((l) => l.productId === g.productId && l.unit === g.unit)?.kg ?? 0;
  const stocked = units.filter((g) => g.availableKg > 0);
  const [unit, setUnit] = useState((stocked.slice().sort((a, b) => a.price - b.price)[0] ?? units[0]).unit);
  const sel = units.find((g) => g.unit === unit)!;
  const [qty, setQty] = useState(inCart(sel) || Math.min(stepFor(sel.unit), sel.availableKg));

  const pick = (g: CatalogueItem) => { setUnit(g.unit); setQty(inCart(g) || Math.min(stepFor(g.unit), g.availableKg)); };
  const update = inCart(sel) > 0;

  return (
    <Sheet title={p.name} subtitle={units.length > 1 ? 'Choose a unit and how many.' : `How many ${units[0].unit}?`} onClose={onClose}
      footer={<Button label={`${update ? 'Update cart' : 'Add to cart'} · ${ghs(qty * sel.price)}`} icon="cart" disabled={qty <= 0}
        onPress={() => { dispatch({ type: 'set', line: { productId: sel.productId, unit: sel.unit, kg: qty } }); onClose(); }} />}>
      <View style={s.list} accessibilityRole="radiogroup">
        {units.map((g) => {
          const on = g.unit === sel.unit;
          const out = g.availableKg <= 0;
          const n = inCart(g);
          return (
            <Pressable key={g.unit} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: out }}
              accessibilityLabel={`${g.unit}, ${ghs(g.price)} per ${g.unit}, ${out ? 'sold out' : `${fmtQty(g.availableKg, g.unit)} left`}`}
              disabled={out} onPress={() => pick(g)} style={({ pressed }) => [s.row, on && s.rowOn, out && s.rowOff, pressed && s.pressed]}>
              <View style={[s.radio, on && s.radioOn]}>{on ? <Icon name="check" size={14} color="#ffffff" /> : null}</View>
              <View style={s.grow}>
                <Text style={[s.unitName, on && s.unitNameOn]}>{g.unit}</Text>
                <Text style={[s.meta, out && s.danger]}>{out ? 'Sold out' : `${fmtQty(g.availableKg, g.unit)} left${n > 0 ? ` · ${fmtQty(n, g.unit)} in cart` : ''}`}</Text>
              </View>
              <Text style={s.price}>{ghs(g.price)}<Text style={s.unit}> / {g.unit}</Text></Text>
            </Pressable>
          );
        })}
      </View>
      <View style={s.qty}>
        <Text style={s.label}>Quantity</Text>
        <QtyStepper key={sel.unit} unit={sel.unit} value={qty} max={sel.availableKg} removable={false} onChange={setQty} />
        <Text style={s.meta}>Up to {fmtQty(sel.availableKg, sel.unit)} available</Text>
      </View>
    </Sheet>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: c.surfaceCard, borderWidth: 1.5, borderColor: c.cardEdge },
  rowOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  rowOff: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  radio: { width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5, borderColor: c.cardEdge },
  radioOn: { backgroundColor: c.brand600, borderColor: c.brand600 },
  grow: { flex: 1, gap: 2 },
  unitName: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  unitNameOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  meta: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
  danger: { color: c.dangerInk },
  price: { fontFamily: fonts.heading, fontSize: 18, color: c.ink, fontVariant: ['tabular-nums' as const] },
  unit: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  qty: { gap: 8 },
  label: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
});
