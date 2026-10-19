import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { cancelLot, type LotRow, type PriceRow, type Product, type SupplyRow } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { LotBuilder } from './LotBuilder';
import { LotTrailView, StageBar } from './LotTrail';
import { Empty, kg, SectionTitle, usePaged } from './OpsBits';
import { useAction } from './useAction';

const FILTERS = ['All', 'Open', 'Paid', 'On the road', 'Delivered', 'Cancelled'];
const group = (state: string) =>
  state === 'listed' || state === 'escrow_pending' ? 'Open' : state === 'escrow_funded' ? 'Paid' : state === 'collecting' || state === 'in_transit' ? 'On the road' : state === 'cancelled' ? 'Cancelled' : 'Delivered';

/** Build lots, then follow each one from listing to delivery, with the agent's and driver's records. */
export function LotsPanel({ supply, lots, products, prices, onChange }: {
  supply: SupplyRow[];
  lots: LotRow[];
  products: Product[];
  prices: PriceRow[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onChange);
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState<string | null>(null);
  const filtered = lots.filter((l) => filter === 'All' || group(l.state) === filter);
  const { rows, more } = usePaged(filtered, filter);

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <LotBuilder supply={supply} products={products} prices={prices} onChange={onChange} />

      <SectionTitle title="Lots" note="Open a lot to see where it is and what the agent and driver recorded." />
      {lots.length === 0 ? <Empty icon="package" title="No lots yet" hint="Group available listings into a lot above. Buyers can then order it." /> : (
        <>
          <ChoiceChips label="Status" options={FILTERS} value={filter} onChange={setFilter} />
          {filtered.length === 0 ? <Text style={s.meta}>No lots with this status.</Text> : null}
          {rows.map((l) => {
            const on = open === l.id;
            const farmers = supply.filter((r) => r.lotId === l.id);
            return (
              <Card key={l.id} style={s.item}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : l.id)} style={s.head}>
                  <View style={s.grow}>
                    <Text style={s.name} numberOfLines={1}>{l.code} · {l.product}</Text>
                    <Text style={s.meta}>Created {new Date(l.createdAt).toLocaleDateString('en-GH')}</Text>
                  </View>
                  <Badge label={group(l.state)} tone={l.state === 'cancelled' ? 'neutral' : group(l.state) === 'Open' ? 'warning' : 'success'} />
                  <Icon name="chevronDown" size={18} color={colors.inkMuted} />
                </Pressable>
                <View style={s.facts}>
                  <Fact label="Weight" value={kg(l.totalKg)} />
                  <Fact label="Value" value={l.pricePerKg ? ghs(l.totalKg * l.pricePerKg) : 'No price'} />
                  <Fact label="Farmers" value={String(l.listings)} />
                </View>
                {l.state !== 'cancelled' ? <View style={s.stage}><StageBar state={l.state} /></View> : null}
                {on ? (
                  <View style={s.body}>
                    <Text style={s.sub}>Farmers in this lot</Text>
                    {farmers.map((r) => <Text key={r.id} style={s.meta}>{r.farmer} · {r.point} · {kg(r.weightKg)}</Text>)}
                    {l.state !== 'listed' && l.state !== 'cancelled' ? <LotTrailView lotId={l.id} /> : null}
                    {l.state === 'listed' ? <Button size="sm" variant="outline" label="Cancel lot" loading={busy} onPress={() => run(() => cancelLot(l.id))} /> : null}
                  </View>
                ) : null}
              </Card>
            );
          })}
          {more}
        </>
      )}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { padding: 0, overflow: 'hidden' as const },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 14 },
  grow: { flex: 1, gap: 2 },
  facts: { flexDirection: 'row' as const, marginHorizontal: 14, marginBottom: 14, borderRadius: 12, backgroundColor: c.surfaceSunken },
  fact: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 12 },
  factLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  factValue: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums' as const] },
  stage: { paddingHorizontal: 14, paddingBottom: 16 },
  body: { gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle, alignItems: 'flex-start' as const },
  sub: { fontFamily: fonts.sansBold, fontSize: 13, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
