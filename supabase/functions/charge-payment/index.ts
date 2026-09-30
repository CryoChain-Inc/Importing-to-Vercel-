import { caller, cors, json, mutateWorkspace } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('FLW_SECRET_KEY');
  if (!secret)
    return json(
      {
        error:
          'Add FLW_SECRET_KEY to the charge-payment function secrets. Card and mobile money stay unpaid until Flutterwave is connected.',
      },
      503,
    );
  const who = await caller(req);
  if (who.error) return who.error;
  const body = await req.json().catch(() => ({}));
  const orderId = String(body.orderId ?? '');
  const method = body.method === 'momo' ? 'momo' : 'card';
  const phone = String(body.phone ?? '');
  let link = '';
  let failure = '';
  let alreadyPaid = false;
  try {
    await mutateWorkspace(who.admin, (state) => {
      const orders = state.orders as {
        id: string;
        status: string;
        payment?: { checkoutUrl?: string };
      }[];
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Order not found.');
      if (order.status === 'paid') {
        alreadyPaid = true;
        return;
      }
      // Return cached checkout link if one was already issued for this order.
      if (order.payment?.checkoutUrl) link = order.payment.checkoutUrl;
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Payment could not start.' }, 400);
  }
  if (alreadyPaid) return json({ error: 'This order is already paid.' }, 409);
  if (link) return json({ link });

  const { data: row } = await who.admin.from('workspace').select('state').eq('id', 1).single();
  const orders =
    (row?.state as { orders?: { id: string; total: number; orgId: string }[] })?.orders ?? [];
  const order = orders.find((o) => o.id === orderId);
  if (!order) return json({ error: 'Order not found.' }, 404);
  // Prefix txRef with orderId for deterministic correlation when webhooks fire.
  const txRef = `${orderId}-${Date.now()}`;
  const payload = {
    tx_ref: txRef,
    amount: order.total,
    currency: 'GHS',
    redirect_url: Deno.env.get('APP_URL') ?? 'https://cryochain.co',
    // Flutterwave requires 'mobilemoneyghana' specifically for Ghana telecom networks.
    payment_options: method === 'momo' ? 'mobilemoneyghana' : 'card',
    customer: {
      email: who.user.email ?? 'payments@cryochain.co',
      name: who.profile.display_name || 'CryoChain buyer',
      phonenumber: phone,
    },
    customizations: { title: 'CryoChain', description: `Order ${orderId}` },
    meta: { order_id: orderId },
  };
  const res = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const raw = await res.json().catch(() => ({}));
  link = raw?.data?.link ?? '';
  if (!res.ok || !link) failure = raw?.message ?? 'Flutterwave did not return a payment page.';
  // Record checkout link or provider failure on the order for operational visibility and retry.
  await mutateWorkspace(who.admin, (state) => {
    const list = state.orders as { id: string; payment?: Record<string, unknown> }[];
    const found = list.find((o) => o.id === orderId);
    if (!found?.payment) return;
    if (link) found.payment.checkoutUrl = link;
    else found.payment.checkoutError = failure;
    found.payment.ref = txRef;
  });
  if (!link) return json({ error: failure }, 502);
  return json({ link });
});
