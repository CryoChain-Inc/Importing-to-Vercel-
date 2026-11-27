import type {
  HeatMetric,
  ReportQuery,
  ReportRow,
  SortKey,
  Status,
  UnitTotals,
} from '../../services/report.service';
import { NO_QUERY } from '../../services/report.service';
import { fmtQty } from '../../utils/format';

export const STATUS: Record<Status, string> = {
  all: 'All',
  in_stock: 'In stock',
  sold_out: 'Sold out',
  none: 'Nothing listed',
};
export const SORTS: Record<SortKey, string> = {
  name: 'Name',
  joined: 'Date joined',
  listings: 'Number of listings',
  listed: 'Amount listed',
  remaining: 'Amount in stock',
};
export const METRICS: Record<HeatMetric, string> = {
  farmers: 'Farmers',
  listed: 'Listed',
  remaining: 'In stock',
};
/** What the map shades, in words. */
export const heatCaption = (m: HeatMetric, unit: string) =>
  m === 'farmers' || !unit
    ? 'Farmers in the area'
    : m === 'listed'
      ? `${unit} listed in the area`
      : `${unit} in stock in the area`;
/** Amount sorts and map shading compare quantities, which only add up inside one unit. */
export const NEEDS_UNIT: SortKey[] = ['listed', 'remaining'];

export const isFiltered = (q: ReportQuery) =>
  q.q.trim() !== '' ||
  q.product !== '' ||
  q.unit !== '' ||
  q.status !== NO_QUERY.status;

/** Active filters as plain sentences, for the PDF and Excel cover. */
export function describeQuery(q: ReportQuery): string[] {
  const out: string[] = [];
  if (q.q.trim()) out.push(`Search: “${q.q.trim()}”`);
  if (q.product) out.push(`Product: ${q.product}`);
  if (q.unit) out.push(`Unit: ${q.unit}`);
  if (q.status !== 'all') out.push(`Stock: ${STATUS[q.status]}`);
  return out;
}

/** "120 kg · 8 bunch": one figure per unit, since units never add up. */
export const unitsText = (
  t: Pick<UnitTotals, 'unit' | 'listed' | 'remaining'>[],
  k: 'listed' | 'remaining',
) =>
  t
    .filter((v) => v[k] > 0 || k === 'listed')
    .map((v) => fmtQty(v[k], v.unit))
    .join(' · ') || '—';

export const fileStamp = () => new Date().toISOString().slice(0, 10);
/** "Farmer-Stock-Report_2026-11-27.pdf" */
export const reportFileName = (ext: 'pdf' | 'xlsx' | 'csv') => `Farmer-Stock-Report_${fileStamp()}.${ext}`;

/** Neutralises cells a spreadsheet would run as a formula (names and addresses are typed by farmers). */
const cell = (v: string | number | boolean | null): string => {
  let s = v == null ? '' : String(v);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s().-]+$/.test(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const COLUMNS = [
  'Farmer',
  'Phone',
  'Farm address',
  'Latitude',
  'Longitude',
  'Joined',
  'Product',
  'Unit',
  'Listed',
  'Sold',
  'Delivered',
  'In stock',
  'Listed on',
] as const;
/** Columns that hold quantities (right-aligned, numeric). */
export const AMOUNT_COLS = [8, 9, 10, 11];
export const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** The cells of one export row, in COLUMNS order. A farmer with nothing listed has empty stock cells. */
export const rowCells = (r: ReportRow): (string | number | null)[] => [
  r.farmerName,
  r.phone,
  r.address,
  r.latitude,
  r.longitude,
  day(r.joinedAt),
  r.listingId ? r.product : '',
  r.listingId ? r.unit : '',
  r.listingId ? r.listed : null,
  r.listingId ? r.sold : null,
  r.listingId ? r.delivered : null,
  r.listingId ? r.remaining : null,
  day(r.listedAt),
];

/** The export rows as CSV, with a byte-order mark so Excel reads the UTF-8 names correctly. */
export function toCsv(rows: ReportRow[]): string {
  const body = rows.map((r) => rowCells(r).map(cell).join(','));
  return `﻿${[COLUMNS.join(','), ...body].join('\r\n')}\r\n`;
}

/** "FSR-20261127-0930": the number printed on the PDF and the Excel cover. */
export const reportNo = (d: Date) => {
  const iso = d.toISOString();
  return `FSR-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 16).replace(':', '')}`;
};

/** Stock by product and unit, with farmer and listing counts. */
export function byProduct(rows: ReportRow[]) {
  const m = new Map<string, { product: string; unit: string; farmers: Set<string>; listings: number } & Omit<UnitTotals, 'unit'>>();
  for (const r of rows) {
    if (!r.listingId) continue;
    const k = `${r.product}\u0000${r.unit}`;
    const e = m.get(k) ?? { product: r.product, unit: r.unit, farmers: new Set<string>(), listings: 0, listed: 0, sold: 0, delivered: 0, remaining: 0 };
    e.farmers.add(r.farmerId);
    e.listings += 1;
    e.listed += r.listed;
    e.sold += r.sold;
    e.delivered += r.delivered;
    e.remaining += r.remaining;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => a.product.localeCompare(b.product) || a.unit.localeCompare(b.unit));
}

