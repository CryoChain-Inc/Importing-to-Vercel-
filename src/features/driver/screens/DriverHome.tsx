import React, { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, Input, StatHero } from '../../../components/common';
import { Banner, Skeleton } from '../../../components/feedback';
import { FieldShell, FieldSkeleton } from '../../../components/layout/FieldShell';
import {
  arriveStop, completeLotDelivery, departStop, fetchDeliveryPhotos, fetchDriverRoute, fetchStopCaptures, logTemperature,
  type DriverDelivery, type DriverRoute, type DriverStop, type StopCapture,
} from '../../../services/driver.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { fmtWindow } from '../../../utils/format';
import { takePhoto, type Photo } from '../../../utils/photo';

type Screen = { name: 'route' } | { name: 'stop'; stopId: string } | { name: 'delivery'; lotId: string };

const kgText = (n: number) => `${Number(n).toLocaleString('en-GH', { maximumFractionDigits: 0 })} kg`;

export function DriverHome({ account }: { account: Account }) {
  const [route, setRoute] = useState<DriverRoute | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'route' });
  const [proofs, setProofs] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    try {
      setRoute(await fetchDriverRoute());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load today\'s route.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const routeId = route?.id;
  const delivered = route?.deliveries.filter((d) => d.deliveredAt).length ?? 0;
  useEffect(() => {
    if (!routeId || !delivered) return;
    let live = true;
    fetchDeliveryPhotos(routeId).then((m) => live && setProofs(m), () => {});
    return () => { live = false; };
  }, [routeId, delivered]);

  const stop = screen.name === 'stop' ? route?.stops.find((item) => item.id === screen.stopId) ?? null : null;
  const delivery = screen.name === 'delivery' ? route?.deliveries.find((item) => item.lotId === screen.lotId) ?? null : null;
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  return (
    <FieldShell name={account.name} role="Driver">
      {error ? (
        <>
          <Banner text={error} />
          {route === undefined ? <Button label="Try again" variant="outline" onPress={load} /> : null}
        </>
      ) : null}
      {route === undefined && !error ? <FieldSkeleton /> : null}

      {screen.name === 'route' && route !== undefined ? (
        <Manifest route={route} proofs={proofs} onOpen={(stopId) => setScreen({ name: 'stop', stopId })} onDeliver={(lotId) => setScreen({ name: 'delivery', lotId })} />
      ) : null}

      {screen.name === 'stop' && stop && route ? <StopVisit stop={stop} onBack={() => setScreen({ name: 'route' })} onRun={run} /> : null}
      {screen.name === 'stop' && route && !stop ? <Banner text="That stop is no longer on today's route." /> : null}

      {screen.name === 'delivery' && route && delivery ? (
        <ProofOfDelivery
          route={route}
          delivery={delivery}
          onBack={() => setScreen({ name: 'route' })}
          onDone={async () => {
            await load();
            setScreen({ name: 'route' });
          }}
        />
      ) : null}
    </FieldShell>
  );
}

