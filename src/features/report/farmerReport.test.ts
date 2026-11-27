import type { ReportRow, ReportView } from '../../services/report.service';
import { NO_QUERY } from '../../services/report.service';
import { buildPdfHtml } from './exportPdf';
import { buildXlsx } from './exportXlsx';
import { describeQuery, isFiltered, toCsv, unitsText } from './farmerReport';
import { rampRgb } from './heat';

const row = (o: Partial<ReportRow>): ReportRow => ({
  farmerId: 'a',
  farmerName: 'Ama',
  phone: '+233241234567',
  address: 'Zone 1',
  latitude: 9.4,
  longitude: -0.85,
  joinedAt: '2026-01-02T00:00:00Z',
  listingId: 'l1',
  product: 'Tomato',
  unit: 'kg',
  listed: 100,
  sold: 40,
  delivered: 10,
  remaining: 60,
  listedAt: '2026-02-03T00:00:00Z',
  ...o,
});
const rows = [
  row({}),
  row({ listingId: 'l2', product: 'Plantain', unit: 'bunch', listed: 20, remaining: 0 }),
  row({
    farmerId: 'b',
    farmerName: '=cmd|x',
    latitude: null,
    longitude: null,
    listingId: null,
    product: '',
    unit: '',
    listed: 0,
    sold: 0,
    delivered: 0,
    remaining: 0,
  }),
];
const view: ReportView = {
  total: 2,
  located: 1,
  listings: 2,
  totals: [
    { unit: 'bunch', listed: 20, sold: 0, delivered: 0, remaining: 0 },
    { unit: 'kg', listed: 100, sold: 40, delivered: 10, remaining: 60 },
  ],
  points: [
    {
      id: 'a',
      name: '<b>Ama</b>',
      address: 'Zone 1',
      phone: '',
      lat: 9.4,
      lng: -0.85,
      weight: 1,
      listings: 2,
      totals: [],
    },
  ],
  options: { products: [], units: [] },
  farmers: [],
};

test('csv has a row per listing, a BOM for Excel, and defuses formulas', () => {
  const csv = toCsv(rows);
  expect(csv.startsWith('﻿')).toBe(true);
  expect(csv.split('\r\n')).toHaveLength(5);
  expect(csv).toContain("'=cmd|x");
  expect(csv).toContain('+233241234567');
});

test('describes filters and units in plain words', () => {
  expect(isFiltered(NO_QUERY)).toBe(false);
  const q = { ...NO_QUERY, q: ' ama ', unit: 'kg', status: 'in_stock' as const };
  expect(isFiltered(q)).toBe(true);
  expect(describeQuery(q)).toEqual(['Search: “ama”', 'Unit: kg', 'Stock: In stock']);
  expect(unitsText(view.totals, 'remaining')).toBe('60 kg');
});

test('heat ramp runs from blue to red', () => {
  expect(rampRgb(0)).toEqual([56, 189, 248]);
  expect(rampRgb(1)).toEqual([225, 29, 72]);
});

test('xlsx is a zip whose cells are text, never formulas', () => {
  const bytes = buildXlsx({ rows, view, query: NO_QUERY, generated: new Date('2026-11-27') });
  expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
  const xml = Buffer.from(bytes).toString('utf8');
  expect(xml).toContain('Farmers and listings');
  expect(xml).toContain('=cmd|x');
  expect(xml).not.toContain('<f>');
});

test('pdf html escapes what farmers typed', () => {
  const html = buildPdfHtml({
    rows: [row({ farmerName: '<img src=x onerror=alert(1)>' })],
    view,
    query: NO_QUERY,
    metricNote: 'Farmers in the area',
    title: 'Farmer-Stock-Report_2026-11-27',
    generated: new Date('2026-11-27T09:00:00Z'),
  });
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img');
  expect(html).toContain('FARMER &amp; STOCK REPORT');
  expect(html).toContain('<title>Farmer-Stock-Report_2026-11-27</title>');
  expect(html).not.toContain('@page { size: A4; margin: 12mm');
});
