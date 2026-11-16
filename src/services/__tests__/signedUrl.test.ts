import { signedUrl } from '../signedUrl';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));

it('signs same-tick paths in one request and reuses the result', async () => {
  const createSignedUrls = jest.fn(async (paths: string[]) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `https://x/${p}` })),
  }));
  (supabase.storage.from as jest.Mock).mockReturnValue({ createSignedUrls });

  const [a, b, none] = await Promise.all([
    signedUrl('deliveries', 'a.jpg'),
    signedUrl('deliveries', 'b.jpg'),
    signedUrl('deliveries', null),
  ]);
  expect([a, b, none]).toEqual(['https://x/a.jpg', 'https://x/b.jpg', null]);
  expect(await signedUrl('deliveries', 'a.jpg')).toBe(a);
  expect(createSignedUrls).toHaveBeenCalledTimes(1);
});
