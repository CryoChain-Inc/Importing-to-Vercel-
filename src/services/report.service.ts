import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/** The only mailbox that may use /govt; the database checks it too (private.can_view_farmer_report). */
export const GOVT_EMAIL = 'govt@cryochain.co';

export type Status = 'all' | 'in_stock' | 'sold_out' | 'none';
export type SortKey = 'name' | 'joined' | 'listings' | 'listed' | 'remaining';
export type HeatMetric = 'farmers' | 'listed' | 'remaining';

/** Everything the database filters, sorts and pages on. '' means "any". */
export interface ReportQuery {
  q: string;
  product: string;
  /** Stock only adds up inside one unit, so listed/remaining sorts and shading need this. */
  unit: string;
  status: Status;
  sort: SortKey;
  dir: 'asc' | 'desc';
}
export const NO_QUERY: ReportQuery = {
  q: '',
  product: '',
  unit: '',
  status: 'all',
  sort: 'joined',
  dir: 'desc',
};

export interface UnitTotals {
  unit: string;
  listed: number;
  sold: number;
  delivered: number;
  remaining: number;
}
export interface ReportLine {
  id: string;
  product: string;
  unit: string;
  listed: number;
  sold: number;
  delivered: number;
  remaining: number;
  listedAt: string | null;
}
export interface ReportFarmer {
  id: string;
  name: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  joinedAt: string;
  lines: ReportLine[];
  totals: UnitTotals[];
}
export interface ReportPoint {
  id: string;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  weight: number;
  listings: number;
  totals: Pick<UnitTotals, 'unit' | 'listed' | 'remaining'>[];
}
export interface ReportView {
  total: number;
  located: number;
  listings: number;
  totals: UnitTotals[];
  points: ReportPoint[];
  options: { products: string[]; units: string[] };
  farmers: ReportFarmer[];
}

/** One row per farmer and listing; farmers with nothing listed come once with listingId null. */
export interface ReportRow {
  farmerId: string;
  farmerName: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  joinedAt: string;
  listingId: string | null;
  product: string;
  unit: string;
  listed: number;
  sold: number;
  delivered: number;
  remaining: number;
  listedAt: string | null;
}

const num = (v: unknown) => Number(v ?? 0);
const filterArgs = (f: ReportQuery) => ({
  p_q: f.q.trim() || null,
  p_product: f.product || null,
  p_unit: f.unit || null,
  p_status: f.status,
  p_sort: f.sort,
  p_dir: f.dir,
});
const totalsOf = (t: any[]): UnitTotals[] =>
  (t ?? []).map((x) => ({
    unit: x.unit,
    listed: num(x.listed),
    sold: num(x.sold),
    delivered: num(x.delivered),
    remaining: num(x.remaining),
  }));

/** One page of farmers plus the totals, map points and filter options for these filters; ops and govt only. */
export async function fetchReportView(
  f: ReportQuery,
  metric: HeatMetric,
  page: number,
  pageSize: number,
): Promise<ReportView> {
  const { data, error } = await supabase.rpc('farmer_report_view', {
    ...filterArgs(f),
    p_metric: metric,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error('Could not load the farmer report.');
  const d = data as any;
  return {
    total: num(d.total),
    located: num(d.located),
    listings: num(d.listings),
    totals: totalsOf(d.totals),
    points: d.points.map((p: any) => ({
      ...p,
      address: p.address ?? '',
      weight: num(p.weight),
      listings: num(p.listings),
      totals: totalsOf(p.totals),
    })),
    options: { products: d.options.products, units: d.options.units },
    farmers: d.farmers.map((x: any) => ({
      ...x,
      name: x.name ?? 'Unnamed farmer',
      phone: x.phone ?? '',
      address: x.address ?? '',
      lines: x.lines.map((l: any) => ({
        ...l,
        listed: num(l.listed),
        sold: num(l.sold),
        delivered: num(l.delivered),
        remaining: num(l.remaining),
      })),
      totals: totalsOf(x.totals),
    })),
  };
}

/** Every matching farmer and listing in screen order (up to 20,000 rows), for PDF, Excel and CSV. */
export async function fetchReportRows(f: ReportQuery): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('farmer_report', filterArgs(f));
  if (error) throw new Error('Could not load the farmer report.');
  return ((data ?? []) as any[]).map((r) => ({
    farmerId: r.farmer_id,
    farmerName: r.farmer_name ?? 'Unnamed farmer',
    phone: r.phone ?? '',
    address: r.address ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
    joinedAt: r.joined_at,
    listingId: r.listing_id,
    product: r.product ?? '',
    unit: r.unit ?? '',
    listed: num(r.listed),
    sold: num(r.sold),
    delivered: num(r.delivered),
    remaining: num(r.remaining),
    listedAt: r.listed_at,
  }));
}

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';
export const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

/** Downloads a file on web; on a phone it opens the share sheet (save to Files, email, WhatsApp). */
export async function saveFile(
  data: string | Uint8Array,
  fileName: string,
  mime: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(data);
  await share(file.uri, mime);
}

async function share(uri: string, mime: string) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: 'Farmer report' });
}

/** Web opens the browser's print dialog (choose "Save as PDF"); a phone renders a PDF file and shares it. */
export async function savePdf(html: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.srcdoc = html;
    frame.onload = () => {
      const w = frame.contentWindow;
      if (!w) return frame.remove();
      w.addEventListener('afterprint', () => frame.remove());
      setTimeout(() => w.print(), 250); // let the map snapshot and fonts settle
    };
    document.body.appendChild(frame);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const named = new File(Paths.cache, fileName);
  if (named.exists) named.delete();
  new File(uri).move(named);
  await share(named.uri, MIME.pdf);
}
