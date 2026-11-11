import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { completeStop } from '../../../services/driver.route.service';
import { recordHandover, uploadHandoverMedia, type DeliveryOrder, type DropoffStop, type HandoverMediaKind, type PickupStop } from '../../../services/driver.deliveries.service';
import type { PickedImage } from '../../../services/catalogueImage';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { NOTE_MAX, parseReading } from '../reading';
import { Empty } from '../../ops/components/OpsBits';
import { useAction } from '../../ops/components/useAction';
import { BackButton, Fact, NextCard, openMaps, openPhone, QuickActions, RowCard, StepDot } from './bits';

const kgText = (n: number, unit = 'kg') => `${n} ${unit}`;
/** Quantities only add up within one unit, so a mixed order shows one total per unit. */
const sumText = (ps: PickupStop[], q: (p: PickupStop) => number) => {
  const m = new Map<string, number>();
  for (const p of ps) m.set(p.expectedUnit, (m.get(p.expectedUnit) ?? 0) + q(p));
  return [...m].map(([u, n]) => kgText(Math.round(n * 10) / 10, u)).join(' + ');
};

/** The stop the driver should go to next: first farmer still to collect, else the buyer. */
export function nextStop(order: DeliveryOrder): { kind: 'pickup'; pickup: PickupStop } | { kind: 'dropoff' } | null {
  const pickup = order.pickups.find((p) => p.state === 'pending');
  if (pickup) return { kind: 'pickup', pickup };
  return order.dropoff?.state === 'pending' ? { kind: 'dropoff' } : null;
}

const etaText = (iso: string | null) => (iso ? `around ${new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}` : '');

/** Every stop still to make on this trip, across all its orders, in driving order. Lines at one farm share a number. */
export function RouteList({ orders, onPickup, onDropoff }: { orders: DeliveryOrder[]; onPickup: (stopId: string, orderId: string) => void; onDropoff: (orderId: string) => void }) {
  const s = useThemedStyles(styles);
  const stops = orders.flatMap((o) => [
    ...o.pickups.filter((p) => p.state === 'pending').map((p) => ({ seq: p.seq, place: p.farmerId ?? p.stopId, order: o, pickup: p as PickupStop | null })),
    ...(o.dropoff?.state === 'pending' ? [{ seq: o.dropoff.seq, place: o.id, order: o, pickup: null }] : []),
  ]).sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));
  // Stop number per place: consecutive lines at the same farm are one visit.
  const visits = stops.reduce<number[]>((acc, x, i) => [...acc, i > 0 && stops[i - 1].place === x.place ? acc[i - 1] : (acc[i - 1] ?? 0) + 1], []);
  return (
    <View style={s.list}>
      {stops.map((x, i) => {
        const p = x.pickup;
        return (
          <RowCard
            key={p?.stopId ?? x.order.id}
            lead={<StepDot n={visits[i]} now={i === 0} />}
            title={p ? `${p.farmerName} · ${p.product} ${kgText(p.expectedKg, p.expectedUnit)}` : `Deliver to ${x.order.buyerName}`}
            sub={[x.order.code, p ? p.place : x.order.address, etaText(p ? p.eta : x.order.dropoff?.eta ?? null)].filter(Boolean).join(' · ')}
            right={<Badge label={p ? 'Collect' : 'Deliver'} tone={p ? 'info' : 'success'} />}
            onPress={() => (p ? onPickup(p.stopId, x.order.id) : onDropoff(x.order.id))}
          />
        );
      })}
    </View>
  );
}

export function DeliveryList({ orders, past, onOpen }: { orders: DeliveryOrder[]; past: boolean; onOpen: (id: string) => void }) {
  const s = useThemedStyles(styles);
  const rows = orders.filter((o) => (past ? !o.ongoing : o.ongoing));
  if (rows.length === 0) {
    return (
      <Empty
        icon="package"
        title={past ? 'No past deliveries' : 'No ongoing deliveries'}
        hint={past ? 'Deliveries you have finished will be listed here.' : 'Paid orders near you are added here once your location is on.'}
      />
    );
  }
  return (
    <View style={s.list}>
      {rows.map((o) => (
        <RowCard
          key={o.id}
          title={o.buyerName}
          lead={past ? <StepDot n={0} done /> : undefined}
          sub={`${o.code} · ${o.pickups.length} farmer${o.pickups.length === 1 ? '' : 's'}${past ? ` · ${sumText(o.pickups, (p) => p.recordedKg ?? p.expectedKg)}` : ''}`}
          done={past}
          right={past ? undefined : <Badge label={`${o.pickups.filter((p) => p.state === 'pending').length} to collect`} tone="info" />}
          onPress={() => onOpen(o.id)}
        />
      ))}
    </View>
  );
}

