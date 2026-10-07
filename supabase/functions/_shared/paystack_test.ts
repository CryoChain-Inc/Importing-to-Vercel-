import assert from 'node:assert/strict';

const assertEquals: typeof assert.deepEqual = assert.deepEqual;
import {
  CONCLUSIVE,
  baseTransferReference,
  fromPesewas,
  ghsBalance,
  momoBankCode,
  namesLookAlike,
  paystackFetch,
  resolveWalletName,
  toPesewas,
  transferReference,
  validSignature,
} from './paystack.ts';

function stubFetch(handler: (input: string, init: RequestInit | undefined) => Response) {
  const previous = globalThis.fetch;
  const calls: { input: string; method?: string; body?: BodyInit | null }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), method: init?.method, body: init?.body });
    return handler(String(input), init);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

Deno.test('cedis convert to pesewas and back', () => {
  assertEquals(toPesewas(12.34), 1234);
  assertEquals(toPesewas(0.1), 10);
  assertEquals(toPesewas(1), 100);
  assertEquals(fromPesewas(1234), 12.34);
  assertEquals(fromPesewas(10), 0.1);
});

Deno.test('mobile money networks map onto Paystack bank codes', () => {
  assertEquals(momoBankCode('MTN'), 'MTN');
  assertEquals(momoBankCode('Telecel'), 'VOD');
  assertEquals(momoBankCode('AirtelTigo'), 'ATL');
  assertEquals(momoBankCode('Other'), 'Other');
});

Deno.test('transfer references stay inside Paystack rules and retries get a fresh suffix', () => {
  const base = transferReference('A1B2 C3D4/7001');
  assert(base.length >= 16 && base.length <= 50);
  assert(/^[a-z0-9_-]+$/.test(base));
  assertEquals(base.includes(' '), false);
  const retry = transferReference('A1B2 C3D4/7001', 2);
  assertEquals(retry, `${base}_a2`);
  assertEquals(baseTransferReference(retry), base);
  assertEquals(transferReference('short', 0).endsWith('_a0'), true);
});

Deno.test('names match on a shared word and ignore single letters', () => {
  assert(namesLookAlike('Akua Boateng', 'AKUA MENSAH'));
  assert(namesLookAlike('Kwesi-Appiah', 'kwesi appiah'));
  assertEquals(namesLookAlike('A B', 'A Boateng'), false);
  assertEquals(namesLookAlike('Esi Quaye', 'Ama Gyamfi'), false);
});

Deno.test('conclusive Paystack statuses are the ones that will not change', () => {
  for (const status of ['success', 'failed', 'reversed', 'abandoned', 'blocked', 'rejected']) {
    assert(CONCLUSIVE.has(status));
  }
  assertEquals(CONCLUSIVE.has('pending'), false);
  assertEquals(CONCLUSIVE.has('otp'), false);
});

Deno.test('paystackFetch is ok only when HTTP and the status flag both succeed', async () => {
  const ok = stubFetch(
    () => new Response(JSON.stringify({ status: true, data: { balance: 1 } }), { status: 200 }),
  );
  try {
    const res = await paystackFetch('/balance', 'sk_test');
    assertEquals(res.ok, true);
    assertEquals(ok.calls[0].method, 'GET');
    assert(ok.calls[0].input.endsWith('/balance'));
  } finally {
    ok.restore();
  }

  const flagged = stubFetch(
    () => new Response(JSON.stringify({ status: false, message: 'no' }), { status: 200 }),
  );
  try {
    const res = await paystackFetch('/transfer', 'sk_test', { amount: 100 });
    assertEquals(res.ok, false);
    assertEquals(flagged.calls[0].method, 'POST');
    assertEquals(flagged.calls[0].body, JSON.stringify({ amount: 100 }));
  } finally {
    flagged.restore();
  }

  const broken = stubFetch(() => new Response('not-json', { status: 500 }));
  try {
    const res = await paystackFetch('/balance', 'sk_test');
    assertEquals(res.ok, false);
    assertEquals(res.raw, {});
  } finally {
    broken.restore();
  }
});

Deno.test('wallet lookup and the GHS balance read the Paystack payload', async () => {
  const named = stubFetch(
    () =>
      new Response(JSON.stringify({ status: true, data: { account_name: ' Akua Boateng ' } }), {
        status: 200,
      }),
  );
  try {
    const res = await resolveWalletName('sk_test', '0244009999', 'Telecel');
    assertEquals(res, { ok: true, name: 'Akua Boateng' });
    assert(named.calls[0].input.includes('bank_code=VOD'));
    assert(named.calls[0].input.includes('account_number=0244009999'));
  } finally {
    named.restore();
  }

  const declined = stubFetch(
    () =>
      new Response(JSON.stringify({ status: false, message: 'Account not found' }), {
        status: 200,
      }),
  );
  try {
    assertEquals(await resolveWalletName('sk_test', '0244009999', 'MTN'), {
      ok: false,
      error: 'Account not found',
    });
  } finally {
    declined.restore();
  }

  const balance = stubFetch(
    () =>
      new Response(
        JSON.stringify({
          status: true,
          data: [
            { currency: 'NGN', balance: 50 },
            { currency: 'ghs', balance: 250000 },
          ],
        }),
        { status: 200 },
      ),
  );
  try {
    assertEquals(await ghsBalance('sk_test'), { ok: true, pesewas: 250000 });
  } finally {
    balance.restore();
  }

  const empty = stubFetch(
    () =>
      new Response(JSON.stringify({ status: true, data: [{ currency: 'NGN', balance: 1 }] }), {
        status: 200,
      }),
  );
  try {
    assertEquals(await ghsBalance('sk_test'), {
      ok: false,
      error: 'No GHS balance on this Paystack account.',
    });
  } finally {
    empty.restore();
  }
});

Deno.test('the webhook signature is the hex HMAC-SHA512 of the raw body', async () => {
  const body = '{"event":"transfer.success"}';
  const secret = 'sk_test_secret';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const signature = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const flipped = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
  assertEquals(await validSignature(body, signature, secret), true);
  assertEquals(await validSignature(body + ' ', signature, secret), false);
  assertEquals(await validSignature(body, '', secret), false);
  assertEquals(await validSignature(body, signature.slice(0, -1), secret), false);
  assertEquals(await validSignature(body, flipped, secret), false);
});
