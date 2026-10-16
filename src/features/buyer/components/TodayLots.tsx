import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { payOnline, placeOrder, type TodayLot } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';

const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

/** Today's open lots. "Confirm and pay" first asks how to pay; only then is the lot reserved (order placed). */
export function TodayLots({ lots, onOrdered, onRefresh }: {
  lots: TodayLot[];
  onOrdered: () => void;
  onRefresh: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onRefresh);
  const [choosing, setChoosing] = useState<string | null>(null);

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
          {choosing === l.id ? (
            <>
              <Text style={s.meta}>How would you like to pay? Your order is created when you choose.</Text>
              <Button label="Pay online (mobile money or bank)" loading={busy}
                onPress={() => run(async () => { const id = await placeOrder(l.id); onOrdered(); await payOnline(id); })} />
              <Button variant="outline" label="Pay by bank transfer" disabled={busy}
                onPress={() => run(async () => { await placeOrder(l.id); onOrdered(); })} />
              <Button variant="ghost" size="sm" label="Back" disabled={busy} onPress={() => setChoosing(null)} />
            </>
          ) : <Button label="Confirm and pay" onPress={() => setChoosing(l.id)} />}
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
