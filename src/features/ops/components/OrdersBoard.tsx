import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from 'react-native';
import { Badge, Button, Card, Icon, Input } from '../../../components/common';
import { Banner, Reveal } from '../../../components/feedback';
import {
  fetchBoardOrder,
  fetchBoardPage,
  type BoardOrder,
  type BoardState,
  type DriverRoute,
} from '../../../services/ops.fulfilment.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { boardFilter, orderTrack, TRACK_STEPS, type BoardFilter } from '../orderTrack';
import type { PageProps } from '../useOpsLocation';
import { OrderDetail } from './OrderDetail';
import { Empty, PanelSkeleton, Pager, Segmented, useServerPage, usePaged, when } from './OpsBits';

const STAGES: { key: BoardFilter; label: string }[] = [
  { key: 'moving', label: 'On the road' },
  { key: 'farmers', label: 'Waiting for farmers' },
  { key: 'attention', label: 'Not allocated' },
  { key: 'done', label: 'Delivered' },
];
const isStage = (v?: string): v is BoardFilter => STAGES.some((x) => x.key === v);
const qty = (n: number) => n.toLocaleString('en-GH', { maximumFractionDigits: 2 });

/** Orders, filtered by payment state on the server or by journey stage from the dashboard's board. An order opens on its own page (?order=<id>) so Back and links work. */
export function OrdersBoard({
  drivers,
  board,
  onChange,
  params,
  setParams,
  rev,
}: {
  drivers: DriverRoute[];
  board: BoardOrder[];
  onChange: () => Promise<void>;
} & PageProps) {
  const back = () =>
    setParams({
      state: params.state ?? '',
      stage: params.stage ?? '',
      page: params.page ?? '',
      q: params.q ?? '',
    });
  if (params.order)
    return (
      <OrderPage id={params.order} drivers={drivers} rev={rev} onChange={onChange} onBack={back} />
    );
  if (isStage(params.stage))
    return <StageOrders stage={params.stage} board={board} params={params} setParams={setParams} />;
  return <ServerOrders board={board} params={params} setParams={setParams} rev={rev} />;
}

