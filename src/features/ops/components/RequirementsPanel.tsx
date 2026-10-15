import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { closeRequirement, type RequirementRow } from '../../../services/ops.buyers.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';
import { useAction } from './useAction';

const TONE = { open: 'warning', matched: 'success', closed: 'neutral' } as const;

/** Buyer demand. "Create lot" opens the Lots tab prefilled; creating the lot marks the requirement matched. */
export function RequirementsPanel({ requirements, onCreateLot, onChange }: {
  requirements: RequirementRow[];
  onCreateLot: (r: RequirementRow) => void;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      {requirements.length === 0 ? <Card><Text style={s.meta}>No buyer requirements yet.</Text></Card> : null}
      {requirements.map((r) => (
        <Card key={r.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{r.product} · Grade {r.grade} · {r.quantityKg.toLocaleString('en-GH')} kg</Text>
            <Badge label={r.state} tone={TONE[r.state]} />
          </View>
          <Text style={s.meta}>{r.buyer}{r.buyerPhone ? ` · ${formatPhone(r.buyerPhone)}` : ''}</Text>
          <Text style={s.meta}>{r.period} · up to {ghs(r.maxPricePerKg)}/kg · {r.destination} · {new Date(r.createdAt).toLocaleDateString('en-GH')}</Text>
          {r.state === 'open' ? (
            <View style={s.actions}>
              <Button size="sm" label="Create lot" onPress={() => onCreateLot(r)} />
              <Button size="sm" variant="outline" label="Close" disabled={busy} onPress={() => run(() => closeRequirement(r.id))} />
            </View>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 6, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
