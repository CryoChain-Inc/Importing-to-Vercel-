export const ghs = (n: number) => `GH₵${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

/** Ghana-style numbers: 024… and +233 24… compare equal. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('0') ? `233${d.slice(1)}` : d;
}

export const isPhone = (raw: string) => /^233\d{9}$/.test(normalizePhone(raw));
/** Person's name on an account: buyer, farmer, driver, or operations. */
export const NAME_MAX = 60;
/** @deprecated Use NAME_MAX. Kept so older buyer screens stay in sync. */
export const BUYER_NAME_MAX = NAME_MAX;
/** Sign-in and contact email for every role. */
export const EMAIL_MAX = 60;
export const isEmail = (raw: string) => {
  const v = raw.trim();
  const at = v.indexOf('@');
  return at > 0 && at < v.length - 1 && v.length <= EMAIL_MAX && /^\S+@\S+\.\S+$/.test(v);
};

/** Today's calendar service date in Ghana (YYYY-MM-DD), matching route service_date in Africa/Accra timezone. */
export function getTodayServiceDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** @deprecated Use getTodayServiceDate() */
export const accraToday = getTodayServiceDate;

/** Local display, e.g. 024 555 0142. */
export function localPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = normalizePhone(raw);
  if (d.startsWith('233') && d.length === 12) {
    const local = `0${d.slice(3)}`;
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return formatPhone(raw);
}

export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = normalizePhone(raw);
  if (d.startsWith('233') && d.length === 12) return `+233 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return d ? `+${d}` : '';
}

export const maskPhone = (raw: string) => {
  const d = normalizePhone(raw);
  return d.length < 4 ? d : `••• ••• ${d.slice(-3)}`;
};

const accra = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', ...opts }).format(new Date(iso));

/** "Fri 16 Oct, 06:00–10:00" in Ghana time. */
export function fmtWindow(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso || !endIso) return '';
  const hm = { hour: '2-digit', minute: '2-digit', hour12: false } as const;
  return `${accra(startIso, { weekday: 'short', day: 'numeric', month: 'short' })}, ${accra(startIso, hm)}–${accra(endIso, hm)}`;
}
