import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input, Pagination } from '../../components/common';
import { Banner, useToast } from '../../components/feedback';
import { fetchFarmerReport, saveCsv, type ReportRow } from '../../services/report.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { fmtQty, formatPhone } from '../../utils/format';
import { Empty, PanelSkeleton, Stat, StatGrid } from '../ops/components/OpsBits';
import {
  NO_FILTERS,
  applyFilters,
  byArea,
  groupFarmers,
  heatPoints,
  sortFarmers,
  sumByUnit,
  toCsv,
  type ByUnit,
  type Filters,
  type HeatMetric,
  type SortKey,
  type Status,
} from './farmerReport';
import { HeatMap } from './HeatMap';

const ALL = 'All';
const PAGE = 15;
const STATUS: Record<Status, string> = {
  all: ALL,
  in_stock: 'In stock',
  sold_out: 'Sold out',
  none: 'Nothing listed',
};
const WALLET = { all: ALL, verified: 'Verified', unverified: 'Not verified' } as const;
const SORTS: Record<SortKey, string> = {
  name: 'Name',
  locality: 'Collection point',
  joined: 'Joined',
  listings: 'Listings',
  listed: 'Listed',
  remaining: 'In stock',
};
const METRICS: Record<HeatMetric, string> = {
  farmers: 'Farmers',
  listed: 'Listed',
  remaining: 'In stock',
};
const keyOf = <T extends string>(map: Record<T, string>, label: string) =>
  (Object.keys(map) as T[]).find((k) => map[k] === label) ?? (Object.keys(map)[0] as T);
const unitsText = (t: ByUnit, k: 'listed' | 'remaining') =>
  Object.entries(t)
    .filter(([, v]) => v[k] > 0 || k === 'listed')
    .map(([u, v]) => fmtQty(v[k], u))
    .join(' · ') || '—';

/**
 * Farmers, their stock and where they are, with filters, sorting, a density map and a CSV export.
 * Shared by the ops console and the government site; both read the same guarded database report.
 */
