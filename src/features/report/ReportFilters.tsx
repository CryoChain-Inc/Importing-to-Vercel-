import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card, Icon } from '../../components/common';
import type { ReportQuery, SortKey, Status } from '../../services/report.service';
import {
  focusRing,
  fonts,
  useTheme,
  useThemedStyles,
  type ColorToken,
  type PressState,
} from '../../theme';
import { Segmented } from '../ops/components/OpsBits';
import { FilterSelect, type Option } from './FilterSelect';
import { NEEDS_UNIT, SORTS, STATUS, describeQuery, isFiltered } from './farmerReport';

interface Props {
  query: ReportQuery;
  /** The search box's own text; the query follows it after a short pause. */
  text: string;
  onText: (t: string) => void;
  onChange: (patch: Partial<ReportQuery>) => void;
  onClear: () => void;
  options: { products: string[]; units: string[] };
}

const opt = (xs: string[]): Option[] => xs.map((v) => ({ value: v, label: v }));
const seg = <K extends string>(map: Record<K, string>) =>
  (Object.keys(map) as K[]).map((key) => ({ key, label: map[key] }));

/** Search, dropdown filters, status switches, sort and the chips of everything that is switched on. */
export function ReportFilters({ query, text, onText, onChange, onClear, options }: Props) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  const sorts = (Object.keys(SORTS) as SortKey[])
    .filter((k) => query.unit || !NEEDS_UNIT.includes(k))
    .map((k) => ({
      value: k,
      label: SORTS[k],
    }));
  const chips: { label: string; off: Partial<ReportQuery> }[] = [
    ...(query.q.trim() ? [{ label: `“${query.q.trim()}”`, off: { q: '' } }] : []),
    ...(query.product ? [{ label: query.product, off: { product: '' } }] : []),
    ...(query.unit ? [{ label: `Unit: ${query.unit}`, off: { unit: '' } }] : []),
    ...(query.status !== 'all'
      ? [{ label: STATUS[query.status], off: { status: 'all' as Status } }]
      : []),
  ];

  return (
    <Card style={s.card}>
      <View style={s.row}>
        <View style={[s.search, focus && s.searchOn]}>
          <Icon name="search" size={18} color={focus ? colors.brandInk : colors.inkMuted} />
          <TextInput
            value={text}
            onChangeText={onText}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="Search name, phone, town or address"
            placeholderTextColor={colors.inkMuted}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search farmers"
            style={[s.searchInput, { outlineStyle: 'none' } as object]}
          />
          {text ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
              onPress={() => onText('')}
            >
              <Icon name="close" size={16} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={s.sort}>
          <View style={s.grow}>
            <FilterSelect
              label="Sort by"
              value={query.sort}
              options={sorts}
              onChange={(v) => onChange({ sort: v as SortKey })}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={query.dir === 'asc' ? 'Ascending. Switch to descending' : 'Descending. Switch to ascending'}
            onPress={() => onChange({ dir: query.dir === 'asc' ? 'desc' : 'asc' })}
            style={({ hovered, pressed, focused }: PressState) => [
              s.dir,
              hovered && s.dirHover,
              pressed && s.dirPress,
              focused && focusRing(colors.focusRing),
            ]}
          >
            <Icon
              name={query.dir === 'asc' ? 'chevronUp' : 'chevronDown'}
              size={20}
              color={colors.brandInk}
            />
          </Pressable>
        </View>
      </View>

      <View style={s.selects}>
        <View style={s.select}>
          <FilterSelect
            label="Product"
            value={query.product}
            options={opt(options.products)}
            anyLabel="All products"
            onChange={(product) => onChange({ product })}
          />
        </View>
        <View style={s.select}>
          <FilterSelect
            label="Unit"
            value={query.unit}
            options={opt(options.units)}
            anyLabel="All units"
            onChange={(unit) => onChange({ unit })}
          />
        </View>
      </View>

      <View style={s.row}>
        <View style={s.segBox}>
          <Text style={s.segLabel}>Stock</Text>
          <Segmented
            options={seg(STATUS)}
            value={query.status}
            onChange={(status) => onChange({ status })}
          />
        </View>
      </View>

      {isFiltered(query) ? (
        <View style={s.chips}>
          {chips.map((c) => (
            <Pressable
              key={c.label}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${c.label}`}
              onPress={() => onChange(c.off)}
              style={({ hovered, focused }: PressState) => [
                s.chip,
                hovered && s.chipHover,
                focused && focusRing(colors.focusRing),
              ]}
            >
              <Text style={s.chipText} numberOfLines={1}>
                {c.label}
              </Text>
              <Icon name="close" size={13} color={colors.brandInk} />
            </Pressable>
          ))}
          <Button label="Clear all" variant="ghost" size="sm" onPress={onClear} />
        </View>
      ) : null}
      <Text style={s.srOnly} accessibilityLiveRegion="polite">
        {describeQuery(query).join(', ')}
      </Text>
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 14 },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end' as const },
  grow: { flex: 1, minWidth: 0 },
  search: {
    flex: 2,
    minWidth: 260,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: c.fieldBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchOn: { backgroundColor: c.surfaceCard, borderColor: c.brand600 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.ink,
    paddingVertical: 12,
  },
  sort: { flex: 1, minWidth: 220, flexDirection: 'row' as const, gap: 8, alignItems: 'stretch' as const },
  dir: {
    width: 54,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  dirHover: { backgroundColor: c.fieldBg },
  dirPress: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  selects: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  select: { flex: 1, minWidth: 190 },
  segBox: { flex: 1, minWidth: 260, gap: 6 },
  segLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    alignItems: 'center' as const,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: 34,
    maxWidth: 240,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: c.brandTint,
  },
  chipHover: { backgroundColor: c.fieldBg },
  chipText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.brandInk, flexShrink: 1 },
  srOnly: { position: 'absolute' as const, width: 1, height: 1, opacity: 0 },
});
