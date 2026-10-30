import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import type { CatalogueItem } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { Sheet } from '../../ops/components/Sheet';
import { KG_STEP } from '../cart/cart';
import { useCart } from '../cart/CartProvider';
import { KgStepper } from './KgStepper';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Pick a grade and a quantity for a product that has several grades. Dialog on web, bottom sheet on phones. */
export function AddToCartSheet({ grades, onClose }: { grades: CatalogueItem[]; onClose: () => void }) {
  const s = useThemedStyles(styles);
  const { lines, dispatch } = useCart();
  const p = grades[0];
  const inCart = (g: CatalogueItem) => lines.find((l) => l.productId === g.productId && l.grade === g.grade)?.kg ?? 0;
  const stocked = grades.filter((g) => g.availableKg > 0);
  const [grade, setGrade] = useState((stocked.slice().sort((a, b) => a.price - b.price)[0] ?? grades[0]).grade);
  const sel = grades.find((g) => g.grade === grade)!;
  const [qty, setQty] = useState(inCart(sel) || Math.min(KG_STEP, sel.availableKg));

  const pick = (g: CatalogueItem) => { setGrade(g.grade); setQty(inCart(g) || Math.min(KG_STEP, g.availableKg)); };
  const update = inCart(sel) > 0;

  return (
    <Sheet title={p.name} subtitle="Choose a grade and how many kilograms." onClose={onClose}
      footer={<Button label={`${update ? 'Update cart' : 'Add to cart'} · ${ghs(qty * sel.price)}`} icon="cart" disabled={qty <= 0}
        onPress={() => { dispatch({ type: 'set', line: { productId: sel.productId, grade: sel.grade, kg: qty } }); onClose(); }} />}>
      <View style={s.list} accessibilityRole="radiogroup">
        {grades.map((g) => {
          const on = g.grade === sel.grade;
          const out = g.availableKg <= 0;
          const n = inCart(g);
          return (
            <Pressable key={g.grade} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: out }}
              accessibilityLabel={`Grade ${g.grade}, ${ghs(g.price)} per kilogram, ${out ? 'sold out' : `${kg(g.availableKg)} left`}`}
              disabled={out} onPress={() => pick(g)} style={({ pressed }) => [s.row, on && s.rowOn, out && s.rowOff, pressed && s.pressed]}>
              <View style={[s.radio, on && s.radioOn]}>{on ? <Icon name="check" size={14} color="#ffffff" /> : null}</View>
              <View style={s.grow}>
                <Text style={[s.grade, on && s.gradeOn]}>Grade {g.grade}</Text>
                <Text style={[s.meta, out && s.danger]}>{out ? 'Sold out' : `${kg(g.availableKg)} left${n > 0 ? ` · ${kg(n)} in cart` : ''}`}</Text>
              </View>
              <Text style={s.price}>{ghs(g.price)}<Text style={s.unit}> / kg</Text></Text>
            </Pressable>
          );
        })}
      </View>
      <View style={s.qty}>
        <Text style={s.label}>Quantity</Text>
        <KgStepper key={sel.grade} value={qty} max={sel.availableKg} removable={false} onChange={setQty} />
        <Text style={s.meta}>Up to {kg(sel.availableKg)} available</Text>
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
  grade: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  gradeOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  meta: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
  danger: { color: c.dangerInk },
  price: { fontFamily: fonts.heading, fontSize: 18, color: c.ink, fontVariant: ['tabular-nums' as const] },
  unit: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  qty: { gap: 8 },
  label: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
});
