import React, { useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { retryAllocation, type AllocationStatus, type BoardOrder, type MediaKind } from '../../../services/ops.fulfilment.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { boardFilter, orderTrack, TRACK_STEPS } from '../orderTrack';
import { Empty, Segmented, usePaged, when } from './OpsBits';
import { useAction } from './useAction';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type Stage = 'attention' | 'farmers' | 'moving' | 'done' | 'closed';

const kgText = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} kg`;
const ACTIVE: AllocationStatus[] = ['offered', 'accepted', 'collected'];

const ALLOC_TONE: Record<AllocationStatus, Tone> = { offered: 'warning', accepted: 'success', collected: 'info', declined: 'danger', expired: 'danger', cancelled: 'neutral' };

const mapsUrl = (lat: number, lng: number) => (Platform.OS === 'ios'
  ? `http://maps.apple.com/?ll=${lat},${lng}`
  : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);

/** Paid orders with supply progress, farmer photos, driver readings and the live location of the truck. */
export function OrdersBoard({ orders, onChange }: { orders: BoardOrder[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { busy, error, run } = useAction(onChange);
  const [filter, setFilter] = useState<'all' | Stage>('all');
  const [open, setOpen] = useState<string | null>(null);
  const withStage = orders.map((o) => ({ o, st: boardFilter(o), track: orderTrack(o) }));
  const count = (f: Stage) => withStage.filter((x) => x.st.stage === f).length;
  const shown = withStage.filter((x) => filter === 'all' || x.st.stage === filter);
  const { rows, more } = usePaged(shown, filter, 6);

  if (orders.length === 0) return <Empty icon="package" title="No orders yet" hint="Orders appear here as soon as a buyer checks out. Paid orders are allocated to farmers and routed automatically." />;
  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Segmented value={filter} onChange={setFilter} options={[
        { key: 'all', label: 'All', count: orders.length },
        { key: 'attention', label: 'Attention', count: count('attention') },
        { key: 'farmers', label: 'Farmers', count: count('farmers') },
        { key: 'moving', label: 'Moving', count: count('moving') },
        { key: 'done', label: 'Delivered', count: count('done') },
      ]} />
      {rows.length === 0 ? <Text style={s.meta}>Nothing here.</Text> : null}
      {rows.map(({ o, st, track }) => {
        const on = open === o.id;
        const payout = o.allocations.filter((a) => ACTIVE.includes(a.status)).reduce((n, a) => n + a.amount, 0);
        return (
          <Card key={o.id} style={s.item}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : o.id)} style={s.head}>
              <View style={s.grow}>
                <Text style={s.name}>{o.code} · {o.buyer}</Text>
                <Text style={s.meta} numberOfLines={on ? undefined : 1}>{o.items.join(', ')}</Text>
              </View>
              <View style={s.right}>
                <Text style={s.amount}>{ghs(o.amount)}</Text>
                <Badge label={st.label} tone={st.tone} />
              </View>
              <Icon name="chevronRight" size={16} color={colors.inkMuted} />
            </Pressable>

            {on ? (
              <View style={s.body}>
                <Progress track={track} />
                <Text style={s.meta}>{when(o.createdAt)} · {o.address || 'No address'}</Text>

                <DriverWatch order={o} />

                <Text style={s.sub}>Farmers and produce</Text>
                {o.allocations.length === 0 ? <Text style={s.meta}>No farmer allocated yet.</Text> : o.allocations.map((a) => (
                  <View key={a.id} style={s.alloc}>
                    <View style={s.row}>
                      <View style={s.grow}>
                        <Text style={s.value}>{a.farmer} · {a.product}</Text>
                        <Text style={s.meta}>Listed {kgText(a.kg)} grade {a.grade}{a.kmToBuyer != null ? ` · ${a.kmToBuyer} km from buyer` : ''}</Text>
                        {a.takenKg != null ? <Text style={s.value}>Taken {kgText(a.takenKg)} grade {a.takenGrade ?? a.grade}{a.temperatureC != null ? ` · ${a.temperatureC} °C` : ''}</Text> : <Text style={s.meta}>Quantity not taken yet.</Text>}
                        <Text style={s.meta}>We pay {ghs(a.amount)}{a.status === 'offered' ? ` · answer by ${when(a.expiresAt)}` : ''}</Text>
                      </View>
                      <Badge label={a.status} tone={ALLOC_TONE[a.status]} />
                    </View>
                    <MediaRow
                      items={[
                        ...a.farmerPhotos.map((uri) => ({ uri, kind: 'photo' as const, caption: 'Farmer photo' })),
                        a.capturePhoto ? { uri: a.capturePhoto, kind: 'photo' as const, caption: 'Collection photo' } : null,
                        a.driverMediaUrl ? { uri: a.driverMediaUrl, kind: a.driverMediaKind ?? 'photo', caption: a.driverMediaKind === 'video' ? 'Driver video' : 'Driver photo' } : null,
                      ]}
                    />
                  </View>
                ))}
                {payout > 0 ? <Text style={s.meta}>Farmer cost {ghs(payout)} · margin {ghs(o.amount - payout)}</Text> : null}

                <Text style={s.sub}>Route</Text>
                {o.stops.length === 0 ? <Text style={s.meta}>No stops planned yet.</Text> : o.stops.map((p) => (
                  <View key={p.id} style={s.alloc}>
                    <View style={s.row}>
                      <View style={s.grow}>
                        <Text style={s.value}>{p.seq ? `${p.seq}. ` : ''}{p.label}</Text>
                        <Text style={s.meta}>{p.driver ? `Driver ${p.driver}` : 'No driver yet'}{p.doneAt ? ` · ${when(p.doneAt)}` : ''}</Text>
                        {p.takenKg != null || p.temperatureC != null ? (
                          <Text style={s.meta}>
                            {[p.takenKg != null ? kgText(p.takenKg) : '', p.takenGrade ? `grade ${p.takenGrade}` : '', p.temperatureC != null ? `${p.temperatureC} °C` : ''].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      <Badge label={p.state === 'done' ? 'Done' : 'Pending'} tone={p.state === 'done' ? 'success' : 'neutral'} />
                    </View>
                    <MediaRow items={p.mediaUrl ? [{ uri: p.mediaUrl, kind: p.mediaKind ?? 'photo', caption: p.kind === 'dropoff' ? 'Arrival' : 'Pickup' }] : []} />
                  </View>
                ))}

                {o.state === 'paid' && st.stage !== 'done' ? (
                  <Button size="sm" variant="outline" label="Re-run allocation" loading={busy} onPress={() => run(() => retryAllocation(o.id))} />
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}
      {more}
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
          const current = !track.cancelled && i === track.index;
          return (
            <View key={step.key} style={s.step}>
              <View style={[s.dot, done && s.dotOn, current && s.dotNow]} />
              <Text style={[s.stepLabel, done && s.stepOn]} numberOfLines={1}>{step.label}</Text>
            </View>
          );
        })}
      </View>
      <Text style={s.meta}>Supply {kgText(track.collectedKg)} taken of {kgText(ordered)} ordered · {kgText(track.allocatedKg)} allocated ({pct(track.collectedKg)}% collected)</Text>
      <View style={s.bar} accessibilityLabel={`${pct(track.collectedKg)} percent collected`}>
        <View style={[s.fill, { width: `${pct(track.allocatedKg)}%` as `${number}%` }, s.fillAlloc]} />
        <View style={[s.fill, { width: `${pct(track.collectedKg)}%` as `${number}%` }]} />
      </View>
    </View>
  );
}

function DriverWatch({ order }: { order: BoardOrder }) {
  const s = useThemedStyles(styles);
  const track = orderTrack(order);
  const d = order.driver;
  if (!d && !track.next) return null;
  const going = track.next;
  return (
    <View style={s.watch}>
      <Text style={s.sub}>Driver</Text>
      <Text style={s.value}>{d?.name || 'Not assigned yet'}</Text>
      {d?.lat != null && d.lng != null ? (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(mapsUrl(d.lat as number, d.lng as number))}>
          <Text style={s.link}>Last seen {d.seenAt ? when(d.seenAt) : ''} · {d.lat.toFixed(4)}, {d.lng.toFixed(4)} · Open map</Text>
        </Pressable>
      ) : <Text style={s.meta}>{d?.seenAt ? `Last seen ${when(d.seenAt)}` : 'No live location yet. The driver shares it from the app.'}</Text>}
      {going ? (
        <Text style={s.meta}>Going to {going.label}{going.lat != null && going.lng != null ? ` · ${going.lat.toFixed(4)}, ${going.lng.toFixed(4)}` : ''}</Text>
      ) : track.key === 'delivered' ? <Text style={s.meta}>This order has been delivered.</Text> : null}
      {going?.lat != null && going.lng != null ? (
        <Button size="sm" variant="outline" icon="pin" label="Open next stop" onPress={() => Linking.openURL(mapsUrl(going.lat as number, going.lng as number))} />
      ) : null}
    </View>
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
  list: { gap: 12 },
  item: { gap: 10, padding: 16 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  grow: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end' as const, gap: 4 },
  body: { gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: 10 },
  alloc: { gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  progress: { gap: 8 },
  steps: { flexDirection: 'row' as const, gap: 4 },
  step: { flex: 1, alignItems: 'center' as const, gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.borderSubtle },
  dotOn: { backgroundColor: c.brand600 },
  dotNow: { transform: [{ scale: 1.25 }] },
  stepLabel: { fontFamily: fonts.sansMedium, fontSize: 10, color: c.inkMuted, textAlign: 'center' as const },
  stepOn: { color: c.ink, fontFamily: fonts.sansBold },
  bar: { height: 8, borderRadius: 4, backgroundColor: c.surfaceSunken, overflow: 'hidden' as const },
  fill: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, backgroundColor: c.brand600, borderRadius: 4 },
  fillAlloc: { backgroundColor: c.brandTint },
  watch: { gap: 4, padding: 12, borderRadius: 14, backgroundColor: c.surfaceSunken },
  media: { gap: 8 },
  tile: { width: 96, gap: 4 },
  thumb: { width: 96, height: 96, borderRadius: 12, backgroundColor: c.surfaceSunken },
  video: { alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brand900 },
  videoLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: '#ffffff' },
  cap: { fontFamily: fonts.sansMedium, fontSize: 11, color: c.inkMuted },
  link: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, color: c.brandInk },
  name: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  value: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  sub: { fontFamily: fonts.sansBold, fontSize: 13, color: c.inkMuted, marginTop: 4 },
  amount: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted, flexShrink: 1 },
});
