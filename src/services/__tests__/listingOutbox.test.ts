import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueListing, flushOutbox, queuedCount } from '../listingOutbox';
import { supabase } from '../supabase';

jest.mock('expo-file-system', () => {
  class File { uri: string; constructor(...p: any[]) { this.uri = p.map((x) => x.uri ?? x).join('/'); } copy = jest.fn(async () => undefined); arrayBuffer = async () => new ArrayBuffer(1); }
  class Directory { uri = 'dir'; exists = false; create = jest.fn(); delete = jest.fn(); }
  return { File, Directory, Paths: { document: { uri: 'doc' } } };
});
jest.mock('../supabase', () => ({
  requireUserId: jest.fn(async () => 'farmer-1'),
  supabase: { storage: { from: jest.fn() }, from: jest.fn() },
}));

const upload = jest.fn();
const insert = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (supabase.storage.from as jest.Mock).mockReturnValue({ upload, remove: jest.fn() });
  (supabase.from as jest.Mock).mockReturnValue({ insert });
  (globalThis as any).fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(1) }));
  upload.mockResolvedValue({ error: null });
});

const photos = ['a', 'b', 'c'].map((n) => ({ uri: `file:///${n}.jpg`, mimeType: 'image/jpeg', fingerprint: n }));

test('listing is kept while offline and sent once with the same id when the network returns', async () => {
  await AsyncStorage.clear();
  await enqueueListing('Tomato', 50, 'A', photos);
  expect(queuedCount()).toBe(1);

  insert.mockResolvedValueOnce({ error: { message: 'TypeError: Network request failed', code: '' }, status: 0 });
  expect(await flushOutbox()).toBe(0);
  expect(queuedCount()).toBe(1);

  insert.mockResolvedValueOnce({ error: null, status: 201 });
  expect(await flushOutbox()).toBe(1);
  expect(queuedCount()).toBe(0);
  const [first, second] = insert.mock.calls.map((c) => c[0]);
  expect(second.id).toBe(first.id);
  expect(second.image_paths).toEqual(first.image_paths);
});

test('a retry that finds the row already saved counts as done', async () => {
  await enqueueListing('Maize', 10, 'B', photos);
  upload.mockResolvedValue({ error: { message: 'The resource already exists' } });
  insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' }, status: 409 });
  expect(await flushOutbox()).toBe(1);
  expect(queuedCount()).toBe(0);
});

test('a refusal from the server is kept for the farmer to see, not retried forever', async () => {
  await enqueueListing('Yam', 10, 'C', photos);
  insert.mockResolvedValue({ error: { code: '42501', message: 'denied' }, status: 403 });
  expect(await flushOutbox()).toBe(0);
  expect(queuedCount()).toBe(0);
});