function StageBar({
  board,
  active,
  onPick,
}: {
  board: BoardOrder[];
  active?: BoardFilter;
  onPick: (k: BoardFilter | null) => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      {STAGES.map((x) => {
        const on = x.key === active;
        const n = board.filter((o) => boardFilter(o).stage === x.key).length;
        return (
          <Pressable
            key={x.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(on ? null : x.key)}
            style={[s.chip, on && s.chipOn]}
          >
            <Text style={[s.chipText, on && s.chipTextOn]}>{x.label}</Text>
            <Text style={[s.chipCount, on && s.chipTextOn]}>{n}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function OrderRow({ o, index, onOpen }: { o: BoardOrder; index: number; onOpen: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const st = boardFilter(o);
  const track = orderTrack(o);
  const pct = track.orderedKg > 0 ? (track.collectedKg / track.orderedKg) * 100 : 0;
  const showCollected = o.state === 'paid' && track.orderedKg > 0;
  return (
    <Reveal index={index}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open order ${o.code}`}
        onPress={onOpen}
        style={({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
          s.row,
          hovered && s.hover,
          pressed && s.press,
        ]}
      >
        <View style={s.top}>
          <Text style={s.code}>{o.code}</Text>
          <Text style={s.when}>{when(o.createdAt)}</Text>
        </View>
        <View style={s.mid}>
          <View style={s.grow}>
            <Text style={s.buyer} numberOfLines={1}>
              {o.buyer}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {o.items.join(', ')}
            </Text>
          </View>
          <Text style={s.amount}>{ghs(o.amount)}</Text>
        </View>
        <View
          style={s.steps}
          accessibilityLabel={`Step ${track.index + 1} of ${TRACK_STEPS.length}`}
        >
          {TRACK_STEPS.map((step, i) => (
            <View key={step.key} style={[s.seg, !track.cancelled && i <= track.index && s.segOn]} />
          ))}
        </View>
        <View style={s.foot}>
          <Text style={[s.meta, s.grow]} numberOfLines={1}>
            {showCollected ? (
              <>
                <Text style={s.collectNum}>{qty(track.collectedKg)}</Text> of {qty(track.orderedKg)}{' '}
                {track.unit} collected · {Math.round(pct)}%
              </>
            ) : (
              `Step ${track.index + 1} of ${TRACK_STEPS.length}`
            )}
          </Text>
          <Badge label={st.label} tone={st.tone} />
          <Icon name="chevronRight" size={16} color={colors.inkMuted} />
        </View>
      </Pressable>
    </Reveal>
  );
}

/** Orders in one journey stage, read from the same latest-100 board the dashboard counts. */
function StageOrders({
  stage,
  board,
  params,
  setParams,
}: { stage: BoardFilter; board: BoardOrder[] } & Pick<PageProps, 'params' | 'setParams'>) {
  const s = useThemedStyles(styles);
  const q = (params.q ?? '').trim().toLowerCase();
  const all = board.filter(
    (o) => boardFilter(o).stage === stage && (!q || o.code.toLowerCase().includes(q)),
  );
  const { rows, more } = usePaged(all, `${stage}|${q}`, 8);
  const label = STAGES.find((x) => x.key === stage)!.label;
  return (
    <View style={s.list}>
      <StageBar board={board} active={stage} onPick={(k) => setParams(k ? { stage: k } : {})} />
      <Input
        label="Search orders"
        value={params.q ?? ''}
        onChangeText={(v) => setParams({ stage, q: v }, true)}
        placeholder="Order code"
      />
      {rows.length === 0 ? (
        <Empty
          icon="package"
          title={`Nothing ${stage === 'moving' ? 'on the road' : label.toLowerCase()}`}
          hint="Orders move in here on their own as farmers accept, drivers collect and trips finish."
        />
      ) : (
        rows.map((o, i) => (
          <OrderRow
            key={o.id}
            o={o}
            index={i}
            onOpen={() => setParams({ stage, q: params.q ?? '', order: o.id })}
          />
        ))
      )}
      {more}
      {board.length >= 100 ? (
        <Text style={s.meta}>
          Showing the latest 100 orders. Use All orders to search older ones.
        </Text>
      ) : null}
      <Button variant="ghost" size="sm" label="All orders" onPress={() => setParams({})} />
    </View>
  );
}

function ServerOrders({ board, params, setParams, rev }: { board: BoardOrder[] } & PageProps) {
  const s = useThemedStyles(styles);
  const state = (params.state ?? 'all') as BoardState;
  const { rows, total, q, text, setText, page, goPage, loading, firstLoad, error } = useServerPage(
    params,
    setParams,
    rev,
    (p, query) => fetchBoardPage(p, query, state),
  );
  if (firstLoad) return error ? <Banner text={error} /> : <PanelSkeleton variant="list" />;
  if (!total && !q && state === 'all' && !loading)
    return (
      <Empty
        icon="package"
        title="No orders yet"
        hint="Orders appear here as soon as a buyer checks out. Paid orders are allocated to farmers and routed automatically."
      />
    );

  return (
    <View style={[s.list, loading && s.busy]}>
      {error ? <Banner text={error} /> : null}
      <StageBar board={board} onPick={(k) => k && setParams({ stage: k })} />
      <Segmented
        value={state}
        onChange={(k) => setParams(k === 'all' ? {} : { state: k })}
        options={[
          { key: 'all', label: 'All' },
          { key: 'paid', label: 'Paid' },
          { key: 'awaiting_payment', label: 'Awaiting payment' },
          { key: 'cancelled', label: 'Cancelled' },
        ]}
      />
      <Input label="Search orders" value={text} onChangeText={setText} placeholder="Order code" />
      {!loading && rows.length === 0 ? (
        <Card style={s.none}>
          <Text style={s.meta}>No orders match.</Text>
          <Button size="sm" variant="outline" label="Clear filters" onPress={() => setParams({})} />
        </Card>
      ) : (
        rows.map((o, i) => (
          <OrderRow
            key={o.id}
            o={o}
            index={i}
            onOpen={() =>
              setParams({
                state: params.state ?? '',
                page: params.page ?? '',
                q: params.q ?? '',
                order: o.id,
              })
            }
          />
        ))
      )}
      <Pager page={page} total={total} onPage={goPage} noun="orders" />
    </View>
  );
}

/** Loads the order behind ?order=<id>, so a shared link works whichever page of the list it came from. */
function OrderPage({
  id,
  drivers,
  rev,
  onChange,
  onBack,
}: {
  id: string;
  drivers: DriverRoute[];
  rev: number;
  onChange: () => Promise<void>;
  onBack: () => void;
}) {
  const [state, setState] = useState<
    { order: BoardOrder | null; error: string | null } | 'loading'
  >('loading');
  useEffect(() => {
    let live = true;
    fetchBoardOrder(id)
      .then((order) => live && setState({ order, error: null }))
      .catch(
        (e) =>
          live &&
          setState({
            order: null,
            error: e instanceof Error ? e.message : 'Could not load this order.',
          }),
      );
    return () => {
      live = false;
    };
  }, [id, rev]);
  if (state === 'loading') return <PanelSkeleton variant="stats" />;
  if (!state.order)
    return (
      <>
        <Banner text={state.error ?? 'That order could not be found.'} />
        <Button label="Back to orders" variant="outline" onPress={onBack} />
      </>
    );
  return <OrderDetail order={state.order} drivers={drivers} onChange={onChange} onBack={onBack} />;
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  busy: { opacity: 0.6 },
  none: { gap: 10, alignItems: 'flex-start' as const },
  row: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.cardEdge,
    backgroundColor: c.surfaceCard,
  },
  hover: { borderColor: c.borderStrong, backgroundColor: c.surfaceSunken },
  press: { opacity: 0.85 },
  top: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  mid: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 12 },
  foot: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1, gap: 2 },
  steps: { flexDirection: 'row' as const, gap: 3 },
  seg: { flex: 1, height: 6, borderRadius: 2, backgroundColor: c.borderSubtle },
  segOn: { backgroundColor: c.brand600 },
  code: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: c.inkMuted,
    fontVariant: ['tabular-nums' as const],
  },
  when: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
  buyer: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  amount: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  collectNum: { fontFamily: fonts.sansBold, color: c.ink, fontVariant: ['tabular-nums' as const] },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: c.surfaceSunken,
  },
  chipOn: { backgroundColor: c.brandTint },
  chipText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  chipTextOn: { color: c.brandInk },
  chipCount: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: c.inkMuted,
    fontVariant: ['tabular-nums' as const],
  },
});
