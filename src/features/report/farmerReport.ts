import type { ReportRow } from '../../services/report.service';

export interface Totals {
  listed: number;
  sold: number;
  delivered: number;
  remaining: number;
}
/** Stock per unit: units (kg, bunch...) never add up across each other. */
export type ByUnit = Record<string, Totals>;

export interface ReportFarmer {
  id: string;
  name: string;
  phone: string;
  locality: string;
  address: string;
  lat: number | null;
  lng: number | null;
  walletVerified: boolean;
  joinedAt: string;
  lines: ReportRow[];
  totals: ByUnit;
}

export type Status = 'all' | 'in_stock' | 'sold_out' | 'none';
export type SortKey = 'name' | 'locality' | 'joined' | 'listings' | 'listed' | 'remaining';

export interface Filters {
  q: string;
  locality: string;
  product: string;
  /** '' means every unit. */
  unit: string;
  status: Status;
  wallet: 'all' | 'verified' | 'unverified';
}
export const NO_FILTERS: Filters = {
  q: '',
  locality: '',
  product: '',
  unit: '',
  status: 'all',
  wallet: 'all',
};

export function totalsOf(lines: ReportRow[]): ByUnit {
  const out: ByUnit = {};
  for (const l of lines) {
    const t = (out[l.unit] ??= { listed: 0, sold: 0, delivered: 0, remaining: 0 });
    t.listed += l.listed;
    t.sold += l.sold;
    t.delivered += l.delivered;
    t.remaining += l.remaining;
  }
  return out;
}

/** Report rows are one per farmer and listing; this folds them into one entry per farmer. */
export function groupFarmers(rows: ReportRow[]): ReportFarmer[] {
  const by = new Map<string, ReportFarmer>();
  for (const r of rows) {
    let f = by.get(r.farmerId);
    if (!f) {
      f = {
        id: r.farmerId,
        name: r.farmerName,
        phone: r.phone,
        locality: r.locality,
        address: r.address,
        lat: r.latitude,
        lng: r.longitude,
        walletVerified: r.walletVerified,
        joinedAt: r.joinedAt,
        lines: [],
        totals: {},
      };
      by.set(r.farmerId, f);
    }
    if (r.listingId) f.lines.push(r);
  }
  const all = [...by.values()];
  all.forEach((f) => (f.totals = totalsOf(f.lines)));
  return all;
}

/** Applies the filters; line filters (product, unit) also narrow each farmer's lines and totals. */
export function applyFilters(farmers: ReportFarmer[], f: Filters): ReportFarmer[] {
  const q = f.q.trim().toLowerCase();
  const lineFilter = Boolean(f.product || f.unit);
  const out: ReportFarmer[] = [];
  for (const farmer of farmers) {
    if (f.locality && farmer.locality !== f.locality) continue;
    if (f.wallet !== 'all' && farmer.walletVerified !== (f.wallet === 'verified')) continue;
    if (
      q &&
      ![farmer.name, farmer.phone, farmer.locality, farmer.address].some((v) =>
        v.toLowerCase().includes(q),
      )
    )
      continue;
    const lines = farmer.lines.filter(
      (l) => (!f.product || l.product === f.product) && (!f.unit || l.unit === f.unit),
    );
    if (lineFilter && lines.length === 0) continue;
    const stocked = lines.some((l) => l.remaining > 0);
    if (f.status === 'none' && lines.length > 0) continue;
    if (f.status === 'in_stock' && !stocked) continue;
    if (f.status === 'sold_out' && (lines.length === 0 || stocked)) continue;
    out.push({ ...farmer, lines, totals: totalsOf(lines) });
  }
  return out;
}

const amount = (f: ReportFarmer, unit: string, k: 'listed' | 'remaining') =>
  unit ? (f.totals[unit]?.[k] ?? 0) : 0;

export function sortFarmers(
  farmers: ReportFarmer[],
  key: SortKey,
  dir: 'asc' | 'desc',
  unit: string,
): ReportFarmer[] {
  const val = (f: ReportFarmer): string | number =>
    key === 'name'
      ? f.name.toLowerCase()
      : key === 'locality'
        ? f.locality.toLowerCase()
        : key === 'joined'
          ? f.joinedAt
          : key === 'listings'
            ? f.lines.length
            : amount(f, unit, key);
  const sign = dir === 'asc' ? 1 : -1;
  return [...farmers].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * sign;
  });
}

/** Total across farmers, per unit. */
export function sumByUnit(farmers: ReportFarmer[]): ByUnit {
  return totalsOf(farmers.flatMap((f) => f.lines));
}

export interface AreaRow {
  locality: string;
  farmers: number;
  listings: number;
  totals: ByUnit;
}

/** One row per collection point or town, biggest first. */
export function byArea(farmers: ReportFarmer[]): AreaRow[] {
  const by = new Map<string, ReportFarmer[]>();
  for (const f of farmers) {
    const k = f.locality || 'No collection point';
    by.set(k, [...(by.get(k) ?? []), f]);
  }
  return [...by.entries()]
    .map(([locality, fs]) => ({
      locality,
      farmers: fs.length,
      listings: fs.reduce((n, f) => n + f.lines.length, 0),
      totals: sumByUnit(fs),
    }))
    .sort((a, b) => b.farmers - a.farmers || a.locality.localeCompare(b.locality));
}

export type HeatMetric = 'farmers' | 'listed' | 'remaining';

export interface HeatPoint {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  farmer: ReportFarmer;
}

/** Farmers with a GPS fix. Listed and remaining only mean something inside one unit; otherwise each farmer counts as one. */
export function heatPoints(farmers: ReportFarmer[], metric: HeatMetric, unit: string): HeatPoint[] {
  const m = unit ? metric : 'farmers';
  const out: HeatPoint[] = [];
  for (const f of farmers) {
    if (f.lat == null || f.lng == null) continue;
    const weight = m === 'farmers' ? 1 : amount(f, unit, m);
    if (weight > 0) out.push({ id: f.id, lat: f.lat, lng: f.lng, weight, farmer: f });
  }
  return out;
}

const unitText = (t: ByUnit) =>
  Object.entries(t)
    .map(([u, v]) => `${v.listed} ${u}`)
    .join(', ');
export const stockText = unitText;

/** Neutralises cells a spreadsheet would run as a formula (names and addresses are typed by farmers). */
const cell = (v: string | number | boolean | null): string => {
  let s = v == null ? '' : String(v);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s().-]+$/.test(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEAD = [
  'Farmer',
  'Phone',
  'Collection point',
  'Farm address',
  'Latitude',
  'Longitude',
  'Wallet verified',
  'Joined',
  'Product',
  'Unit',
  'Listed',
  'Sold',
  'Delivered',
  'Remaining',
  'Listed on',
];
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** The current view as CSV: one row per farmer and listing; a farmer with nothing listed gets one row with empty stock. */
export function toCsv(farmers: ReportFarmer[]): string {
  const rows = farmers.flatMap((f) => {
    const base = [
      f.name,
      f.phone,
      f.locality,
      f.address,
      f.lat,
      f.lng,
      f.walletVerified ? 'Yes' : 'No',
      day(f.joinedAt),
    ];
    return f.lines.length
      ? f.lines.map((l) => [
          ...base,
          l.product,
          l.unit,
          l.listed,
          l.sold,
          l.delivered,
          l.remaining,
          day(l.listedAt),
        ])
      : [[...base, '', '', '', '', '', '', '']];
  });
  // The BOM makes Excel read the file as UTF-8.
  return '﻿' + [HEAD, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
