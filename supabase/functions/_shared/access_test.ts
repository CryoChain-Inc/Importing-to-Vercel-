import assert from 'node:assert/strict';

const assertEquals: typeof assert.deepEqual = assert.deepEqual;
import {
  appOrigin,
  filterFor,
  findFarmerId,
  mergeBuyer,
  replaceOperational,
  type Profile,
} from './access.ts';

function profile(partial: Partial<Profile> & Pick<Profile, 'role'>): Profile {
  return {
    id: 'user-1',
    display_name: 'Test',
    phone: null,
    org_id: null,
    buyer_user_id: null,
    farmer_id: null,
    ops_user_id: null,
    device_id: null,
    draft: { lines: [], deliveryDate: '', address: '' },
    ...partial,
  };
}

function workspace() {
  return {
    seq: 4,
    orders: [
      {
        id: 'CC-1',
        orgId: 'O1',
        status: 'paid',
        runId: 'RUN-1',
        address: 'Kitchen',
        requestedBy: 'U1',
        approvedBy: 'U2',
        payment: { status: 'confirmed', amount: 100 },
        lines: [{ id: 'L1', name: 'Tomato' }],
        receiver: 'Yaw',
      },
      { id: 'CC-2', orgId: 'O2', status: 'submitted', address: 'Other', lines: [] },
    ],
    orgs: [
      { id: 'O1', name: 'Kempinski', status: 'approved' },
      { id: 'O2', name: 'Other', status: 'approved' },
    ],
    buyerUsers: [
      { id: 'U1', orgId: 'O1', name: 'Abena' },
      { id: 'U9', orgId: 'O2', name: 'Kojo' },
    ],
    farmers: [
      { id: 'F1', code: 'FM-0101', name: 'Akua' },
      { id: 'F2', code: 'FM-0102', name: 'Kwesi' },
    ],
    consignments: [
      { id: 'CS-1', orderId: 'CC-1', farmerId: 'F1', runId: 'RUN-1', photos: ['crate'] },
      { id: 'CS-2', orderId: 'CC-2', farmerId: 'F2', photos: ['scale'] },
    ],
    runs: [
      {
        id: 'RUN-1',
        position: { lat: 1, lng: 2 },
        stops: [
          { kind: 'farm', farmerId: 'F1', label: 'Adeiso' },
          {
            kind: 'delivery',
            farmerId: undefined,
            label: 'Kitchen',
            address: 'Secret',
            orderIds: ['CC-1'],
          },
        ],
      },
    ],
    temps: [{ id: 'TP-1', runId: 'RUN-1' }],
    deliveries: [{ id: 'DL-1', orderId: 'CC-1' }],
    settlements: [
      { id: 'ST-1', farmerId: 'F1' },
      { id: 'ST-2', farmerId: 'F2' },
    ],
    ledger: [
      { id: 'LG-1', orderId: 'CC-1', amount: 100 },
      { id: 'LG-2', orderId: 'CC-2', amount: 40 },
    ],
    payoutRuns: [{ id: 'PR-1' }],
    transfers: [{ id: 'TR-1' }],
    exceptions: [{ id: 'EX-1' }],
    sms: [{ id: 'SM-1', farmerId: 'F1' }],
    availability: [{ id: 'AV-1', farmerId: 'F1' }],
    events: [{ id: 'EV-1' }],
    devices: [{ id: 'DEV-1' }],
    opsUsers: [{ id: 'OU1' }],
    audit: [{ id: 'AU-1' }],
    session: { draft: { lines: [{ id: 'old' }], deliveryDate: '2026-10-01', address: 'Old' } },
  };
}

Deno.test('ops, agents, and drivers see the full record with their own session', () => {
  const state = workspace();
  const view = filterFor(
    state,
    profile({
      role: 'agent',
      device_id: 'DEV-A1',
      draft: { lines: [], deliveryDate: '', address: '' },
    }),
  );
  assertEquals((view.farmers as unknown[]).length, 2);
  assertEquals((view.session as { agentDeviceId: string }).agentDeviceId, 'DEV-A1');
  assertEquals((view.session as { driverDeviceId: string }).driverDeviceId, '');
  assertEquals((state.session as { draft: { address: string } }).draft.address, 'Old');
});

Deno.test('a buyer only sees their organisation, and farm photos are stripped', () => {
  const view = filterFor(
    workspace(),
    profile({ role: 'buyer', org_id: 'O1', buyer_user_id: 'U1' }),
  );
  assertEquals(
    (view.orders as { id: string }[]).map((order) => order.id),
    ['CC-1'],
  );
  assertEquals(view.farmers, []);
  assertEquals(view.settlements, []);
  assertEquals(view.transfers, []);
  assertEquals((view.consignments as { photos: string[] }[])[0].photos, []);
  assertEquals(
    (view.buyerUsers as { id: string }[]).map((user) => user.id),
    ['U1'],
  );
  assertEquals((view.session as { buyerUserId: string }).buyerUserId, 'U1');
});

