import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, type PressableStateCallbackType } from 'react-native';
import { Badge, Button, Card, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { fetchBoardOrder, fetchBoardPage, type BoardOrder, type BoardState, type DriverRoute } from '../../../services/ops.fulfilment.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { boardFilter, orderTrack, TRACK_STEPS } from '../orderTrack';
import type { PageProps } from '../useOpsLocation';
import { OrderDetail } from './OrderDetail';
import { Empty, PanelSkeleton, Pager, Segmented, useServerPage, when } from './OpsBits';

/** Orders, paged and filtered by the server. An order opens on its own page (?order=<id>) so Back and links work. */
export function OrdersBoard({ drivers, onChange, params, setParams, rev }: { drivers: DriverRoute[]; onChange: () => Promise<void> } & PageProps) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const state = (params.state ?? 'all') as BoardState;
  const { rows, total, q, text, setText, page, goPage, loading, firstLoad, error } = useServerPage(params, setParams, rev, (p, query) => fetchBoardPage(p, query, state));
  const back = () => setParams({ state: params.state ?? '', page: params.page ?? '', q: params.q ?? '' });

  if (params.order) return <OrderPage id={params.order} drivers={drivers} rev={rev} onChange={onChange} onBack={back} />;
  if (firstLoad) return error ? <Banner text={error} /> : <PanelSkeleton />;
  if (!total && !q && state === 'all' && !loading) return <Empty icon="package" title="No orders yet" hint="Orders appear here as soon as a buyer checks out. Paid orders are allocated to farmers and routed automatically." />;

  return (
    <View style={[s.list, loading && s.busy]}>
      {error ? <Banner text={error} /> : null}
      <Segmented value={state} onChange={(k) => setParams(k === 'all' ? {} : { state: k })} options={[
        { key: 'all', label: 'All' },
        { key: 'paid', label: 'Paid' },
        { key: 'awaiting_payment', label: 'Awaiting payment' },
        { key: 'cancelled', label: 'Cancelled' },
      ]} />
      <Input label="Search orders" value={text} onChangeText={setText} placeholder="Order code" />
      {!loading && rows.length === 0 ? (
        <Card style={s.none}>
          <Text style={s.meta}>No orders match.</Text>
          <Button size="sm" variant="outline" label="Clear filters" onPress={() => setParams({})} />
        </Card>
      ) : rows.map((o) => {
        const st = boardFilter(o);
        const track = orderTrack(o);
        return (
          <Pressable key={o.id} accessibilityRole="link" accessibilityLabel={`Open order ${o.code}`} onPress={() => setParams({ state: params.state ?? '', page: params.page ?? '', q: params.q ?? '', order: o.id })}
            style={({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [s.row, hovered && s.hover, pressed && s.press]}>
            <View style={s.top}>
              <Text style={s.code}>{o.code}</Text>
              <Text style={s.when}>{when(o.createdAt)}</Text>
            </View>
            <View style={s.mid}>
              <View style={s.grow}>
                <Text style={s.buyer} numberOfLines={1}>{o.buyer}</Text>
                <Text style={s.meta} numberOfLines={1}>{o.items.join(', ')}</Text>
              </View>
              <Text style={s.amount}>{ghs(o.amount)}</Text>
            </View>
            <View style={s.foot}>
              <View style={s.steps} accessibilityLabel={`Step ${track.index + 1} of ${TRACK_STEPS.length}`}>
                {TRACK_STEPS.map((step, i) => <View key={step.key} style={[s.seg, !track.cancelled && i <= track.index && s.segOn]} />)}
              </View>
              <Badge label={st.label} tone={st.tone} />
              <Icon name="chevronRight" size={16} color={colors.inkMuted} />
            </View>
          </Pressable>
        );
      })}
      <Pager page={page} total={total} onPage={goPage} noun="orders" />
    </View>
  );
}

/** Loads the order behind ?order=<id>, so a shared link works whichever page of the list it came from. */
function OrderPage({ id, drivers, rev, onChange, onBack }: { id: string; drivers: DriverRoute[]; rev: number; onChange: () => Promise<void>; onBack: () => void }) {
  const [state, setState] = useState<{ order: BoardOrder | null; error: string | null } | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    fetchBoardOrder(id).then((order) => live && setState({ order, error: null })).catch((e) => live && setState({ order: null, error: e instanceof Error ? e.message : 'Could not load this order.' }));
    return () => { live = false; };
  }, [id, rev]);
  if (state === 'loading') return <PanelSkeleton />;
  if (!state.order) return <><Banner text={state.error ?? 'That order could not be found.'} /><Button label="Back to orders" variant="outline" onPress={onBack} /></>;
  return <OrderDetail order={state.order} drivers={drivers} onChange={onChange} onBack={onBack} />;
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  busy: { opacity: 0.6 },
  none: { gap: 10, alignItems: 'flex-start' as const },
  row: { gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.cardEdge, backgroundColor: c.surfaceCard },
  hover: { borderColor: c.borderStrong, backgroundColor: c.surfaceSunken },
  press: { opacity: 0.85 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  mid: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 12 },
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1, gap: 2 },
  steps: { flex: 1, flexDirection: 'row' as const, gap: 3 },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.borderSubtle },
  segOn: { backgroundColor: c.brand600 },
  code: { fontFamily: fonts.sansBold, fontSize: 13, color: c.inkMuted, fontVariant: ['tabular-nums' as const] },
  when: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
  buyer: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  amount: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
