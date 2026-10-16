import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Badge, Button, Card, Input, ThemeToggle } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { useNav } from '../../../navigation';
import {
  arriveStop, completeLotDelivery, departStop, fetchDriverRoute, logTemperature,
  type DriverDelivery, type DriverRoute, type DriverStop,
} from '../../../services/driver.service';
import { authService } from '../../../services/auth.service';
import { fmtWindow } from '../../../utils/format';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';

type Screen = { name: 'route' } | { name: 'stop'; stopId: string } | { name: 'delivery'; lotId: string };

const kgText = (n: number) => `${Number(n).toLocaleString('en-GH', { maximumFractionDigits: 0 })} kg`;

async function takePhoto(): Promise<{ uri: string; mime: string } | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) {
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4 });
      if (shot.canceled || !shot.assets[0]) return null;
      return { uri: shot.assets[0].uri, mime: shot.assets[0].mimeType ?? 'image/jpeg' };
    }
  } catch {
    // A desktop browser has no camera. The photo library covers that case.
  }
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4 });
  if (picked.canceled || !picked.assets[0]) return null;
  return { uri: picked.assets[0].uri, mime: picked.assets[0].mimeType ?? 'image/jpeg' };
}

export function DriverHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  const [route, setRoute] = useState<DriverRoute | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'route' });

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

  const signOut = () => authService.signOut().finally(() => reset({ name: 'landing' }));
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
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.content}>
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.hello}>Hello, {account.name || 'driver'}</Text>
              <Badge label="Driver" tone="info" />
            </View>
            <ThemeToggle />
          </View>
          {error ? <Banner text={error} /> : null}
          {route === undefined && !error ? <Text style={s.meta}>Loading today's route…</Text> : null}

          {screen.name === 'route' && route !== undefined ? (
            <Manifest
              route={route}
              onOpen={(stopId) => setScreen({ name: 'stop', stopId })}
              onDeliver={(lotId) => setScreen({ name: 'delivery', lotId })}
            />
          ) : null}

          {screen.name === 'stop' && stop && route ? (
            <StopVisit stop={stop} onBack={() => setScreen({ name: 'route' })} onRun={run} />
          ) : null}
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

          <Button label="Sign out" variant="ghost" size="sm" onPress={signOut} />
        </View>
      </ScrollView>
    </View>
  );
}

