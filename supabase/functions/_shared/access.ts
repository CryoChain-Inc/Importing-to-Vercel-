export type Profile = {
  id: string;
  role: 'buyer' | 'farmer' | 'agent' | 'driver' | 'ops' | 'pending';
  display_name: string;
  phone: string | null;
  org_id: string | null;
  buyer_user_id: string | null;
  farmer_id: string | null;
  ops_user_id: string | null;
  device_id: string | null;
  draft: { lines: unknown[]; deliveryDate: string; address: string };
};

type Rec = Record<string, unknown>;

const emptySession = () => ({
  buyerUserId: '',
  opsUserId: '',
  farmerId: '',
  agentDeviceId: '',
  driverDeviceId: '',
  draft: { lines: [] as unknown[], deliveryDate: '', address: '' },
});

export function blankSession(state: Rec) {
  const draft = (state.session as Rec | undefined)?.draft ?? emptySession().draft;
  state.session = emptySession();
  return draft;
}

export function applySession(state: Rec, profile: Profile) {
  const draft = profile.draft ?? { lines: [], deliveryDate: '', address: '' };
  state.session = {
    buyerUserId: profile.buyer_user_id ?? '',
    opsUserId: profile.ops_user_id ?? '',
    farmerId: profile.farmer_id ?? '',
    agentDeviceId: profile.role === 'agent' ? (profile.device_id ?? '') : '',
    driverDeviceId: profile.role === 'driver' ? (profile.device_id ?? '') : '',
    draft,
  };
}

function arr(state: Rec, key: string): Rec[] {
  return Array.isArray(state[key]) ? (state[key] as Rec[]) : [];
}

/**
 * Projects and redacts the global workspace document based on the authenticated user's role.
 * Acts as an in-memory Row-Level Security (RLS) enforcement layer.
 */
export function filterFor(state: Rec, profile: Profile): Rec {
  const next = structuredClone(state) as Rec;
  // Ops, field agents, and drivers require full operational visibility across all collections.
  if (profile.role === 'ops' || profile.role === 'agent' || profile.role === 'driver') {
    applySession(next, profile);
    return next;
  }
  if (profile.role === 'buyer') {
    const orgId = profile.org_id;
    const orders = arr(next, 'orders').filter((o) => o.orgId === orgId);
    const orderIds = new Set(orders.map((o) => String(o.id)));
    const runIds = new Set(
      orders
        .map((o) => o.runId)
        .filter(Boolean)
        .map(String),
    );
    next.orders = orders;
    next.orgs = arr(next, 'orgs').filter((o) => o.id === orgId);
    next.buyerUsers = arr(next, 'buyerUsers').filter((u) => u.orgId === orgId);
    next.ledger = arr(next, 'ledger').filter((l) => l.orderId && orderIds.has(String(l.orderId)));
    next.runs = arr(next, 'runs').filter((r) => runIds.has(String(r.id)));
    next.temps = arr(next, 'temps').filter((t) => runIds.has(String(t.runId)));
    next.deliveries = arr(next, 'deliveries').filter((d) => orderIds.has(String(d.orderId)));
    // Strip farm-gate photos to protect farmer privacy and reduce payload size.
    next.consignments = arr(next, 'consignments')
      .filter((c) => orderIds.has(String(c.orderId)))
      .map((c) => ({ ...c, photos: [] }));
    // Zero out private operational, payout, and internal collections.
    for (const key of [
      'farmers',
      'availability',
      'settlements',
      'payoutRuns',
      'transfers',
      'exceptions',
      'sms',
      'events',
      'devices',
      'opsUsers',
      'audit',
    ])
      next[key] = [];
    applySession(next, profile);
    return next;
  }
  if (profile.role === 'farmer') {
    const farmerId = profile.farmer_id;
    const consignments = arr(next, 'consignments').filter((c) => c.farmerId === farmerId);
    const orderIds = new Set(consignments.map((c) => String(c.orderId)));
    const runIds = new Set(
      consignments
        .map((c) => c.runId)
        .filter(Boolean)
        .map(String),
    );
    next.farmers = arr(next, 'farmers').filter((f) => f.id === farmerId);
    next.consignments = consignments;
    next.settlements = arr(next, 'settlements').filter((s) => s.farmerId === farmerId);
    next.sms = arr(next, 'sms').filter((m) => m.farmerId === farmerId);
    next.availability = arr(next, 'availability').filter((a) => a.farmerId === farmerId);
    // Redact commercial details (pricing, buyer address, order lines) to preserve customer privacy.
    next.orders = arr(next, 'orders')
      .filter((o) => orderIds.has(String(o.id)))
      .map((o) => ({
        ...o,
        address: '',
        requestedBy: '',
        approvedBy: undefined,
        payment: undefined,
        lines: [],
        receiver: undefined,
      }));
    next.runs = arr(next, 'runs')
      .filter((r) => runIds.has(String(r.id)))
      .map((r) => ({
        ...r,
        position: undefined,
        stops: arr({ stops: r.stops } as Rec, 'stops')
          .filter((s) => s.farmerId === farmerId || s.kind === 'delivery')
          .map((s) =>
            s.kind === 'delivery' ? { ...s, address: '', label: 'Delivery', orderIds: [] } : s,
          ),
      }));
    for (const key of [
      'orgs',
      'buyerUsers',
      'ledger',
      'payoutRuns',
      'transfers',
      'exceptions',
      'events',
      'devices',
      'opsUsers',
      'audit',
      'temps',
      'deliveries',
    ])
      next[key] = [];
    applySession(next, profile);
    return next;
  }
  for (const key of Object.keys(next)) {
    if (Array.isArray(next[key])) next[key] = [];
  }
  applySession(next, profile);
  return next;
}

