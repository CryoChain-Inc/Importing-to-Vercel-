import type { ReportQuery, ReportRow, ReportView } from '../../services/report.service';
import { AMOUNT_COLS, COLUMNS, byProduct, describeQuery, reportNo, rowCells } from './farmerReport';

/* A small, dependency-free .xlsx writer: a stored (uncompressed) zip of the few XML parts Excel needs.
   Strings go in as inline text, so a farmer-typed "=cmd" can never become a formula. */

const enc = new TextEncoder();
const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files: [string, string][]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const n = enc.encode(name);
    const d = enc.encode(text);
    const crc = crc32(d);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // UTF-8 names
    head.setUint16(12, 0x5a21, true); // 2025-01-01, fixed so output is reproducible
    head.setUint32(14, crc, true);
    head.setUint32(18, d.length, true);
    head.setUint32(22, d.length, true);
    head.setUint16(26, n.length, true);
    const local = new Uint8Array(30 + n.length);
    local.set(new Uint8Array(head.buffer));
    local.set(n, 30);
    parts.push(local, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(14, 0x5a21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, d.length, true);
    c.setUint32(24, d.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    const entry = new Uint8Array(46 + n.length);
    entry.set(new Uint8Array(c.buffer));
    entry.set(n, 46);
    central.push(entry);
    offset += local.length + d.length;
  }
  const size = central.reduce((s, e) => s + e.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Style ids, in the order of cellXfs below.
const S = {
  plain: 0,
  head: 1,
  band: 2,
  bandSub: 3,
  num: 4,
  txt: 5,
  zTxt: 6,
  zNum: 7,
  section: 8,
  kLabel: 9,
  kValue: 10,
} as const;
type Cell = string | number | null | { v: string | number | null; s: number };
const cell = (v: string | number | null, s: number): Cell => ({ v, s });

const col = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

interface SheetOpts {
  freeze?: boolean;
  filter?: boolean;
  merges?: string[];
  heights?: Record<number, number>;
}

function sheet(rows: Cell[][], widths: number[], o: SheetOpts = {}) {
  const data = rows
    .map((r, y) => {
      const cells = r
        .map((c, x) => {
          const v = c !== null && typeof c === 'object' ? c.v : c;
          const s = c !== null && typeof c === 'object' ? c.s : S.plain;
          const ref = `${col(x)}${y + 1}`;
          if (v === null || v === '') return `<c r="${ref}" s="${s}"/>`;
          return typeof v === 'number'
            ? `<c r="${ref}" s="${s}"><v>${v}</v></c>`
            : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        })
        .join('');
      const ht = o.heights?.[y];
      return `<row r="${y + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`;
    })
    .join('');
  const last = `${col(Math.max(0, widths.length - 1))}${Math.max(1, rows.length)}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0" showGridLines="0">${
      o.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''
    }</sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${data}</sheetData>${o.filter ? `<autoFilter ref="A1:${last}"/>` : ''}` +
    `${o.merges?.length ? `<mergeCells count="${o.merges.length}">${o.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}</worksheet>`
  );
}

const font = (extra: string) => `<font>${extra}<name val="Calibri"/></font>`;
const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts>` +
  `<fonts count="7">${font('<sz val="11"/>')}${font('<b/><sz val="11"/><color rgb="FFFFFFFF"/>')}${font('<b/><sz val="20"/><color rgb="FFFFFFFF"/>')}${font('<sz val="10"/><color rgb="FFC8E6D4"/>')}${font('<b/><sz val="12"/><color rgb="FF0B6B3A"/>')}${font('<sz val="10"/><color rgb="FF56615B"/>')}${font('<b/><sz val="16"/><color rgb="FF0B6B3A"/>')}</fonts>` +
  `<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF0B6B3A"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF0A3D24"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF0F6F2"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE4F5EA"/></patternFill></fill></fills>` +
  `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="thin"><color rgb="FFDCE5DF"/></bottom><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="medium"><color rgb="FF0B6B3A"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="11">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" indent="1"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" indent="1"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right"/></xf>` +
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>` +
  `<xf numFmtId="0" fontId="5" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" indent="1"/></xf>` +
  `<xf numFmtId="164" fontId="6" fillId="5" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>` +
  `</cellXfs></styleSheet>`;

const head = (labels: readonly string[]): Cell[] => labels.map((v) => cell(v, S.head));
const stripe = (i: number) => ({ t: i % 2 ? S.zTxt : S.txt, n: i % 2 ? S.zNum : S.num });

export interface XlsxInput {
  rows: ReportRow[];
  view: ReportView;
  query: ReportQuery;
  generated: Date;
}

/** A workbook with a branded cover (scope and totals), stock by product, and every farmer's listings. */
export function buildXlsx({ rows, view, query, generated }: XlsxInput): Uint8Array {
  const filters = describeQuery(query);
  const when = `${generated.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const band = (text: string, s: number): Cell[] => [cell(text, s), cell('', s), cell('', s), cell('', s), cell('', s)];
  const section = (text: string): Cell[] => band(text, S.section);
  const kpi = (label: string, v: number): Cell[] => [cell(label, S.kLabel), cell(v, S.kValue)];

  const cover: Cell[][] = [
    band('Farmer & stock report', S.band),
    band(`CryoChain  ·  ${reportNo(generated)}  ·  ${when}`, S.bandSub),
    [],
    section('Scope'),
    ...(filters.length ? filters : ['All farmers, all products']).map((f): Cell[] => [f]),
    [],
    section('Summary'),
    kpi('Farmers', view.total),
    kpi('With a farm location', view.located),
    kpi('Listings', view.listings),
    [],
    section('Stock by unit'),
    head(['Unit', 'Listed', 'Sold', 'Delivered', 'In stock']),
    ...view.totals.map((t, i): Cell[] => {
      const z = stripe(i);
      return [cell(t.unit, z.t), cell(t.listed, z.n), cell(t.sold, z.n), cell(t.delivered, z.n), cell(t.remaining, z.n)];
    }),
  ];
  const products: Cell[][] = [
    head(['Product', 'Unit', 'Farmers', 'Listings', 'Listed', 'Sold', 'Delivered', 'In stock']),
    ...byProduct(rows).map((p, i): Cell[] => {
      const z = stripe(i);
      return [
        cell(p.product, z.t),
        cell(p.unit, z.t),
        cell(p.farmers.size, z.n),
        cell(p.listings, z.n),
        cell(p.listed, z.n),
        cell(p.sold, z.n),
        cell(p.delivered, z.n),
        cell(p.remaining, z.n),
      ];
    }),
  ];
  const detail: Cell[][] = [
    head(COLUMNS),
    ...rows.map((r, i): Cell[] => {
      const z = stripe(i);
      return rowCells(r).map((v, x) => cell(v, AMOUNT_COLS.includes(x) ? z.n : z.t));
    }),
  ];
  const sheets: [string, string][] = [
    ['Summary', sheet(cover, [30, 18, 16, 16, 16], { merges: ['A1:E1', 'A2:E2'], heights: { 0: 38, 1: 20 } })],
    ['Stock by product', sheet(products, [26, 10, 11, 11, 14, 14, 14, 14], { freeze: true, filter: true })],
    [
      'Farmers and listings',
      sheet(detail, [26, 17, 34, 11, 11, 12, 18, 8, 12, 12, 12, 12, 12], { freeze: true, filter: true }),
    ],
  ];
  const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  return zip([
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}</Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ${ns}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map(([n], i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ${ns}>${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', STYLES],
    ...sheets.map(([, xml], i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, xml]),
  ]);
}
