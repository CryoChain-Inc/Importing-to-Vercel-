import { COUNTRIES, DEFAULT_COUNTRY, isNationalNumber, toE164 } from './countries';

const find = (iso: string) => COUNTRIES.find((c) => c.iso === iso)!;

test('covers the world with real calling codes and flags', () => {
  expect(COUNTRIES.length).toBeGreaterThan(200);
  expect(DEFAULT_COUNTRY.dial).toBe('233');
  expect(find('GH').flag).toBe('🇬🇭');
});

test('validates and formats national numbers', () => {
  expect(isNationalNumber(find('GH'), '024 123 4567')).toBe(true);
  expect(isNationalNumber(find('GH'), '123')).toBe(false);
  expect(toE164(find('GH'), '024 123 4567')).toBe('+233241234567');
});
