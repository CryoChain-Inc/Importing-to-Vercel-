// Supabase "Send Email" auth hook: delivers the 6-digit sign-in code through Twilio's Email API
// instead of Supabase's rate-limited built-in SMTP.
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { codeEmail, confirmEmail } from '../_shared/templates/email.ts';

const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');

type HookPayload = {
  user: { email?: string; new_email?: string; email_change?: string };
  email_data: { token: string; token_new?: string; token_hash?: string; redirect_to?: string; email_action_type?: string; new_email?: string };
};

Deno.serve(async (req) => {
  const body = await req.text();
  let payload: HookPayload;
  try {
    payload = new Webhook(hookSecret).verify(body, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return new Response('invalid signature', { status: 401 });
  }

  const { user, email_data } = payload;
  const from = Deno.env.get('EMAIL_FROM');
  if (!from) {
    console.error('EMAIL_FROM secret is not set');
    return Response.json({ error: { http_code: 500, message: 'Email sender not configured' } });
  }
  // Adding/changing an email: the code goes to the new address (secure email change is off).
  const change = email_data.email_action_type === 'email_change';
  const newEmail = user.new_email || user.email_change || email_data.new_email;
  const to = change ? newEmail || user.email : user.email;
  const code = email_data.token;
  // With secure email change off, token_hash pairs with the new address (Supabase names the hashes the other way round).
  const link = change && email_data.token_hash
    ? `${Deno.env.get('SUPABASE_URL')}/auth/v1/verify?${new URLSearchParams({
        token: email_data.token_hash,
        type: 'email_change',
        ...(email_data.redirect_to ? { redirect_to: email_data.redirect_to } : {}),
      })}`
    : null;
  if (!to) {
    console.error('no recipient', { user: Object.keys(user), email_data: Object.keys(email_data), type: email_data.email_action_type });
    return Response.json({ error: { http_code: 400, message: 'No email address to send to' } });
  }
  const auth = btoa(`${Deno.env.get('TWILIO_ACCOUNT_SID')}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`);
  const res = await fetch('https://comms.twilio.com/v1/Emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      from: { address: from, name: 'CryoChain' },
      to: [{ address: to }],
      content: {
        ...(link ? confirmEmail(link) : codeEmail(code, change ? 'confirmation' : 'sign-in')),
      },
    }),
  });

  if (!res.ok) {
    console.error('twilio email failed', res.status, await res.text());
    return Response.json({ error: { http_code: 502, message: 'Could not send email' } }, { status: 200 });
  }
  return Response.json({});
});
