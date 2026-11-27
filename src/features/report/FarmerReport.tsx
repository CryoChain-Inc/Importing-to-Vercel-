import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Pagination } from '../../components/common';
import { Banner, useToast } from '../../components/feedback';
import { useDebounced } from '../../hooks/useDebounced';
import {
  MIME,
  NO_QUERY,
  fetchReportRows,
  fetchReportView,
  saveFile,
  savePdf,
  type ExportFormat,
  type HeatMetric,
  type ReportQuery,
  type ReportView,
} from '../../services/report.service';
import { fonts, useThemedStyles, type ColorToken } from '../../theme';
import { Empty, PanelSkeleton, Stat, StatGrid } from '../ops/components/OpsBits';
import { ExportBar } from './ExportBar';
import { FarmerRow } from './FarmerRow';
import { FilterSelect } from './FilterSelect';
import { HeatMap } from './HeatMap';
import { ReportFilters } from './ReportFilters';
import { buildPdfHtml } from './exportPdf';
import { buildXlsx } from './exportXlsx';
import {
  NEEDS_UNIT,
  heatCaption,
  isFiltered,
  reportFileName,
  toCsv,
  unitsText,
} from './farmerReport';

const SIZES = [10, 25, 50].map((n) => ({ value: String(n), label: `${n} per page` }));
const LABEL: Record<ExportFormat, string> = { pdf: 'PDF report', xlsx: 'Excel workbook', csv: 'CSV' };

/**
 * Farmers, their stock and where they are. Search, filters, sorting and paging all run in the database; this screen
 * holds one page of farmers plus the map points. Shared by the ops console and the government site.
 */
