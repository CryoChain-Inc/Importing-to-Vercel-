import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { placeOrder, type TodayLot } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Today's open lots. Confirming reserves the lot and moves the buyer to its bank-transfer instructions. */
export function TodayLots({ lots, onOrdered, onRefresh }: {
  lots: TodayLot[];
  onOrdered: () => void;
  onRefresh: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onRefresh);

  return (
    <View style={s.list}>
      <Text style={s.title}>Today’s lots</Text>
      {error ? <Banner text={error} /> : null}
      {lots.length === 0 ? (
        <Card><Text style={s.meta}>No lots are open today. Post a requirement and we’ll build one for you.</Text></Card>
      ) : null}
      {lots.map((l) => (
        <Card key={l.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{l.product}</Text>
            <Badge label={l.code} tone="info" />
          </View>
          <Text style={s.meta}>{kg(l.totalKg)} at {ghs(l.pricePerKg)}/kg · cold chain from farm gate</Text>
          <Text style={s.total}>{ghs(l.amount)}</Text>
          <Text style={s.meta}>Pay by bank transfer. Paystack (card, mobile wallet) is coming soon.</Text>
          <Button label="Confirm and pay" loading={busy}
            onPress={() => run(async () => { await placeOrder(l.id); onOrdered(); })} />
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 8 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, flexShrink: 1 },
  total: { fontFamily: fonts.heading, fontSize: 24, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
