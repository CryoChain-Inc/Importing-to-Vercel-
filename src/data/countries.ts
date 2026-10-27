import countryNames from 'i18n-iso-countries/langs/en.json';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

/** Every country libphonenumber-js knows, with its real calling code. Dial codes also feed public.split_phone() in the profile_phone_parts migration. */
export interface Country {
  iso: CountryCode;
  name: string;
  dial: string;
  flag: string;
}

// Hermes on Android has no Intl.DisplayNames, so names come from a bundled list; some entries are arrays (first is canonical).
const nameOf = (iso: string) => {
  const n = (countryNames.countries as Record<string, string | string[]>)[iso];
  return (Array.isArray(n) ? n[0] : n) ?? iso;
};

const flagOf = (iso: string) => String.fromCodePoint(...[...iso].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));

export const COUNTRIES: Country[] = getCountries()
  .map((iso) => ({ iso, name: nameOf(iso), dial: getCountryCallingCode(iso), flag: flagOf(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.iso === 'GH') ?? COUNTRIES[0];

const parse = (c: Country, raw: string) => parsePhoneNumberFromString(raw, c.iso);

export const isNationalNumber = (c: Country, raw: string) => parse(c, raw)?.isValid() ?? false;

/** E.164 identifier the auth service sends the code to, e.g. "024 123 4567" + GH -> "+233241234567". */
export const toE164 = (c: Country, raw: string) => parse(c, raw)?.number ?? `+${c.dial}${raw.replace(/\D/g, '')}`;