export function FarmerReport() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const toast = useToast();
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('joined');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [metric, setMetric] = useState<HeatMetric>('farmers');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchFarmerReport()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const farmers = useMemo(() => groupFarmers(rows ?? []), [rows]);
  const options = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
    const lines = (rows ?? []).filter((r) => r.listingId);
    return {
      localities: uniq(farmers.map((x) => x.locality)),
      products: uniq(lines.map((r) => r.product)),
      units: uniq(lines.map((r) => r.unit)),
    };
  }, [rows, farmers]);

  const shown = useMemo(
    () => sortFarmers(applyFilters(farmers, f), sort, dir, f.unit),
    [farmers, f, sort, dir],
  );
  const totals = useMemo(() => sumByUnit(shown), [shown]);
  const area = useMemo(() => byArea(shown), [shown]);
  const points = useMemo(() => heatPoints(shown, metric, f.unit), [shown, metric, f.unit]);
  const pageRows = shown.slice((page - 1) * PAGE, page * PAGE);

  const set = (patch: Partial<Filters>) => {
    setF((p) => ({ ...p, ...patch }));
    setPage(1);
    // Listed / In stock only compare inside one unit.
    if ('unit' in patch && !patch.unit) {
      setMetric('farmers');
      if (sort === 'listed' || sort === 'remaining') setSort('joined');
    }
  };
  const filtered = JSON.stringify(f) !== JSON.stringify(NO_FILTERS);
  const unitSorts = f.unit
    ? (Object.keys(SORTS) as SortKey[])
    : (['name', 'locality', 'joined', 'listings'] as SortKey[]);

  const exportCsv = async () => {
    try {
      await saveCsv(toCsv(shown), `cryochain-farmers-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not export the report.', 'error');
    }
  };

  if (!rows)
    return error ? (
      <View style={s.gap}>
        <Banner text={error} />
        <Button
          label="Try again"
          variant="outline"
          onPress={() => {
            setError(null);
            load();
          }}
        />
      </View>
    ) : (
      <PanelSkeleton variant="list" />
    );
  if (!farmers.length)
    return (
      <Empty
        icon="users"
        title="No farmers yet"
        hint="Farmers appear in this report after they sign up and add their farm location."
      />
    );

  const located = shown.filter((x) => x.lat != null).length;
  return (
    <View style={s.gap}>
      <StatGrid>
        <Stat
          label="Farmers"
          value={String(shown.length)}
          note={filtered ? `of ${farmers.length}` : undefined}
          icon="users"
        />
        <Stat
          label="On the map"
          value={String(located)}
          note={
            located < shown.length ? `${shown.length - located} without a location` : 'All located'
          }
          icon="pin"
        />
        <Stat
          label="Listings"
          value={String(shown.reduce((n, x) => n + x.lines.length, 0))}
          icon="leaf"
        />
        <Stat label="Listed" value={unitsText(totals, 'listed')} icon="package" />
        <Stat
          label="Still in stock"
          value={unitsText(totals, 'remaining')}
          tone="brand"
          icon="grid"
        />
      </StatGrid>

      <Card style={s.panel}>
        <Input
          label="Search"
          value={f.q}
          onChangeText={(q) => set({ q })}
          placeholder="Name, phone, town or address"
        />
        <View style={s.chips}>
          <ChoiceChips
            label="Collection point"
            options={[ALL, ...options.localities]}
            value={f.locality || ALL}
            onChange={(v) => set({ locality: v === ALL ? '' : v })}
          />
          <ChoiceChips
            label="Product"
            options={[ALL, ...options.products]}
            value={f.product || ALL}
            onChange={(v) => set({ product: v === ALL ? '' : v })}
          />
          <ChoiceChips
            label="Unit"
            options={[ALL, ...options.units]}
            value={f.unit || ALL}
            onChange={(v) => set({ unit: v === ALL ? '' : v })}
          />
          <ChoiceChips
            label="Stock"
            options={Object.values(STATUS)}
            value={STATUS[f.status]}
            onChange={(v) => set({ status: keyOf(STATUS, v) })}
          />
          <ChoiceChips
            label="Wallet"
            options={Object.values(WALLET)}
            value={WALLET[f.wallet]}
            onChange={(v) => set({ wallet: keyOf(WALLET, v) })}
          />
        </View>
        <View style={s.bar}>
          <View style={s.grow}>
            <ChoiceChips
              label="Sort by"
              options={unitSorts.map((k) => SORTS[k])}
              value={SORTS[sort]}
              onChange={(v) => {
                setSort(keyOf(SORTS, v));
                setPage(1);
              }}
            />
          </View>
          <Button
            label={dir === 'asc' ? 'Ascending' : 'Descending'}
            variant="outline"
            size="sm"
            icon={dir === 'asc' ? 'chevronUp' : 'chevronDown'}
            onPress={() => setDir(dir === 'asc' ? 'desc' : 'asc')}
          />
        </View>
        <View style={s.bar}>
          {filtered ? (
            <Button
              label="Clear filters"
              variant="ghost"
              size="sm"
              onPress={() => {
                setF(NO_FILTERS);
                setPage(1);
                setMetric('farmers');
              }}
            />
          ) : (
            <View />
          )}
          <Button
            label={`Export CSV · ${shown.length} farmer${shown.length === 1 ? '' : 's'}`}
            icon="download"
            onPress={exportCsv}
            disabled={!shown.length}
          />
        </View>
      </Card>

      <Card style={s.panel}>
        <View style={s.bar}>
          <View style={s.grow}>
            <Text style={s.h}>Where farmers are</Text>
            <Text style={s.meta}>
              Darker areas have more{' '}
              {metric === 'farmers'
                ? 'farmers'
                : metric === 'listed'
                  ? `${f.unit} listed`
                  : `${f.unit} in stock`}
              . Tap a dot for the farmer.
            </Text>
          </View>
          {f.unit ? (
            <ChoiceChips
              label="Shade by"
              options={Object.values(METRICS)}
              value={METRICS[metric]}
              onChange={(v) => setMetric(keyOf(METRICS, v))}
            />
          ) : null}
        </View>
        {points.length ? (
          <HeatMap points={points} />
        ) : (
          <Text style={s.meta}>None of these farmers has shared a farm location yet.</Text>
        )}
      </Card>

      <Card style={s.panel}>
        <Text style={s.h}>By collection point</Text>
        {area.map((a) => (
          <View key={a.locality} style={s.areaRow}>
            <Text style={[s.value, s.grow]} numberOfLines={1}>
              {a.locality}
            </Text>
            <Text style={s.meta}>
              {a.farmers} farmer{a.farmers === 1 ? '' : 's'}
            </Text>
            <Text style={[s.value, s.areaStock]} numberOfLines={1}>
              {unitsText(a.totals, 'listed')}
            </Text>
          </View>
        ))}
      </Card>

      <Text style={s.h}>Farmers</Text>
      {shown.length === 0 ? <Text style={s.meta}>No farmer matches these filters.</Text> : null}
      {pageRows.map((x) => {
        const on = open === x.id;
        return (
          <Card key={x.id} style={s.item}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: on }}
              onPress={() => setOpen(on ? null : x.id)}
              style={s.head}
            >
              <View style={s.grow}>
                <Text style={s.name} numberOfLines={1}>
                  {x.name}
                </Text>
                <Text style={s.meta} numberOfLines={1}>
                  {[x.locality, formatPhone(x.phone)].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              <View style={s.stock}>
                <Text style={s.value} numberOfLines={1}>
                  {x.lines.length ? unitsText(x.totals, 'listed') : 'Nothing listed'}
                </Text>
                {x.lines.length ? (
                  <Text style={s.meta} numberOfLines={1}>
                    {unitsText(x.totals, 'remaining')} left
                  </Text>
                ) : null}
              </View>
              <Badge
                label={x.walletVerified ? 'Verified' : 'Not verified'}
                tone={x.walletVerified ? 'success' : 'warning'}
              />
              <Icon name="chevronDown" size={18} color={colors.inkMuted} />
            </Pressable>
            {on ? (
              <View style={s.body}>
                <Text style={s.meta}>Farm address</Text>
                <Text style={s.value}>{x.address || '—'}</Text>
                <Text style={s.meta}>
                  {x.lat != null
                    ? `GPS ${x.lat.toFixed(5)}, ${x.lng?.toFixed(5)}`
                    : 'No GPS location shared'}{' '}
                  · Joined {new Date(x.joinedAt).toLocaleDateString('en-GH')}
                </Text>
                {x.lines.map((l) => (
                  <View key={l.listingId} style={s.line}>
                    <Text style={[s.value, s.grow]} numberOfLines={1}>
                      {l.product}
                    </Text>
                    <Text style={s.cell}>{fmtQty(l.listed, l.unit)} listed</Text>
                    <Text style={s.cell}>{fmtQty(l.sold, l.unit)} sold</Text>
                    <Text style={s.cell}>{fmtQty(l.delivered, l.unit)} delivered</Text>
                    <Text style={[s.cell, s.strong]}>{fmtQty(l.remaining, l.unit)} left</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
      <Pagination
        page={page}
        total={shown.length}
        pageSize={PAGE}
        onPage={setPage}
        noun="farmers"
      />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  gap: { gap: 14 },
  panel: { gap: 12 },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  bar: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  grow: { flex: 1, minWidth: 160, gap: 2 },
  h: { fontFamily: fonts.heading, fontSize: 18, color: c.ink },
  areaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  areaStock: { minWidth: 120, textAlign: 'right' as const },
  item: { padding: 0, overflow: 'hidden' as const },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    padding: 14,
    minHeight: 64,
  },
  stock: { alignItems: 'flex-end' as const, minWidth: 130 },
  body: { gap: 6, padding: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  line: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 4,
  },
  cell: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.inkMuted,
    fontVariant: ['tabular-nums' as const],
  },
  strong: { fontFamily: fonts.sansBold, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  value: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
