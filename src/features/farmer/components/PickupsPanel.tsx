import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Badge, Card, Icon } from '../../../components/common';
import type { Pickup, PickupState } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';

const qty = (n: number, unit: string) =>
  `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} ${unit}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short' });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });

const LABEL: Record<PickupState, string> = {
  waiting: 'Reserved',
  on_the_way: 'Truck on the way',
  collected: 'Collected',
  delivered: 'Delivered · payment due',
  paid: 'Paid',
  not_supplied: 'Not supplied',
};
const TONE: Record<PickupState, 'info' | 'warning' | 'success' | 'neutral'> = {
  waiting: 'warning',
  on_the_way: 'info',
  collected: 'info',
  delivered: 'info',
  paid: 'success',
  not_supplied: 'neutral',
};
const STEPS = ['Reserved', 'On the way', 'Collected', 'Paid'];
const STEP: Record<PickupState, number> = {
  waiting: 0,
  on_the_way: 1,
  collected: 2,
  delivered: 2,
  paid: 3,
  not_supplied: -1,
};

type Styles = ReturnType<typeof styles>;

/** The farmer's pickups: one tracker card per pickup (stage, truck arrival, driver) and a history of what was collected. */
export function PickupsPanel({ pickups }: { pickups: Pickup[] }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [view, setView] = useState<'ahead' | 'past'>('ahead');
  const ahead = pickups.filter((p) => p.state === 'waiting' || p.state === 'on_the_way');
  const past = pickups.filter((p) => !ahead.includes(p));
  const done = past.filter((p) => p.state !== 'not_supplied');
  const expected = done.reduce((n, p) => n + p.expected, 0);
  const collected = done.reduce((n, p) => n + p.collected, 0);
  const upcoming = ahead.reduce((n, p) => n + p.earning, 0);
  const earned = done.reduce((n, p) => n + p.earning, 0);
  const shown = view === 'ahead' ? ahead : past;

  if (pickups.length === 0) {
    return (
      <Card style={s.empty}>
        <View style={s.emptyIcon}>
          <Icon name="truck" size={26} color={colors.brandInk} />
        </View>
        <Text style={s.title}>No pickups yet</Text>
        <Text style={s.note}>
          When a buyer orders your produce, the pickup, the driver and the truck’s arrival time
          appear here.
        </Text>
      </Card>
    );
  }

  return (
    <View style={s.list}>
      <Card style={s.summary}>
        <Stat s={s} label="Coming up" value={ahead.length.toString()} note={ghs(upcoming)} />
        <View style={s.divider} />
        <Stat
          s={s}
          label="Collected"
          value={expected > 0 ? `${Math.round((collected / expected) * 100)}%` : '—'}
          note={`${done.length} ${done.length === 1 ? 'pickup' : 'pickups'}`}
        />
        <View style={s.divider} />
        <Stat s={s} label="Earned" value={ghs(earned)} note="from collected" />
      </Card>

      <View style={s.seg} accessibilityRole="tablist">
        {(
          [
            ['ahead', 'Coming up', ahead.length],
            ['past', 'History', past.length],
          ] as const
        ).map(([key, label, n]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === key }}
            onPress={() => setView(key)}
            style={[s.segItem, view === key && s.segOn]}
          >
            <Text style={[s.segText, view === key && s.segTextOn]}>
              {label} · {n}
            </Text>
          </Pressable>
        ))}
      </View>

      {shown.length === 0 ? (
        <Text style={s.meta}>
          {view === 'ahead' ? 'No pickups booked right now.' : 'Nothing collected yet.'}
        </Text>
      ) : null}
      {shown.map((p) => (
        <PickupCard key={p.id} p={p} s={s} />
      ))}
    </View>
  );
}

function Stat({
  s,
  label,
  value,
  note,
}: {
  s: Styles;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <View style={s.stat}>
      <Text style={s.meta}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.meta}>{note}</Text>
    </View>
  );
}

function PickupCard({ p, s }: { p: Pickup; s: Styles }) {
  const { colors } = useTheme();
  const isAhead = p.state === 'waiting' || p.state === 'on_the_way';
  const pct = p.expected > 0 ? Math.min(1, p.collected / p.expected) : 0;
  const full = p.state !== 'not_supplied' && p.short <= 0;
  const callable = !!p.driver?.phone;

  return (
    <Card style={s.item}>
      <View style={s.row}>
        <View style={s.grow}>
          <Text style={s.name}>{p.product}</Text>
          <Text style={s.meta}>
            {isAhead
              ? `${qty(p.expected, p.unit)} reserved`
              : p.collectedAt
                ? `Collected ${day(p.collectedAt)}, ${time(p.collectedAt)}`
                : `Reserved ${day(p.reservedAt)}`}
          </Text>
        </View>
        <Badge label={LABEL[p.state]} tone={TONE[p.state]} />
      </View>

      {STEP[p.state] >= 0 ? <Stepper at={STEP[p.state]} s={s} /> : null}

      {isAhead ? (
        <View style={s.eta}>
          <Icon name="truck" size={18} color={colors.brandInk} />
          <Text style={s.when}>
            {p.state === 'on_the_way' && p.eta
              ? `Arriving ${day(p.eta)}, around ${time(p.eta)}`
              : 'A truck is assigned shortly. We will tell you.'}
          </Text>
        </View>
      ) : (
        <View style={s.collect}>
          <View style={s.row}>
            <Text style={s.value}>
              {qty(p.collected, p.unit)}
              <Text style={s.meta}> of {qty(p.expected, p.unit)} collected</Text>
            </Text>
            {p.short > 0 ? <Text style={s.short}>{qty(p.short, p.unit)} short</Text> : null}
          </View>
          <View style={s.track}>
            <View style={[s.fill, full ? s.fillFull : s.fillShort, { flex: pct }]} />
            <View style={{ flex: 1 - pct }} />
          </View>
        </View>
      )}

      {isAhead && p.driver ? (
        <View style={s.driver}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials(p.driver.name)}</Text>
          </View>
          <View style={s.grow}>
            <Text style={s.driverName} numberOfLines={1}>
              {p.driver.name || 'Your driver'}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {[p.driver.plate, p.driver.vehicle, p.driver.phone].filter(Boolean).join(' · ') ||
                'Truck details not set'}
            </Text>
          </View>
          {callable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${p.driver.name || 'the driver'}`}
              hitSlop={6}
              onPress={() => Linking.openURL(`tel:${p.driver!.phone.replace(/[^\d+]/g, '')}`)}
              style={({ pressed }) => [s.call, pressed && s.pressed]}
            >
              <Icon name="phone" size={18} color={colors.brandInk} />
              <Text style={s.callText}>Call</Text>
            </Pressable>
          ) : null}
        </View>
      ) : isAhead ? (
        <Text style={s.meta}>
          Your driver’s name and number show here once a truck is assigned.
        </Text>
      ) : null}

      <View style={s.foot}>
        <Text style={[s.meta, s.shrink]}>
          {isAhead
            ? `Paid on what the driver collects. If you have less, report it from the listing.`
            : p.state === 'not_supplied'
              ? 'Nothing was collected.'
              : p.paid >= p.earning && p.earning > 0
                ? 'Paid out to your wallet'
                : 'Payment due'}
        </Text>
        <Text style={s.earn}>
          {isAhead ? '≈ ' : ''}
          {ghs(p.earning)}
        </Text>
      </View>
    </Card>
  );
}

