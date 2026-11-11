import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Card, Icon } from '../../../components/common';
import type { Pickup, PickupState } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';

const qty = (n: number, unit: string) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 2 })} ${unit}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GH', { weekday: 'short', day: 'numeric', month: 'short' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });

const LABEL: Record<PickupState, string> = {
  waiting: 'Reserved', on_the_way: 'Truck on the way', collected: 'Collected', delivered: 'Delivered · payment due', paid: 'Paid', not_supplied: 'Not supplied',
};
const TONE: Record<PickupState, 'info' | 'warning' | 'success' | 'neutral'> = {
  waiting: 'warning', on_the_way: 'info', collected: 'info', delivered: 'info', paid: 'success', not_supplied: 'neutral',
};

/** The farmer's pickup schedule (what is coming and when) and history (expected, collected, paid). */
export function PickupsPanel({ pickups }: { pickups: Pickup[] }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const ahead = pickups.filter((p) => p.state === 'waiting' || p.state === 'on_the_way');
  const past = pickups.filter((p) => !ahead.includes(p));
  const done = past.filter((p) => p.state !== 'not_supplied');
  const expected = done.reduce((n, p) => n + p.expected, 0);
  const collected = done.reduce((n, p) => n + p.collected, 0);

  if (pickups.length === 0) {
    return (
      <Card style={s.empty}>
        <View style={s.emptyIcon}><Icon name="truck" size={26} color={colors.brandInk} /></View>
        <Text style={s.title}>No pickups yet</Text>
        <Text style={s.note}>When a buyer orders your produce, the pickup and the truck’s arrival time appear here.</Text>
      </Card>
    );
  }

  return (
    <View style={s.list}>
      <Text style={s.section}>Coming up</Text>
      {ahead.length === 0 ? <Text style={s.meta}>No pickups booked right now.</Text> : null}
      {ahead.map((p) => (
        <Card key={p.id} tone="tint" style={s.item}>
          <View style={s.row}>
            <Text style={s.name}>{qty(p.expected, p.unit)} {p.product}</Text>
            <Badge label={LABEL[p.state]} tone={TONE[p.state]} />
          </View>
          <Text style={s.when}>
            {p.state === 'on_the_way' && p.eta ? `Truck expected ${day(p.eta)} around ${time(p.eta)}` : 'We will tell you when a truck is on its way.'}
          </Text>
          <Text style={s.meta}>You earn about {ghs(p.earning)} for this quantity, paid on what the driver collects. If you have less, report it from the listing now.</Text>
        </Card>
      ))}

      {past.length > 0 ? (
        <>
          <Text style={s.section}>History</Text>
          {expected > 0 ? (
            <Text style={s.meta}>
              Collected {Math.round((collected / expected) * 100)}% of what was reserved across {done.length} {done.length === 1 ? 'pickup' : 'pickups'}.
            </Text>
          ) : null}
          {past.map((p) => (
            <Card key={p.id} style={s.item}>
              <View style={s.row}>
                <Text style={s.name}>{p.product}</Text>
                <Badge label={LABEL[p.state]} tone={TONE[p.state]} />
              </View>
              <View style={s.facts}>
                <Fact label="Expected" value={qty(p.expected, p.unit)} s={s} />
                <Fact label="Collected" value={qty(p.collected, p.unit)} s={s} />
                <Fact label="Short" value={p.short > 0 ? qty(p.short, p.unit) : '—'} s={s} />
                <Fact label={p.paid >= p.earning && p.earning > 0 ? 'Paid' : 'Earned'} value={ghs(p.earning)} s={s} />
              </View>
              <Text style={s.meta}>{p.collectedAt ? `Collected ${day(p.collectedAt)} at ${time(p.collectedAt)}` : `Reserved ${day(p.reservedAt)}`}</Text>
            </Card>
          ))}
        </>
      ) : null}
    </View>
  );
}

function Fact({ label, value, s }: { label: string; value: string; s: ReturnType<typeof styles> }) {
  return (
    <View style={s.fact}>
      <Text style={s.meta}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 8 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 10 },
  facts: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 16 },
  fact: { gap: 2, minWidth: 64 },
  section: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, marginTop: 6 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  when: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  note: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, color: c.inkMuted, textAlign: 'center' as const, maxWidth: 360 },
  empty: { alignItems: 'center' as const, gap: 10, paddingVertical: 40 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
});
