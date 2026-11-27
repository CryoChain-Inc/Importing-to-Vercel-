import React, { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '../../components/common';
import type { HeatMetric, ReportPoint } from '../../services/report.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { fmtQty, formatPhone } from '../../utils/format';
import { Meter } from '../ops/components/OpsBits';
import { HeatCanvas } from './HeatCanvas';
import { HEAT_STOPS } from './heat';
import { METRICS, heatCaption } from './farmerReport';

interface Props {
  points: ReportPoint[];
  /** Farmers that match the filters, and how many of them have a farm location. */
  total: number;
  located: number;
  metric: HeatMetric;
  onMetric: (m: HeatMetric) => void;
  /** Listed / In stock only compare inside one unit; without one the map just counts farmers. */
  unit: string;
  height?: number;
}

/** The density map with its own controls floating on top: metric switch, counts, legend and the picked farmer. */
export function HeatMap({ points, total, located, metric, onMetric, unit, height = 540 }: Props) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const wide = useWindowDimensions().width >= 720;
  const [picked, setPicked] = useState<ReportPoint | null>(null);
  const [fit, setFit] = useState(0);
  // A farmer that the filters removed can't stay selected.
  const sel = picked && points.some((p) => p.id === picked.id) ? picked : null;
  const setSel = setPicked;

  const m = unit ? metric : 'farmers';
  return (
    <View style={[s.box, { height: wide ? height : Math.min(height, 460) }]}>
      <HeatCanvas points={points} selectedId={sel?.id ?? null} onSelect={setSel} fitSignal={fit} />

      <View style={s.top} pointerEvents="box-none">
        {unit ? (
          <View style={s.metrics} accessibilityRole="tablist">
            {(Object.keys(METRICS) as HeatMetric[]).map((k) => (
              <Pressable
                key={k}
                accessibilityRole="tab"
                accessibilityState={{ selected: m === k }}
                onPress={() => onMetric(k)}
                style={[s.metric, m === k && s.metricOn]}
              >
                <Text style={[s.metricText, m === k && s.metricTextOn]}>{METRICS[k]}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={s.pill}>
            <Icon name="grid" size={14} color={colors.brandInk} />
            <Text style={s.pillText}>Pick a unit to shade by amount</Text>
          </View>
        )}
        <View style={s.topRight}>
          <View style={s.pill}>
            <Icon name="pin" size={14} color={colors.brandInk} />
            <Text style={s.pillText}>
              {located} on the map
              {located < total ? ` · ${total - located} without a location` : ''}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fit all farmers"
            onPress={() => {
              setSel(null);
              setFit((n) => n + 1);
            }}
            style={s.fab}
          >
            <Icon name="locate" size={18} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {sel ? (
        <View style={[s.card, wide ? s.cardWide : s.cardNarrow]}>
          <View style={s.cardHead}>
            <View style={s.grow}>
              <Text style={s.cardName} numberOfLines={1}>
                {sel.name}
              </Text>
              <Text style={s.cardMeta} numberOfLines={1}>
                {[formatPhone(sel.phone), sel.address].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={() => setSel(null)}
            >
              <Icon name="close" size={18} color={colors.inkMuted} />
            </Pressable>
          </View>
          {sel.totals.length ? (
            sel.totals.map((t) => (
              <View key={t.unit} style={s.stockRow}>
                <View style={s.stockText}>
                  <Text style={s.cardValue}>{fmtQty(t.remaining, t.unit)} in stock</Text>
                  <Text style={s.cardMeta}>of {fmtQty(t.listed, t.unit)} listed</Text>
                </View>
                <Meter pct={t.listed ? (t.remaining / t.listed) * 100 : 0} />
              </View>
            ))
          ) : (
            <Text style={s.cardMeta}>Nothing listed yet</Text>
          )}
        </View>
      ) : null}

      {!sel || wide ? (
        <View style={s.legend} pointerEvents="none">
          <Text style={s.legendTitle}>{heatCaption(m, unit)}</Text>
          <Svg width="100%" height={10}>
            <Defs>
              <LinearGradient id="heatramp" x1="0" y1="0" x2="1" y2="0">
                {HEAT_STOPS.map(([o, c]) => (
                  <Stop key={o} offset={o} stopColor={c} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect width="100%" height={10} rx={5} fill="url(#heatramp)" />
          </Svg>
          <View style={s.legendEnds}>
            <Text style={s.legendEnd}>Fewer</Text>
            <Text style={s.legendEnd}>More</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const glass = (c: Record<ColorToken, string>) => ({
  backgroundColor: `${c.surfaceCard}f0`,
  borderWidth: 1,
  borderColor: c.borderSubtle,
  boxShadow: '0 6px 22px rgba(10, 61, 36, 0.16)',
});

const styles = (c: Record<ColorToken, string>) => ({
  box: { borderRadius: 18, overflow: 'hidden' as const, backgroundColor: c.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  top: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    padding: 12,
    gap: 8,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
  },
  topRight: { flexDirection: 'row' as const, gap: 8, alignItems: 'center' as const },
  metrics: { ...glass(c), flexDirection: 'row' as const, padding: 4, borderRadius: 14, gap: 2 },
  metric: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center' as const,
  },
  metricOn: { backgroundColor: c.brand700 },
  metricText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.inkMuted },
  metricTextOn: { color: c.onBrand },
  pill: {
    ...glass(c),
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  pillText: { fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: c.ink },
  fab: {
    ...glass(c),
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  legend: {
    ...glass(c),
    position: 'absolute' as const,
    left: 12,
    bottom: 12,
    width: 230,
    padding: 12,
    gap: 6,
    borderRadius: 14,
  },
  legendTitle: { fontFamily: fonts.sansBold, fontSize: 12.5, color: c.ink },
  legendEnds: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  legendEnd: { fontFamily: fonts.sansMedium, fontSize: 11.5, color: c.inkMuted },
  card: { ...glass(c), position: 'absolute' as const, padding: 14, gap: 10, borderRadius: 16 },
  cardWide: { right: 12, bottom: 12, width: 300 },
  cardNarrow: { left: 12, right: 12, bottom: 12 },
  cardHead: { flexDirection: 'row' as const, gap: 10, alignItems: 'flex-start' as const },
  cardName: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  cardMeta: { fontFamily: fonts.sansRegular, fontSize: 12.5, color: c.inkMuted },
  cardValue: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  stockRow: { gap: 6 },
  stockText: { gap: 1 },
});
