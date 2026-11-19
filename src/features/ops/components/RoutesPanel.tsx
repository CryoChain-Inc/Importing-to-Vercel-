import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { reorderStops, unlockRoute } from '../../../services/ops.control.service';
import { LiveMap, type LivePlace } from '../../../components/location/LiveMap';
import { decodePolyline } from '../../../utils/polyline';
import { Banner, Pulse, Reveal } from '../../../components/feedback';
import { replanRoutes, type DriverRoute } from '../../../services/ops.fulfilment.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty, Meter, SectionTitle, Stat, StatGrid, when } from './OpsBits';
import { useAction } from './useAction';

const FRESH_MS = 30 * 60 * 1000;
const online = (d: DriverRoute) =>
  Boolean(d.seenAt) && Date.now() - new Date(d.seenAt!).getTime() < FRESH_MS;
// A truck on a trip should report every 30 seconds; 10 minutes of silence is worth flagging.
const SIGNAL_MS = 10 * 60 * 1000;
const noSignal = (d: DriverRoute) =>
  d.stops.some((x) => x.state === 'pending') &&
  (!d.seenAt || Date.now() - new Date(d.seenAt).getTime() > SIGNAL_MS);
const ALL = 'All trucks';
const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }) : '';
const sameDay = (iso: string | null) =>
  !iso || new Date(iso).toDateString() === new Date().toDateString();

type RouteStop = DriverRoute['stops'][number];
interface Place {
  key: string;
  kind: RouteStop['kind'];
  label: string;
  seq: number | null;
  eta: string | null;
  done: boolean;
  orders: string[];
  readings: string[];
}
/** One physical stop: lines of the same farm or buyer that sit next to each other in the route. */
const places = (stops: RouteStop[]): Place[] =>
  [...stops]
    .sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999))
    .reduce<Place[]>((acc, x) => {
      const p = acc[acc.length - 1];
      if (p && p.kind === x.kind && p.label === x.label) {
        p.orders.push(x.order);
        p.done = p.done && x.state === 'done';
        if (x.reading) p.readings.push(x.reading);
        return acc;
      }
      acc.push({
        key: x.id,
        kind: x.kind,
        label: x.label,
        seq: x.seq,
        eta: x.eta,
        done: x.state === 'done',
        orders: [x.order],
        readings: x.reading ? [x.reading] : [],
      });
      return acc;
    }, []);

