import { caller, cors, json, mutateWorkspace } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const who = await caller(req);
  if (who.error) return who.error;
  if (!['ops', 'agent', 'driver'].includes(who.profile.role)) return json({ error: 'Staff only.' }, 403);
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const provider = (Deno.env.get('SMS_PROVIDER') ?? 'hubtel').toLowerCase();
  let result: { ok: boolean; ref?: string; error?: string } = { ok: false, error: 'SMS provider is not configured.' };
  const { data: row } = await who.admin.from('workspace').select('state').eq('id', 1).single();
  const sms = ((row?.state as { sms?: { id: string; to: string; body: string; status: string }[] })?.sms ?? []).find(m => m.id === id);
  if (!sms) return json({ error: 'Message not found.' }, 404);
  if (sms.status === 'sent' || sms.status === 'delivered') return json({ ok: true, ref: 'already-sent' });
  try {
    if (provider === 'africastalking') result = await africa(sms.to, sms.body);
    else result = await hubtel(sms.to, sms.body);
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : 'SMS failed.' };
  }
  await mutateWorkspace(who.admin, (state) => {
    const list = state.sms as { id: string; status: string; ref: string }[];
    const message = list.find(m => m.id === id);
    if (!message || message.status === 'sent' || message.status === 'delivered') return;
    if (result.ok) {
      message.status = 'sent';
      message.ref = `${result.ref ?? 'HUB'}:${message.ref}`;
    } else {
      message.status = 'failed';
      const exceptions = state.exceptions as Record<string, unknown>[];
      exceptions.unshift({
        id: `EX-sms-${id}`,
        type: 'sms_failed',
        severity: 'medium',
        title: `SMS failed · ${sms.to}`,
        detail: result.error ?? 'The provider rejected the message.',
        openedAt: Date.now(),
        status: 'open',
      });
    }
  });
  return json(result, result.ok ? 200 : 502);
});

async function hubtel(to: string, body: string) {
  const id = Deno.env.get('HUBTEL_CLIENT_ID');
  const secret = Deno.env.get('HUBTEL_CLIENT_SECRET');
  const from = Deno.env.get('HUBTEL_SENDER') ?? 'CryoChain';
  if (!id || !secret) return { ok: false, error: 'Add HUBTEL_CLIENT_ID, HUBTEL_CLIENT_SECRET, and HUBTEL_SENDER to the send-sms secrets.' };
  const res = await fetch('https://smsc.hubtel.com/v1/messages/send', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: from, To: to.replace(/\s/g, ''), Content: body }),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: raw?.message ?? raw?.statusDescription ?? 'Hubtel rejected the message.' };
  return { ok: true, ref: String(raw?.messageId ?? raw?.MessageId ?? `HUB-${Date.now()}`) };
}

async function africa(to: string, body: string) {
  const username = Deno.env.get('AT_USERNAME');
  const key = Deno.env.get('AT_API_KEY');
  const from = Deno.env.get('AT_SENDER') ?? 'CryoChain';
  if (!username || !key) return { ok: false, error: 'Add AT_USERNAME, AT_API_KEY, and AT_SENDER, and set SMS_PROVIDER=africastalking.' };
  const form = new URLSearchParams({ username, to: to.replace(/\s/g, ''), message: body, from });
  const res = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: { apiKey: key, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const raw = await res.json().catch(() => ({}));
  const recipient = raw?.SMSMessageData?.Recipients?.[0];
  if (!res.ok || !recipient || recipient.status !== 'Success') return { ok: false, error: recipient?.status ?? 'Africa\'s Talking rejected the message.' };
  return { ok: true, ref: String(recipient.messageId ?? `AT-${Date.now()}`) };
}
