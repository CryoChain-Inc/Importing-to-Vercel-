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
