jest.mock('../config', () => ({
  supabaseUrl: '',
  supabaseAnonKey: '',
  remoteEnabled: false,
}));

jest.mock('../client', () => ({
  supabase: {},
}));

import { shotDone } from '../media';

describe('shotDone', () => {
  test('a slot is done when the label is stored bare or as a storage path', () => {
    expect(shotDone(['crate', 'scale'], 'scale')).toBe(true);
    expect(shotDone(['scale:user/scale-1.jpg'], 'scale')).toBe(true);
    expect(shotDone(['crate:user/crate-1.jpg'], 'scale')).toBe(false);
    expect(shotDone([], 'scale')).toBe(false);
  });
});
