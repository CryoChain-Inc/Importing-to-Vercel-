export const ghs = (n: number) => `GH₵${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

/** Ghana-style numbers: 024… and +233 24… compare equal. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('0') ? `233${d.slice(1)}` : d;
}

export const isPhone = (raw: string) => /^233\d{9}$/.test(normalizePhone(raw));
export const isEmail = (raw: string) => /^\S+@\S+\.\S+$/.test(raw.trim());

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

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon, Wed · 06:00–10:00" from Postgres `days` and `time` values ("06:00:00"). */
export const windowLabel = (days: number[], start: string, end: string) =>
  `${[...days].sort().map((d) => DAY_NAMES[d]).join(', ')} · ${start.slice(0, 5)}–${end.slice(0, 5)}`;
