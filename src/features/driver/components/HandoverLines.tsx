import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
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
import { NOTE_MAX, parseReading } from '../reading';
import { totalText, type Stop, type StopLine } from '../stops';

export interface FinishedStop {
  stop: Stop;
  next: Stop | null;
}

const QUALITY = ['Good', 'Fair', 'Poor'] as const;
type Quality = (typeof QUALITY)[number];

const qty = (n: number | null, unit: string) =>
  `${Math.round((n ?? 0) * 100) / 100} ${unit}`.trim();

export function MediaPreview({ uri, kind }: { uri: string; kind: HandoverMediaKind }) {
  const s = useThemedStyles(styles);
  if (kind === 'video')
    return (
      <Button size="sm" variant="outline" label="Open video" onPress={() => Linking.openURL(uri)} />
    );
  return <Image source={{ uri }} style={s.thumb} accessibilityLabel="Photo taken at this stop" />;
}

/** Large camera tile: the proof of quality is the one thing the driver must always add. */
function ProofTile({
  picked,
  savedUrl,
  savedKind,
  onPick,
}: {
  picked: PickedImage | null;
  savedUrl: string | null;
  savedKind: HandoverMediaKind | null;
  onPick: (from: 'camera' | 'library') => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const has = Boolean(picked || savedUrl);
  const isVideo = picked ? (picked.mimeType || '').startsWith('video/') : savedKind === 'video';
  const uri = picked?.uri ?? savedUrl;
  return (
    <View style={s.proofWrap}>
      <Text style={s.label}>Proof of quality</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={has ? 'Retake the photo or video' : 'Take a photo or short video'}
        onPress={() => onPick('camera')}
        style={({ pressed }) => [s.tile, has ? s.tileDone : null, pressed ? s.pressed : null]}
      >
        {has && uri && !isVideo ? (
          <Image source={{ uri }} style={s.tileImg} />
        ) : (
          <View style={s.tileEmpty}>
            <Icon name={has ? 'check' : 'camera'} size={28} color={colors.brandInk} />
            <Text style={s.tileText}>{has ? 'Video ready' : 'Take a photo or short video'}</Text>
          </View>
        )}
        {has ? (
          <View style={s.retake}>
            <Icon name="camera" size={14} color={colors.onBrand} />
            <Text style={s.retakeText}>Retake</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => onPick('library')} hitSlop={8}>
        <Text style={s.link}>Choose from gallery instead</Text>
      </Pressable>
    </View>
  );
}

function QualityChips({ value, onChange }: { value: Quality; onChange: (q: Quality) => void }) {
  const s = useThemedStyles(styles);
  return (
    <View>
      <Text style={s.label}>Quality</Text>
      <View style={s.seg} accessibilityRole="radiogroup">
        {QUALITY.map((q) => {
          const on = q === value;
          return (
            <Pressable
              key={q}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(q)}
              style={[s.segBtn, on ? (q === 'Poor' ? s.segPoor : s.segOn) : null]}
            >
              <Text style={[s.segText, on ? s.segTextOn : null]}>{q}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** One produce line or one order: verify it, add proof, confirm, move on. */
function LineCard({
  stop,
  line,
  index,
  of,
  temp,
  range,
  isLast,
  onSaved,
}: {
  stop: Stop;
  line: StopLine;
  index: number;
  of: number;
  temp: string;
  range: { min: number | null; max: number | null };
  isLast: boolean;
  onSaved: (last: boolean) => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const pickup = stop.kind === 'pickup';
  const saved = line.pickup ?? line.dropoff;
  const [kg, setKg] = useState(
    line.pickup?.recordedKg == null ? '' : String(line.pickup.recordedKg),
  );
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const [quality, setQuality] = useState<Quality>('Good');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTicked = pickup || line.items.every((_, i) => ticked[i]);
  const text = note.trim();
  const full = quality === 'Good' ? text : `Quality: ${quality}${text ? ` — ${text}` : ''}`;
  const r = parseReading({
    kind: stop.kind,
    kg,
    temp,
    note: full,
    min: range.min,
    max: range.max,
    reservedKg: pickup ? (line.qty ?? undefined) : undefined,
  });
  const hasMedia = Boolean(picked || saved?.mediaPath);
  const needNote = quality === 'Poor' && !text;
  const ready = r.ok && hasMedia && allTicked && !line.blocked && !needNote;
  const short = pickup && line.qty != null && kg.trim() !== '' && Number(kg) < line.qty;

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
    const res =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0])
      setPicked({
        uri: res.assets[0].uri,
        mimeType: res.assets[0].mimeType,
        assetId: res.assets[0].assetId,
      });
  };

  const submit = async () => {
    if (!ready || !r.ok) return;
    setBusy(true);
    setError(null);
    try {
      const media = picked
        ? await uploadHandoverMedia(line.stopId, picked)
        : {
            path: saved?.mediaPath as string,
            kind: (saved?.mediaKind ?? 'photo') as HandoverMediaKind,
          };
      await recordHandover(line.stopId, {
        ...r.value,
        mediaPath: media.path,
        mediaKind: media.kind,
      });
      await completeStop(line.stopId);
      posthog?.capture(pickup ? 'pickup_completed' : 'delivery_completed', {
        handover_media_kind: media.kind,
        quality,
      });
      await onSaved(isLast);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  const title = pickup ? line.label : `Order ${line.orderCode}`;
  return (
    <Card style={s.active}>
      <View style={s.lineHead}>
        <Badge label={`${index} of ${of}`} tone="info" />
        <Text style={s.eyebrow}>{pickup ? 'Collect' : 'Hand over'}</Text>
      </View>
      <Text style={s.lineTitle}>{title}</Text>

      {pickup ? (
        <>
          <View style={s.expect}>
            <Text style={s.expectLabel}>Expected</Text>
            <Text style={s.expectValue}>{qty(line.qty, line.unit)}</Text>
          </View>
          <Input
            label={`Quantity you collected (${line.unit})`}
            value={kg}
            onChangeText={setKg}
            keyboardType="decimal-pad"
            maxLength={8}
          />
          <View style={s.fillRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use the full amount for ${line.label}`}
              onPress={() => setKg(String(line.qty))}
              style={({ pressed }) => [s.fill, pressed ? s.pressed : null]}
            >
              <Text style={s.fillText}>{`Full · ${qty(line.qty, line.unit)}`}</Text>
            </Pressable>
            {short ? (
              <Text
                style={s.shortText}
              >{`${qty((line.qty ?? 0) - Number(kg), line.unit)} short`}</Text>
            ) : null}
          </View>
        </>
      ) : (
        <View style={s.checks}>
          <Text style={s.label}>Check each item with the buyer</Text>
          {line.items.map((it, i) => {
            const on = Boolean(ticked[i]);
            return (
              <Pressable
                key={`${it.product}-${i}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setTicked((t) => ({ ...t, [i]: !t[i] }))}
                style={({ pressed }) => [
                  s.check,
                  on ? s.checkOn : null,
                  pressed ? s.pressed : null,
                ]}
              >
                <View style={[s.box, on ? s.boxOn : null]}>
                  {on ? (
                    <Icon name="check" size={16} color={colors.onBrand} strokeWidth={3} />
                  ) : null}
                </View>
                <Text style={s.checkName}>{it.product}</Text>
                <Text style={s.checkQty}>{qty(it.qty, it.unit)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <QualityChips value={quality} onChange={setQuality} />
      <ProofTile
        picked={picked}
        savedUrl={saved?.mediaUrl ?? null}
        savedKind={saved?.mediaKind ?? null}
        onPick={choose}
      />
      <Input
        label={quality === 'Poor' ? 'What is wrong? (required)' : 'Note (optional)'}
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX - 20}
      />

      {error ? <Banner text={error} /> : null}
      {line.blocked ? (
        <Banner
          tone="info"
          text="Collect this order's produce from the farms before delivering it."
        />
      ) : !r.ok && (temp !== '' || kg !== '') ? (
        <Banner tone="info" text={r.error} />
      ) : null}
      <Button
        size="lg"
        icon="check"
        label={pickup ? `Confirm ${line.label}` : `Confirm order ${line.orderCode}`}
        loading={busy}
        disabled={!ready}
        onPress={submit}
      />
    </Card>
  );
}

/** A line that is not the one being worked on: done (with what was recorded) or waiting its turn. */
function LineRow({ line, n, pickup }: { line: StopLine; n: number; pickup: boolean }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const done = line.state === 'done';
  const what = pickup
    ? done
      ? `${qty(line.recordedKg ?? line.qty, line.unit)} collected`
      : `Reserved ${qty(line.qty, line.unit)}`
    : line.items.map((i) => `${i.product} ${qty(i.qty, i.unit)}`).join(' · ');
  return (
    <View style={[s.mini, done ? s.miniDone : null]}>
      <View style={[s.miniDot, done ? s.miniDotDone : null]}>
        {done ? (
          <Icon name="check" size={14} color={colors.onBrand} strokeWidth={3} />
        ) : (
          <Text style={s.miniN}>{n}</Text>
        )}
      </View>
      <View style={s.miniText}>
        <Text style={s.miniTitle} numberOfLines={1}>
          {pickup ? line.label : `Order ${line.orderCode}`}
        </Text>
        <Text style={s.miniMeta} numberOfLines={2}>
          {what}
        </Text>
      </View>
      {line.blocked && !done ? <Badge label="At farm" tone="warning" /> : null}
    </View>
  );
}

/**
 * The stop as a checklist: temperature once, then each produce line or order in turn.
 * Every line is confirmed on its own with its own quantity, quality and proof, then the next one opens.
 */
export function StopFlow({
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
  const pickup = stop.kind === 'pickup';
  const [temp, setTemp] = useState(stop.temperatureC == null ? '' : String(stop.temperatureC));
  const pending = stop.lines.filter((l) => l.state === 'pending');
  // Blocked drop-off orders are skipped over: work on the first one that can be handed over.
  const active = pending.find((l) => !l.blocked) ?? null;
  const doneCount = stop.lines.length - pending.length;
  const total = totalText(stop.lines.map((l) => ({ qty: pickup ? l.qty : null, unit: l.unit })));
  const lo = range.min ?? -100;
  const hi = range.max ?? 100;

  const saved = async (last: boolean) => {
    if (last) onFinished({ stop, next });
    await onChange().catch(() => undefined);
  };

  return (
    <View style={s.flow}>
      <View style={s.progress}>
        <Text style={s.progressText}>
          {`${doneCount} of ${stop.lines.length} ${pickup ? 'produce' : 'orders'} done`}
          {pickup && total ? ` · ${total}` : ''}
        </Text>
        <View style={s.bar}>
          <View style={[s.barFill, { width: `${(doneCount / stop.lines.length) * 100}%` }]} />
        </View>
      </View>

      <Card style={s.tempCard}>
        <Input
          label={pickup ? 'Temperature at the farm (°C)' : 'Temperature at delivery (°C)'}
          value={temp}
          onChangeText={setTemp}
          keyboardType="numbers-and-punctuation"
          maxLength={6}
          hint={`Safe range ${lo} to ${hi} °C. Entered once for this stop.`}
        />
      </Card>

      {stop.lines.map((l, i) =>
        l === active ? (
          <LineCard
            key={l.stopId}
            stop={stop}
            line={l}
            index={i + 1}
            of={stop.lines.length}
            temp={temp}
            range={range}
            isLast={pending.length === 1}
            onSaved={saved}
          />
        ) : (
          <LineRow key={l.stopId} line={l} n={i + 1} pickup={pickup} />
        ),
      )}

      {!active && pending.length > 0 ? (
        <Banner tone="info" text="Collect every farmer's produce before delivering these orders." />
      ) : null}
      <Text style={s.nextHint}>{next ? `Next stop: ${next.name}` : 'This is your last stop.'}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  flow: { gap: 12 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  progress: { gap: 8 },
  progressText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.surfaceSunken,
    overflow: 'hidden' as const,
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: c.brand600 },
  tempCard: { padding: 16 },
  active: { gap: 14, padding: 20, borderWidth: 2, borderColor: c.brand600 },
  lineHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: c.brandInk,
  },
  lineTitle: {
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: c.ink,
  },
  expect: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    padding: 14,
    borderRadius: 14,
    backgroundColor: c.brandTint,
  },
  expectLabel: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.brandInk },
  expectValue: { fontFamily: fonts.heading, fontSize: 26, color: c.brandInk },
  fillRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  fill: {
    minHeight: 44,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: c.brandTint,
  },
  fillText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  shortText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.warningInk },
  label: { fontFamily: fonts.sansBold, fontSize: 13, color: c.ink, marginBottom: 6 },
  checks: { gap: 8 },
  check: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.borderSubtle,
    backgroundColor: c.surfaceCard,
  },
  checkOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  box: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: c.borderStrong,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  boxOn: { backgroundColor: c.brand600, borderColor: c.brand600 },
  checkName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  checkQty: { fontFamily: fonts.heading, fontSize: 16, color: c.ink },
  seg: { flexDirection: 'row' as const, gap: 8 },
  segBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.borderSubtle,
    backgroundColor: c.surfaceCard,
  },
  segOn: { backgroundColor: c.brand600, borderColor: c.brand600 },
  segPoor: { backgroundColor: c.dangerFill, borderColor: c.dangerFill },
  segText: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  segTextOn: { color: c.onBrand },
  proofWrap: { gap: 6 },
  tile: {
    height: 150,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    borderColor: c.brand600,
    backgroundColor: c.brandTint,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tileDone: { borderStyle: 'solid' as const },
  tileImg: { width: '100%' as const, height: '100%' as const },
  tileEmpty: { alignItems: 'center' as const, gap: 8 },
  tileText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  retake: {
    position: 'absolute' as const,
    right: 10,
    bottom: 10,
    flexDirection: 'row' as const,
    gap: 6,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: c.brand600,
  },
  retakeText: { fontFamily: fonts.sansBold, fontSize: 13, color: c.onBrand },
  link: { fontFamily: fonts.sansBold, fontSize: 13, color: c.brandInk, paddingVertical: 4 },
  thumb: { width: 160, height: 160, borderRadius: 14, backgroundColor: c.surfaceSunken },
  mini: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    backgroundColor: c.surfaceCard,
  },
  miniDone: { backgroundColor: c.surfaceSunken },
  miniDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.borderSubtle,
  },
  miniDotDone: { backgroundColor: c.brand600, borderColor: c.brand600 },
  miniN: { fontFamily: fonts.sansBold, fontSize: 13, color: c.inkMuted },
  miniText: { flex: 1, gap: 2 },
  miniTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  miniMeta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  nextHint: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.inkMuted,
    textAlign: 'center' as const,
  },
});
