import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, StatHero } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { FieldShell, FieldSkeleton } from '../../../components/layout/FieldShell';
import { confirmStop, fetchTodayRoute, saveCapture, type AgentFarmer, type AgentStop, type CaptureGrade } from '../../../services/agent.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { fmtWindow, ghs, localPhone } from '../../../utils/format';
import type { Photo } from '../../../utils/photo';
import { CaptureForm } from '../components/CaptureForm';

type Screen =
  | { name: 'route' }
  | { name: 'stop'; stopId: string }
  | { name: 'capture'; stopId: string; listingId: string };

const kgText = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;

export function AgentHome({ account }: { account: Account }) {
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

  const stop = screen.name === 'route' ? null : stops?.find((item) => item.id === screen.stopId) ?? null;
  const farmer = screen.name === 'capture' ? stop?.farmers.find((item) => item.listingId === screen.listingId) ?? null : null;

  const save = async (listingId: string, stopId: string, input: { kg: number; grade: CaptureGrade; photo: Photo | null }, existingPath?: string) => {
    await saveCapture(listingId, { ...input, existingPath });
    await load();
    setScreen({ name: 'stop', stopId });
  };

  return (
    <FieldShell name={account.name} role="Field agent">
      {error ? (
        <>
          <Banner text={error} />
          {stops === null ? <Button label="Try again" variant="outline" onPress={load} /> : null}
        </>
      ) : null}
      {stops === null && !error ? <FieldSkeleton /> : null}

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
    </FieldShell>
  );
}

