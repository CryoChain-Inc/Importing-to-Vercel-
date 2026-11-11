import { fetchListings, reportShortage, updateListing, updateListingPhotos } from '../farmer.service';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn(), storage: { from: jest.fn() }, functions: { invoke: jest.fn() } },
  requireUserId: jest.fn().mockResolvedValue('farmer-1'),
}));
jest.mock('../offlineCache', () => ({ cached: (_k: string, f: () => unknown) => f() }));
jest.mock('../catalogueImage', () => ({ EXT: { 'image/jpeg': 'jpg' }, readBytes: jest.fn().mockResolvedValue(new ArrayBuffer(4)) }));

const rpc = supabase.rpc as jest.Mock;
const upload = jest.fn();
const remove = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  upload.mockResolvedValue({ error: null });
  remove.mockResolvedValue({ error: null });
  (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove });
});

test('listings carry reserved and collected quantities from listing_stock', async () => {
  const order = jest.fn().mockResolvedValue({ data: [{ id: 'l1', product: 'Tomato', weight_kg: 100, created_at: 'x', unit: 'kg', image_paths: ['a'] }], error: null });
  (supabase.from as jest.Mock).mockImplementation((t: string) => ({
    select: () => (t === 'produce_listings' ? { order } : Promise.resolve({ data: [{ listing_id: 'l1', sold_kg: 60, reserved_kg: 40, collected_kg: 20, remaining_kg: 40 }], error: null })),
  }));
  const [l] = await fetchListings();
  expect(l).toMatchObject({ weightKg: 100, reservedKg: 40, collectedKg: 20, remainingKg: 40 });
});

test('a quantity below what is reserved names the reserved amount', async () => {
  rpc.mockResolvedValue({ error: { message: 'quantity cannot be below the 60.00 kg already reserved' } });
  await expect(updateListing('l1', 'Tomato', 50, 'kg')).rejects.toThrow('60.00 kg is already reserved');
});

test('new photos are uploaded, saved after the kept ones, and dropped files are deleted', async () => {
  rpc.mockResolvedValue({ data: ['farmer-1/old.jpg'], error: null });
  await updateListingPhotos('l1', ['farmer-1/a.jpg'], [{ uri: 'file://new.jpg', mimeType: 'image/jpeg' }]);
  const saved = rpc.mock.calls[0][1].p_paths as string[];
  expect(saved[0]).toBe('farmer-1/a.jpg');
  expect(saved[1]).toMatch(/^farmer-1\/l1-\d+-0\.jpg$/);
  expect(remove).toHaveBeenCalledWith(['farmer-1/old.jpg']);
});

test('a refused photo save removes what was just uploaded', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'photos of reserved produce cannot be removed' } });
  await expect(updateListingPhotos('l1', [], [{ uri: 'file://new.jpg', mimeType: 'image/jpeg' }])).rejects.toThrow('added to but not removed');
  expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^farmer-1\/l1-/)]);
});

test('reporting a shortage sends what the farmer can supply and explains a refusal', async () => {
  rpc.mockResolvedValueOnce({ error: null });
  await reportShortage('l1', 60);
  expect(rpc).toHaveBeenCalledWith('report_listing_shortage', { p_listing: 'l1', p_available: 60 });
  rpc.mockResolvedValueOnce({ error: { message: 'enter less than the 100 reserved' } });
  await expect(reportShortage('l1', 100)).rejects.toThrow('lower than what is reserved');
});