function Manifest({ route, proofs, onOpen, onDeliver }: {
  route: DriverRoute | null;
  proofs: Map<string, string>;
  onOpen: (id: string) => void;
  onDeliver: (lotId: string) => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const stops = route?.stops ?? [];
  const deliveries = route?.deliveries ?? [];
  const loaded = stops.length > 0 && stops.every((stop) => stop.departedAt);
  if (stops.length === 0) {
    return (
      <Card style={s.empty}>
        <View style={s.emptyIcon}><Icon name="truck" size={22} color={colors.brandInk} /></View>
        <Text style={s.name}>No route yet</Text>
        <Text style={[s.meta, s.center]}>Operations has not assigned today's stops. Check again after they do.</Text>
      </Card>
    );
  }
  return (
    <View style={s.stack}>
      <StatHero label={route?.plate ? `To move today · vehicle ${route.plate}` : 'To move today'} value={kgText(stops.reduce((n, x) => n + x.listedKg, 0))} cells={[
        { label: 'Stops loaded', value: `${stops.filter((x) => x.departedAt).length} of ${stops.length}` },
        { label: 'Delivered', value: `${deliveries.filter((d) => d.deliveredAt).length} of ${deliveries.length}` },
      ]} />

      <NextUp stops={stops} deliveries={deliveries} loaded={loaded} onOpen={onOpen} onDeliver={onDeliver} />

      <Text style={s.section}>Collect</Text>
      <View style={s.grid}>
        {stops.map((stop, index) => (
          <Card key={stop.id} style={[s.card, s.cell]}>
            <View style={s.row}>
              <View style={s.num}><Text style={s.numText}>{index + 1}</Text></View>
              <View style={s.grow}>
                <Text style={s.name} numberOfLines={1}>{stop.pointName}</Text>
                <Text style={s.meta} numberOfLines={1}>{[fmtWindow(stop.windowStart, stop.windowEnd), stop.locality].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
            <View style={s.row}>
              <Text style={s.meta}>{stop.farmers} farmer{stop.farmers === 1 ? '' : 's'} · {kgText(stop.listedKg)}</Text>
              <Badge label={stop.departedAt ? 'Collected' : stop.arrivedAt ? 'Arrived' : stop.confirmed ? 'Ready' : 'Agent working'} tone={stop.departedAt ? 'success' : stop.arrivedAt || stop.confirmed ? 'warning' : 'neutral'} />
            </View>
            <Button label={stop.departedAt ? 'View stop' : 'Open stop'} variant={stop.departedAt ? 'outline' : 'primary'} onPress={() => onOpen(stop.id)} />
          </Card>
        ))}
      </View>

      <Text style={s.section}>Deliver</Text>
      <View style={s.grid}>
        {deliveries.map((d) => (
          <Card key={d.lotId} tone={d.deliveredAt ? 'tint' : undefined} style={[s.card, s.cell]}>
            <View style={s.row}>
              <Text style={s.name} numberOfLines={1}>{d.buyer}</Text>
              <Badge label={d.deliveredAt ? 'Delivered' : 'To deliver'} tone={d.deliveredAt ? 'success' : 'neutral'} />
            </View>
            <Text style={s.meta}>{[d.code, `${d.product} ${kgText(d.expectedKg)}`, d.location, fmtWindow(d.windowStart, d.windowEnd)].filter(Boolean).join(' · ')}</Text>
            {d.deliveredAt ? (
              <>
                <Text style={s.meta}>Received by {d.receivedBy}.</Text>
                {proofs.get(d.lotId) ? <Image source={{ uri: proofs.get(d.lotId)! }} style={s.preview} accessibilityLabel={`Delivery photo for ${d.buyer}`} /> : null}
              </>
            ) : <Button label="Deliver to this buyer" disabled={!loaded} onPress={() => onDeliver(d.lotId)} />}
          </Card>
        ))}
      </View>
      {!loaded && deliveries.some((d) => !d.deliveredAt) ? <Text style={s.meta}>Deliveries unlock once every stop is collected.</Text> : null}
    </View>
  );
}

/** The one thing to do next, so the driver never has to scan the whole list. */
function NextUp({ stops, deliveries, loaded, onOpen, onDeliver }: {
  stops: DriverStop[]; deliveries: DriverDelivery[]; loaded: boolean; onOpen: (id: string) => void; onDeliver: (id: string) => void;
}) {
  const s = useThemedStyles(styles);
  const stop = stops.find((x) => !x.departedAt);
  const drop = deliveries.find((d) => !d.deliveredAt);
  if (stop) {
    return (
      <Card tone="tint" style={s.card}>
        <Text style={s.label}>Next up</Text>
        <Text style={s.name}>Collect at {stop.pointName}</Text>
        <Text style={s.meta}>{[fmtWindow(stop.windowStart, stop.windowEnd), `${stop.farmers} farmer${stop.farmers === 1 ? '' : 's'}`, kgText(stop.listedKg)].filter(Boolean).join(' · ')}</Text>
        <Button label="Open stop" onPress={() => onOpen(stop.id)} />
      </Card>
    );
  }
  if (drop && loaded) {
    return (
      <Card tone="tint" style={s.card}>
        <Text style={s.label}>Next up</Text>
        <Text style={s.name}>Deliver to {drop.buyer}</Text>
        <Text style={s.meta}>{[drop.code, `${drop.product} ${kgText(drop.expectedKg)}`, drop.location, fmtWindow(drop.windowStart, drop.windowEnd)].filter(Boolean).join(' · ')}</Text>
        <Button label="Deliver now" onPress={() => onDeliver(drop.lotId)} />
      </Card>
    );
  }
  return (
    <Card tone="tint" style={s.card}>
      <Text style={s.label}>Next up</Text>
      <Text style={s.name}>Route complete</Text>
      <Text style={s.meta}>Every stop is collected and every lot delivered. The farmers' payments are now payable.</Text>
    </Card>
  );
}

/** What the agent weighed, graded and photographed at this stop. */
function AgentCaptures({ stopId, version }: { stopId: string; version: string }) {
  const s = useThemedStyles(styles);
  const [state, setState] = useState<{ key: string; rows?: StopCapture[]; error?: string } | null>(null);
  const key = `${stopId}|${version}`;
  useEffect(() => {
    let live = true;
    fetchStopCaptures(stopId).then(
      (rows) => live && setState({ key, rows }),
      (e) => live && setState({ key, error: e instanceof Error ? e.message : 'Could not load the captures.' }),
    );
    return () => { live = false; };
  }, [stopId, key]);

  const cur = state?.key === key ? state : null;
  if (!cur) return <View style={s.stack}><Skeleton height={64} radius={14} /><Skeleton height={64} radius={14} /></View>;
  if (cur.error) return <Text style={s.bad}>{cur.error}</Text>;
  if (!cur.rows?.length) return <Text style={s.meta}>No farmers at this stop.</Text>;
  return (
    <View style={s.stack}>
      {cur.rows.map((r) => (
        <View key={r.listingId} style={s.capture}>
          {r.photoUrl ? <Image source={{ uri: r.photoUrl }} style={s.thumb} accessibilityLabel={`${r.product} from ${r.farmer}, captured by the agent`} /> : <View style={[s.thumb, s.noThumb]}><Text style={s.meta}>No photo</Text></View>}
          <View style={s.grow}>
            <Text style={s.name} numberOfLines={1}>{r.farmer}</Text>
            <Text style={s.meta}>{r.product} · listed {kgText(r.listedKg)}</Text>
            <Text style={s.value}>{r.recordedKg == null ? 'Not weighed yet' : `${kgText(r.recordedKg)} weighed`}</Text>
          </View>
          {r.grade ? <Badge label={`Grade ${r.grade}`} tone={r.grade === 'Reject' ? 'danger' : 'success'} /> : <Badge label="Pending" tone="warning" />}
        </View>
      ))}
    </View>
  );
}

function StopVisit({ stop, onBack, onRun }: { stop: DriverStop; onBack: () => void; onRun: (fn: () => Promise<void>) => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [temp, setTemp] = useState(stop.temperatureC == null ? '' : String(stop.temperatureC));
  const [busy, setBusy] = useState(false);
  const ready = stop.confirmed && stop.farmers > 0 && stop.captured === stop.farmers;
  const canLeave = stop.temperatureC != null && ready && !stop.departedAt;
  const act = (fn: () => Promise<void>) => {
    setBusy(true);
    onRun(fn).finally(() => setBusy(false));
  };
  const celsius = Number(temp);
  const done = Boolean(stop.departedAt);

  return (
    <View style={s.stack}>
      <Button label="Today's route" variant="ghost" size="sm" icon="arrowLeft" onPress={onBack} />
      <View>
        <Text style={s.section}>{stop.pointName}</Text>
        <Text style={s.meta}>{[fmtWindow(stop.windowStart, stop.windowEnd), stop.locality, stop.products.join(', ')].filter(Boolean).join(' · ')}</Text>
      </View>

      <Steps steps={[
        { label: 'Arrived', done: Boolean(stop.arrivedAt) },
        { label: 'Temperature', done: stop.temperatureC != null },
        { label: 'Collected', done },
      ]} />

      <StatHero label="Expected load" value={kgText(stop.listedKg)} cells={[
        { label: 'Farmers', value: String(stop.farmers) },
        { label: 'Weighed by agent', value: stop.captured ? kgText(stop.capturedKg) : 'Not yet' },
      ]} />

      <View style={s.wide}>
        <View style={s.col}>
          <Text style={s.section}>Captured by the agent</Text>
          <Card style={s.card}>
            <AgentCaptures stopId={stop.id} version={`${stop.captured}|${stop.capturedKg}|${stop.confirmed}`} />
            {ready ? <Badge label="Confirmed by the agent" tone="success" /> : <Text style={s.meta}>The agent has not confirmed this stop yet. You can collect once they do.</Text>}
          </Card>
        </View>

        <View style={s.col}>
          <Text style={s.section}>Your steps</Text>
          {!stop.arrivedAt ? (
            <Card style={s.card}>
              <Text style={s.name}>Step 1 · Arrive</Text>
              <Text style={s.meta}>Confirm your arrival when you reach the point. That timestamp starts the custody record for this load.</Text>
              <Button label="I have arrived" onPress={() => act(() => arriveStop(stop.id))} loading={busy} />
            </Card>
          ) : null}

          {stop.arrivedAt ? (
            <Card style={s.card}>
              <Text style={s.name}>Step 2 · Temperature</Text>
              {done ? (
                <Text style={s.meta}>Recorded at {stop.temperatureC}°C. The record is closed now this stop is collected.</Text>
              ) : (
                <>
                  <Text style={s.meta}>Log the unit reading before you load. We hold title from here.</Text>
                  <Input label="Degrees C" value={temp} onChangeText={setTemp} keyboardType="decimal-pad" placeholder="4" />
                  <Button
                    label={stop.temperatureC == null ? 'Log temperature' : 'Update temperature'}
                    variant={stop.temperatureC == null ? 'primary' : 'outline'}
                    loading={busy}
                    disabled={!Number.isFinite(celsius) || temp.trim() === '' || celsius === stop.temperatureC}
                    onPress={() => act(() => logTemperature(stop.id, celsius))}
                  />
                  {stop.temperatureC != null ? <Banner tone="info" text={`Logged at ${stop.temperatureC}°C`} /> : null}
                </>
              )}
            </Card>
          ) : null}

          {stop.arrivedAt && !done ? (
            <Card style={s.card}>
              <Text style={s.name}>Step 3 · Collect</Text>
              <Text style={s.meta}>Mark this stop collected once the produce is on the truck. You cannot undo it.</Text>
              <Button label="Mark as collected" onPress={() => act(() => departStop(stop.id))} loading={busy} disabled={!canLeave} />
              {!canLeave ? <Text style={s.meta}>{stop.temperatureC == null ? 'Log the temperature first.' : 'The agent must capture every farmer and confirm this stop first.'}</Text> : null}
            </Card>
          ) : null}

          {done ? <Banner tone="info" text="Collected. Head to the next stop or the delivery." /> : null}
        </View>
      </View>
    </View>
  );
}

/** Three-step tracker for a stop. Finished steps are ticked, the next one is ringed. */
function Steps({ steps }: { steps: { label: string; done: boolean }[] }) {
  const s = useThemedStyles(styles);
  const next = steps.findIndex((x) => !x.done);
  return (
    <View style={s.steps}>
      {steps.map((st, i) => (
        <View key={st.label} style={s.step}>
          <View style={[s.dot, st.done && s.dotDone, i === next && s.dotNext]}>
            {st.done ? <Icon name="check" size={14} color="#ffffff" /> : <Text style={s.dotText}>{i + 1}</Text>}
          </View>
          <Text style={[s.stepLabel, (st.done || i === next) && s.stepOn]} numberOfLines={1}>{st.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ProofOfDelivery({ route, delivery, onBack, onDone }: { route: DriverRoute; delivery: DriverDelivery; onBack: () => void; onDone: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [receiver, setReceiver] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = receiver.trim().length >= 2 && photo !== null;

  const save = async () => {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      await completeLotDelivery(route.id, delivery.lotId, receiver, photo);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the delivery.');
      setBusy(false);
    }
  };

  return (
    <View style={[s.stack, s.narrow]}>
      <View>
        <Text style={s.section}>Proof of delivery</Text>
        <Text style={s.meta}>{delivery.product} {kgText(delivery.expectedKg)} to {delivery.buyer}{delivery.location ? `, ${delivery.location}` : ''}. This is what makes the farmers' payments payable.</Text>
      </View>
      {error ? <Banner text={error} /> : null}
      <Card style={s.card}>
        {photo ? <Image source={{ uri: photo.uri }} style={s.preview} accessibilityLabel="Photograph of the delivered load" /> : null}
        <Button label={photo ? 'Retake photograph' : 'Photograph of delivered load'} icon="camera" variant={photo ? 'outline' : 'primary'} onPress={() => takePhoto().then((next) => next && setPhoto(next))} />
        <Input label="Received by" value={receiver} onChangeText={setReceiver} placeholder="Name of person receiving" />
      </Card>
      <Button label="Complete delivery" onPress={save} loading={busy} disabled={!ready} />
      <Button label="Back" variant="outline" onPress={onBack} disabled={busy} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  stack: { gap: 14 },
  wide: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 16, alignItems: 'flex-start' as const },
  col: { flexGrow: 1, flexBasis: 320, gap: 12 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.brandInk },
  steps: { flexDirection: 'row' as const, gap: 8 },
  step: { flex: 1, alignItems: 'center' as const, gap: 6 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken },
  dotDone: { backgroundColor: c.brand600 },
  dotNext: { borderWidth: 3, borderColor: c.brand600 },
  dotText: { fontFamily: fonts.sansBold, fontSize: 13, color: c.inkMuted },
  stepLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  stepOn: { fontFamily: fonts.sansBold, color: c.ink },
  narrow: { width: '100%' as const, maxWidth: 720, alignSelf: 'center' as const },
  section: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: c.ink },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  cell: { flexGrow: 1, flexBasis: 300 },
  card: { gap: 12 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10, alignSelf: 'stretch' as const },
  grow: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  value: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, flexShrink: 1 },
  bad: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.dangerInk },
  num: { width: 36, height: 36, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  numText: { fontFamily: fonts.sansBold, fontSize: 15, color: c.brandInk },
  capture: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 10, borderRadius: 14, backgroundColor: c.surfaceSunken },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: c.surfaceCard },
  noThumb: { alignItems: 'center' as const, justifyContent: 'center' as const },
  preview: { width: '100%' as const, height: 200, borderRadius: 12, backgroundColor: c.surfaceSunken },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 32 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  center: { textAlign: 'center' as const, maxWidth: 360 },
});
