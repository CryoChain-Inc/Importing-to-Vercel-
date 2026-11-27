import type {
  ReportPoint,
  ReportQuery,
  ReportRow,
  ReportView,
} from '../../services/report.service';
import { fmtQty, formatPhone } from '../../utils/format';
import { byProduct, day, describeQuery, reportNo } from './farmerReport';
import { RAMP_CSS, rampRgb } from './heat';

/** Farmers type their own names and addresses, so every string goes through here before it meets HTML. */
const h = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const ROW_CAP = 3000;
const POINT_CAP = 1500;
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
const W = 700;
const H = 300;
const R = 40;
const n = (v: number) => v.toLocaleString('en-GH', { maximumFractionDigits: 2 });
const longDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Web Mercator, so the glows land on the same spot as the Google static map underneath.
const mx = (lng: number, z: number) => ((lng + 180) / 360) * 256 * 2 ** z;
const my = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z;
};
const unlat = (y: number, z: number) => {
  const k = Math.PI - (2 * Math.PI * y) / (256 * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(k));
};

/** Farm locations as a gradient map: a Google static map underneath when it loads, a plain grid when it doesn't. */
function locationMap(all: ReportPoint[]): string {
  const pts = [...all].sort((a, b) => b.weight - a.weight).slice(0, POINT_CAP);
  if (!pts.length) return '';
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  let z = 12;
  for (; z > 1; z--) {
    const w = mx(Math.max(...lngs), z) - mx(Math.min(...lngs), z);
    const hh = my(Math.min(...lats), z) - my(Math.max(...lats), z);
    if (w <= W - 150 && hh <= H - 110) break;
  }
  const cx = (mx(Math.min(...lngs), z) + mx(Math.max(...lngs), z)) / 2;
  const cy = (my(Math.min(...lats), z) + my(Math.max(...lats), z)) / 2;
  const cLat = unlat(cy, z);
  const cLng = (cx / (256 * 2 ** z)) * 360 - 180;
  const px = pts.map((p) => [mx(p.lng, z) - cx + W / 2, my(p.lat, z) - cy + H / 2]);
  const maxW = Math.max(...pts.map((p) => p.weight), 1);
  const sums = px.map(([x, y], i) => {
    let t = 0;
    px.forEach(([x2, y2], j) => {
      const d = Math.hypot(x - x2, y - y2);
      if (d < R) t += pts[j].weight * (1 - d / R);
    });
    return t || pts[i].weight;
  });
  const denom = Math.max(...sums, 3 * maxW);
  const steps = 12;
  const defs = Array.from({ length: steps }, (_, i) => {
    const [r, g, b] = rampRgb(i / (steps - 1));
    const c = `rgb(${r},${g},${b})`;
    return `<radialGradient id="g${i}"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset=".4" stop-color="${c}" stop-opacity=".62"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  }).join('');
  const blobs = px
    .map(([x, y], i) => {
      const t = Math.min(1, 0.12 + 0.88 * (sums[i] / denom));
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${R}" fill="url(#g${Math.round(t * (steps - 1))})"/>`;
    })
    .join('');
  const dots = px
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#0a3d24" stroke="#fff" stroke-width="1"/>`)
    .join('');
  const grid =
    Array.from({ length: 8 }, (_, i) => `<line x1="${(W / 7) * i}" y1="0" x2="${(W / 7) * i}" y2="${H}"/>`).join('') +
    Array.from({ length: 5 }, (_, i) => `<line x1="0" y1="${(H / 4) * i}" x2="${W}" y2="${(H / 4) * i}"/>`).join('');
  const img = KEY
    ? `<img alt="" src="https://maps.googleapis.com/maps/api/staticmap?center=${cLat.toFixed(5)},${cLng.toFixed(5)}&zoom=${z}&size=${W}x${H}&scale=2&maptype=roadmap&style=feature:poi|visibility:off&style=feature:all|saturation:-55|lightness:12&key=${encodeURIComponent(KEY)}" onerror="this.style.display='none'">`
    : '';
  return `<div class="map"><svg viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#eef2ee"/><g stroke="#dbe3dc" stroke-width="1">${grid}</g></svg>${img}<svg viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${blobs}${dots}</svg></div>`;
}

interface Group {
  id: string;
  name: string;
  phone: string;
  address: string;
  joined: string;
  lines: ReportRow[];
}

