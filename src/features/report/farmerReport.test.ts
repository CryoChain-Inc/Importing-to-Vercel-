import type { ReportRow } from '../../services/report.service';
import {
  NO_FILTERS,
  applyFilters,
  groupFarmers,
  heatPoints,
  sortFarmers,
  toCsv,
} from './farmerReport';

const row = (o: Partial<ReportRow>): ReportRow => ({
  farmerId: 'a',
  farmerName: 'Ama',
  phone: '+233241234567',
  locality: 'Tamale',
  address: '',
  latitude: 9.4,
  longitude: -0.85,
  walletVerified: true,
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
    locality: 'Kumasi',
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

test('groups rows per farmer and totals each unit separately', () => {
  const [a, b] = groupFarmers(rows);
  expect(a.lines).toHaveLength(2);
  expect(a.totals.kg.remaining).toBe(60);
  expect(a.totals.bunch.listed).toBe(20);
  expect(b.lines).toHaveLength(0);
});

test('filters by unit, stock and search; a unit filter narrows totals', () => {
  const f = groupFarmers(rows);
  expect(
    applyFilters(f, { ...NO_FILTERS, unit: 'bunch', status: 'sold_out' }).map((x) => x.id),
  ).toEqual(['a']);
  expect(applyFilters(f, { ...NO_FILTERS, status: 'none' }).map((x) => x.id)).toEqual(['b']);
  expect(applyFilters(f, { ...NO_FILTERS, q: 'kumasi' })).toHaveLength(1);
  expect(applyFilters(f, { ...NO_FILTERS, unit: 'kg' })[0].totals.bunch).toBeUndefined();
});

test('sorts and builds heat points only for located farmers', () => {
  const f = groupFarmers(rows);
  expect(sortFarmers(f, 'name', 'asc', '').map((x) => x.id)).toEqual(['b', 'a']);
  expect(heatPoints(f, 'farmers', '')).toHaveLength(1);
  expect(
    heatPoints(applyFilters(f, { ...NO_FILTERS, unit: 'kg' }), 'remaining', 'kg')[0].weight,
  ).toBe(60);
});

test('csv has a row per listing and defuses formulas', () => {
  const csv = toCsv(groupFarmers(rows));
  expect(csv.split('\r\n')).toHaveLength(5);
  expect(csv).toContain("'=cmd|x");
  expect(csv).toContain('+233241234567');
});
