import React from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, Text, View, type PressableStateCallbackType } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { retryAllocation, type AllocationStatus, type BoardOrder, type DriverRoute, type MediaKind } from '../../../services/ops.fulfilment.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { boardFilter, orderTrack, TRACK_STEPS } from '../orderTrack';
import { when } from './OpsBits';
import { OrderControls } from './OrderControls';
import { useAction } from './useAction';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const kgText = (n: number, unit = 'kg') => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} ${unit}`;
const ACTIVE: AllocationStatus[] = ['offered', 'accepted', 'collected'];
const ALLOC_TONE: Record<AllocationStatus, Tone> = { offered: 'warning', accepted: 'success', collected: 'info', declined: 'danger', expired: 'danger', cancelled: 'neutral' };
const ALLOC_LABEL: Record<AllocationStatus, string> = { offered: 'Waiting for farmer', accepted: 'Farmer accepted', collected: 'Collected', declined: 'Declined', expired: 'Expired', cancelled: 'Cancelled' };

const mapsUrl = (lat: number, lng: number) => (Platform.OS === 'ios'
  ? `http://maps.apple.com/?ll=${lat},${lng}`
  : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);

/** One order on its own page: status, supply, the trip from farm to buyer, and the manual fixes. */
export function OrderDetail({ order: o, drivers, onBack, onChange }: { order: BoardOrder; drivers: DriverRoute[]; onBack: () => void; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onChange);
  const st = boardFilter(o);
  const track = orderTrack(o);
  const payout = o.allocations.filter((a) => ACTIVE.includes(a.status)).reduce((n, a) => n + a.amount, 0);
  const stops = [...o.stops].sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));

  return (
    <View style={s.page}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to all orders" onPress={onBack} style={({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [s.back, hovered && s.backHover]}>
        <Icon name="arrowLeft" size={18} color={colors.ink} />
        <Text style={s.backText}>All orders</Text>
      </Pressable>

      <Card style={s.hero}>
        <View style={s.heroTop}>
          <View style={s.grow}>
            <Text style={s.code}>{o.code}</Text>
            <Text style={s.buyer}>{o.buyer}</Text>
          </View>
          <Badge label={st.label} tone={st.tone} />
        </View>
        <Text style={s.amount}>{ghs(o.amount)}</Text>
        <Text style={s.meta}>{o.items.join(', ')}</Text>
        <View style={s.facts}>
          <Fact icon="package" text={`Ordered ${when(o.createdAt)}`} />
          <Fact icon="pin" text={o.address || 'No address'} />
        </View>
        <Progress track={track} />
      </Card>

      {error ? <Banner text={error} /> : null}

      <DriverWatch order={o} />

      <Card style={s.section}>
        <View style={s.sectionHead}>
          <Text style={s.h}>Farmers and produce</Text>
          {payout > 0 ? <Text style={s.meta}>We pay {ghs(payout)} · margin {ghs(o.amount - payout)}</Text> : null}
        </View>
        {o.allocations.length === 0 ? <Text style={s.meta}>No farmer allocated yet.</Text> : o.allocations.map((a, i) => (
          <View key={a.id} style={[s.block, i > 0 && s.divider]}>
            <View style={s.row}>
              <View style={s.grow}>
                <Text style={s.value}>{a.product}</Text>
                <Text style={s.meta}>{a.farmer}</Text>
              </View>
              <Badge label={ALLOC_LABEL[a.status]} tone={ALLOC_TONE[a.status]} />
            </View>
            <View style={s.stats}>
              <Stat label="Listed" value={kgText(a.kg, a.unit)} />
              <Stat label="Taken" value={a.takenKg != null ? kgText(a.takenKg, a.unit) : 'Not yet'} />
              <Stat label="We pay" value={ghs(a.amount)} />
              {a.temperatureC != null ? <Stat label="Temperature" value={`${a.temperatureC} °C`} /> : null}
              {a.kmToBuyer != null ? <Stat label="From buyer" value={`${a.kmToBuyer} km`} /> : null}
            </View>
            {a.status === 'offered' ? <Text style={s.meta}>Farmer must answer by {when(a.expiresAt)}.</Text> : null}
            <MediaRow
              items={[
                ...a.farmerPhotos.map((uri) => ({ uri, kind: 'photo' as const, caption: 'Farmer photo' })),
                a.capturePhoto ? { uri: a.capturePhoto, kind: 'photo' as const, caption: 'Collection photo' } : null,
                a.driverMediaUrl ? { uri: a.driverMediaUrl, kind: a.driverMediaKind ?? 'photo', caption: a.driverMediaKind === 'video' ? 'Driver video' : 'Driver photo' } : null,
              ]}
            />
          </View>
        ))}
        {o.state === 'paid' && st.stage !== 'done' ? (
          <Button size="sm" variant="outline" label="Re-run allocation" loading={busy} onPress={() => run(() => retryAllocation(o.id))} style={s.self} />
        ) : null}
      </Card>

      <Card style={s.section}>
        <Text style={s.h}>Trip</Text>
        {stops.length === 0 ? <Text style={s.meta}>No stops planned yet.</Text> : stops.map((p, i) => {
          const done = p.state === 'done';
          const readings = [p.takenKg != null ? kgText(p.takenKg, p.unit) : '', p.temperatureC != null ? `${p.temperatureC} °C` : ''].filter(Boolean).join(' · ');
          return (
            <View key={p.id} style={s.stop}>
              <View style={s.rail}>
                <View style={[s.node, done && s.nodeDone]}>{done ? <Icon name="check" size={12} color="#ffffff" /> : null}</View>
                {i < stops.length - 1 ? <View style={[s.line, done && s.lineDone]} /> : null}
              </View>
              <View style={s.stopBody}>
                <View style={s.row}>
                  <Text style={[s.value, s.grow]}>{p.kind === 'dropoff' ? 'Deliver' : 'Collect'} · {p.label}</Text>
                  <Badge label={done ? 'Done' : 'Pending'} tone={done ? 'success' : 'neutral'} />
                </View>
                <Text style={s.meta}>{p.driver ? `Driver ${p.driver}` : 'No driver yet'}{p.doneAt ? ` · ${when(p.doneAt)}` : ''}{readings ? ` · ${readings}` : ''}</Text>
                <MediaRow items={p.mediaUrl ? [{ uri: p.mediaUrl, kind: p.mediaKind ?? 'photo', caption: p.kind === 'dropoff' ? 'Arrival' : 'Pickup' }] : []} />
              </View>
            </View>
          );
        })}
      </Card>

      {o.state === 'paid' ? <Card style={s.section}><OrderControls order={o} drivers={drivers} onChange={onChange} /></Card> : null}
    </View>
  );
}

