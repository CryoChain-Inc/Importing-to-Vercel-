import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { fetchOffers, respondToOffer, type Offer } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';

const when = (iso: string) => new Date(iso).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const TONE = { offered: 'warning', accepted: 'success', collected: 'success', declined: 'neutral', expired: 'neutral', cancelled: 'neutral' } as const;
const LABEL = { offered: 'Waiting for you', accepted: 'Accepted', collected: 'Collected', declined: 'Declined', expired: 'Expired', cancelled: 'Cancelled' } as const;

/** Orders CryoChain wants from this farmer: how many kg, what it pays, and accept or decline. No buyer details. */
export function Offers() {
  const s = useThemedStyles(styles);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const load = useCallback(async () => { setOffers(await fetchOffers().catch(() => [])); }, []);
  const { busy, error, run } = useAction(load);

  useEffect(() => {
    let live = true;
    const tick = () => { fetchOffers().then((o) => { if (live) setOffers(o); }, () => undefined); };
    tick();
    const t = setInterval(tick, 30000);
    return () => { live = false; clearInterval(t); };
  }, []);

  if (!offers || offers.length === 0) return null;
  const open = offers.filter((o) => o.status === 'offered' && new Date(o.expiresAt) > new Date());
  const rest = offers.filter((o) => !open.includes(o)).slice(0, 5);

  return (
    <View style={s.list}>
      <Text style={s.title}>Orders for your produce</Text>
      {error ? <Banner text={error} /> : null}
      {open.map((o) => (
        <Card key={o.id} tone="tint" style={s.item}>
          <Text style={s.name}>{o.kg.toLocaleString('en-GH')} kg {o.product} · Grade {o.grade}</Text>
          <Text style={s.pay}>{ghs(o.amount)}</Text>
          <Text style={s.meta}>You earn this when the produce is collected. Answer by {when(o.expiresAt)}.</Text>
          <View style={s.actions}>
            <Button label="Accept" loading={busy} onPress={() => run(() => respondToOffer(o.id, true))} style={s.grow} />
            <Button label="Decline" variant="outline" disabled={busy} onPress={() => run(() => respondToOffer(o.id, false))} style={s.grow} />
          </View>
        </Card>
      ))}
      {rest.map((o) => (
        <Card key={o.id} style={s.row}>
          <View style={s.grow}>
            <Text style={s.name}>{o.kg.toLocaleString('en-GH')} kg {o.product} · {ghs(o.amount)}</Text>
            <Text style={s.meta}>{when(o.createdAt)}</Text>
          </View>
          <Badge label={LABEL[o.status]} tone={TONE[o.status]} />
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 8 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  grow: { flex: 1 },
  actions: { flexDirection: 'row' as const, gap: 10 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  pay: { fontFamily: fonts.heading, fontSize: 26, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
