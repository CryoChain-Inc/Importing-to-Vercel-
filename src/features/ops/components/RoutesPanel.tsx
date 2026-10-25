import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { replanRoutes, type DriverRoute } from '../../../services/ops.fulfilment.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty, Hero, SectionTitle, when } from './OpsBits';
import { useAction } from './useAction';

const FRESH_MS = 30 * 60 * 1000;
const online = (d: DriverRoute) => Boolean(d.seenAt) && Date.now() - new Date(d.seenAt!).getTime() < FRESH_MS;

/** Each driver's last reported position and their route, built and re-sequenced by the system as orders change. */
export function RoutesPanel({ drivers, onChange }: { drivers: DriverRoute[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const live = drivers.filter(online);
  const pending = drivers.reduce((n, d) => n + d.stops.filter((x) => x.state === 'pending').length, 0);

  if (drivers.length === 0) return <Empty icon="truck" title="No drivers yet" hint="Invite drivers from Team. Once they open the app and share their location, orders are routed to them automatically." />;
  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Hero label="Drivers reporting" value={`${live.length} of ${drivers.length}`} cells={[{ label: 'Stops pending', value: String(pending) }]} />
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
              <Badge label={online(d) ? 'Reporting' : d.seenAt ? 'Offline' : 'Never seen'} tone={online(d) ? 'success' : 'neutral'} />
            </View>
            <Text style={s.meta}>{d.lat != null ? `Last seen ${when(d.seenAt)} · ${d.lat.toFixed(4)}, ${d.lng!.toFixed(4)}` : 'Has not shared a location.'}</Text>
            <SectionTitle title="Route" note={`${todo.length} pending`} />
            {d.stops.length === 0 ? <Text style={s.meta}>No stops. New orders are assigned automatically.</Text> : d.stops.map((x) => (
              <View key={x.id} style={s.row}>
                <Text style={[s.stop, x.state === 'done' && s.done]} numberOfLines={2}>{x.seq ? `${x.seq}. ` : ''}{x.label} · {x.order}</Text>
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
});