function Fact({ icon, text }: { icon: 'package' | 'pin'; text: string }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <View style={s.fact}>
      <Icon name={icon} size={14} color={colors.inkMuted} />
      <Text style={[s.meta, s.grow]}>{text}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function Progress({ track }: { track: ReturnType<typeof orderTrack> }) {
  const s = useThemedStyles(styles);
  const ordered = Math.max(track.orderedKg, 0);
  const pct = (n: number) => (ordered > 0 ? Math.min(100, Math.round((n / ordered) * 100)) : 0);
  return (
    <View style={s.progress}>
      <View style={s.steps}>
        {TRACK_STEPS.map((step, i) => {
          const done = !track.cancelled && i <= track.index;
          return (
            <View key={step.key} style={s.step}>
              <View style={[s.seg, done && s.segOn]} />
              <Text style={[s.stepLabel, done && s.stepOn]} numberOfLines={1}>{step.label}</Text>
            </View>
          );
        })}
      </View>
      <View style={s.bar} accessibilityLabel={`${pct(track.collectedKg)} percent collected`}>
        <View style={[s.fill, s.fillAlloc, { width: `${pct(track.allocatedKg)}%` as `${number}%` }]} />
        <View style={[s.fill, { width: `${pct(track.collectedKg)}%` as `${number}%` }]} />
      </View>
      <Text style={s.meta}>{kgText(track.collectedKg, track.unit)} collected · {kgText(track.allocatedKg, track.unit)} allocated · {kgText(ordered, track.unit)} ordered</Text>
    </View>
  );
}

function DriverWatch({ order }: { order: BoardOrder }) {
  const s = useThemedStyles(styles);
  const track = orderTrack(order);
  const d = order.driver;
  const going = track.next;
  if (!d && !going) return null;
  return (
    <Card style={s.section}>
      <Text style={s.h}>Driver</Text>
      <Text style={s.value}>{d?.name || 'Not assigned yet'}</Text>
      {d?.lat != null && d.lng != null ? (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(mapsUrl(d.lat as number, d.lng as number))}>
          <Text style={s.link}>Last seen {d.seenAt ? when(d.seenAt) : ''} · Open on map</Text>
        </Pressable>
      ) : <Text style={s.meta}>{d?.seenAt ? `Last seen ${when(d.seenAt)}` : 'No live location yet. The driver shares it from the app.'}</Text>}
      {going ? <Text style={s.meta}>Heading to {going.label}</Text> : null}
      {going?.lat != null && going.lng != null ? (
        <Button size="sm" variant="outline" icon="pin" label="Open next stop" onPress={() => Linking.openURL(mapsUrl(going.lat as number, going.lng as number))} style={s.self} />
      ) : null}
    </Card>
  );
}

