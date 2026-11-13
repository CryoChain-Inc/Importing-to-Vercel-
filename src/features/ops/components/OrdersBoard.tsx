import React from 'react';
import { Pressable, Text, View, type PressableStateCallbackType } from 'react-native';
import { Badge, Button, Card, Icon, Pagination } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import type { BoardOrder, DriverRoute } from '../../../services/ops.fulfilment.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { boardFilter, orderTrack, TRACK_STEPS } from '../orderTrack';
import type { PageProps } from '../useOpsLocation';
import { OrderDetail } from './OrderDetail';
import { Empty, Segmented, when } from './OpsBits';

type Stage = 'attention' | 'farmers' | 'moving' | 'done' | 'closed';
const ORDERS_PER_PAGE = 10;

/** Paid orders. The list pages 10 at a time; an order opens on its own page (?order=<id>) so Back and links work. */
export function OrdersBoard({ orders, drivers, onChange, params, setParams }: { orders: BoardOrder[]; drivers: DriverRoute[]; onChange: () => Promise<void> } & Pick<PageProps, 'params' | 'setParams'>) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const stage = (params.stage ?? 'all') as 'all' | Stage;
  const withStage = orders.map((o) => ({ o, st: boardFilter(o), track: orderTrack(o) }));
  const count = (f: Stage) => withStage.filter((x) => x.st.stage === f).length;
  const shown = withStage.filter((x) => stage === 'all' || x.st.stage === stage);
  const pages = Math.max(1, Math.ceil(shown.length / ORDERS_PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(params.page) || 1));
  const rows = shown.slice((page - 1) * ORDERS_PER_PAGE, page * ORDERS_PER_PAGE);

  const picked = params.order ? orders.find((o) => o.id === params.order) : undefined;
  if (picked) return <OrderDetail order={picked} drivers={drivers} onChange={onChange} onBack={() => setParams({ stage: params.stage ?? '', page: params.page ?? '' })} />;
  if (orders.length === 0) return <Empty icon="package" title="No orders yet" hint="Orders appear here as soon as a buyer checks out. Paid orders are allocated to farmers and routed automatically." />;

  return (
    <View style={s.list}>
      {params.order ? <Banner text="That order is no longer on the board." /> : null}
      <Segmented value={stage} onChange={(k) => setParams(k === 'all' ? {} : { stage: k })} options={[
        { key: 'all', label: 'All', count: orders.length },
        { key: 'attention', label: 'Attention', count: count('attention') },
        { key: 'farmers', label: 'Farmers', count: count('farmers') },
        { key: 'moving', label: 'Moving', count: count('moving') },
        { key: 'done', label: 'Delivered', count: count('done') },
      ]} />
      {rows.length === 0 ? (
        <Card style={s.none}>
          <Text style={s.meta}>No orders in this stage.</Text>
          <Button size="sm" variant="outline" label="Show all orders" onPress={() => setParams({})} />
        </Card>
      ) : rows.map(({ o, st, track }) => (
        <Pressable key={o.id} accessibilityRole="link" accessibilityLabel={`Open order ${o.code}`} onPress={() => setParams({ stage: params.stage ?? '', page: params.page ?? '', order: o.id })}
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
      ))}
      <Pagination page={page} total={shown.length} pageSize={ORDERS_PER_PAGE} noun="orders" onPage={(p) => setParams({ stage: params.stage ?? '', page: p > 1 ? String(p) : '' })} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
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
