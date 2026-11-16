import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Animated, Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import type { PickedImage } from '../../../services/catalogueImage';
import {
  recordHandover,
  uploadHandoverMedia,
  type HandoverMediaKind,
} from '../../../services/driver.deliveries.service';
import { completeStop } from '../../../services/driver.route.service';
import { posthog } from '../../../config/posthog';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty } from '../../ops/components/OpsBits';
import { legText, type DrivePath } from '../drivePath';
import { NOTE_MAX, parseReading } from '../reading';
import { totalText, type Stop, type StopLine } from '../stops';
import {
  BackButton,
  openMaps,
  openPhone,
  placed,
  QuickActions,
  SectionLabel,
  StepDot,
} from './bits';

const clock = (iso: string | null) =>
  iso
    ? `around ${new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}`
    : '';

const lineText = (l: StopLine) =>
  l.pickup ? `${l.label} · ${l.qty} ${l.unit}` : `Order ${l.orderCode}`;

/** What the driver is about to do, in the order they do it. */
const STEPS = {
  pickup: [
    'Drive to the farm. Call ahead if you cannot find it.',
    'Weigh each item and enter what you loaded.',
    'Check the temperature, then take a photo.',
    'Confirm to get your next stop.',
  ],
  dropoff: [
    'Hand over every order listed here.',
    'Check the temperature, then take a photo.',
    'Confirm the delivery to get your next stop.',
  ],
};

const kindLabel = (s: Stop) => (s.kind === 'pickup' ? 'Pickup' : 'Delivery');

/** A stop in a list: number, who, what, and when. The next one is marked. */
export function StopRow({
  n,
  stop,
  now,
  onPress,
}: {
  n: number;
  stop: Stop;
  now?: boolean;
  onPress: () => void;
}) {
  const s = useThemedStyles(styles);
  const done = stop.state === 'done';
  const orders = new Set(stop.lines.map((l) => l.orderId)).size;
  const what =
    stop.kind === 'pickup'
      ? stop.lines.map((l) => l.label).join(', ')
      : `${orders} order${orders === 1 ? '' : 's'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${kindLabel(stop)} ${stop.name}`}
      style={({ pressed }) => [s.row, now ? s.rowNow : null, pressed ? s.pressed : null]}
    >
      <StepDot n={n} done={done} now={now} />
      <View style={s.rowText}>
        <Text style={[s.rowTitle, done ? s.muted : null]} numberOfLines={1}>
          {stop.name}
        </Text>
        <Text style={s.meta} numberOfLines={1}>
          {[what, done ? '' : clock(stop.eta)].filter(Boolean).join(' · ')}
        </Text>
        {stop.place ? (
          <Text style={s.meta} numberOfLines={1}>
            {stop.place}
          </Text>
        ) : null}
      </View>
      <Badge
        label={done ? 'Done' : now ? 'Next' : kindLabel(stop)}
        tone={done ? 'success' : now ? 'info' : 'neutral'}
      />
    </Pressable>
  );
}

export function StopList({
  todo,
  done,
  onOpen,
}: {
  todo: Stop[];
  done: Stop[];
  onOpen: (key: string) => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.list}>
      {todo.length === 0 ? (
        <Empty
          icon="package"
          title="No stops right now"
          hint="Paid orders near you are assigned here while your location is on."
        />
      ) : (
        <>
          <SectionLabel text={`To do · ${todo.length}`} />
          {todo.map((x, i) => (
            <StopRow key={x.key} n={i + 1} stop={x} now={i === 0} onPress={() => onOpen(x.key)} />
          ))}
        </>
      )}
      {done.length > 0 ? (
        <>
          <SectionLabel text={`Completed · ${done.length}`} />
          {done.map((x, i) => (
            <StopRow key={x.key} n={i + 1} stop={x} onPress={() => onOpen(x.key)} />
          ))}
        </>
      ) : null}
    </View>
  );
}

