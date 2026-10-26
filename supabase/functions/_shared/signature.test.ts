import { validSignature } from './signature.ts';

Deno.test('webhook signature: accepts the right HMAC, rejects tampering and missing header', async () => {
  const body = '{"event":"charge.success"}';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('sk'), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))), (b) => b.toString(16).padStart(2, '0')).join('');
  if (!(await validSignature(body, sig, 'sk'))) throw new Error('valid signature rejected');
  if (await validSignature(body + ' ', sig, 'sk')) throw new Error('tampered body accepted');
  if (await validSignature(body, null, 'sk')) throw new Error('missing signature accepted');
});
