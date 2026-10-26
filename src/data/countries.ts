import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

/** Every country libphonenumber-js knows, with its real calling code. Dial codes also feed public.split_phone() in the profile_phone_parts migration. */
export interface Country {
  iso: CountryCode;
  name: string;
  dial: string;
  flag: string;
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null; // shortcut: engines without Intl.DisplayNames show the ISO code, upgrade if one ships without it
  }
})();

const flagOf = (iso: string) => String.fromCodePoint(...[...iso].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));

export const COUNTRIES: Country[] = getCountries()
  .map((iso) => ({ iso, name: regionNames?.of(iso) ?? iso, dial: getCountryCallingCode(iso), flag: flagOf(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.iso === 'GH') ?? COUNTRIES[0];

const parse = (c: Country, raw: string) => parsePhoneNumberFromString(raw, c.iso);

export const isNationalNumber = (c: Country, raw: string) => parse(c, raw)?.isValid() ?? false;

/** E.164 identifier the auth service sends the code to, e.g. "024 123 4567" + GH -> "+233241234567". */
export const toE164 = (c: Country, raw: string) => parse(c, raw)?.number ?? `+${c.dial}${raw.replace(/\D/g, '')}`;