/** Home's main card: where to go next, how far, what to pick up or hand over, and the two buttons that matter. */
export function NextStop({
  stop,
  index,
  total,
  path,
  onArrived,
}: {
  stop: Stop;
  index: number;
  total: number;
  path: DrivePath | null;
  onArrived: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const leg = legText(path?.legs[0]);
  const shown = stop.lines.slice(0, 4);
  return (
    <Card style={s.next}>
      <View style={s.nextTop}>
        <View style={s.nextBadge}>
          <Text style={s.nextNum}>{index}</Text>
        </View>
        <View style={s.rowText}>
          <Text style={s.eyebrow}>{`${kindLabel(stop)} · stop ${index} of ${total}`}</Text>
          <Text style={s.nextTitle} numberOfLines={2}>
            {stop.name}
          </Text>
        </View>
      </View>
      {stop.place ? <Text style={s.metaLg}>{stop.place}</Text> : null}
      {leg || stop.eta ? (
        <View style={s.chips}>
          {leg ? (
            <View style={s.chip}>
              <Icon name="pin" size={14} color={colors.brandInk} />
              <Text style={s.chipText}>{leg}</Text>
            </View>
          ) : null}
          {stop.eta ? (
            <View style={s.chip}>
              <Text style={s.chipText}>{clock(stop.eta)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={s.items}>
        {shown.map((l) => (
          <Text key={l.stopId} style={s.item}>
            {lineText(l)}
          </Text>
        ))}
        {stop.lines.length > shown.length ? (
          <Text style={s.meta}>{`+ ${stop.lines.length - shown.length} more`}</Text>
        ) : null}
      </View>
      <View style={s.nextActions}>
        {placed(stop.lat, stop.lng) ? (
          <Button
            size="lg"
            icon="pin"
            label="Navigate"
            style={s.grow}
            onPress={() => openMaps(stop.lat, stop.lng)}
          />
        ) : null}
        <Button
          size="lg"
          variant={placed(stop.lat, stop.lng) ? 'tonal' : 'primary'}
          icon="check"
          label={stop.kind === 'pickup' ? "I'm at the farm" : "I've arrived"}
          style={s.grow}
          onPress={onArrived}
        />
      </View>
      {stop.phone ? (
        <Button
          size="sm"
          variant="ghost"
          icon="phone"
          label={stop.kind === 'pickup' ? 'Call farmer' : 'Call buyer'}
          onPress={() => openPhone(stop.phone)}
          style={s.callBtn}
        />
      ) : null}
      <View style={s.steps}>
        <Text style={s.stepsTitle}>What to do here</Text>
        {STEPS[stop.kind].map((t, i) => (
          <View key={t} style={s.step}>
            <Text style={s.stepN}>{i + 1}</Text>
            <Text style={s.stepText}>{t}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export interface FinishedStop {
  stop: Stop;
  next: Stop | null;
}

/** One screen for a stop: who and where, what is on it, and the form that completes it. */
export function StopPage({
  stop,
  next,
  range,
  backLabel,
  onBack,
  onChange,
  onFinished,
}: {
  stop: Stop;
  next: Stop | null;
  range: { min: number | null; max: number | null };
  backLabel: string;
  onBack: () => void;
  onChange: () => Promise<void>;
  onFinished: (f: FinishedStop) => void;
}) {
  const s = useThemedStyles(styles);
  const done = stop.state === 'done';
  const orders = new Set(stop.lines.map((l) => l.orderId)).size;
  return (
    <View style={s.list}>
      <BackButton label={backLabel} onPress={onBack} />
      <Card style={s.head}>
        <View style={s.headTop}>
          <Badge label={kindLabel(stop)} tone={stop.kind === 'pickup' ? 'info' : 'success'} />
          {done ? <Badge label="Done" tone="success" /> : null}
        </View>
        <Text style={s.title}>{stop.name}</Text>
        <Text style={s.metaLg}>{stop.place || 'Address not set'}</Text>
        {orders > 1 ? <Text style={s.meta}>{`${orders} orders at this stop`}</Text> : null}
        <QuickActions
          items={[
            ...(stop.phone
              ? [
                  {
                    icon: 'phone' as const,
                    label: stop.kind === 'pickup' ? 'Call farmer' : 'Call buyer',
                    onPress: () => openPhone(stop.phone),
                  },
                ]
              : []),
            ...(placed(stop.lat, stop.lng)
              ? [
                  {
                    icon: 'pin' as const,
                    label: 'Navigate',
                    onPress: () => openMaps(stop.lat, stop.lng),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      {done ? (
        <StopSummary stop={stop} onBack={onBack} backLabel={backLabel} />
      ) : (
        <HandoverForm
          stop={stop}
          next={next}
          range={range}
          onChange={onChange}
          onFinished={onFinished}
        />
      )}
    </View>
  );
}

function MediaPreview({ uri, kind }: { uri: string; kind: HandoverMediaKind }) {
  const s = useThemedStyles(styles);
  if (kind === 'video')
    return (
      <Button size="sm" variant="outline" label="Open video" onPress={() => Linking.openURL(uri)} />
    );
  return <Image source={{ uri }} style={s.thumb} accessibilityLabel="Photo taken at this stop" />;
}

function StopSummary({
  stop,
  onBack,
  backLabel,
}: {
  stop: Stop;
  onBack: () => void;
  backLabel: string;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Card style={s.form}>
      <View style={s.headTop}>
        <Icon name="check" size={22} color={colors.brandInk} />
        <Text style={s.formTitle}>Completed</Text>
      </View>
      {stop.lines.map((l) => (
        <Text key={l.stopId} style={s.item}>
          {l.pickup
            ? `${l.label} · ${l.recordedKg ?? l.qty} ${l.unit} collected`
            : `Order ${l.orderCode} delivered`}
        </Text>
      ))}
      <Text style={s.meta}>
        {stop.temperatureC == null
          ? 'No temperature recorded'
          : `${stop.temperatureC} °C on record`}
      </Text>
      {stop.note ? <Text style={s.meta}>{stop.note}</Text> : null}
      {stop.mediaUrl ? <MediaPreview uri={stop.mediaUrl} kind={stop.mediaKind ?? 'photo'} /> : null}
      <Button label={backLabel} variant="tonal" onPress={onBack} />
    </Card>
  );
}

/**
 * Records every line at the stop in one go: a quantity per produce line, one temperature, one photo or video.
 * The photo and temperature are shared, so a farm with three crops takes one photo, not three.
 */
function HandoverForm({
  stop,
  next,
  range,
  onChange,
  onFinished,
}: {
  stop: Stop;
  next: Stop | null;
  range: { min: number | null; max: number | null };
  onChange: () => Promise<void>;
  onFinished: (f: FinishedStop) => void;
}) {
  const s = useThemedStyles(styles);
  const pending = stop.lines.filter((l) => l.state === 'pending');
  const first = pending[0];
  const saved = pending.find((l) => l.pickup?.mediaPath ?? l.dropoff?.mediaPath);
  const savedPath = saved?.pickup?.mediaPath ?? saved?.dropoff?.mediaPath ?? null;
  const savedKind = saved?.pickup?.mediaKind ?? saved?.dropoff?.mediaKind ?? null;
  const savedUrl = saved?.pickup?.mediaUrl ?? saved?.dropoff?.mediaUrl ?? null;

  const [kgs, setKgs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pending.map((l) => [
        l.stopId,
        l.pickup?.recordedKg == null ? '' : String(l.pickup.recordedKg),
      ]),
    ),
  );
  const [temp, setTemp] = useState(stop.temperatureC == null ? '' : String(stop.temperatureC));
  const [note, setNote] = useState(stop.note);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lo = range.min ?? -100;
  const hi = range.max ?? 100;
  const parsed = pending.map((l) => ({
    line: l,
    r: parseReading({
      kind: stop.kind,
      kg: kgs[l.stopId] ?? '',
      temp,
      note,
      min: range.min,
      max: range.max,
      reservedKg: l.pickup ? (l.qty ?? undefined) : undefined,
    }),
  }));
  const bad = parsed.find((p) => !p.r.ok);
  const hasMedia = Boolean(picked || savedPath);
  const blocked = stop.kind === 'dropoff' && stop.waiting > 0;
  const ready = !bad && hasMedia && !blocked && pending.length > 0;

  const choose = async (from: 'camera' | 'library') => {
    if (from === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) return;
    }
    const opts = {
      mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
      videoMaxDuration: 30,
      quality: 0.6,
    };
    const r =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets[0])
      setPicked({
        uri: r.assets[0].uri,
        mimeType: r.assets[0].mimeType,
        assetId: r.assets[0].assetId,
      });
  };

  const submit = async () => {
    if (!ready || !first) return;
    setBusy(true);
    setError(null);
    try {
      const media = picked
        ? await uploadHandoverMedia(first.stopId, picked)
        : { path: savedPath as string, kind: (savedKind ?? 'photo') as HandoverMediaKind };
      for (const p of parsed) {
        if (!p.r.ok) continue;
        await recordHandover(p.line.stopId, {
          ...p.r.value,
          mediaPath: media.path,
          mediaKind: media.kind,
        });
        await completeStop(p.line.stopId);
      }
      posthog?.capture(stop.kind === 'pickup' ? 'pickup_completed' : 'delivery_completed', {
        handover_media_kind: media.kind,
        lines: pending.length,
      });
      onFinished({ stop, next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
      onChange().catch(() => undefined);
    }
  };

  return (
    <Card style={s.form}>
      <Text style={s.formTitle}>
        {stop.kind === 'pickup' ? 'What you collected' : `What you are delivering`}
      </Text>
      {stop.kind === 'pickup' ? (
        pending.map((l) => (
          <View key={l.stopId} style={s.lineBox}>
            <View style={s.lineTop}>
              <Text style={s.item}>{l.label}</Text>
              <Text style={s.meta}>{`Reserved ${l.qty} ${l.unit}`}</Text>
            </View>
            <Input
              label={`Quantity collected (${l.unit})`}
              value={kgs[l.stopId] ?? ''}
              onChangeText={(v) => setKgs((k) => ({ ...k, [l.stopId]: v }))}
              keyboardType="decimal-pad"
              maxLength={8}
              hint="Enter 0 if there was nothing. The farmer is paid for what you record."
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use the full reserved amount for ${l.label}`}
              onPress={() => setKgs((k) => ({ ...k, [l.stopId]: String(l.qty) }))}
              style={({ pressed }) => [s.fill, pressed ? s.pressed : null]}
            >
              <Text style={s.fillText}>{`Full amount · ${l.qty} ${l.unit}`}</Text>
            </Pressable>
          </View>
        ))
      ) : (
        <View style={s.lineBox}>
          {pending.map((l) => (
            <Text key={l.stopId} style={s.item}>{`Order ${l.orderCode}`}</Text>
          ))}
        </View>
      )}
      <Input
        label="Temperature (°C)"
        value={temp}
        onChangeText={setTemp}
        keyboardType="numbers-and-punctuation"
        maxLength={6}
        hint={`Safe range ${lo} to ${hi} °C`}
      />
      <Input
        label="Condition notes (optional)"
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX}
        hint={`${note.length}/${NOTE_MAX}`}
      />
      <Text style={s.stepsTitle}>Photo or short video</Text>
      <View style={s.actions}>
        <Button
          size="sm"
          variant="outline"
          icon="camera"
          label="Take photo or video"
          onPress={() => choose('camera')}
        />
        <Button size="sm" variant="outline" label="Upload" onPress={() => choose('library')} />
      </View>
      {picked ? (
        <MediaPreview
          uri={picked.uri}
          kind={(picked.mimeType || '').startsWith('video/') ? 'video' : 'photo'}
        />
      ) : savedUrl ? (
        <MediaPreview uri={savedUrl} kind={savedKind ?? 'photo'} />
      ) : (
        <Text style={s.meta}>Add one photo or video. It is kept with the record of this stop.</Text>
      )}
      {error ? <Banner text={error} /> : null}
      {blocked ? (
        <Banner tone="info" text="Collect every farmer's produce before delivering these orders." />
      ) : bad && !bad.r.ok && (temp !== '' || Object.values(kgs).some(Boolean)) ? (
        <Banner tone="info" text={bad.r.error} />
      ) : null}
      <Button
        size="lg"
        icon="check"
        label={stop.kind === 'pickup' ? 'Confirm pickup' : 'Confirm delivery'}
        loading={busy}
        disabled={!ready}
        onPress={submit}
      />
      {next ? (
        <Text style={s.meta}>{`Next: ${next.name}`}</Text>
      ) : (
        <Text style={s.meta}>This is your last stop.</Text>
      )}
    </Card>
  );
}

/** Shown right after a stop is confirmed: the next stop is one tap away, so the driver never goes back to a list. */
export function StopDone({
  done,
  onNext,
  onHome,
}: {
  done: FinishedStop;
  onNext: (key: string) => void;
  onHome: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [pop] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [pop]);
  const { stop, next } = done;
  const total = totalText(stop.lines.map((l) => ({ qty: l.pickup ? l.qty : null, unit: l.unit })));
  return (
    <View style={s.list}>
      <Card style={s.doneCard}>
        <Animated.View style={[s.doneMark, { transform: [{ scale: pop }] }]}>
          <Icon name="check" size={36} color={colors.onBrand} strokeWidth={3} />
        </Animated.View>
        <Text style={s.title}>{stop.kind === 'pickup' ? 'Pickup complete' : 'Delivered'}</Text>
        <Text style={s.metaLg}>
          {stop.kind === 'pickup' && total ? `${total} from ${stop.name}` : stop.name}
        </Text>
      </Card>
      {next ? (
        <Card style={s.next}>
          <Text style={s.eyebrow}>{`Next stop · ${kindLabel(next)}`}</Text>
          <Text style={s.nextTitle}>{next.name}</Text>
          {next.place ? <Text style={s.metaLg}>{next.place}</Text> : null}
          <Button
            size="lg"
            icon="arrowRight"
            label="Go to next stop"
            onPress={() => onNext(next.key)}
          />
          {placed(next.lat, next.lng) ? (
            <Button
              variant="tonal"
              icon="pin"
              label="Navigate there"
              onPress={() => openMaps(next.lat, next.lng)}
            />
          ) : null}
        </Card>
      ) : (
        <Card style={s.next}>
          <Text style={s.nextTitle}>That was your last stop</Text>
          <Text style={s.metaLg}>
            You have no stops left. New ones appear here when they are assigned.
          </Text>
          <Button size="lg" label="Back to home" onPress={onHome} />
        </Card>
      )}
      {next ? <Button variant="ghost" label="Back to home" onPress={onHome} /> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  muted: { color: c.inkMuted },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  metaLg: { fontFamily: fonts.sansMedium, fontSize: 16, lineHeight: 22, color: c.inkMuted },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: c.ink,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 72,
    padding: 14,
    backgroundColor: c.surfaceCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.borderSubtle,
  },
  rowNow: { borderColor: c.brand600, borderWidth: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  next: { gap: 12, padding: 20 },
  nextTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  nextBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand600,
  },
  nextNum: { fontFamily: fonts.heading, fontSize: 24, color: c.onBrand },
  eyebrow: { fontFamily: fonts.sansBold, fontSize: 13, color: c.brandInk },
  nextTitle: {
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: c.ink,
  },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: c.brandTint,
  },
  chipText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  items: { gap: 4, paddingVertical: 4 },
  item: { fontFamily: fonts.sansBold, fontSize: 16, lineHeight: 22, color: c.ink },
  nextActions: { flexDirection: 'row' as const, gap: 10 },
  grow: { flex: 1 },
  callBtn: { alignSelf: 'flex-start' as const },
  steps: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  stepsTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  step: { flexDirection: 'row' as const, gap: 10 },
  stepN: { width: 20, fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  stepText: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 20,
    color: c.inkMuted,
  },
  head: { gap: 8, padding: 20 },
  headTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  form: { gap: 14, padding: 20 },
  formTitle: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: c.ink },
  lineBox: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: c.surfaceSunken },
  lineTop: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  fill: {
    alignSelf: 'flex-start' as const,
    minHeight: 44,
    justifyContent: 'center' as const,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: c.brandTint,
  },
  fillText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  thumb: { width: 160, height: 160, borderRadius: 14, backgroundColor: c.surfaceSunken },
  doneCard: { alignItems: 'center' as const, gap: 10, padding: 28 },
  doneMark: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand600,
  },
});
