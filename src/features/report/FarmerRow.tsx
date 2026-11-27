import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Icon } from '../../components/common';
import type { ReportFarmer } from '../../services/report.service';
import {
  focusRing,
  fonts,
  useTheme,
  useThemedStyles,
  type ColorToken,
  type PressState,
} from '../../theme';
import { fmtQty, formatPhone } from '../../utils/format';
import { Meter } from '../ops/components/OpsBits';
import { unitsText } from './farmerReport';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
const hue = (name: string) => [...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 2;
const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' });

function Fig({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.fig}>
      <Text style={s.figLabel}>{label}</Text>
      <Text style={[s.figValue, strong && s.figStrong]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** One farmer: who, where, how much they listed and how much is left. Opens to show every listing. */
export function FarmerRow({
  farmer: x,
  open,
  onToggle,
}: {
  farmer: ReportFarmer;
  open: boolean;
  onToggle: () => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const one = x.totals.length === 1 ? x.totals[0] : null;
  const alt = hue(x.name) === 1;
  return (
    <Card style={s.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${x.name}, ${x.lines.length} listings`}
        onPress={onToggle}
        style={({ hovered, pressed, focused }: PressState) => [
          s.head,
          hovered && s.hover,
          pressed && s.press,
          focused && focusRing(colors.focusRing),
        ]}
      >
        <View style={[s.avatar, { backgroundColor: alt ? colors.harvestTint : colors.brandTint }]}>
          <Text style={[s.initials, { color: alt ? colors.harvestInk : colors.brandInk }]}>
            {initials(x.name)}
          </Text>
        </View>
        <View style={s.who}>
          <Text style={s.name} numberOfLines={1}>
            {x.name}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {formatPhone(x.phone) || x.address || '—'}
          </Text>
        </View>
        <View style={s.stock}>
          {x.lines.length ? (
            <>
              <Text style={s.value} numberOfLines={1}>
                {unitsText(x.totals, 'remaining')} in stock
              </Text>
              <Text style={s.meta} numberOfLines={1}>
                of {unitsText(x.totals, 'listed')} listed
              </Text>
              {one ? (
                <View style={s.meter}>
                  <Meter pct={one.listed ? (one.remaining / one.listed) * 100 : 0} />
                </View>
              ) : null}
            </>
          ) : (
            <Text style={s.meta}>Nothing listed</Text>
          )}
        </View>
        <View style={open && s.flip}>
          <Icon name="chevronDown" size={18} color={colors.inkMuted} />
        </View>
      </Pressable>

      {open ? (
        <View style={s.body}>
          <View style={s.facts}>
            <View style={s.fact}>
              <Icon name="pin" size={15} color={colors.inkMuted} />
              <Text style={s.factText}>
                {x.address || 'No address on file'}
                {x.lat != null && x.lng != null
                  ? `  ·  ${x.lat.toFixed(4)}, ${x.lng.toFixed(4)}`
                  : '  ·  No farm location'}
              </Text>
            </View>
            <View style={s.fact}>
              <Icon name="user" size={15} color={colors.inkMuted} />
              <Text style={s.factText}>Joined {date(x.joinedAt)}</Text>
            </View>
          </View>
          {x.lines.length ? (
            x.lines.map((l) => (
              <View key={l.id} style={s.line}>
                <View style={s.lineTop}>
                  <View style={s.product}>
                    <Text style={s.productName} numberOfLines={1}>
                      {l.product}
                    </Text>
                    {l.listedAt ? <Text style={s.meta}>Listed {date(l.listedAt)}</Text> : null}
                  </View>
                  <Fig label="Listed" value={fmtQty(l.listed, l.unit)} />
                  <Fig label="Sold" value={fmtQty(l.sold, l.unit)} />
                  <Fig label="Delivered" value={fmtQty(l.delivered, l.unit)} />
                  <Fig label="In stock" value={fmtQty(l.remaining, l.unit)} strong />
                </View>
                <Meter pct={l.listed ? (l.remaining / l.listed) * 100 : 0} />
              </View>
            ))
          ) : (
            <Text style={s.meta}>This farmer hasn’t listed anything yet.</Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { padding: 0, overflow: 'hidden' as const },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
    padding: 14,
    minHeight: 76,
  },
  hover: { backgroundColor: c.surfaceSunken },
  press: { opacity: 0.9 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  initials: { fontFamily: fonts.heading, fontSize: 16 },
  who: { flex: 1, minWidth: 150, gap: 2 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  stock: { minWidth: 170, gap: 2, alignItems: 'flex-end' as const },
  meter: { width: 150, marginTop: 4 },
  value: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  flip: { transform: [{ rotate: '180deg' }] },
  body: {
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
    backgroundColor: c.surfaceSunken,
  },
  facts: { gap: 6, marginBottom: 2 },
  fact: { flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const },
  factText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  line: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.surfaceCard },
  lineTop: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14, alignItems: 'center' as const },
  product: { flex: 1, minWidth: 140, gap: 1 },
  productName: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  fig: { minWidth: 84, gap: 1 },
  figLabel: { fontFamily: fonts.sansMedium, fontSize: 11.5, color: c.inkMuted },
  figValue: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  figStrong: { color: c.brandInk, fontFamily: fonts.sansBold },
});
