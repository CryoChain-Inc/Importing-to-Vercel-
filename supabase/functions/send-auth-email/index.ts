// Supabase "Send Email" auth hook: delivers the 6-digit sign-in code through Twilio's Email API
// instead of Supabase's rate-limited built-in SMTP.
import { Webhook } from 'npm:standardwebhooks@1.0.0';

const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');

type HookPayload = {
  user: { email: string };
  email_data: { token: string };
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
  const auth = btoa(`${Deno.env.get('TWILIO_ACCOUNT_SID')}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`);
  const res = await fetch('https://comms.twilio.com/v1/Emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      from: { address: from, name: 'CryoChain' },
      to: [{ address: user.email }],
      content: {
        subject: 'Your CryoChain sign-in code',
        html: `<p>Your sign-in code is <strong style="font-size:20px">${email_data.token}</strong>.</p><p>It expires shortly. If you didn't request it, ignore this email.</p>`,
      },
    }),
  });

  if (!res.ok) {
    console.error('twilio email failed', res.status, await res.text());
    return Response.json({ error: { http_code: 502, message: 'Could not send email' } }, { status: 200 });
  }
  return Response.json({});
});