function Timeline({ items }: { items: Place[] }) {
  const s = useThemedStyles(styles);
  return (
    <View>
      {items.map((p, i) => (
        <View key={p.key} style={s.railRow}>
          <View style={s.rail}>
            <View style={[s.node, p.kind === 'dropoff' ? s.nodeDrop : s.nodePick, p.done ? s.nodeDone : null]}>
              <Text style={s.nodeN}>{p.done ? '✓' : (p.seq ?? i + 1)}</Text>
            </View>
            {i < items.length - 1 ? <View style={[s.rule, p.done ? s.ruleDone : null]} /> : null}
          </View>
          <View style={s.place}>
            <View style={s.row}>
              <Text style={[s.stop, p.done && s.done]} numberOfLines={2}>
                {p.label}
              </Text>
              <Badge
                label={p.done ? 'Done' : p.kind === 'pickup' ? 'Pickup' : 'Delivery'}
                tone={p.done ? 'success' : 'neutral'}
              />
            </View>
            <Text style={s.meta}>
              {[`Order ${p.orders.join(', ')}`, !p.done && p.eta ? `~${clock(p.eta)}` : ''].filter(Boolean).join(' · ')}
            </Text>
            {p.readings.map((r, j) => (
              <Text key={j} style={s.meta}>
                {r}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Each driver's last reported position and their route, built and re-sequenced by the system as orders change. */
export function RoutesPanel({
  drivers,
  onChange,
}: {
  drivers: DriverRoute[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onChange);
  const live = drivers.filter(online);
  const pending = drivers.reduce(
    (n, d) => n + d.stops.filter((x) => x.state === 'pending').length,
    0,
  );
  const onRoad = drivers.filter((d) => d.stops.some((x) => x.state === 'pending'));
  const [focus, setFocus] = useState(ALL);
  // The driver whose stops are being reordered, with the order being built.
  const [editing, setEditing] = useState<{ driver: string; ids: string[] } | null>(null);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const move = (i: number, by: number) =>
    setEditing((e) => {
      if (!e) return e;
      const ids = [...e.ids];
      [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
      return { ...e, ids };
    });
  const shown = onRoad.filter((d) => focus === ALL || d.name === focus);
  const map = {
    // One truck at a time for its truck marker; the shared map shows every truck's stops and roads.
    truck:
      shown.length === 1 && shown[0].lat != null ? { lat: shown[0].lat, lng: shown[0].lng! } : null,
    places: shown.flatMap((d) =>
      d.stops
        .filter((x) => x.state === 'pending')
        .map((x): LivePlace => ({
          lat: x.lat,
          lng: x.lng,
          label: `${d.name}: ${x.seq ?? ''} ${x.label}`,
          kind: x.kind,
        })),
    ),
    route:
      shown.length === 1
        ? shown[0].stops
            .filter((x) => x.state === 'pending')
            .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
            .flatMap((x) => (x.legPolyline ? decodePolyline(x.legPolyline) : []))
        : [],
    trail: shown.length === 1 ? shown[0].trail : [],
  };

  if (drivers.length === 0)
    return (
      <Empty
        icon="truck"
        title="No drivers yet"
        hint="Invite drivers from Team. Once they open the app and share their location, orders are routed to them automatically."
      />
    );
  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <StatGrid>
        <Stat
          icon="truck"
          label="Drivers reporting"
          value={`${live.length} of ${drivers.length}`}
          tone={live.length ? 'brand' : undefined}
        />
        <Stat icon="pin" label="Stops pending" value={String(pending)} />
        <Stat icon="users" label="On the road" value={String(onRoad.length)} />
        <Stat
          icon="alert"
          label="No signal"
          value={String(onRoad.filter(noSignal).length)}
          tone={onRoad.some(noSignal) ? 'danger' : undefined}
          note="Silent for 10+ minutes"
        />
      </StatGrid>
      {onRoad.length > 0 ? (
        <Card style={s.item}>
          <SectionTitle title="Live map" note={`${onRoad.length} on the road`} />
          {onRoad.length > 1 ? (
            <ChoiceChips
              label="Show"
              options={[ALL, ...onRoad.map((d) => d.name)]}
              value={focus}
              onChange={setFocus}
            />
          ) : null}
          <LiveMap
            truck={map.truck}
            places={map.places}
            route={map.route}
            trail={map.trail}
            height={360}
          />
          <Text style={s.meta}>
            {shown.length === 1
              ? 'Blue: the road ahead. Grey: the road driven in the last 12 hours.'
              : 'Pick a truck to see its position, the road ahead and the road it has driven.'}
          </Text>
          {onRoad.filter(noSignal).map((d) => (
            <Banner
              key={d.id}
              text={`No signal from ${d.name} for over 10 minutes${d.seenAt ? ` (last ${when(d.seenAt)})` : ''}.`}
            />
          ))}
        </Card>
      ) : null}
      <View style={s.top}>
        <View style={s.grow}>
          <SectionTitle title="Drivers" note="One card per driver with today's route." />
        </View>
        <Button
          size="sm"
          variant="outline"
          label="Re-plan all routes"
          loading={busy}
          onPress={() => run(replanRoutes)}
        />
      </View>
      <View style={s.grid}>
      {drivers.map((d, di) => {
        const todo = d.stops.filter((x) => x.state === 'pending');
        // A day's route is what is pending plus what was finished today; older stops are history.
        const today = d.stops.filter((x) => x.state === 'pending' || sameDay(x.doneAt));
        const earlier = d.stops.filter((x) => !today.includes(x));
        const todayDone = today.filter((x) => x.state === 'done').length;
        return (
          <Reveal key={d.id} index={di} style={s.cell}>
          <Card style={s.item}>
            <View style={s.top}>
              <View style={s.avatarBox}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{(d.name || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
                {online(d) && !noSignal(d) ? (
                  <View style={s.dotBox}>
                    <Pulse color={colors.brand500} size={12} />
                    <View style={s.dot} />
                  </View>
                ) : null}
              </View>
              <View style={s.grow}>
                <Text style={s.name}>{d.name}</Text>
                <Text style={s.meta}>
                  {[d.vehicle, d.phone].filter(Boolean).join(' · ') || 'No vehicle details'}
                </Text>
              </View>
              <Badge
                label={
                  noSignal(d)
                    ? 'No signal'
                    : online(d)
                      ? 'Reporting'
                      : d.seenAt
                        ? 'Offline'
                        : 'Never seen'
                }
                tone={noSignal(d) ? 'warning' : online(d) ? 'success' : 'neutral'}
              />
            </View>
            <View style={s.seen}>
              <Icon name="pin" size={14} color={colors.inkMuted} />
              <Text style={[s.meta, s.grow]}>
                {d.lat != null
                  ? `Last seen ${when(d.seenAt)} · ${d.lat.toFixed(4)}, ${d.lng!.toFixed(4)}`
                  : 'Has not shared a location.'}
              </Text>
            </View>
            <SectionTitle
              title="Route"
              note={`${todo.length} pending${d.routeLocked ? ' · order set by ops' : ''}`}
            />
            {editing?.driver === d.id ? (
              <View style={s.edit}>
                {editing.ids.map((id, i) => {
                  const x = todo.find((t) => t.id === id)!;
                  return (
                    <View key={id} style={s.row}>
                      <Text style={s.stop} numberOfLines={2}>
                        {i + 1}. {x.label} · {x.order}
                      </Text>
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Up"
                        disabled={i === 0}
                        onPress={() => move(i, -1)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Down"
                        disabled={i === editing.ids.length - 1}
                        onPress={() => move(i, 1)}
                      />
                    </View>
                  );
                })}
                <Input
                  label="Reason"
                  value={reason}
                  onChangeText={setReason}
                  maxLength={280}
                  placeholder="e.g. Buyer closes at noon"
                />
                <View style={s.row}>
                  <Button
                    size="sm"
                    label="Save this order"
                    loading={busy}
                    disabled={!reason.trim()}
                    onPress={() =>
                      run(async () => {
                        await reorderStops(d.id, editing.ids, reason);
                        setEditing(null);
                        setReason('');
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    label="Cancel"
                    onPress={() => setEditing(null)}
                  />
                </View>
                <Text style={s.meta}>
                  The system keeps this order until the trip ends. New orders are added at the end.
                </Text>
              </View>
            ) : todo.length > 1 || d.routeLocked ? (
              <View style={s.actionsRow}>
                {todo.length > 1 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    label="Change stop order"
                    onPress={() =>
                      setEditing({
                        driver: d.id,
                        ids: [...todo].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).map((t) => t.id),
                      })
                    }
                  />
                ) : null}
                {d.routeLocked ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    label="Let the system order it"
                    loading={busy}
                    onPress={() =>
                      run(() => unlockRoute(d.id, 'Handed back to automatic planning'))
                    }
                  />
                ) : null}
              </View>
            ) : null}
            {d.stops.length === 0 ? (
              <Text style={s.meta}>No stops. New orders are assigned automatically.</Text>
            ) : (
              <>
                <Meter pct={(todayDone / Math.max(today.length, 1)) * 100} />
                <Text style={s.meta}>
                  {`${todayDone} of ${today.length} stops done today · ${new Set(today.map((x) => x.order)).size} orders`}
                </Text>
                <Timeline items={places(today)} />
                {earlier.length > 0 ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      label={
                        open.has(d.id)
                          ? 'Hide earlier stops'
                          : `Show earlier stops · ${earlier.length}`
                      }
                      onPress={() =>
                        setOpen((o) => {
                          const n = new Set(o);
                          if (!n.delete(d.id)) n.add(d.id);
                          return n;
                        })
                      }
                    />
                    {open.has(d.id) ? <Timeline items={places(earlier)} /> : null}
                  </>
                ) : null}
              </>
            )}
          </Card>
          </Reveal>
        );
      })}
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 16 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 16, alignItems: 'flex-start' as const },
  cell: { flexGrow: 1, flexBasis: 420, minWidth: 280 },
  item: { gap: 10, padding: 18 },
  avatarBox: { width: 44, height: 44 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  avatarText: { fontFamily: fonts.sansBold, fontSize: 18, color: c.brandInk },
  dotBox: {
    position: 'absolute' as const,
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: c.brand500,
    borderWidth: 2,
    borderColor: c.surfaceCard,
  },
  seen: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  top: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  grow: { flex: 1, gap: 2 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  stop: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  done: { color: c.inkMuted, textDecorationLine: 'line-through' as const },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  edit: { gap: 8 },
  bar: { height: 8, borderRadius: 4, backgroundColor: c.surfaceSunken, overflow: 'hidden' as const },
  barFill: { height: 8, borderRadius: 4, backgroundColor: c.brand600 },
  railRow: { flexDirection: 'row' as const, gap: 12 },
  rail: { width: 28, alignItems: 'center' as const },
  node: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
  },
  nodePick: { backgroundColor: c.brandTint, borderColor: c.brand600 },
  nodeDrop: { backgroundColor: c.harvestTint, borderColor: c.harvestFill },
  nodeDone: { backgroundColor: c.brand600, borderColor: c.brand600 },
  nodeN: { fontFamily: fonts.sansBold, fontSize: 12, color: c.ink },
  rule: { flex: 1, width: 2, marginVertical: 3, backgroundColor: c.borderSubtle },
  ruleDone: { backgroundColor: c.brand600 },
  place: { flex: 1, gap: 2, paddingBottom: 14 },
  actionsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
});