function RouteList({ stops, onOpen }: { stops: AgentStop[]; onOpen: (id: string) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  if (stops.length === 0) {
    return (
      <Card style={s.empty}>
        <View style={s.emptyIcon}><Icon name="truck" size={22} color={colors.brandInk} /></View>
        <Text style={s.name}>No route yet</Text>
        <Text style={[s.meta, s.center]}>Operations has not assigned today's stops. Check again after they do.</Text>
      </Card>
    );
  }
  const farmers = stops.flatMap((x) => x.farmers);
  const done = farmers.filter((f) => f.capture);
  const weighed = done.reduce((n, f) => n + (f.capture?.recordedKg ?? 0), 0);
  return (
    <View style={s.stack}>
      <StatHero label="Weighed today" value={kgText(weighed)} cells={[
        { label: 'Farmers captured', value: `${done.length} of ${farmers.length}` },
        { label: 'Stops confirmed', value: `${stops.filter((x) => x.confirmed).length} of ${stops.length}` },
      ]} />
      <Text style={s.section}>Today's stops</Text>
      <View style={s.grid}>
        {stops.map((stop, i) => {
          const captured = stop.farmers.filter((f) => f.capture).length;
          const all = stop.farmers.length > 0 && captured === stop.farmers.length;
          return (
            <Card key={stop.id} style={[s.card, s.cell]}>
              <View style={s.row}>
                <View style={s.num}><Text style={s.numText}>{i + 1}</Text></View>
                <View style={s.grow}>
                  <Text style={s.name} numberOfLines={1}>{stop.pointName}</Text>
                  <Text style={s.meta} numberOfLines={1}>{[stop.locality, fmtWindow(stop.windowStart, stop.windowEnd)].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
              <View style={s.row}>
                <Badge label={stop.confirmed ? 'Confirmed' : stop.farmers.length ? `${captured} of ${stop.farmers.length} captured` : 'No listings'} tone={stop.confirmed || all ? 'success' : 'warning'} />
                {stop.confirmed ? <Icon name="lock" size={16} color={colors.inkMuted} /> : null}
              </View>
              <Button label={stop.confirmed ? 'View stop' : 'Open stop'} variant={stop.confirmed ? 'outline' : 'primary'} onPress={() => onOpen(stop.id)} />
            </Card>
          );
        })}
      </View>
      <Card tone="tint" style={s.card}>
        <Text style={s.name}>What happens next</Text>
        <Text style={s.meta}>Open a stop. Weigh, grade and photograph every farmer, then confirm the stop so the driver can collect it. Confirming locks the captures.</Text>
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
  const captured = stop.farmers.filter((f) => f.capture).length;
  const allCaptured = stop.farmers.length > 0 && captured === stop.farmers.length;
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
      <Button label="Today's route" variant="ghost" size="sm" icon="arrowLeft" onPress={onBack} />
      <View>
        <Text style={s.section}>{stop.pointName}</Text>
        <Text style={s.meta}>{[stop.locality, fmtWindow(stop.windowStart, stop.windowEnd), `${captured} of ${stop.farmers.length} captured`].filter(Boolean).join(' · ')}</Text>
      </View>
      {error ? <Banner text={error} /> : null}
      {stop.confirmed ? <Banner tone="info" text="Stop confirmed. Captures are locked and the driver can load." /> : null}
      {stop.farmers.length === 0 ? (
        <Card style={s.card}><Text style={s.meta}>No farmers from the paid lots are at this collection point.</Text></Card>
      ) : (
        <View style={s.grid}>
          {stop.farmers.map((farmer) => <FarmerCard key={farmer.listingId} farmer={farmer} locked={stop.confirmed} onCapture={() => onCapture(farmer.listingId)} />)}
        </View>
      )}
      {allCaptured && !stop.confirmed ? (
        <>
          <Button label="Confirm stop" onPress={confirm} loading={busy} />
          <Text style={s.meta}>Check each capture first. You cannot change them after confirming.</Text>
        </>
      ) : null}
      {stop.farmers.length > 0 && !allCaptured ? <Text style={s.meta}>Capture every farmer before confirming this stop for collection.</Text> : null}
    </View>
  );
}

function FarmerCard({ farmer, locked, onCapture }: { farmer: AgentFarmer; locked: boolean; onCapture: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [photos, setPhotos] = useState(false);
  const saved = farmer.capture;
  return (
    <Card style={[s.card, s.cell]}>
      <View style={s.row}>
        <View style={s.avatar}><Text style={s.avatarText}>{farmer.name.slice(0, 1).toUpperCase()}</Text></View>
        <View style={s.grow}>
          <Text style={s.name} numberOfLines={1}>{farmer.name}</Text>
          <Text style={s.meta} numberOfLines={1}>{localPhone(farmer.phone) || 'No phone saved'}</Text>
        </View>
        <Badge label={saved ? 'Captured' : 'To capture'} tone={saved ? 'success' : 'warning'} />
      </View>

      <View style={s.listing}>
        {farmer.photos[0] ? <Image source={{ uri: farmer.photos[0] }} style={s.thumb} accessibilityLabel={`${farmer.product} listed by ${farmer.name}`} /> : <View style={[s.thumb, s.noThumb]}><Icon name="leaf" size={18} color={colors.inkMuted} /></View>}
        <View style={s.grow}>
          <Text style={s.label}>Listed</Text>
          <Text style={s.value}>{farmer.product} · {kgText(farmer.listedKg)} · grade {farmer.listedGrade}</Text>
          {farmer.estNet != null ? <Text style={s.meta}>Expects about {ghs(farmer.estNet)}</Text> : null}
        </View>
      </View>
      {farmer.photos.length > 1 ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: photos }} onPress={() => setPhotos(!photos)} style={s.link}>
          <Icon name="camera" size={14} color={colors.brandInk} />
          <Text style={s.linkText}>{photos ? 'Hide listing photos' : `See all ${farmer.photos.length} listing photos`}</Text>
        </Pressable>
      ) : null}
      {photos ? (
        <View style={s.gallery}>
          {farmer.photos.map((uri) => <Image key={uri} source={{ uri }} style={s.shot} accessibilityLabel={`${farmer.product} listed by ${farmer.name}`} />)}
        </View>
      ) : null}

      {saved ? (
        <View style={s.captured}>
          <Text style={s.label}>You recorded</Text>
          <Text style={s.value}>{kgText(saved.recordedKg)} · grade {saved.grade}</Text>
          {farmer.net != null ? <Text style={s.meta}>Farmer receives {ghs(farmer.net)} once the lot is delivered.</Text> : null}
        </View>
      ) : null}
      {locked ? (
        <View style={s.lock}>
          <Icon name="lock" size={14} color={colors.inkMuted} />
          <Text style={s.meta}>Locked. The stop is confirmed.</Text>
        </View>
      ) : (
        <Button label={saved ? 'Edit capture' : 'Capture weight and grade'} variant={saved ? 'outline' : 'primary'} onPress={onCapture} />
      )}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  stack: { gap: 14 },
  section: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: c.ink },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  cell: { flexGrow: 1, flexBasis: 300 },
  card: { gap: 12 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10, alignSelf: 'stretch' as const },
  grow: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted, flexShrink: 1 },
  label: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  value: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  num: { width: 36, height: 36, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  numText: { fontFamily: fonts.sansBold, fontSize: 15, color: c.brandInk },
  avatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  avatarText: { fontFamily: fonts.sansBold, fontSize: 16, color: c.brandInk },
  listing: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 10, borderRadius: 14, backgroundColor: c.surfaceSunken },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: c.surfaceCard },
  noThumb: { alignItems: 'center' as const, justifyContent: 'center' as const },
  link: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44 },
  linkText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.brandInk },
  gallery: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  shot: { width: 96, height: 96, borderRadius: 12, backgroundColor: c.surfaceSunken },
  captured: { gap: 2, padding: 12, borderRadius: 14, backgroundColor: c.brandTint },
  lock: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, minHeight: 44 },
  empty: { alignItems: 'center' as const, gap: 8, paddingVertical: 32 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  center: { textAlign: 'center' as const, maxWidth: 360 },
});
