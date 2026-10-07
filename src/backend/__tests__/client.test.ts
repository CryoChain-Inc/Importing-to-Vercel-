jest.mock('../config', () => ({
  supabaseUrl: '',
  supabaseAnonKey: '',
  remoteEnabled: false,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: {} }),
}));

import {
  clearPasswordSetup,
  markPasswordSaved,
  passwordSavedFor,
  peekPasswordSetup,
} from '../client';

function installSessionStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
}

describe('password setup memory', () => {
  beforeEach(installSessionStorage);

  test('invite and recovery kinds survive the hash being stripped', () => {
    sessionStorage.setItem('cc-password-setup', 'invite');
    expect(peekPasswordSetup()).toBe('invite');
    sessionStorage.setItem('cc-password-setup', 'recovery');
    expect(peekPasswordSetup()).toBe('recovery');
    sessionStorage.setItem('cc-password-setup', 'other');
    expect(peekPasswordSetup()).toBeNull();
  });

  test('clearing the setup flag forgets the link kind', () => {
    sessionStorage.setItem('cc-password-setup', 'invite');
    clearPasswordSetup();
    expect(peekPasswordSetup()).toBeNull();
  });

  test('a saved password is remembered for that user only', () => {
    expect(passwordSavedFor('user-1')).toBe(false);
    markPasswordSaved('user-1');
    expect(passwordSavedFor('user-1')).toBe(true);
    expect(passwordSavedFor('user-2')).toBe(false);
  });
});