/** The route as numbered steps: farmers first, then the buyer. The next step is the only one with a button. */
export function DeliveryOrderPage({
  order, onBack, onPickup, onDropoff,
}: {
  order: DeliveryOrder;
  onBack?: () => void;
  onPickup: (stopId: string) => void;
  onDropoff: () => void;
}) {
  const s = useThemedStyles(styles);
  const next = nextStop(order);
  const steps = order.pickups.length + (order.dropoff ? 1 : 0);
  const done = order.pickups.filter((p) => p.state === 'done').length + (order.dropoff?.state === 'done' ? 1 : 0);
  return (
    <View style={s.list}>
      {onBack ? <BackButton label="Delivery" onPress={onBack} /> : null}
      <View style={s.top}>
        <Text style={s.name}>{onBack ? order.code : `Current route · ${order.code}`}</Text>
        <Badge label={`${done} of ${steps} done`} tone={done === steps && steps > 0 ? 'success' : 'info'} />
      </View>
      {next?.kind === 'pickup' ? (
        <NextCard
          eyebrow="Next stop"
          title={next.pickup.farmerName}
          lines={[`${next.pickup.product} · ${kgText(next.pickup.expectedKg, next.pickup.expectedUnit)}`, next.pickup.place]}
          label="Start pickup"
          onPress={() => onPickup(next.pickup.stopId)}
        />
      ) : next?.kind === 'dropoff' ? (
        <NextCard eyebrow="Last stop" title={order.buyerName} lines={[order.address || 'Buyer address']} label="Deliver to buyer" onPress={onDropoff} />
      ) : null}
      <Card style={s.route}>
        {order.pickups.map((p, i) => {
          const isDone = p.state === 'done';
          return (
            <RouteStop
              key={p.stopId}
              n={i + 1}
              title={p.farmerName}
              sub={isDone && p.recordedKg != null ? `${kgText(p.recordedKg, p.expectedUnit)} collected` : `${p.product} · ${kgText(p.expectedKg, p.expectedUnit)}`}
              done={isDone}
              now={next?.kind === 'pickup' && next.pickup.stopId === p.stopId}
              last={!order.dropoff && i === order.pickups.length - 1}
              onPress={() => onPickup(p.stopId)}
            />
          );
        })}
        {order.dropoff ? (
          <RouteStop
            n={order.pickups.length + 1}
            title={`Deliver to ${order.buyerName}`}
            sub={order.address || 'Buyer address'}
            done={order.dropoff.state === 'done'}
            now={next?.kind === 'dropoff'}
            last
            onPress={onDropoff}
          />
        ) : <Text style={s.meta}>The buyer drop-off is not on your route yet.</Text>}
        {order.pickups.length === 0 ? <Text style={s.meta}>No farm pickups on this order yet.</Text> : null}
      </Card>
    </View>
  );
}

/** One stop on the route: marker, a line down to the next stop, and the stop's details. */
function RouteStop({ n, title, sub, done, now, last, onPress }: { n: number; title: string; sub: string; done: boolean; now: boolean; last?: boolean; onPress: () => void }) {
  const s = useThemedStyles(styles);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.stop, pressed ? { opacity: 0.85 } : null]}>
      <View style={s.rail}>
        <StepDot n={n} done={done} now={now} />
        {last ? null : <View style={[s.line, done ? s.lineDone : null]} />}
      </View>
      <View style={[s.stopText, last ? null : s.stopGap]}>
        <View style={s.top}>
          <Text style={[s.name, done ? s.muted : null]} numberOfLines={1}>{title}</Text>
          {now ? <Badge label="Next" tone="info" /> : null}
        </View>
        <Text style={s.meta} numberOfLines={2}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function StopHeader({ title, lines, phone, call, spot }: { title: string; lines: string[]; phone: string; call: string; spot: { lat: number; lng: number } | null }) {
  const s = useThemedStyles(styles);
  const actions = [
    ...(phone ? [{ icon: 'phone' as const, label: call, onPress: () => openPhone(phone) }] : []),
    ...(spot ? [{ icon: 'pin' as const, label: 'Navigate', onPress: () => openMaps(spot.lat, spot.lng) }] : []),
  ];
  return (
    <Card style={s.item}>
      <Text style={s.title}>{title}</Text>
      {lines.filter(Boolean).map((line) => <Text key={line} style={s.meta}>{line}</Text>)}
      <QuickActions items={actions} />
    </Card>
  );
}