function group(rows: ReportRow[]): Group[] {
  const by = new Map<string, Group>();
  for (const r of rows) {
    let g = by.get(r.farmerId);
    if (!g) {
      g = { id: r.farmerId, name: r.farmerName, phone: r.phone, address: r.address, joined: r.joinedAt, lines: [] };
      by.set(r.farmerId, g);
    }
    if (r.listingId) g.lines.push(r);
  }
  return [...by.values()];
}

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; }
body { font: 10.5px/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1b2420; padding: 0 15mm; }
table.frame { width: 100%; border-collapse: collapse; }
table.frame > thead > tr > td, table.frame > tfoot > tr > td { height: 14mm; padding: 0; }
table.frame > tbody > tr > td { padding: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #0b6b3a; }
.brand { display: flex; align-items: center; gap: 9px; }
.mark { width: 30px; height: 30px; border-radius: 8px; background: #0b6b3a; color: #fff; font-weight: 800; font-size: 17px; display: flex; align-items: center; justify-content: center; }
.brand b { font-size: 17px; letter-spacing: -.2px; }
.brand span { display: block; color: #5b665f; font-size: 10px; margin-top: 1px; }
.title { text-align: right; }
.title h1 { margin: 0; font-size: 24px; letter-spacing: 1.5px; color: #0b6b3a; font-weight: 800; }
.meta { margin-top: 6px; border-collapse: collapse; margin-left: auto; }
.meta td { padding: 1px 0 1px 14px; font-size: 10px; }
.meta td:first-child { color: #5b665f; }
.meta td:last-child { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.two { display: flex; gap: 18px; margin-top: 16px; align-items: flex-start; }
.box { flex: 1; border: 1px solid #d9e0db; border-radius: 6px; padding: 11px 13px; }
.box h3, h2 { margin: 0 0 7px; font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: #5b665f; font-weight: 700; }
.filters div { padding: 2px 0; }
.sum table { width: 100%; border-collapse: collapse; }
.sum td { padding: 3px 0; border-bottom: 1px solid #edf1ee; font-variant-numeric: tabular-nums; }
.sum td:last-child { text-align: right; font-weight: 700; }
.sum tr.grand td { border-bottom: 0; border-top: 2px solid #0b6b3a; padding-top: 6px; font-size: 11.5px; color: #0b6b3a; }
section { margin-top: 18px; }
.map { position: relative; width: 100%; aspect-ratio: ${W} / ${H}; border: 1px solid #d9e0db; border-radius: 6px; overflow: hidden; }
.map > * { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; }
.legend { display: flex; align-items: center; gap: 8px; margin-top: 6px; color: #5b665f; font-size: 9.5px; }
.legend i { display: block; width: 150px; height: 8px; border-radius: 4px; background: ${RAMP_CSS}; }
table.t { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.t th { text-align: left; font-size: 9px; letter-spacing: .6px; text-transform: uppercase; color: #5b665f; padding: 6px 6px; border-bottom: 1.5px solid #1b2420; font-weight: 700; }
.t td { padding: 5px 6px; border-bottom: 1px solid #e6ebe7; vertical-align: top; }
.t .n { text-align: right; white-space: nowrap; }
.t tr.total td { border-top: 1.5px solid #1b2420; border-bottom: 0; font-weight: 800; }
.farmer { margin-top: 12px; border: 1px solid #d9e0db; border-radius: 6px; break-inside: avoid; overflow: hidden; }
.fh { display: flex; justify-content: space-between; gap: 14px; background: #f3f6f4; padding: 8px 11px; }
.fh b { font-size: 12px; }
.fh small { display: block; color: #5b665f; font-size: 9.5px; }
.fh .r { text-align: right; }
.farmer .t { table-layout: fixed; }
.farmer .t th:nth-child(1) { width: 30%; }
.farmer .t th:nth-child(2) { width: 15%; }
.farmer .t th { padding-left: 11px; }
.farmer .t td:first-child, .farmer .t th:first-child { padding-left: 11px; }
.farmer .t td:last-child, .farmer .t th:last-child { padding-right: 11px; }
.farmer .t tr:last-child td { border-bottom: 0; }
.none { padding: 8px 11px; color: #5b665f; }
.note { margin-top: 14px; color: #5b665f; font-size: 9.5px; }
.foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #d9e0db; color: #5b665f; font-size: 9.5px; display: flex; justify-content: space-between; }
`;

export interface PdfInput {
  rows: ReportRow[];
  view: ReportView;
  query: ReportQuery;
  metricNote: string;
  generated: Date;
  /** Becomes the document title, which browsers use as the saved file name. */
  title: string;
}

/** An invoice-style document: header and report number, scope and totals, stock by product, then every farmer with their listings. */
export function buildPdfHtml({ rows, view, query, metricNote, generated, title }: PdfInput): string {
  const filters = describeQuery(query);
  const iso = generated.toISOString();
  const no = reportNo(generated);
  const groups = group(rows);
  const shownRows = rows.slice(0, ROW_CAP);
  const cut = new Set(shownRows.map((r) => r.farmerId));
  const shown = groups.filter((g) => cut.has(g.id));
  const products = byProduct(rows);
  const map = locationMap(view.points);

  const summary = view.totals
    .map((t) => `<tr><td>Listed (${h(t.unit)})</td><td>${h(n(t.listed))}</td></tr><tr><td>Sold (${h(t.unit)})</td><td>${h(n(t.sold))}</td></tr><tr><td>Delivered (${h(t.unit)})</td><td>${h(n(t.delivered))}</td></tr>`)
    .join('');
  const stock = view.totals.map((t) => fmtQty(t.remaining, t.unit)).join('  +  ') || '—';

  const productRows = products
    .map(
      (p) =>
        `<tr><td><b>${h(p.product)}</b></td><td>${h(p.unit)}</td><td class="n">${p.farmers.size}</td><td class="n">${p.listings}</td><td class="n">${h(n(p.listed))}</td><td class="n">${h(n(p.sold))}</td><td class="n">${h(n(p.delivered))}</td><td class="n"><b>${h(n(p.remaining))}</b></td></tr>`,
    )
    .join('');

  const farmers = shown
    .map((g) => {
      const lines = g.lines.length
        ? `<table class="t"><thead><tr><th>Product</th><th>Listed on</th><th class="n">Listed</th><th class="n">Sold</th><th class="n">Delivered</th><th class="n">In stock</th></tr></thead><tbody>${g.lines
            .map(
              (l) =>
                `<tr><td><b>${h(l.product)}</b></td><td>${h(day(l.listedAt))}</td><td class="n">${h(fmtQty(l.listed, l.unit))}</td><td class="n">${h(fmtQty(l.sold, l.unit))}</td><td class="n">${h(fmtQty(l.delivered, l.unit))}</td><td class="n"><b>${h(fmtQty(l.remaining, l.unit))}</b></td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<div class="none">No listings.</div>';
      return `<div class="farmer"><div class="fh"><div><b>${h(g.name)}</b><small>${h(g.address || 'No address on file')}</small></div><div class="r"><small>${h(formatPhone(g.phone) || g.phone || '—')}</small><small>Joined ${h(day(g.joined))}</small></div></div>${lines}</div>`;
    })
    .join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${h(title)}</title><style>${CSS}</style></head><body>
<table class="frame"><thead><tr><td></td></tr></thead><tbody><tr><td>
<div class="top">
  <div class="brand"><div class="mark">C</div><div><b>CryoChain</b><span>Agri marketplace</span></div></div>
  <div class="title"><h1>FARMER &amp; STOCK REPORT</h1>
    <table class="meta"><tr><td>Report no.</td><td>${h(no)}</td></tr><tr><td>Date</td><td>${h(longDate(generated))}</td></tr><tr><td>Farmers</td><td>${view.total.toLocaleString('en-GH')}</td></tr></table></div>
</div>
<div class="two">
  <div class="box filters"><h3>Scope</h3>${(filters.length ? filters : ['All farmers, all products']).map((f) => `<div>${h(f)}</div>`).join('')}</div>
  <div class="box sum"><h3>Summary</h3><table>
    <tr><td>Farmers</td><td>${view.total.toLocaleString('en-GH')}</td></tr>
    <tr><td>With a farm location</td><td>${view.located.toLocaleString('en-GH')}</td></tr>
    <tr><td>Listings</td><td>${view.listings.toLocaleString('en-GH')}</td></tr>${summary}
    <tr class="grand"><td>Still in stock</td><td>${h(stock)}</td></tr></table></div>
</div>
${map ? `<section><h2>Farm locations</h2>${map}<div class="legend">Fewer<i></i>More · ${h(metricNote)}</div></section>` : ''}
${productRows ? `<section><h2>Stock by product</h2><table class="t"><thead><tr><th>Product</th><th>Unit</th><th class="n">Farmers</th><th class="n">Listings</th><th class="n">Listed</th><th class="n">Sold</th><th class="n">Delivered</th><th class="n">In stock</th></tr></thead><tbody>${productRows}</tbody></table></section>` : ''}
<section><h2>Farmers and listings</h2>${farmers || '<div class="none">No farmers match.</div>'}</section>
${groups.length > shown.length ? `<p class="note">Showing the first ${shown.length.toLocaleString('en-GH')} of ${groups.length.toLocaleString('en-GH')} farmers. Download the Excel workbook for the full set.</p>` : ''}
<p class="note">Quantities are in each listing’s own unit and are never added across units.</p>
<div class="foot"><span>CryoChain · ${h(no)}</span><span>Generated ${h(longDate(generated))} ${h(iso.slice(11, 16))} UTC</span></div>
</td></tr></tbody><tfoot><tr><td></td></tr></tfoot></table>
</body></html>`;
}
