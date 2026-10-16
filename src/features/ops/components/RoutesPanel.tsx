import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  cancelRoute, fetchPaidLots, fetchRoutes, planRoute,
  type PaidLot, type PlannedRoute, type SupplyRow, type TeamMember,
} from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { accraToday, fmtWindow } from '../../../utils/format';
import { MultiChips } from './MultiChips';
import { useAction } from './useAction';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
type Win = { start: string; end: string };
const PICKUP: Win = { start: '06:00', end: '10:00' };
const ARRIVAL: Win = { start: '12:00', end: '16:00' };
const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 0 })} kg`;

/** Plan a route for paid lots: pickup windows per collection point, an arrival window per buyer. */
export function RoutesPanel({ team, supply, onChange }: { team: TeamMember[]; supply: SupplyRow[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [routes, setRoutes] = useState<PlannedRoute[]>([]);
  const [paid, setPaid] = useState<PaidLot[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setRoutes(await fetchRoutes());
      setPaid(await fetchPaidLots());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load routes.');
    }
  }, []);
  const refresh = useCallback(async () => {
    await onChange();
    await reload();
  }, [onChange, reload]);
  const { busy, error, run } = useAction(refresh);
  useEffect(() => {
    Promise.all([fetchRoutes(), fetchPaidLots()]).then(
      ([r, p]) => {
        setRoutes(r);
        setPaid(p);
      },
      (e) => setLoadError(e instanceof Error ? e.message : 'Could not load routes.'),
    );
  }, []);

  const agents = team.filter((m) => m.role === 'agent');
  const drivers = team.filter((m) => m.role === 'driver');
  const agentLabels = agents.map((a) => a.name || 'Unnamed agent');
  const driverLabels = drivers.map((d) => d.name || 'Unnamed driver');
  const [agentLabel, setAgentLabel] = useState('');
  const [driverLabel, setDriverLabel] = useState('');
  const [date, setDate] = useState(accraToday());
  const [picked, setPicked] = useState<string[]>([]);
  const [wins, setWins] = useState<Record<string, Win>>({});
  const agent = agents.find((a) => (a.name || 'Unnamed agent') === agentLabel) ?? agents[0];
  const driver = drivers.find((d) => (d.name || 'Unnamed driver') === driverLabel) ?? drivers[0];

  const chosen = paid.filter((l) => picked.includes(l.id));
  const stops = new Map<string, { name: string; farmers: number; kg: number }>();
  supply.filter((r) => r.lotId && picked.includes(r.lotId) && r.pointId).forEach((r) => {
    const cur = stops.get(r.pointId!) ?? { name: r.point, farmers: 0, kg: 0 };
    stops.set(r.pointId!, { name: cur.name, farmers: cur.farmers + 1, kg: cur.kg + r.weightKg });
  });
  const win = (key: string, fallback: Win): Win => wins[key] ?? fallback;
  const setWin = (key: string, fallback: Win, patch: Partial<Win>) => setWins({ ...wins, [key]: { ...win(key, fallback), ...patch } });
  const validWin = (w: Win) => TIME.test(w.start) && TIME.test(w.end) && w.end > w.start;
  const ready =
    Boolean(agent && driver) && /^\d{4}-\d{2}-\d{2}$/.test(date) && chosen.length > 0 && stops.size > 0 &&
    [...stops.keys()].every((id) => validWin(win(id, PICKUP))) && chosen.every((l) => validWin(win(l.id, ARRIVAL)));

  return (
    <View style={s.list}>
      {error || loadError ? <Banner text={error || loadError || ''} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>Plan a route</Text>
        <Text style={s.meta}>Only paid lots can be routed. One truck can collect several lots and deliver each to its own buyer.</Text>
        {agents.length && drivers.length && paid.length ? (
          <>
            <Input label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder={accraToday()} />
            <ChoiceChips label="Field agent" options={agentLabels} value={agent?.name || agentLabel} onChange={setAgentLabel} />
            <ChoiceChips label="Driver" options={driverLabels} value={driver?.name || driverLabel} onChange={setDriverLabel} />
            <MultiChips
              label="Paid lots"
              options={paid.map((l) => ({ key: l.id, label: `${l.code} · ${l.product} · ${kg(l.totalKg)} → ${l.buyer}` }))}
              value={picked}
              onChange={setPicked}
            />
            {stops.size ? (
              <View style={s.group}>
                <Text style={s.name}>Pickup windows (sent to the farmers)</Text>
                {[...stops].map(([id, st]) => (
                  <WindowFields key={id} label={`${st.name} · ${st.farmers} farmer${st.farmers === 1 ? '' : 's'}, ${kg(st.kg)}`} value={win(id, PICKUP)} onChange={(p) => setWin(id, PICKUP, p)} />
                ))}
                <Text style={s.name}>Buyer arrival windows</Text>
                {chosen.map((l) => (
                  <WindowFields key={l.id} label={`${l.code} → ${l.buyer}${l.location ? `, ${l.location}` : ''}`} value={win(l.id, ARRIVAL)} onChange={(p) => setWin(l.id, ARRIVAL, p)} />
                ))}
                <Text style={s.meta}>Times are Ghana time, 24-hour. Stops run in the order of their pickup windows.</Text>
              </View>
            ) : null}
            <Button
              label="Plan route"
              loading={busy}
              disabled={!ready}
              onPress={() =>
                run(async () => {
                  await planRoute({
                    date,
                    agentId: agent!.id,
                    driverId: driver!.id,
                    stops: [...stops.keys()].map((pointId) => ({ pointId, ...win(pointId, PICKUP) })),
                    lots: chosen.map((l) => ({ lotId: l.id, ...win(l.id, ARRIVAL) })),
                  });
                  setPicked([]);
                  setWins({});
                })
              }
            />
          </>
        ) : (
          <Text style={s.meta}>
            {!agents.length || !drivers.length
              ? 'Invite a field agent and a driver from Team before planning a route.'
              : 'No paid lots waiting. A lot appears here once its buyer has paid.'}
          </Text>
        )}
      </Card>

      {routes.length === 0 ? (
        <Text style={s.meta}>No routes planned.</Text>
      ) : (
        routes.map((route) => (
          <Card key={route.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name}>{route.date} · {route.agentName}{route.driverName ? ` · ${route.driverName}` : ''}</Text>
              <Badge label={`${route.lots.length} lot${route.lots.length === 1 ? '' : 's'}`} tone="info" />
            </View>
            <Text style={s.label}>Collect</Text>
            {route.stops.map((st, i) => (
              <Text key={i} style={s.meta}>
                {i + 1}. {st.pointName}{st.locality ? ` · ${st.locality}` : ''} · {fmtWindow(st.windowStart, st.windowEnd)}{st.departed ? ' · loaded' : st.arrived ? ' · arrived' : ''}
              </Text>
            ))}
            <Text style={s.label}>Deliver</Text>
            {route.lots.map((l) => (
              <Text key={l.code} style={s.meta}>
                {l.code} · {l.product} {kg(l.kg)} → {l.buyer}{l.location ? `, ${l.location}` : ''} · {fmtWindow(l.windowStart, l.windowEnd)}{l.delivered ? ' · delivered' : ''}
              </Text>
            ))}
            {!route.started ? <Button size="sm" variant="outline" label="Cancel route" loading={busy} onPress={() => run(() => cancelRoute(route.id))} /> : null}
          </Card>
        ))
      )}
    </View>
  );
}

function WindowFields({ label, value, onChange }: { label: string; value: Win; onChange: (patch: Partial<Win>) => void }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.winRow}>
      <Text style={s.meta}>{label}</Text>
      <View style={s.times}>
        <View style={s.time}><Input label="From" value={value.start} onChangeText={(v) => onChange({ start: v })} placeholder="06:00" /></View>
        <View style={s.time}><Input label="To" value={value.end} onChangeText={(v) => onChange({ end: v })} placeholder="10:00" /></View>
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  group: { gap: 10 },
  item: { gap: 6, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  label: { fontFamily: fonts.sansBold, fontSize: 13, color: c.ink, marginTop: 4 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  winRow: { gap: 4 },
  times: { flexDirection: 'row' as const, gap: 10 },
  time: { flex: 1 },
});
