export const ghs = (n: number) => `GH₵${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

/** Ghana-style numbers: 024… and +233 24… compare equal. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('0') ? `233${d.slice(1)}` : d;
}

export const isPhone = (raw: string) => /^233\d{9}$/.test(normalizePhone(raw));
export const isEmail = (raw: string) => /^\S+@\S+\.\S+$/.test(raw.trim());

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