export function PickupPage({
  order, pickup, range, onBack, onChange,
}: {
  order: DeliveryOrder;
  pickup: PickupStop;
  range: { min: number | null; max: number | null };
  onBack: () => void;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const done = pickup.state === 'done';
  return (
    <View style={s.list}>
      <BackButton label="Route" onPress={onBack} />
      <StopHeader
        title={pickup.farmerName}
        lines={[pickup.place || 'Farm address not set']}
        phone={pickup.farmerPhone}
        call="Call farmer"
        spot={{ lat: pickup.lat, lng: pickup.lng }}
      />
      <Card tone="tint" style={s.facts}>
        <Fact label="Product" value={pickup.product} />
        <Fact label="Reserved quantity" value={kgText(pickup.expectedKg, pickup.expectedUnit)} />
      </Card>
      {done ? (
        <SavedReading kg={pickup.recordedKg} unit={pickup.expectedUnit} temp={pickup.temperatureC} note={pickup.note} mediaUrl={pickup.mediaUrl} mediaKind={pickup.mediaKind} onBack={onBack} backLabel="Back to route" />
      ) : (
        <ReadingForm
          kind="pickup"
          stopId={pickup.stopId}
          range={range}
          unit={pickup.expectedUnit}
          reservedKg={pickup.expectedKg}
          initial={{ kg: pickup.recordedKg, temp: pickup.temperatureC, note: pickup.note, mediaPath: pickup.mediaPath, mediaKind: pickup.mediaKind, mediaUrl: pickup.mediaUrl }}
          blocked={false}
          completeLabel="Confirm pickup"
          onComplete={() => completeStop(pickup.stopId)}
          onChange={onChange}
        />
      )}
    </View>
  );
}

export function DropoffPage({
  order, dropoff, range, onBack, onChange,
}: {
  order: DeliveryOrder;
  dropoff: DropoffStop;
  range: { min: number | null; max: number | null };
  onBack: () => void;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const waiting = order.pickups.filter((p) => p.state === 'pending').length;
  const done = dropoff.state === 'done';
  return (
    <View style={s.list}>
      <BackButton label="Route" onPress={onBack} />
      <StopHeader
        title={order.buyerName}
        lines={[order.address || 'Buyer address']}
        phone={order.buyerPhone}
        call="Call buyer"
        spot={{ lat: dropoff.lat, lng: dropoff.lng }}
      />
      <Card tone="tint" style={s.facts}>
        <Fact label="Farmers" value={String(order.pickups.length)} />
        <Fact label="Total quantity" value={sumText(order.pickups, (p) => p.recordedKg ?? p.expectedKg)} />
      </Card>
      {order.pickups.map((p) => (
        <Text key={p.stopId} style={s.meta}>
          {p.farmerName} · {p.product} · {p.recordedKg != null ? `${kgText(p.recordedKg, p.expectedUnit)} collected` : `${kgText(p.expectedKg, p.expectedUnit)} listed`}
          {p.state === 'pending' ? ' · still to collect' : ''}
        </Text>
      ))}
      {done ? (
        <SavedReading kg={null} unit="kg" temp={dropoff.temperatureC} note={dropoff.note} mediaUrl={dropoff.mediaUrl} mediaKind={dropoff.mediaKind} onBack={onBack} backLabel="Back to route" />
      ) : (
        <ReadingForm
          kind="dropoff"
          stopId={dropoff.stopId}
          range={range}
          unit="kg"
          initial={{ kg: null, temp: dropoff.temperatureC, note: dropoff.note, mediaPath: dropoff.mediaPath, mediaKind: dropoff.mediaKind, mediaUrl: dropoff.mediaUrl }}
          blocked={waiting > 0}
          blockedText="Collect every farmer's produce before delivering this order."
          completeLabel="Confirm delivery"
          onComplete={() => completeStop(dropoff.stopId)}
          onChange={onChange}
        />
      )}
    </View>
  );
}

function SavedReading({ kg, unit, temp, note, mediaUrl, mediaKind, onBack, backLabel }: {
  kg: number | null; unit: string; temp: number | null; note: string;
  mediaUrl: string | null; mediaKind: HandoverMediaKind | null;
  onBack: () => void; backLabel: string;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Card style={s.item}>
      <View style={s.top}>
        <Text style={s.title}>Done</Text>
        <Icon name="check" size={22} color={colors.brandInk} />
      </View>
      {kg != null ? <Text style={s.meta}>{kgText(kg, unit)}</Text> : null}
      <Text style={s.meta}>{temp == null ? 'No temperature recorded' : `${temp} °C on record`}</Text>
      {note ? <Text style={s.meta}>{note}</Text> : null}
      {mediaUrl ? <MediaPreview uri={mediaUrl} kind={mediaKind ?? 'photo'} /> : null}
      <Button label={backLabel} variant="tonal" onPress={onBack} />
    </Card>
  );
}

function MediaPreview({ uri, kind }: { uri: string; kind: HandoverMediaKind }) {
  const s = useThemedStyles(styles);
  if (kind === 'video') return <Button size="sm" variant="outline" label="Open video" onPress={() => Linking.openURL(uri)} />;
  return <Image source={{ uri }} style={s.thumb} accessibilityLabel="Stop photo" />;
}

function ReadingForm({
  kind, stopId, unit, reservedKg, range, initial, blocked, blockedText, completeLabel, onComplete, onChange,
}: {
  kind: 'pickup' | 'dropoff';
  stopId: string;
  unit: string;
  reservedKg?: number;
  range: { min: number | null; max: number | null };
  initial: { kg: number | null; temp: number | null; note: string; mediaPath: string | null; mediaKind: HandoverMediaKind | null; mediaUrl: string | null };
  blocked: boolean;
  blockedText?: string;
  completeLabel: string;
  onComplete: () => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [kg, setKg] = useState(initial.kg == null ? '' : String(initial.kg));
  const [temp, setTemp] = useState(initial.temp == null ? '' : String(initial.temp));
  const [note, setNote] = useState(initial.note);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  useEffect(() => {
    setKg(initial.kg == null ? '' : String(initial.kg));
    setTemp(initial.temp == null ? '' : String(initial.temp));
    setNote(initial.note);
    setPicked(null);
  }, [initial.kg, initial.temp, initial.note, initial.mediaPath]);

  const parsed = parseReading({ kind, kg, temp, note, min: range.min, max: range.max, reservedKg });
  const hasMedia = Boolean(picked || initial.mediaPath);
  const ready = Boolean(parsed.ok && hasMedia && !blocked);
  const lo = range.min ?? -100;
  const hi = range.max ?? 100;

  const choose = async (from: 'camera' | 'library') => {
    if (from === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) return;
    }
    const r = from === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], videoMaxDuration: 30, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], videoMaxDuration: 30, quality: 0.6 });
    if (!r.canceled && r.assets[0]) setPicked({ uri: r.assets[0].uri, mimeType: r.assets[0].mimeType, assetId: r.assets[0].assetId });
  };

  return (
    <Card style={s.item}>
      <Text style={s.title}>{kind === 'pickup' ? 'Check the produce' : 'Check the temperature'}</Text>
      <Text style={s.meta}>Allowed temperature is {lo} to {hi} °C. Add a photo or a short video. This stays as you save it once the stop is done.</Text>
      {kind === 'pickup' ? (
        <Input label={`Quantity collected (${unit})`} value={kg} onChangeText={setKg} keyboardType="decimal-pad" maxLength={8}
          hint={reservedKg != null ? `Up to ${reservedKg} ${unit}. Enter 0 if there was nothing. The farmer is paid for what you record, and any gap is sourced from another farm.` : undefined} />
      ) : null}
      <Input label="Temperature (°C)" value={temp} onChangeText={setTemp} keyboardType="numbers-and-punctuation" maxLength={6} hint={`Safe range ${lo} to ${hi} °C`} />
      <Input label="Condition notes" value={note} onChangeText={setNote} maxLength={NOTE_MAX} hint={`${note.length}/${NOTE_MAX}`} />
      <View style={s.actions}>
        <Button size="sm" variant="outline" label="Take photo or video" onPress={() => choose('camera')} />
        <Button size="sm" variant="outline" label="Upload" onPress={() => choose('library')} />
      </View>
      {picked ? <MediaPreview uri={picked.uri} kind={(picked.mimeType || '').startsWith('video/') ? 'video' : 'photo'} /> : initial.mediaUrl ? <MediaPreview uri={initial.mediaUrl} kind={initial.mediaKind ?? 'photo'} /> : <Text style={s.meta}>No photo or video yet.</Text>}
      {error ? <Banner text={error} /> : null}
      {blocked && blockedText ? <Banner tone="info" text={blockedText} /> : null}
      <Button
        size="lg"
        label={completeLabel}
        icon="check"
        loading={busy}
        disabled={!ready}
        onPress={() => {
          if (!parsed.ok || !hasMedia) return;
          const value = parsed.value;
          run(async () => {
            const media = picked ? await uploadHandoverMedia(stopId, picked) : { path: initial.mediaPath as string, kind: initial.mediaKind as HandoverMediaKind };
            await recordHandover(stopId, { ...value, mediaPath: media.path, mediaKind: media.kind });
            await onComplete();
          });
        }}
      />
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 10 },
  facts: { flexDirection: 'row' as const, gap: 12, padding: 16 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  title: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  route: { padding: 16 },
  stop: { flexDirection: 'row' as const, gap: 12 },
  rail: { alignItems: 'center' as const, width: 32 },
  line: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1, backgroundColor: c.borderSubtle },
  lineDone: { backgroundColor: c.brand600 },
  stopText: { flex: 1, gap: 2, paddingTop: 5 },
  stopGap: { paddingBottom: 18 },
  muted: { color: c.inkMuted },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  thumb: { width: 160, height: 160, borderRadius: 14, backgroundColor: c.surfaceSunken },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
});