function Manifest({ route, onOpen, onDeliver }: { route: DriverRoute | null; onOpen: (id: string) => void; onDeliver: (lotId: string) => void }) {
  const s = useThemedStyles(styles);
  const stops = route?.stops ?? [];
  const deliveries = route?.deliveries ?? [];
  const loaded = stops.length > 0 && stops.every((stop) => stop.departedAt);
  return (
    <View style={s.stack}>
      <Text style={s.section}>Today's route</Text>
      <Text style={s.meta}>
        {stops.length === 0 ? 'No stops yet.' : `${stops.length} stop${stops.length === 1 ? '' : 's'}, ${deliveries.length} deliver${deliveries.length === 1 ? 'y' : 'ies'}`}
        {route?.plate ? ` · vehicle ${route.plate}` : ''}
      </Text>
      {stops.length === 0 ? (
        <Card style={s.card}>
          <Text style={s.name}>No route yet</Text>
          <Text style={s.meta}>Operations has not assigned today's stops. Check again after they do.</Text>
        </Card>
      ) : (
        <>
          <Text style={s.name}>Collect</Text>
          {stops.map((stop, index) => (
            <Card key={stop.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.name}>{index + 1}. {stop.pointName}</Text>
                <Badge label={stop.departedAt ? 'Loaded' : stop.arrivedAt ? 'Arrived' : 'Not started'} tone={stop.departedAt ? 'success' : stop.arrivedAt ? 'warning' : 'neutral'} />
              </View>
              <Text style={s.meta}>{[fmtWindow(stop.windowStart, stop.windowEnd), stop.locality, `${stop.farmers} farmer${stop.farmers === 1 ? '' : 's'}`, kgText(stop.listedKg)].filter(Boolean).join(' · ')}</Text>
              <Button label="Open stop" onPress={() => onOpen(stop.id)} />
            </Card>
          ))}
          <Text style={s.name}>Deliver</Text>
          {deliveries.map((d) => (
            <Card key={d.lotId} tone={d.deliveredAt ? 'tint' : undefined} style={s.card}>
              <View style={s.row}>
                <Text style={s.name}>{d.buyer}</Text>
                <Badge label={d.deliveredAt ? 'Delivered' : 'To deliver'} tone={d.deliveredAt ? 'success' : 'neutral'} />
              </View>
              <Text style={s.meta}>{[d.code, `${d.product} ${kgText(d.expectedKg)}`, d.location, fmtWindow(d.windowStart, d.windowEnd)].filter(Boolean).join(' · ')}</Text>
              {d.deliveredAt ? <Text style={s.meta}>Received by {d.receivedBy}.</Text> : null}
              {!d.deliveredAt ? <Button label="Deliver to this buyer" disabled={!loaded} onPress={() => onDeliver(d.lotId)} /> : null}
            </Card>
          ))}
        </>
      )}
      <Card tone="tint" style={s.card}>
        <Text style={s.name}>What happens next</Text>
        <Text style={s.meta}>
          {loaded && !route?.deliveredAt
            ? 'Everything is on board. Deliver each lot to its buyer, photograph it, and record the name of the person who receives it.'
            : 'Open a stop. Record your arrival, log the temperature, then load once the agent has confirmed the stop. Deliveries unlock when every stop is loaded.'}
        </Text>
      </Card>
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

  return (
    <View style={s.stack}>
      <Button label="Today's route" variant="ghost" size="sm" onPress={onBack} />
      <Text style={s.section}>{stop.pointName}</Text>
      <Text style={s.meta}>{[fmtWindow(stop.windowStart, stop.windowEnd), stop.locality, stop.products.join(', ')].filter(Boolean).join(' · ')}</Text>

      <Card style={s.card}>
        <Text style={s.meta}>Expected load</Text>
        <Text style={s.kilo}>{kgText(stop.listedKg)}</Text>
        <Text style={s.meta}>{stop.farmers} farmer{stop.farmers === 1 ? '' : 's'} at this stop{stop.captured ? ` · ${kgText(stop.capturedKg)} weighed by the agent` : ''}</Text>
      </Card>

      {!stop.arrivedAt ? <Button label="I have arrived" onPress={() => act(() => arriveStop(stop.id))} loading={busy} /> : null}

      {stop.arrivedAt && !stop.departedAt ? (
        <Card style={s.card}>
          <Text style={s.name}>Temperature check</Text>
          <Text style={s.meta}>Log the unit reading before you load. We hold title from here.</Text>
          <Input label="Degrees C" value={temp} onChangeText={setTemp} keyboardType="decimal-pad" placeholder="4" />
          <Button
            label="Log temperature"
            loading={busy}
            disabled={!Number.isFinite(celsius)}
            onPress={() => act(() => logTemperature(stop.id, celsius))}
          />
          {stop.temperatureC != null ? <Banner tone="info" text={`Logged at ${stop.temperatureC}°C`} /> : null}
        </Card>
      ) : null}

      {stop.arrivedAt && !stop.departedAt ? (
        <>
          <Button label="Loaded, leaving now" onPress={() => act(() => departStop(stop.id))} loading={busy} disabled={!canLeave} />
          {!canLeave ? (
            <Text style={s.meta}>
              {stop.temperatureC == null
                ? 'Log the temperature before leaving.'
                : 'The agent must capture every farmer and confirm this lot before you can leave.'}
            </Text>
          ) : null}
        </>
      ) : null}

      {stop.departedAt ? <Banner tone="info" text="This stop is loaded. You can leave for the next stop or the delivery." /> : null}

      <Card tone="tint" style={s.card}>
        <Text style={s.name}>What happens next</Text>
        <Text style={s.meta}>
          {!stop.arrivedAt
            ? 'Confirm your arrival when you reach the point. That timestamp starts the custody record for this load.'
            : stop.temperatureC == null
              ? 'Log the unit temperature. You cannot leave until it is recorded, and until the agent has confirmed the lot.'
              : 'Load and leave when the lot is ready. The buyer sees the temperature you recorded.'}
        </Text>
      </Card>
    </View>
  );
}

function ProofOfDelivery({ route, delivery, onBack, onDone }: { route: DriverRoute; delivery: DriverDelivery; onBack: () => void; onDone: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [receiver, setReceiver] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
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
    <View style={s.stack}>
      <Text style={s.section}>Proof of delivery</Text>
      <Text style={s.meta}>{delivery.product} {kgText(delivery.expectedKg)} to {delivery.buyer}{delivery.location ? `, ${delivery.location}` : ''}. This is what makes the farmers' payments payable.</Text>
      {error ? <Banner text={error} /> : null}
      <Card style={s.card}>
        {photo ? <Image source={{ uri: photo.uri }} style={s.preview} accessibilityLabel="Photograph of the delivered load" /> : null}
        <Button label={photo ? 'Retake photograph' : 'Photograph of delivered load'} onPress={() => takePhoto().then((next) => next && setPhoto(next))} />
        <Input label="Received by" value={receiver} onChangeText={setReceiver} placeholder="Name of person receiving" />
      </Card>
      <Card tone="tint" style={s.card}>
        <Text style={s.name}>What happens next</Text>
        <Text style={s.meta}>Photograph the load and type the name of whoever receives it. That lets the buyer accept, and every farmer is paid from that record.</Text>
      </Card>
      <Button label="Complete delivery" onPress={save} loading={busy} disabled={!ready} />
      <Button label="Back" variant="outline" onPress={onBack} disabled={busy} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, backgroundColor: c.bgApp },
  scroll: { padding: 16, paddingBottom: 32 },
  content: { width: '100%' as const, maxWidth: 720, alignSelf: 'center' as const, gap: 16 },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  headerText: { gap: 8, alignItems: 'flex-start' as const, flexShrink: 1 },
  hello: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: c.ink },
  stack: { gap: 12 },
  section: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: c.ink },
  card: { gap: 10 },
  row: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  kilo: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  preview: { width: '100%' as const, height: 180, borderRadius: 12, backgroundColor: c.surfaceSunken },
});