Deno.test('a farmer sees their own money and not the buyer address or price lines', () => {
  const view = filterFor(workspace(), profile({ role: 'farmer', farmer_id: 'F1' }));
  assertEquals(
    (view.farmers as { id: string }[]).map((farmer) => farmer.id),
    ['F1'],
  );
  assertEquals(
    (view.settlements as { id: string }[]).map((row) => row.id),
    ['ST-1'],
  );
  const order = (view.orders as { address: string; payment?: unknown; lines: unknown[] }[])[0];
  assertEquals(order.address, '');
  assertEquals(order.payment, undefined);
  assertEquals(order.lines, []);
  const delivery = (
    view.runs as { stops: { kind: string; address?: string; label: string }[] }[]
  )[0].stops[1];
  assertEquals(delivery.address, '');
  assertEquals(delivery.label, 'Delivery');
  assertEquals(view.ledger, []);
  assertEquals(view.payoutRuns, []);
});

Deno.test('a pending login receives an empty workspace', () => {
  const view = filterFor(workspace(), profile({ role: 'pending' }));
  assertEquals(view.orders, []);
  assertEquals(view.farmers, []);
  assertEquals(view.products, undefined);
});

Deno.test('findFarmerId matches the visible code or the internal id', () => {
  const state = workspace();
  assertEquals(findFarmerId(state, ' fm-0101 '), 'F1');
  assertEquals(findFarmerId(state, 'F2'), 'F2');
  assertEquals(findFarmerId(state, 'FM-9999'), '');
  assertEquals(findFarmerId(state, ''), '');
  assertEquals(findFarmerId({}, 'F1'), '');
});

Deno.test('appOrigin keeps only an http or https origin', () => {
  assertEquals(appOrigin(' https://cryochain.co/invite?x=1 '), 'https://cryochain.co');
  assertEquals(appOrigin('http://localhost:8081/path'), 'http://localhost:8081');
  assertEquals(appOrigin('javascript:alert(1)'), '');
  assertEquals(appOrigin('not a url'), '');
  assertEquals(appOrigin(''), '');
});

Deno.test('a buyer cannot roll a confirmed payment back, but can close a delivery', () => {
  const server = workspace();
  const client = structuredClone(server);
  const orders = client.orders as { id: string; status: string; payment?: { amount: number } }[];
  orders[0].status = 'awaiting_payment';
  orders[0].payment = { amount: 1 };
  const merged = mergeBuyer(server, client, profile({ role: 'buyer', org_id: 'O1' }));
  const kept = (
    merged.state.orders as { id: string; status: string; payment?: { amount: number } }[]
  ).find((order) => order.id === 'CC-1')!;
  assertEquals(kept.status, 'paid');
  assertEquals(kept.payment?.amount, 100);

  const closing = structuredClone(server);
  (closing.orders as { id: string; status: string }[])[0].status = 'delivered';
  const clientClose = structuredClone(closing);
  (clientClose.orders as { id: string; status: string }[])[0].status = 'closed';
  const closed = mergeBuyer(closing, clientClose, profile({ role: 'buyer', org_id: 'O1' }));
  assertEquals(
    (closed.state.orders as { id: string; status: string }[]).find((order) => order.id === 'CC-1')!
      .status,
    'closed',
  );
});

Deno.test('a buyer cannot un-approve their organisation or duplicate a ledger row', () => {
  const server = workspace();
  const client = structuredClone(server);
  (client.orgs as { id: string; status: string }[])[0].status = 'pending';
  (client.ledger as { id: string }[]).push({ id: 'LG-1' }, {
    id: 'LG-9',
    orderId: 'CC-1',
  } as never);
  const merged = mergeBuyer(server, client, profile({ role: 'buyer', org_id: 'O1' }));
  assertEquals(
    (merged.state.orgs as { id: string; status: string }[]).find((org) => org.id === 'O1')!.status,
    'approved',
  );
  const ids = (merged.state.ledger as { id: string }[]).map((row) => row.id);
  assertEquals(ids.filter((id) => id === 'LG-1').length, 1);
  assert(ids.includes('LG-9'));
  assert(ids.includes('LG-2'));
});

Deno.test('the first organisation registration is linked, and a second one is refused', () => {
  const server = { orgs: [], buyerUsers: [], orders: [], ledger: [] };
  const client = {
    orgs: [{ id: 'O9', name: 'New' }],
    buyerUsers: [{ id: 'U9', orgId: 'O9' }],
    orders: [{ id: 'CC-9', orgId: 'O9' }],
    session: { buyerUserId: 'U9' },
    ledger: [],
  };
  const created = mergeBuyer(server, client, profile({ role: 'buyer' }));
  assertEquals(created.link, { org_id: 'O9', buyer_user_id: 'U9' });
  assertEquals((created.state.orders as { id: string }[])[0].id, 'CC-9');

  assert.throws(
    () =>
      mergeBuyer(
        server,
        { ...client, orgs: [{ id: 'O9' }, { id: 'O10' }] },
        profile({ role: 'buyer' }),
      ),
    /Submit one organisation registration\./,
  );
});

Deno.test('operational saves keep the higher sequence and drop the device session', () => {
  const next = replaceOperational(
    { seq: 9 },
    {
      seq: 4,
      orders: [{ id: 'CC-1' }],
      session: {
        buyerUserId: 'U1',
        draft: { lines: [1], deliveryDate: '2026-10-08', address: 'Kitchen' },
      },
    },
  );
  assertEquals(next.seq, 9);
  assertEquals(next.session, {
    buyerUserId: '',
    opsUserId: '',
    farmerId: '',
    agentDeviceId: '',
    driverDeviceId: '',
    draft: { lines: [], deliveryDate: '', address: '' },
  });
  assertEquals((next.orders as { id: string }[])[0].id, 'CC-1');
});
