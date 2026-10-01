import { caller, cors, json, mutateWorkspace } from '../_shared/db.ts';
import { paystackFetch, toPesewas } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret)
    return json(
      {
        error:
          'Add PAYSTACK_SECRET_KEY to the charge-payment function secrets. Card and mobile money stay unpaid until Paystack is connected.',
      },
      503,
    );
  const who = await caller(req);
  if (who.error) return who.error;
  const body = await req.json().catch(() => ({}));
  const orderId = String(body.orderId ?? '');
  const method = body.method === 'momo' ? 'momo' : 'card';
  let link = '';
  let failure = '';
  let alreadyPaid = false;
  try {
    await mutateWorkspace(who.admin, (state) => {
      const orders = state.orders as {
        id: string;
        status: string;
        payment?: { checkoutUrl?: string; provider?: string };
      }[];
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new Error('Order not found.');
      if (order.status === 'paid') {
        alreadyPaid = true;
        return;
      }
      // Reuse a Paystack link only. A leftover Flutterwave link is ignored so a new one can be created.
      if (order.payment?.checkoutUrl && order.payment.provider === 'paystack')
        link = order.payment.checkoutUrl;
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

  // Order ids look like O-1001, so the trailing timestamp can be stripped later if metadata is missing.
  const reference = `${orderId}-${Date.now()}`;
  const payload = {
    reference,
    email: who.user.email ?? 'payments@cryochain.co',
    amount: toPesewas(order.total),
    currency: 'GHS',
    callback_url: Deno.env.get('APP_URL') ?? 'https://cryochain.co',
    channels: method === 'momo' ? ['mobile_money'] : ['card'],
    metadata: {
      order_id: orderId,
      method,
      custom_fields: [{ display_name: 'Order', variable_name: 'order_id', value: orderId }],
    },
  };
  const res = await paystackFetch('/transaction/initialize', secret, payload);
  link = res.raw?.data?.authorization_url ?? '';
  if (!res.ok || !link) failure = res.raw?.message ?? 'Paystack did not return a payment page.';

  await mutateWorkspace(who.admin, (state) => {
    const list = state.orders as { id: string; payment?: Record<string, unknown> }[];
    const found = list.find((o) => o.id === orderId);
    if (!found?.payment) return;
    if (link) {
      found.payment.checkoutUrl = link;
      found.payment.provider = 'paystack';
    } else found.payment.checkoutError = failure;
    found.payment.ref = reference;
  });
  if (!link) return json({ error: failure }, 502);
  return json({ link });
});
