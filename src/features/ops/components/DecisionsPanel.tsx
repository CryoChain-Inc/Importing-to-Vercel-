import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { resolveDecision, retryAllocation, type Decision } from '../../../services/ops.fulfilment.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty, Segmented, usePaged, when } from './OpsBits';
import { useAction } from './useAction';

const KIND: Record<Decision['kind'], { title: string; hint: string }> = {
  no_supply: { title: 'Not enough supply', hint: 'Contact farmers for more stock, or refund the shortfall to the buyer.' },
  no_farmer_price: { title: 'No farmer price', hint: 'Set the farmer price for this product and grade under Prices, then retry.' },
  no_driver: { title: 'No driver available', hint: 'Ask a driver to open the app, or assign a cold truck. The route builds itself once one reports in.' },
  sms_failed: { title: 'SMS not delivered', hint: 'Call the farmer. They can still accept in the app.' },
  allocation_error: { title: 'Allocation failed', hint: 'Retry the allocation. If it fails again, check the order and farmer listings.' },
};

/** Exceptions the system could not settle by itself. Resolve each with a note, so there is a record of what was decided. */
export function DecisionsPanel({ decisions, onChange }: { decisions: Decision[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [note, setNote] = useState<Record<string, string>>({});
  const list = decisions.filter((d) => d.status === tab);
  const { rows, more } = usePaged(list, tab, 6);
  const openCount = decisions.filter((d) => d.status === 'open').length;

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Segmented value={tab} onChange={setTab} options={[
        { key: 'open', label: 'Open', count: openCount },
        { key: 'resolved', label: 'Resolved', count: decisions.length - openCount },
      ]} />
      {rows.length === 0 ? (
        <Empty icon="shield" title={tab === 'open' ? 'Nothing needs a decision' : 'No resolved decisions yet'}
          hint={tab === 'open' ? 'Orders are being allocated and routed automatically. Anything the system cannot settle appears here.' : 'Resolved items keep their note.'} />
      ) : null}
      {rows.map((d) => (
        <Card key={d.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{KIND[d.kind].title}{d.order ? ` · ${d.order}` : ''}</Text>
            <Badge label={d.status === 'open' ? 'Open' : 'Resolved'} tone={d.status === 'open' ? 'danger' : 'success'} />
          </View>
          <Text style={s.body}>{d.summary}</Text>
          <Text style={s.meta}>Raised {when(d.createdAt)}{d.resolvedAt ? ` · resolved ${when(d.resolvedAt)}` : ''}</Text>
          {d.status === 'open' ? (
            <>
              <Text style={s.meta}>{KIND[d.kind].hint}</Text>
              <Input label="What did you decide?" value={note[d.id] ?? ''} onChangeText={(v) => setNote((n) => ({ ...n, [d.id]: v }))} placeholder="e.g. Refunded 230 kg to the buyer" />
              <View style={s.actions}>
                {d.orderId && d.kind !== 'sms_failed' ? <Button size="sm" variant="outline" label="Retry allocation" loading={busy} onPress={() => run(() => retryAllocation(d.orderId!))} /> : null}
                <Button size="sm" label="Mark resolved" loading={busy} disabled={(note[d.id] ?? '').trim().length < 3} onPress={() => run(() => resolveDecision(d.id, note[d.id]))} />
              </View>
            </>
          ) : <Text style={s.meta}>Decision: {d.resolution}</Text>}
        </Card>
      ))}
      {more}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 8, padding: 16 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  body: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
