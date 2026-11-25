import React, { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty } from '../../ops/components/OpsBits';
import { legText, type DrivePath } from '../drivePath';
import { totalText, type Stop, type StopLine } from '../stops';
import { MediaPreview, StopFlow, type FinishedStop } from './HandoverLines';
import { BackButton, openMaps, openPhone, placed, QuickActions, SectionLabel } from './bits';

export type { FinishedStop };

const clock = (iso: string | null) =>
  iso
    ? `around ${new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}`
    : '';

/** What a stop holds, one short line each: produce to collect, or each order with what is in it. */
const holds = (l: StopLine) =>
  l.pickup
    ? `${l.label} · ${l.qty} ${l.unit}`
    : `${l.orderCode} · ${l.items.map((i) => i.product).join(', ')}`;

const kindLabel = (s: Stop) => (s.kind === 'pickup' ? 'Pickup' : 'Delivery');

/** A stop on the route rail: number, who, what it holds, and when. The next one is marked. */
export function StopRow({
  n,
  stop,
  now,
  fresh,
  last,
  onPress,
}: {
  n: number;
  stop: Stop;
  now?: boolean;
  fresh?: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const done = stop.state === 'done';
  const pickup = stop.kind === 'pickup';
  return (
    <View style={s.railRow}>
      <View style={s.rail}>
        <View style={[s.node, pickup ? s.nodePick : s.nodeDrop, done ? s.nodeDone : null]}>
          {done ? (
            <Icon name="check" size={14} color={colors.onBrand} strokeWidth={3} />
          ) : (
            <Text style={[s.nodeN, !pickup ? s.nodeNDrop : null]}>{n}</Text>
          )}
        </View>
        {last ? null : <View style={[s.line, done ? s.lineDone : null]} />}
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${kindLabel(stop)} ${stop.name}`}
        style={({ pressed }) => [s.stopCard, now ? s.rowNow : null, pressed ? s.pressed : null]}
      >
        <View style={s.stopTop}>
          <Text style={s.kind}>{kindLabel(stop)}</Text>
          {fresh ? <Badge label="New" tone="warning" /> : null}
          {done ? (
            <Badge label="Done" tone="success" />
          ) : now ? (
            <Badge label="Next" tone="info" />
          ) : null}
          {!done && stop.eta ? (
            <Text style={s.when}>{clock(stop.eta).replace('around ', '')}</Text>
          ) : null}
        </View>
        <Text style={[s.rowTitle, done ? s.muted : null]} numberOfLines={1}>
          {stop.name}
        </Text>
        {stop.place ? (
          <Text style={s.meta} numberOfLines={1}>
            {stop.place}
          </Text>
        ) : null}
        <View style={s.holds}>
          {stop.lines.slice(0, 4).map((l) => (
            <Text key={l.stopId} style={[s.holdLine, done ? s.muted : null]} numberOfLines={1}>
              {holds(l)}
            </Text>
          ))}
          {stop.lines.length > 4 ? (
            <Text style={s.meta}>{`+ ${stop.lines.length - 4} more`}</Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

/** Today's route at a glance: how far along it is and what is on it. */
export function RouteHeader({
  todo,
  doneLive,
  fresh,
}: {
  todo: Stop[];
  doneLive: Stop[];
  fresh: number;
}) {
  const s = useThemedStyles(styles);
  const all = [...doneLive, ...todo];
  const orders = new Set(all.flatMap((x) => x.lines.map((l) => l.orderId))).size;
  const load = totalText(
    all
      .filter((x) => x.kind === 'pickup')
      .flatMap((x) => x.lines.map((l) => ({ qty: l.qty, unit: l.unit }))),
  );
  const pct = all.length ? (doneLive.length / all.length) * 100 : 0;
  return (
    <Card style={s.route}>
      <View style={s.stopTop}>
        <Text style={s.routeTitle}>Today&apos;s route</Text>
        {fresh > 0 ? <Badge label={`${fresh} new`} tone="warning" /> : null}
      </View>
      <Text style={s.routeBig}>{`${doneLive.length} of ${all.length} stops done`}</Text>
      <View style={s.bar}>
        <View style={[s.barFill, { width: `${pct}%` }]} />
      </View>
      <Text style={s.meta}>
        {[`${orders} order${orders === 1 ? '' : 's'}`, load ? `${load} to collect` : '']
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Card>
  );
}

export function StopList({
  todo,
  done,
  doneLive,
  fresh,
  onOpen,
}: {
  todo: Stop[];
  done: Stop[];
  doneLive: Stop[];
  fresh: Set<string>;
  onOpen: (key: string) => void;
}) {
  const s = useThemedStyles(styles);
  const earlier = done.filter((x) => !doneLive.includes(x));
  const route = [...doneLive, ...todo];
  return (
    <View style={s.list}>
      {route.length === 0 ? (
        <Empty
          icon="package"
          title="No stops right now"
          hint="Paid orders near you are assigned here while your location is on."
        />
      ) : (
        <>
          <RouteHeader
            todo={todo}
            doneLive={doneLive}
            fresh={todo.filter((x) => fresh.has(x.key)).length}
          />
          <View>
            {route.map((x, i) => (
              <StopRow
                key={x.key}
                n={i + 1}
                stop={x}
                now={x === todo[0]}
                fresh={fresh.has(x.key)}
                last={i === route.length - 1}
                onPress={() => onOpen(x.key)}
              />
            ))}
          </View>
        </>
      )}
      {earlier.length > 0 ? (
        <>
          <SectionLabel text={`Earlier · ${earlier.length}`} />
          {earlier.map((x, i) => (
            <StopRow key={x.key} n={i + 1} stop={x} last onPress={() => onOpen(x.key)} />
          ))}
        </>
      ) : null}
    </View>
  );
}

/** Home's main card: where to go next, how far, what to pick up or hand over, and the two buttons that matter. */
export function NextStop({
  stop,
  index,
  total,
  path,
  onArrived,
}: {
  stop: Stop;
  index: number;
  total: number;
  path: DrivePath | null;
  onArrived: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const leg = legText(path?.legs[0]);
  const shown = stop.lines.slice(0, 4);
  const orderCount = new Set(stop.lines.map((l) => l.orderId)).size;
  return (
    <Card style={s.next}>
      <View style={s.nextTop}>
        <View style={s.nextBadge}>
          <Text style={s.nextNum}>{index}</Text>
        </View>
        <View style={s.rowText}>
          <Text
            style={s.eyebrow}
          >{`${kindLabel(stop)} · stop ${index} of ${total}${orderCount > 1 ? ` · ${orderCount} orders` : ''}`}</Text>
          <Text style={s.nextTitle} numberOfLines={2}>
            {stop.name}
          </Text>
        </View>
      </View>
      {stop.place ? <Text style={s.metaLg}>{stop.place}</Text> : null}
      {leg || stop.eta ? (
        <View style={s.chips}>
          {leg ? (
            <View style={s.chip}>
              <Icon name="pin" size={14} color={colors.brandInk} />
              <Text style={s.chipText}>{leg}</Text>
            </View>
          ) : null}
          {stop.eta ? (
            <View style={s.chip}>
              <Text style={s.chipText}>{clock(stop.eta)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={s.items}>
        {shown.map((l) => (
          <Text key={l.stopId} style={s.item}>
            {holds(l)}
          </Text>
        ))}
        {stop.lines.length > shown.length ? (
          <Text style={s.meta}>{`+ ${stop.lines.length - shown.length} more`}</Text>
        ) : null}
      </View>
      <View style={s.nextActions}>
        {placed(stop.lat, stop.lng) ? (
          <Button
            size="lg"
            icon="pin"
            label="Navigate"
            style={s.grow}
            onPress={() => openMaps(stop.lat, stop.lng)}
          />
        ) : null}
        <Button
          size="lg"
          variant={placed(stop.lat, stop.lng) ? 'tonal' : 'primary'}
          icon="check"
          label={stop.kind === 'pickup' ? "I'm at the farm" : "I've arrived"}
          style={s.grow}
          onPress={onArrived}
        />
      </View>
      {stop.phone ? (
        <Button
          size="sm"
          variant="ghost"
          icon="phone"
          label={stop.kind === 'pickup' ? 'Call farmer' : 'Call buyer'}
          onPress={() => openPhone(stop.phone)}
          style={s.callBtn}
        />
      ) : null}
    </Card>
  );
}

/** One screen for a stop: who and where, what is on it, and the form that completes it. */
export function StopPage({
  stop,
  next,
  range,
  backLabel,
  onBack,
  onChange,
  onFinished,
}: {
  stop: Stop;
  next: Stop | null;
  range: { min: number | null; max: number | null };
  backLabel: string;
  onBack: () => void;
  onChange: () => Promise<void>;
  onFinished: (f: FinishedStop) => void;
}) {
  const s = useThemedStyles(styles);
  const done = stop.state === 'done';
  const orders = new Set(stop.lines.map((l) => l.orderId)).size;
  return (
    <View style={s.list}>
      <BackButton label={backLabel} onPress={onBack} />
      <Card style={s.head}>
        <View style={s.headTop}>
          <Badge label={kindLabel(stop)} tone={stop.kind === 'pickup' ? 'info' : 'success'} />
          {done ? <Badge label="Done" tone="success" /> : null}
        </View>
        <Text style={s.title}>{stop.name}</Text>
        <Text style={s.metaLg}>{stop.place || 'Address not set'}</Text>
        {orders > 1 ? <Text style={s.meta}>{`${orders} orders at this stop`}</Text> : null}
        <QuickActions
          items={[
            ...(stop.phone
              ? [
                  {
                    icon: 'phone' as const,
                    label: stop.kind === 'pickup' ? 'Call farmer' : 'Call buyer',
                    onPress: () => openPhone(stop.phone),
                  },
                ]
              : []),
            ...(placed(stop.lat, stop.lng)
              ? [
                  {
                    icon: 'pin' as const,
                    label: 'Navigate',
                    onPress: () => openMaps(stop.lat, stop.lng),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      {done ? (
        <StopSummary stop={stop} onBack={onBack} backLabel={backLabel} />
      ) : (
        <StopFlow
          stop={stop}
          next={next}
          range={range}
          onChange={onChange}
          onFinished={onFinished}
        />
      )}
    </View>
  );
}

function StopSummary({
  stop,
  onBack,
  backLabel,
}: {
  stop: Stop;
  onBack: () => void;
  backLabel: string;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Card style={s.form}>
      <View style={s.headTop}>
        <Icon name="check" size={22} color={colors.brandInk} />
        <Text style={s.formTitle}>Completed</Text>
      </View>
      {stop.lines.map((l) => (
        <Text key={l.stopId} style={s.item}>
          {l.pickup
            ? `${l.label} · ${l.recordedKg ?? l.qty} ${l.unit} collected`
            : `Order ${l.orderCode} delivered · ${l.items.map((i) => i.product).join(', ')}`}
        </Text>
      ))}
      <Text style={s.meta}>
        {stop.temperatureC == null
          ? 'No temperature recorded'
          : `${stop.temperatureC} °C on record`}
      </Text>
      {stop.note ? <Text style={s.meta}>{stop.note}</Text> : null}
      {stop.mediaUrl ? <MediaPreview uri={stop.mediaUrl} kind={stop.mediaKind ?? 'photo'} /> : null}
      <Button label={backLabel} variant="tonal" onPress={onBack} />
    </Card>
  );
}

/** Shown right after a stop is confirmed: the next stop is one tap away, so the driver never goes back to a list. */
export function StopDone({
  done,
  onNext,
  onHome,
}: {
  done: FinishedStop;
  onNext: (key: string) => void;
  onHome: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [pop] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [pop]);
  const { stop, next } = done;
  const total = totalText(stop.lines.map((l) => ({ qty: l.pickup ? l.qty : null, unit: l.unit })));
  return (
    <View style={s.list}>
      <Card style={s.doneCard}>
        <Animated.View style={[s.doneMark, { transform: [{ scale: pop }] }]}>
          <Icon name="check" size={36} color={colors.onBrand} strokeWidth={3} />
        </Animated.View>
        <Text style={s.title}>{stop.kind === 'pickup' ? 'Pickup complete' : 'Delivered'}</Text>
        <Text style={s.metaLg}>
          {stop.kind === 'pickup' && total ? `${total} from ${stop.name}` : stop.name}
        </Text>
      </Card>
      {next ? (
        <Card style={s.next}>
          <Text style={s.eyebrow}>{`Next stop · ${kindLabel(next)}`}</Text>
          <Text style={s.nextTitle}>{next.name}</Text>
          {next.place ? <Text style={s.metaLg}>{next.place}</Text> : null}
          <Button
            size="lg"
            icon="arrowRight"
            label="Go to next stop"
            onPress={() => onNext(next.key)}
          />
          {placed(next.lat, next.lng) ? (
            <Button
              variant="tonal"
              icon="pin"
              label="Navigate there"
              onPress={() => openMaps(next.lat, next.lng)}
            />
          ) : null}
        </Card>
      ) : (
        <Card style={s.next}>
          <Text style={s.nextTitle}>That was your last stop</Text>
          <Text style={s.metaLg}>
            You have no stops left. New ones appear here when they are assigned.
          </Text>
          <Button size="lg" label="Back to home" onPress={onHome} />
        </Card>
      )}
      {next ? <Button variant="ghost" label="Back to home" onPress={onHome} /> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  muted: { color: c.inkMuted },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  metaLg: { fontFamily: fonts.sansMedium, fontSize: 16, lineHeight: 22, color: c.inkMuted },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: c.ink,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 72,
    padding: 14,
    backgroundColor: c.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.borderSubtle,
  },
  rowNow: { borderColor: c.brand600, borderWidth: 2 },
  railRow: { flexDirection: 'row' as const, gap: 12 },
  rail: { width: 32, alignItems: 'center' as const },
  node: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
  },
  nodePick: { backgroundColor: c.brandTint, borderColor: c.brand600 },
  nodeDrop: { backgroundColor: c.harvestTint, borderColor: c.harvestFill },
  nodeDone: { backgroundColor: c.brand600, borderColor: c.brand600 },
  nodeN: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  nodeNDrop: { color: c.harvestInk },
  line: { flex: 1, width: 2, marginVertical: 4, backgroundColor: c.borderSubtle },
  lineDone: { backgroundColor: c.brand600 },
  stopCard: {
    flex: 1,
    gap: 4,
    padding: 14,
    marginBottom: 12,
    backgroundColor: c.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.borderSubtle,
  },
  stopTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  kind: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: c.inkMuted,
  },
  when: { marginLeft: 'auto' as const, fontFamily: fonts.sansBold, fontSize: 13, color: c.ink },
  holds: { gap: 2, marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  holdLine: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: c.ink },
  route: { gap: 8, padding: 18 },
  routeTitle: { fontFamily: fonts.sansBold, fontSize: 13, color: c.brandInk },
  routeBig: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: c.ink },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.surfaceSunken,
    overflow: 'hidden' as const,
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: c.brand600 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  next: { gap: 12, padding: 20 },
  nextTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  nextBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand600,
  },
  nextNum: { fontFamily: fonts.heading, fontSize: 24, color: c.onBrand },
  eyebrow: { fontFamily: fonts.sansBold, fontSize: 13, color: c.brandInk },
  nextTitle: {
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: c.ink,
  },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: c.brandTint,
  },
  chipText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  items: { gap: 4, paddingVertical: 4 },
  item: { fontFamily: fonts.sansBold, fontSize: 16, lineHeight: 22, color: c.ink },
  nextActions: { flexDirection: 'row' as const, gap: 10 },
  grow: { flex: 1 },
  callBtn: { alignSelf: 'flex-start' as const },
  steps: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  stepsTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  step: { flexDirection: 'row' as const, gap: 10 },
  stepN: { width: 20, fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  stepText: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 20,
    color: c.inkMuted,
  },
  head: { gap: 8, padding: 20 },
  headTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  form: { gap: 14, padding: 20 },
  formTitle: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: c.ink },
  lineBox: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: c.surfaceSunken },
  lineTop: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  fill: {
    alignSelf: 'flex-start' as const,
    minHeight: 44,
    justifyContent: 'center' as const,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: c.brandTint,
  },
  fillText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  thumb: { width: 160, height: 160, borderRadius: 14, backgroundColor: c.surfaceSunken },
  doneCard: { alignItems: 'center' as const, gap: 10, padding: 28 },
  doneMark: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand600,
  },
});
