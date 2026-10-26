import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

/** +233... for Twilio; profiles store the number with its country code, sometimes without the plus. */
const e164 = (p: string) => (p.startsWith('+') ? p : `+${p.replace(/\D/g, '')}`);

/**
 * Sends queued SMS (farmer order offers) through Twilio. Safe to call any time: it only sends what the database
 * has already queued, each message at most 3 attempts. Returns how many went out.
 */
export async function flushSms(): Promise<{ sent: number; failed: number }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const service = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const from = Deno.env.get('TWILIO_SMS_FROM');
  if (!sid || !token || (!service && !from)) return { sent: 0, failed: 0 };

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: batch } = await db.rpc('claim_sms', { p_limit: 20 });
  let sent = 0;
  let failed = 0;
  for (const m of (batch ?? []) as { id: string; phone: string; body: string }[]) {
    const form = new URLSearchParams({ To: e164(m.phone), Body: m.body });
    if (service) form.set('MessagingServiceSid', service); else form.set('From', from!);
    let ok = false;
    let error = '';
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      ok = res.ok;
      if (!ok) error = `Twilio ${res.status}: ${(await res.text()).slice(0, 160)}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'network error';
    }
    await db.rpc('finish_sms', { p_id: m.id, p_ok: ok, p_error: ok ? null : error });
    if (ok) sent++; else failed++;
  }
  return { sent, failed };
}
