import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { reorderStops, unlockRoute } from '../../../services/ops.control.service';
import { LiveMap, type LivePlace } from '../../../components/location/LiveMap';
import { decodePolyline } from '../../../utils/polyline';
import { Banner } from '../../../components/feedback';
import { replanRoutes, type DriverRoute } from '../../../services/ops.fulfilment.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty, Hero, SectionTitle, when } from './OpsBits';
import { useAction } from './useAction';

const FRESH_MS = 30 * 60 * 1000;
const online = (d: DriverRoute) => Boolean(d.seenAt) && Date.now() - new Date(d.seenAt!).getTime() < FRESH_MS;
// A truck on a trip should report every 30 seconds; 10 minutes of silence is worth flagging.
const SIGNAL_MS = 10 * 60 * 1000;
const noSignal = (d: DriverRoute) => d.stops.some((x) => x.state === 'pending') && (!d.seenAt || Date.now() - new Date(d.seenAt).getTime() > SIGNAL_MS);
const ALL = 'All trucks';

/** Each driver's last reported position and their route, built and re-sequenced by the system as orders change. */
export function RoutesPanel({ drivers, onChange }: { drivers: DriverRoute[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const live = drivers.filter(online);
  const pending = drivers.reduce((n, d) => n + d.stops.filter((x) => x.state === 'pending').length, 0);
  const onRoad = drivers.filter((d) => d.stops.some((x) => x.state === 'pending'));
  const [focus, setFocus] = useState(ALL);
  // The driver whose stops are being reordered, with the order being built.
  const [editing, setEditing] = useState<{ driver: string; ids: string[] } | null>(null);
  const [reason, setReason] = useState('');
  const move = (i: number, by: number) => setEditing((e) => {
    if (!e) return e;
    const ids = [...e.ids];
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    return { ...e, ids };
  });
  const shown = onRoad.filter((d) => focus === ALL || d.name === focus);
  const map = {
    // One truck at a time for its truck marker; the shared map shows every truck's stops and roads.
    truck: shown.length === 1 && shown[0].lat != null ? { lat: shown[0].lat, lng: shown[0].lng! } : null,
    places: shown.flatMap((d) => d.stops.filter((x) => x.state === 'pending').map((x): LivePlace => ({ lat: x.lat, lng: x.lng, label: `${d.name}: ${x.seq ?? ''} ${x.label}`, kind: x.kind }))),
    route: shown.length === 1 ? shown[0].stops.filter((x) => x.state === 'pending').sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).flatMap((x) => (x.legPolyline ? decodePolyline(x.legPolyline) : [])) : [],
    trail: shown.length === 1 ? shown[0].trail : [],
  };

  if (drivers.length === 0) return <Empty icon="truck" title="No drivers yet" hint="Invite drivers from Team. Once they open the app and share their location, orders are routed to them automatically." />;
  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Hero label="Drivers reporting" value={`${live.length} of ${drivers.length}`} cells={[{ label: 'Stops pending', value: String(pending) }]} />
      {onRoad.length > 0 ? (
        <Card style={s.item}>
          <SectionTitle title="Live map" note={`${onRoad.length} on the road`} />
          {onRoad.length > 1 ? <ChoiceChips label="Show" options={[ALL, ...onRoad.map((d) => d.name)]} value={focus} onChange={setFocus} /> : null}
          <LiveMap truck={map.truck} places={map.places} route={map.route} trail={map.trail} height={360} />
          <Text style={s.meta}>{shown.length === 1 ? 'Blue: the road ahead. Grey: the road driven in the last 12 hours.' : 'Pick a truck to see its position, the road ahead and the road it has driven.'}</Text>
          {onRoad.filter(noSignal).map((d) => <Banner key={d.id} text={`No signal from ${d.name} for over 10 minutes${d.seenAt ? ` (last ${when(d.seenAt)})` : ''}.`} />)}
        </Card>
      ) : null}
      <Button size="sm" variant="outline" label="Re-plan all routes" loading={busy} onPress={() => run(replanRoutes)} />
      {drivers.map((d) => {
        const todo = d.stops.filter((x) => x.state === 'pending');
        return (
          <Card key={d.id} style={s.item}>
            <View style={s.top}>
              <View style={s.grow}>
                <Text style={s.name}>{d.name}</Text>
                <Text style={s.meta}>{[d.vehicle, d.phone].filter(Boolean).join(' · ') || 'No vehicle details'}</Text>
              </View>
              <Badge label={noSignal(d) ? 'No signal' : online(d) ? 'Reporting' : d.seenAt ? 'Offline' : 'Never seen'} tone={noSignal(d) ? 'warning' : online(d) ? 'success' : 'neutral'} />
            </View>
            <Text style={s.meta}>{d.lat != null ? `Last seen ${when(d.seenAt)} · ${d.lat.toFixed(4)}, ${d.lng!.toFixed(4)}` : 'Has not shared a location.'}</Text>
            <SectionTitle title="Route" note={`${todo.length} pending${d.routeLocked ? ' · order set by ops' : ''}`} />
            {editing?.driver === d.id ? (
              <View style={s.edit}>
                {editing.ids.map((id, i) => {
                  const x = todo.find((t) => t.id === id)!;
                  return (
                    <View key={id} style={s.row}>
                      <Text style={s.stop} numberOfLines={2}>{i + 1}. {x.label} · {x.order}</Text>
                      <Button size="sm" variant="ghost" label="Up" disabled={i === 0} onPress={() => move(i, -1)} />
                      <Button size="sm" variant="ghost" label="Down" disabled={i === editing.ids.length - 1} onPress={() => move(i, 1)} />
                    </View>
                  );
                })}
                <Input label="Reason" value={reason} onChangeText={setReason} maxLength={280} placeholder="e.g. Buyer closes at noon" />
                <View style={s.row}>
                  <Button size="sm" label="Save this order" loading={busy} disabled={!reason.trim()}
                    onPress={() => run(async () => { await reorderStops(d.id, editing.ids, reason); setEditing(null); setReason(''); })} />
                  <Button size="sm" variant="ghost" label="Cancel" onPress={() => setEditing(null)} />
                </View>
                <Text style={s.meta}>The system keeps this order until the trip ends. New orders are added at the end.</Text>
              </View>
            ) : todo.length > 1 || d.routeLocked ? (
              <View style={s.actionsRow}>
                {todo.length > 1 ? <Button size="sm" variant="outline" label="Change stop order" onPress={() => setEditing({ driver: d.id, ids: [...todo].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).map((t) => t.id) })} /> : null}
                {d.routeLocked ? <Button size="sm" variant="ghost" label="Let the system order it" loading={busy} onPress={() => run(() => unlockRoute(d.id, 'Handed back to automatic planning'))} /> : null}
              </View>
            ) : null}
            {d.stops.length === 0 ? <Text style={s.meta}>No stops. New orders are assigned automatically.</Text> : d.stops.map((x) => (
              <View key={x.id} style={s.row}>
                <View style={s.grow}>
                  <Text style={[s.stop, x.state === 'done' && s.done]} numberOfLines={2}>{x.seq ? `${x.seq}. ` : ''}{x.label} · {x.order}{x.state === 'pending' && x.eta ? ` · ~${new Date(x.eta).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}` : ''}</Text>
                  {x.reading ? <Text style={s.meta}>{x.reading}</Text> : null}
                </View>
                <Badge label={x.state === 'done' ? 'Done' : x.kind} tone={x.state === 'done' ? 'success' : 'neutral'} />
              </View>
            ))}
          </Card>
        );
      })}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 8, padding: 16 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10 },
  grow: { flex: 1, gap: 2 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  stop: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  done: { color: c.inkMuted, textDecorationLine: 'line-through' as const },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  edit: { gap: 8 },
  actionsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
});
