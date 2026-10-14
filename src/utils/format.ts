export const ghs = (n: number) => `GH₵${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

/** Ghana-style numbers: 024… and +233 24… compare equal. */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('0') ? `233${d.slice(1)}` : d;
}

export const isPhone = (raw: string) => /^233\d{9}$/.test(normalizePhone(raw));
export const isEmail = (raw: string) => /^\S+@\S+\.\S+$/.test(raw.trim());

export const maskPhone = (raw: string) => {
  const d = normalizePhone(raw);
  return d.length < 4 ? d : `••• ••• ${d.slice(-3)}`;
};