export function FarmerReport() {
  const s = useThemedStyles(styles);
  const toast = useToast();
  const [base, setBase] = useState<ReportQuery>(NO_QUERY);
  const [text, setText] = useState('');
  const [metric, setMetric] = useState<HeatMetric>('farmers');
  const [size, setSize] = useState(10);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<ReportView | null>(null);
  const [loaded, setLoaded] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [rev, setRev] = useState(0);
  const [everyone, setEveryone] = useState<number | null>(null); // farmers with no filters on, for "12 of 340"

  // Typing waits for a short pause, then becomes part of the query.
  const q = useDebounced(text, 300);
  const query = useMemo(() => ({ ...base, q }), [base, q]);
  // The page goes back to 1 by itself whenever the filters, sort or map metric change.
  const filterKey = JSON.stringify([query, metric, size]);
  const [pg, setPg] = useState({ key: filterKey, n: 1 });
  const page = pg.key === filterKey ? pg.n : 1;
  const setPage = (n: number) => setPg({ key: filterKey, n });
  const key = JSON.stringify([filterKey, page, rev]);
  const busy = loaded !== key;

  useEffect(() => {
    let live = true;
    fetchReportView(query, metric, page, size)
      .then((v) => {
        if (!live) return;
        if (!isFiltered(query)) setEveryone(v.total);
        // A stale page (the filters shrank the list) falls back to the first one.
        if (!v.farmers.length && v.total > 0 && page > 1) return setPg({ key: filterKey, n: 1 });
        setView(v);
        setError(null);
        setLoaded(key);
      })
      .catch((e: Error) => {
        if (!live) return;
        setError(e.message);
        setLoaded(key);
      });
    return () => {
      live = false;
    };
    // `key` covers every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const change = useCallback((patch: Partial<ReportQuery>) => {
    const { q: typed, ...rest } = patch;
    if (typed !== undefined) setText(typed);
    setBase((p) => {
      const next = { ...p, ...rest };
      // Amount sorts and shading only compare inside one unit.
      if (!next.unit && NEEDS_UNIT.includes(next.sort)) next.sort = NO_QUERY.sort;
      return next;
    });
    if ('unit' in rest && !rest.unit) setMetric('farmers');
  }, []);
  const clear = () => {
    setText('');
    setBase(NO_QUERY);
    setMetric('farmers');
  };

  const download = async (fmt: ExportFormat) => {
    if (!view) return;
    setExporting(fmt);
    try {
      const rows = await fetchReportRows(query);
      const generated = new Date();
      if (fmt === 'csv') await saveFile(toCsv(rows), reportFileName('csv'), MIME.csv);
      else if (fmt === 'xlsx')
        await saveFile(buildXlsx({ rows, view, query, generated }), reportFileName('xlsx'), MIME.xlsx);
      else
        await savePdf(
          buildPdfHtml({
            rows,
            view,
            query,
            generated,
            metricNote: heatCaption(query.unit ? metric : 'farmers', query.unit),
            title: reportFileName('pdf').replace(/\.pdf$/, ''),
          }),
          reportFileName('pdf'),
        );
      toast.show(
        fmt === 'pdf' ? 'Choose “Save as PDF” in the print window.' : `${LABEL[fmt]} downloaded.`,
        'success',
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not export the report.', 'error');
    } finally {
      setExporting(null);
    }
  };

  if (!view)
    return error ? (
      <View style={s.gap}>
        <Banner text={error} />
        <Button
          label="Try again"
          variant="outline"
          onPress={() => {
            setError(null);
            setRev((n) => n + 1);
          }}
        />
      </View>
    ) : (
      <PanelSkeleton variant="stats" />
    );
  if (!isFiltered(query) && view.total === 0)
    return (
      <Empty
        icon="users"
        title="No farmers yet"
        hint="Farmers appear in this report after they sign up and add their farm location."
      />
    );

  const filtered = isFiltered(query);
  const mapped = view.points.length > 0;
  const map = (
    <View style={s.mapCol}>
      {mapped ? (
        <HeatMap
          points={view.points}
          total={view.total}
          located={view.located}
          metric={metric}
          onMetric={setMetric}
          unit={query.unit}
        />
      ) : (
        <Card style={s.noMap}>
          <Text style={s.h}>Nothing to map</Text>
          <Text style={s.meta}>
            None of these farmers has shared a farm location
            {query.unit && metric !== 'farmers' ? `, or has any ${query.unit} ${metric === 'listed' ? 'listed' : 'in stock'}` : ''}
            .
          </Text>
        </Card>
      )}
    </View>
  );

  return (
    <View style={s.gap}>
      <StatGrid>
        <Stat
          label="Farmers"
          value={view.total.toLocaleString('en-GH')}
          note={filtered && everyone != null ? `of ${everyone.toLocaleString('en-GH')}` : undefined}
          icon="users"
        />
        <Stat
          label="On the map"
          value={view.located.toLocaleString('en-GH')}
          note={
            view.located < view.total ? `${view.total - view.located} without a location` : 'All located'
          }
          icon="pin"
        />
        <Stat label="Listings" value={view.listings.toLocaleString('en-GH')} icon="leaf" />
        <Stat label="Listed" value={unitsText(view.totals, 'listed')} icon="package" />
        <Stat label="Still in stock" value={unitsText(view.totals, 'remaining')} tone="brand" icon="grid" />
      </StatGrid>

      <ReportFilters
        query={query}
        text={text}
        onText={setText}
        onChange={change}
        onClear={clear}
        options={view.options}
      />

      <ExportBar
        count={view.total}
        busy={exporting}
        disabled={busy || view.total === 0}
        onExport={download}
      />

      <View style={[s.dim, busy && s.busy]}>
        {map}

        <View style={s.listHead}>
          <Text style={s.h}>Farmers</Text>
          <Text style={s.meta}>
            {view.total.toLocaleString('en-GH')} match{view.total === 1 ? 'es' : ''}
          </Text>
        </View>
        {view.farmers.length === 0 ? (
          <Empty
            icon="search"
            title="No farmer matches"
            hint="Try a different spelling, or remove a filter."
          />
        ) : (
          view.farmers.map((x) => (
            <FarmerRow
              key={x.id}
              farmer={x}
              open={open === x.id}
              onToggle={() => setOpen(open === x.id ? null : x.id)}
            />
          ))
        )}
        <View style={s.foot}>
          <Text style={s.meta}>
            {view.total
              ? `Showing ${(page - 1) * size + 1}–${Math.min(page * size, view.total)} of ${view.total.toLocaleString('en-GH')}`
              : 'No farmers to show'}
          </Text>
          <View style={s.perPage}>
            <FilterSelect
              label="Show"
              value={String(size)}
              options={SIZES}
              onChange={(v) => setSize(Number(v))}
            />
          </View>
        </View>
        <Pagination page={page} total={view.total} pageSize={size} onPage={setPage} noun="farmers" />
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  gap: { gap: 14 },
  dim: { gap: 14 },
  busy: { opacity: 0.55 },
  mapCol: { flex: 1, minWidth: 0 },
  foot: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  perPage: { width: 190 },
  noMap: { gap: 6, minHeight: 160, justifyContent: 'center' as const },
  listHead: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    marginTop: 6,
  },
  h: { fontFamily: fonts.heading, fontSize: 20, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
