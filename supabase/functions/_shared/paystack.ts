const API = 'https://api.paystack.co';

/**
 * GET when no body is given, POST otherwise.
 * `ok` is true only when the HTTP status and Paystack's own `status` flag both succeed.
 */
export async function paystackFetch(path: string, secret: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.json().catch(() => ({}));
  return { ok: res.ok && raw?.status === true, raw };
}

// Paystack charges in pesewas. The app stores order totals in GHS.
export const toPesewas = (ghs: number) => Math.round(ghs * 100);
export const fromPesewas = (pesewas: number) => Math.round(pesewas) / 100;

/** App network name → Paystack mobile money `bank_code`. Telecel is still 'VOD' at Paystack. */
export const MOMO_BANK: Record<string, string> = { MTN: 'MTN', Telecel: 'VOD', AirtelTigo: 'ATL' };
export const momoBankCode = (network: string) => MOMO_BANK[network] ?? network;

/**
 * Paystack transfer references must be lowercase, only [a-z0-9_-], 16 to 50 characters.
 * The transfer's uuid idempotency key already fits; this makes any key safe.
 * `attempt` adds an `_a<n>` suffix so a retry after a *conclusive* failure gets a fresh reference
 * (Paystack rejects a reused one), while a retry of the same attempt after a lost response keeps
 * the same reference and is de-duplicated by Paystack. Double payout is prevented either way.
 */
export function transferReference(idempotencyKey: string, attempt?: number) {
  const base = idempotencyKey
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .padEnd(16, '0')
    .slice(0, 44);
  return attempt === undefined ? base : `${base}_a${attempt}`;
}

/** Strips the `_a<n>` suffix so a webhook reference can be matched back to a stored transfer. */
export const baseTransferReference = (reference: string) => reference.replace(/_a\d+$/, '');

/** Transfer statuses Paystack will never change again. Anything else is still in flight. */
export const CONCLUSIVE = new Set([
  'success',
  'failed',
  'reversed',
  'abandoned',
  'blocked',
  'rejected',
]);

/**
 * Name lookup on a wallet before money is sent to it. Paystack's resolve endpoint is documented for
 * bank accounts in Ghana; for a mobile money number it may answer with a name or decline. Either way
 * the result is recorded on the farmer so Ops can see what was checked and when.
 */
export async function resolveWalletName(secret: string, momo: string, network: string) {
  const query = new URLSearchParams({ account_number: momo, bank_code: momoBankCode(network) });
  const res = await paystackFetch(`/bank/resolve?${query}`, secret);
  const name = String(res.raw?.data?.account_name ?? '').trim();
  if (res.ok && name) return { ok: true as const, name };
  return {
    ok: false as const,
    error: String(res.raw?.message ?? 'Paystack could not resolve this wallet number.'),
  };
}

/** Loose match between the registered farmer name and the name on the wallet. */
export function namesLookAlike(a: string, b: string) {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  const x = tokens(a);
  const y = new Set(tokens(b));
  return x.some((t) => y.has(t));
}

/** Available GHS balance in pesewas, or an error message. */
export async function ghsBalance(secret: string) {
  const res = await paystackFetch('/balance', secret);
  if (!res.ok)
    return { ok: false as const, error: String(res.raw?.message ?? 'Balance check failed.') };
  const rows = (res.raw?.data ?? []) as { currency?: string; balance?: number }[];
  const ghs = rows.find((r) => String(r.currency).toUpperCase() === 'GHS');
  if (!ghs) return { ok: false as const, error: 'No GHS balance on this Paystack account.' };
  return { ok: true as const, pesewas: Number(ghs.balance ?? 0) };
}

/**
 * `x-paystack-signature` is the hex HMAC-SHA512 of the raw request body, keyed with the secret key.
 * The body must be the original text. Re-serializing parsed JSON breaks the signature.
 */
export async function validSignature(rawBody: string, signature: string, secret: string) {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
