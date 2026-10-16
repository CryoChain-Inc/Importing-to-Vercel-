import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, ThemeToggle } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { useNav } from '../../../navigation';
import { fetchTodayRoute, saveCapture, confirmStop, type AgentFarmer, type AgentStop, type CaptureGrade } from '../../../services/agent.service';
import { authService } from '../../../services/auth.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { fmtWindow, ghs, localPhone } from '../../../utils/format';
import { CaptureForm } from '../components/CaptureForm';

type Screen =
  | { name: 'route' }
  | { name: 'stop'; stopId: string }
  | { name: 'capture'; stopId: string; listingId: string };

const kgText = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

export function AgentHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const s = useThemedStyles(styles);
  const [stops, setStops] = useState<AgentStop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'route' });

  const load = useCallback(async () => {
    try {
      setStops(await fetchTodayRoute());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load today\'s route.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const signOut = () => authService.signOut().finally(() => reset({ name: 'landing' }));
  const stop = screen.name === 'route' ? null : stops?.find((item) => item.id === screen.stopId) ?? null;
  const farmer = screen.name === 'capture' ? stop?.farmers.find((item) => item.listingId === screen.listingId) ?? null : null;

  const save = async (listingId: string, stopId: string, input: { kg: number; grade: CaptureGrade; photo: { uri: string; mime: string } | null }, existingPath?: string) => {
    await saveCapture(listingId, { ...input, existingPath });
    await load();
    setScreen({ name: 'stop', stopId });
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.content}>
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.hello}>Hello, {account.name || 'agent'}</Text>
              <Badge label="Field agent" tone="info" />
            </View>
            <ThemeToggle />
          </View>
          {error ? <Banner text={error} /> : null}
          {stops === null && !error ? <Text style={s.meta}>Loading today's route…</Text> : null}

          {screen.name === 'route' && stops ? <RouteList stops={stops} onOpen={(stopId) => setScreen({ name: 'stop', stopId })} /> : null}

          {screen.name === 'stop' && stop ? (
            <StopFarmers
              stop={stop}
              onBack={() => setScreen({ name: 'route' })}
              onCapture={(listingId) => setScreen({ name: 'capture', stopId: stop.id, listingId })}
              onConfirm={() => confirmStop(stop.id).then(load)}
            />
          ) : null}
          {screen.name === 'stop' && stops && !stop ? <Banner text="That stop is no longer on today's route." /> : null}

          {screen.name === 'capture' && farmer && stop ? (
            <CaptureForm
              key={farmer.listingId}
              farmer={farmer}
              onCancel={() => setScreen({ name: 'stop', stopId: stop.id })}
              onSave={(input) => save(farmer.listingId, stop.id, input, farmer.capture?.photoPath)}
            />
          ) : null}
          {screen.name === 'capture' && stops && !farmer ? <Banner text="That farmer is no longer on this stop." /> : null}

          <Button label="Sign out" variant="ghost" size="sm" onPress={signOut} />
        </View>
      </ScrollView>
    </View>
  );
}

function RouteList({ stops, onOpen }: { stops: AgentStop[]; onOpen: (id: string) => void }) {
  const s = useThemedStyles(styles);
  const count = stops.length;
  return (
    <View style={s.stack}>
      <Text style={s.section}>Today's route</Text>
      <Text style={s.meta}>{count === 0 ? 'No collection points yet.' : `${count} collection point${count === 1 ? '' : 's'}.`}</Text>
      {count === 0 ? (
        <Card style={s.card}>
          <Text style={s.name}>No route yet</Text>
          <Text style={s.meta}>Operations has not assigned today's stops. Check again after they do.</Text>
        </Card>
      ) : (
        stops.map((stop) => {
          const captured = stop.farmers.filter((f) => f.capture).length;
          return (
            <Card key={stop.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.name}>{stop.pointName}</Text>
                <Badge label={stop.farmers.length ? `${captured} of ${stop.farmers.length} captured` : 'No listings'} tone={captured && captured === stop.farmers.length ? 'success' : 'warning'} />
              </View>
              <Text style={s.meta}>{[stop.locality, fmtWindow(stop.windowStart, stop.windowEnd)].filter(Boolean).join(' · ')}</Text>
              <Button label="Open stop" onPress={() => onOpen(stop.id)} />
            </Card>
          );
        })
      )}
      <Card tone="tint" style={s.card}>
        <Text style={s.name}>What happens next</Text>
        <Text style={s.meta}>Open a stop. Weigh, grade and photograph every farmer, then confirm the stop so the driver can collect it.</Text>
      </Card>
    </View>
  );
}

function StopFarmers({ stop, onBack, onCapture, onConfirm }: {
  stop: AgentStop;
  onBack: () => void;
  onCapture: (listingId: string) => void;
  onConfirm: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allCaptured = stop.farmers.length > 0 && stop.farmers.every((farmer) => farmer.capture);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm this lot.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.stack}>
      <Button label="Today's route" variant="ghost" size="sm" onPress={onBack} />
      <Text style={s.section}>{stop.pointName}</Text>
      <Text style={s.meta}>{[stop.locality, fmtWindow(stop.windowStart, stop.windowEnd)].filter(Boolean).join(' · ')}</Text>
      {error ? <Banner text={error} /> : null}
      <Text style={s.name}>Farmers at this stop</Text>
      {stop.farmers.length === 0 ? (
        <Card style={s.card}>
          <Text style={s.meta}>No farmers from the paid lots are at this collection point.</Text>
        </Card>
      ) : (
        stop.farmers.map((farmer) => <FarmerCard key={farmer.listingId} farmer={farmer} onCapture={() => onCapture(farmer.listingId)} />)
      )}
      {stop.confirmed ? <Badge label="Ready for collection" tone="success" /> : null}
      {allCaptured && !stop.confirmed ? <Button label="Confirm stop" onPress={confirm} loading={busy} /> : null}
      {stop.farmers.length > 0 && !allCaptured ? <Text style={s.meta}>Capture every farmer before confirming this stop for collection.</Text> : null}
    </View>
  );
}

function FarmerCard({ farmer, onCapture }: { farmer: AgentFarmer; onCapture: () => void }) {
  const s = useThemedStyles(styles);
  const saved = farmer.capture;
  return (
    <Card style={s.card}>
      <View style={s.row}>
        <Text style={s.name}>{farmer.name}</Text>
        <Badge label={saved ? `${kgText(saved.recordedKg)}, ${saved.grade}` : 'Not captured'} tone={saved ? 'success' : 'warning'} />
      </View>
      <Text style={s.meta}>{farmer.product}, listed {kgText(farmer.listedKg)}{farmer.phone ? ` · ${localPhone(farmer.phone)}` : ''}</Text>
      {farmer.net != null ? <Text style={s.meta}>Farmer receives {ghs(farmer.net)} once the lot is delivered.</Text> : null}
      <Button label={saved ? 'Edit capture' : 'Capture weight and grade'} variant={saved ? 'outline' : 'primary'} onPress={onCapture} />
    </Card>
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
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