function MediaRow({ items }: { items: ({ uri: string; kind: MediaKind; caption: string } | null | undefined)[] }) {
  const s = useThemedStyles(styles);
  const shown = items.filter((x): x is { uri: string; kind: MediaKind; caption: string } => Boolean(x?.uri));
  if (shown.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.media}>
      {shown.map((m, i) => (
        <Pressable key={`${m.uri}-${i}`} accessibilityRole="button" accessibilityLabel={m.caption} onPress={() => Linking.openURL(m.uri)} style={s.tile}>
          {m.kind === 'video' ? (
            <View style={[s.thumb, s.video]}><Icon name="camera" size={22} color="#ffffff" /><Text style={s.videoLabel}>Video</Text></View>
          ) : (
            <Image source={{ uri: m.uri }} style={s.thumb} accessibilityLabel={m.caption} />
          )}
          <Text style={s.cap} numberOfLines={1}>{m.caption}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  page: { gap: 12 },
  back: { alignSelf: 'flex-start' as const, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 12 },
  backHover: { backgroundColor: c.surfaceSunken },
  backText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink },
  hero: { gap: 8, padding: 20 },
  heroTop: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  code: { fontFamily: fonts.heading, fontSize: 24, letterSpacing: -0.4, color: c.ink },
  buyer: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.inkMuted },
  amount: { fontFamily: fonts.heading, fontSize: 30, letterSpacing: -0.5, color: c.ink, fontVariant: ['tabular-nums' as const] },
  facts: { gap: 6 },
  fact: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  grow: { flex: 1, gap: 2 },
  section: { gap: 12, padding: 18 },
  sectionHead: { gap: 2 },
  h: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  block: { gap: 10 },
  divider: { paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  stats: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  stat: { flexGrow: 1, flexBasis: 110, gap: 2, padding: 10, borderRadius: 12, backgroundColor: c.surfaceSunken },
  statLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  statValue: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  stop: { flexDirection: 'row' as const, gap: 12 },
  rail: { alignItems: 'center' as const, width: 20 },
  node: { width: 20, height: 20, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  nodeDone: { backgroundColor: c.brand600, borderColor: c.brand600 },
  line: { flex: 1, width: 2, minHeight: 16, marginVertical: 2, backgroundColor: c.borderSubtle },
  lineDone: { backgroundColor: c.brand600 },
  stopBody: { flex: 1, gap: 6, paddingBottom: 14 },
  progress: { gap: 8, marginTop: 6 },
  steps: { flexDirection: 'row' as const, gap: 4 },
  step: { flex: 1, gap: 4 },
  seg: { height: 4, borderRadius: 2, backgroundColor: c.borderSubtle },
  segOn: { backgroundColor: c.brand600 },
  stepLabel: { fontFamily: fonts.sansMedium, fontSize: 10, color: c.inkMuted },
  stepOn: { color: c.ink, fontFamily: fonts.sansBold },
  bar: { height: 6, borderRadius: 3, backgroundColor: c.surfaceSunken, overflow: 'hidden' as const },
  fill: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, backgroundColor: c.brand600, borderRadius: 3 },
  fillAlloc: { backgroundColor: c.brandTint },
  media: { gap: 8 },
  tile: { width: 96, gap: 4 },
  thumb: { width: 96, height: 96, borderRadius: 12, backgroundColor: c.surfaceSunken },
  video: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brand900 },
  videoLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: '#ffffff' },
  cap: { fontFamily: fonts.sansMedium, fontSize: 11, color: c.inkMuted },
  link: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, color: c.brandInk },
  value: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  self: { alignSelf: 'flex-start' as const },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted, flexShrink: 1 },
});
