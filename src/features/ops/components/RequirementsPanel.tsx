import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { closeRequirement, type RequirementRow } from '../../../services/ops.buyers.service';
import type { PriceRow, Product, SupplyRow } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';
import { LotBuilder } from './LotBuilder';
import { Empty, kg, usePaged } from './OpsBits';
import { useAction } from './useAction';

const TONE = { open: 'warning', matched: 'success', closed: 'neutral' } as const;
const FILTERS = ['Open', 'Matched', 'Closed', 'All'];

/** Buyer demand. Each open requirement shows how much matching supply exists and builds the lot right here. */
export function RequirementsPanel({ requirements, supply, products, prices, onChange }: {
  requirements: RequirementRow[];
  supply: SupplyRow[];
  products: Product[];
  prices: PriceRow[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [filter, setFilter] = useState('Open');
  const [matching, setMatching] = useState<string | null>(null);
  const filtered = requirements.filter((r) => filter === 'All' || r.state === filter.toLowerCase());
  const { rows, more } = usePaged(filtered, filter);

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <ChoiceChips label="Show" options={FILTERS} value={filter} onChange={setFilter} />
      {filtered.length === 0 ? (
        <Empty icon="clipboard" title={requirements.length ? `No ${filter.toLowerCase()} requirements` : 'No buyer requirements yet'} hint="When a buyer posts what they need, it lands here with the supply we can match it from." />
      ) : null}
      {rows.map((r) => {
        const have = supply.filter((x) => !x.lotId && x.product.toLowerCase() === r.product.toLowerCase()).reduce((n, x) => n + x.weightKg, 0);
        const on = matching === r.id;
        return (
          <Card key={r.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name}>{r.quantityKg.toLocaleString('en-GH')} kg {r.product}{r.grade ? ` · grade ${r.grade}` : ''}</Text>
              <Badge label={r.state} tone={TONE[r.state]} />
            </View>
            <Text style={s.meta}>{r.buyer}{r.buyerPhone ? ` · ${formatPhone(r.buyerPhone)}` : ''}</Text>
            <Text style={s.meta}>Up to {ghs(r.maxPricePerKg)}/kg · {r.period} · {r.destination}</Text>
            {r.state === 'open' ? (
              <>
                <Text style={s.meta}>
                  {have >= r.quantityKg ? `Enough supply: ${kg(have)} available.` : have > 0 ? `Short by ${kg(r.quantityKg - have)}: only ${kg(have)} available.` : `No ${r.product} available right now.`}
                </Text>
                {!on ? (
                  <View style={s.actions}>
                    <Button size="sm" label="Match with supply" icon="package" disabled={have <= 0} onPress={() => setMatching(r.id)} />
                    <Button size="sm" variant="ghost" label="Close" loading={busy} onPress={() => run(() => closeRequirement(r.id))} />
                  </View>
                ) : null}
              </>
            ) : null}
            {on ? (
              <View style={s.inline}>
                <LotBuilder supply={supply} products={products} prices={prices} onChange={onChange} onDone={() => setMatching(null)}
                  draft={{ requirementId: r.id, product: supply.find((x) => x.product.toLowerCase() === r.product.toLowerCase())?.product ?? r.product, price: r.maxPricePerKg, wantedKg: r.quantityKg, summary: `${r.buyer}: ${r.quantityKg.toLocaleString('en-GH')} kg ${r.product} up to ${ghs(r.maxPricePerKg)}/kg` }} />
                <Button size="sm" variant="ghost" label="Cancel" onPress={() => setMatching(null)} />
              </View>
            ) : null}
          </Card>
        );
      })}
      {more}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 6 },
  inline: { gap: 8, marginTop: 8, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