function Stepper({ at, s }: { at: number; s: Styles }) {
  return (
    <View
      style={s.steps}
      accessible
      accessibilityLabel={`Step ${at + 1} of ${STEPS.length}: ${STEPS[at]}`}
    >
      {STEPS.map((label, i) => (
        <View key={label} style={s.step}>
          <View style={s.stepLine}>
            <View style={[s.seam, i > 0 && i <= at && s.seamOn, i === 0 && s.seamNone]} />
            <View style={[s.dot, i <= at && s.dotOn, i === at && s.dotNow]} />
            <View style={[s.seam, i < at && s.seamOn, i === STEPS.length - 1 && s.seamNone]} />
          </View>
          <Text style={[s.stepText, i === at && s.stepNow]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  grow: { flex: 1, gap: 2 },
  item: { gap: 14 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  summary: { flexDirection: 'row' as const, paddingVertical: 16, paddingHorizontal: 8 },
  stat: { flex: 1, alignItems: 'center' as const, gap: 2, paddingHorizontal: 4 },
  statValue: {
    fontFamily: fonts.heading,
    fontSize: 22,
    letterSpacing: -0.4,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  divider: { width: 1, backgroundColor: c.borderSubtle, marginVertical: 4 },
  seg: {
    flexDirection: 'row' as const,
    backgroundColor: c.surfaceSunken,
    borderRadius: 12,
    padding: 4,
  },
  segItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 9,
  },
  segOn: { backgroundColor: c.surfaceCard },
  segText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.inkMuted },
  segTextOn: { color: c.ink },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 18, letterSpacing: -0.2, color: c.ink },
  when: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, lineHeight: 21, color: c.ink },
  eta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: c.brandTint,
    borderRadius: 12,
    padding: 12,
  },
  value: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  short: { fontFamily: fonts.sansBold, fontSize: 13, color: c.harvestInk },
  collect: { gap: 8 },
  track: {
    flexDirection: 'row' as const,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden' as const,
    backgroundColor: c.surfaceSunken,
  },
  fill: { borderRadius: 4 },
  fillFull: { backgroundColor: c.brand500 },
  fillShort: { backgroundColor: c.harvestFill },
  steps: { flexDirection: 'row' as const },
  step: { flex: 1, alignItems: 'center' as const, gap: 6 },
  stepLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    height: 18,
  },
  seam: { flex: 1, height: 2, backgroundColor: c.borderSubtle },
  seamOn: { backgroundColor: c.brand500 },
  seamNone: { backgroundColor: 'transparent' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.borderSubtle },
  dotOn: { backgroundColor: c.brand500 },
  dotNow: { borderWidth: 3, borderColor: c.brandTint, width: 18, height: 18, borderRadius: 9 },
  stepText: { fontFamily: fonts.sansMedium, fontSize: 11, color: c.inkMuted },
  stepNow: { fontFamily: fonts.sansBold, color: c.ink },
  driver: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
    paddingTop: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brand700,
  },
  avatarText: { fontFamily: fonts.sansBold, fontSize: 15, color: '#ffffff' },
  driverName: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  call: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: c.brandTint,
  },
  callText: { fontFamily: fonts.sansBold, fontSize: 14, color: c.brandInk },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  foot: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  shrink: { flex: 1 },
  earn: {
    flexShrink: 0,
    fontFamily: fonts.heading,
    fontSize: 18,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  note: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 21,
    color: c.inkMuted,
    textAlign: 'center' as const,
    maxWidth: 360,
  },
  empty: { alignItems: 'center' as const, gap: 10, paddingVertical: 40 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
});