// Order statuses that have advanced past buyer submission or payment.
const PROGRESSED = new Set(['paid', 'allocated', 'in_collection', 'delivered', 'closed', 'held']);

/**
 * Safely merges buyer mutations into the authoritative server state.
 * Prevents client rollbacks of webhook-confirmed payments and warehouse allocations.
 */
export function mergeBuyer(
  server: Rec,
  client: Rec,
  profile: Profile,
): { state: Rec; link?: { org_id: string; buyer_user_id: string } } {
  const next = structuredClone(server) as Rec;
  const orgId = profile.org_id;
  if (!orgId) {
    const created = arr(client, 'orgs').filter(
      (o) => !arr(server, 'orgs').some((x) => x.id === o.id),
    );
    if (created.length !== 1) throw new Error('Submit one organisation registration.');
    const org = created[0];
    const users = arr(client, 'buyerUsers').filter((u) => u.orgId === org.id);
    const orders = arr(client, 'orders').filter((o) => o.orgId === org.id);
    next.orgs = [...arr(next, 'orgs'), org];
    next.buyerUsers = [...arr(next, 'buyerUsers'), ...users];
    next.orders = [...orders, ...arr(next, 'orders')];
    const buyerUserId = String(
      (client.session as Rec | undefined)?.buyerUserId ?? users[0]?.id ?? '',
    );
    return { state: next, link: { org_id: String(org.id), buyer_user_id: buyerUserId } };
  }
  const serverOrders = arr(server, 'orders');
  const kept = arr(client, 'orders')
    .filter((o) => o.orgId === orgId)
    .map((o) => {
      const prev = serverOrders.find((x) => x.id === o.id);
      if (!prev) return o;
      const payment = prev.payment as Rec | undefined;
      // Do not allow an offline or stale buyer client to revert an order confirmed or allocated on server.
      const serverAhead = PROGRESSED.has(String(prev.status)) || payment?.status === 'confirmed';
      const clientEarly =
        String(o.status) === 'approved' ||
        String(o.status) === 'awaiting_payment' ||
        String(o.status) === 'submitted';
      if (serverAhead && clientEarly) return prev;
      if (payment?.status === 'confirmed') {
        const serverStatus = String(prev.status);
        const clientStatus = String(o.status);
        // The buyer may close a delivered order. Anything else stays on the server status.
        const accepted =
          clientStatus === 'closed' && (serverStatus === 'delivered' || serverStatus === 'closed');
        return {
          ...o,
          status: accepted ? 'closed' : serverStatus,
          payment: prev.payment,
          paidAt: prev.paidAt,
        };
      }
      return o;
    });
  next.orders = [...serverOrders.filter((o) => o.orgId !== orgId), ...kept];
  next.buyerUsers = [
    ...arr(server, 'buyerUsers').filter((u) => u.orgId !== orgId),
    ...arr(client, 'buyerUsers').filter((u) => u.orgId === orgId),
  ];
  const org = arr(client, 'orgs').find((o) => o.id === orgId);
  const prevOrg = arr(server, 'orgs').find((o) => o.id === orgId);
  if (org && prevOrg) {
    const status =
      prevOrg.status === 'approved' || prevOrg.status === 'suspended' ? prevOrg.status : org.status;
    next.orgs = arr(server, 'orgs').map((o) =>
      o.id === orgId
        ? { ...org, status, virtualAccount: prevOrg.virtualAccount ?? org.virtualAccount }
        : o,
    );
  }
  const belongs = (rows: Rec[], entry: Rec) =>
    !!entry.orderId && rows.some((o) => o.id === entry.orderId && o.orgId === orgId);
  const keptServer = arr(server, 'ledger').filter((l) => belongs(serverOrders, l));
  const added = arr(client, 'ledger').filter(
    (l) => belongs(arr(client, 'orders'), l) && !keptServer.some((s) => s.id === l.id),
  );
  const other = arr(server, 'ledger').filter((l) => !belongs(serverOrders, l));
  const seen = new Set<string>();
  next.ledger = [...other, ...keptServer, ...added].filter((l) => {
    const id = String(l.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { state: next };
}

/**
 * Operational staff (ops, agents, drivers) hold authoritative state.
 * Advances the logical clock (seq) and blanks transient device sessions before commit.
 */
export function replaceOperational(server: Rec, client: Rec): Rec {
  const next = structuredClone(client) as Rec;
  next.seq = Math.max(Number(client.seq ?? 0), Number(server.seq ?? 0));
  blankSession(next);
  return next;
}

/**
 * Resolves a typed farmer number to the internal farmer id on the register.
 * Accepts the visible code (FM-0101) or the internal id (F1, F-1042), trimmed and case-insensitive.
 */
export function findFarmerId(state: Rec, typed: unknown): string {
  const wanted = String(typed ?? '')
    .trim()
    .toLowerCase();
  if (!wanted) return '';
  const farmers = Array.isArray(state.farmers)
    ? (state.farmers as { id?: unknown; code?: unknown }[])
    : [];
  const match = farmers.find(
    (f) =>
      String(f.code ?? '').toLowerCase() === wanted || String(f.id ?? '').toLowerCase() === wanted,
  );
  return match ? String(match.id ?? '') : '';
}

/** Invite links may only redirect to an http(s) origin supplied by the caller. */
export function appOrigin(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}
