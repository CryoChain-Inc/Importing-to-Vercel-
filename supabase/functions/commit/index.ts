import {
  appOrigin,
  applySession,
  blankSession,
  filterFor,
  findFarmerId,
  mergeBuyer,
  replaceOperational,
  type Profile,
} from '../_shared/access.ts';
import { caller, cors, json, readWorkspace, writeWorkspace } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST required.' }, 405);
  const who = await caller(req);
  if (who.error) return who.error;
  const { admin, user, profile } = who;
  const body = await req.json().catch(() => ({}));
  const op = String(body.op ?? 'load');
  try {
    if (op === 'load') return await load(admin, profile);
    if (op === 'bootstrap') return await bootstrap(admin, profile, body.state);
    if (op === 'save') return await save(admin, profile, Number(body.version), body.state);
    if (op === 'become') return await become(admin, profile, String(body.role ?? ''));
    if (op === 'roster') return await roster(admin, profile);
    if (op === 'invite') return await invite(admin, user.email ?? '', profile, body);
    if (op === 'request') return await requestRole(admin, profile, String(body.role ?? ''));
    if (op === 'approve') return await approve(admin, user.email ?? '', profile, body);
    return json({ error: 'Unknown operation.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Save failed.' }, 400);
  }
});

function staff(role: string) {
  return role === 'ops' || role === 'agent' || role === 'driver';
}

const FARMER_NOT_ON_REGISTER =
  'That farmer number is not on the register. The field agent registers the farmer first.';

async function load(admin: ReturnType<typeof Object>, profile: Profile) {
  const row = await readWorkspace(admin as never);
  if (!row) return json({ empty: true, version: 0, profile });
  return json({
    empty: false,
    version: row.version,
    state: filterFor(row.state, profile),
    profile,
  });
}

async function bootstrap(
  admin: ReturnType<typeof Object>,
  profile: Profile,
  state: Record<string, unknown>,
) {
  if (profile.role !== 'ops')
    return json({ error: 'Only the node manager can open the operating record.' }, 403);
  const existing = await readWorkspace(admin as never);
  if (existing)
    return json({
      empty: false,
      version: existing.version,
      state: filterFor(existing.state, profile),
      profile,
    });
  if (!state || !Array.isArray(state.products) || !state.config)
    return json({ error: 'Catalog is missing.' }, 400);
  const ops = Array.isArray(state.opsUsers)
    ? (state.opsUsers[0] as { id?: string } | undefined)
    : undefined;
  blankSession(state);
  const { error } = await (
    admin as {
      from: (t: string) => {
        insert: (v: unknown) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from('workspace')
    .insert({ id: 1, version: 1, state });
  if (error) return json({ error: error.message }, 400);
  if (ops?.id)
    await (
      admin as {
        from: (t: string) => {
          update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> };
        };
      }
    )
      .from('profiles')
      .update({ ops_user_id: ops.id })
      .eq('id', profile.id);
  const linked = { ...profile, ops_user_id: ops?.id ?? profile.ops_user_id };
  applySession(state, linked);
  return json({ empty: false, version: 1, state: filterFor(state, linked), profile: linked });
}

/**
 * Persists client state changes using optimistic version checking and role-specific merge logic.
 */
async function save(
  admin: ReturnType<typeof Object>,
  profile: Profile,
  version: number,
  clientState: Record<string, unknown>,
) {
  // Farmers and unverified accounts have read-only access to operating records.
  if (profile.role === 'pending' || profile.role === 'farmer')
    return json({ error: 'This login cannot change operating records.' }, 403);
  if (!clientState) return json({ error: 'Nothing to save.' }, 400);
  const row = await readWorkspace(admin as never);
  if (!row) return json({ error: 'The node has not been opened yet.' }, 409);
  if (row.version !== version)
    return json({ conflict: true, version: row.version, state: filterFor(row.state, profile) });
  const draft = (clientState.session as { draft?: Profile['draft'] } | undefined)?.draft;
  let next: Record<string, unknown>;
  let link: { org_id: string; buyer_user_id: string } | undefined;
  if (profile.role === 'buyer') {
    const merged = mergeBuyer(row.state, clientState, profile);
    next = merged.state;
    link = merged.link;
    blankSession(next);
  } else if (staff(profile.role)) {
    next = replaceOperational(row.state, clientState);
  } else {
    return json({ error: 'This login cannot change operating records.' }, 403);
  }
  const written = await writeWorkspace(admin as never, row.version, next);
  if (!written) {
    const fresh = await readWorkspace(admin as never);
    return json({
      conflict: true,
      version: fresh?.version ?? row.version,
      state: filterFor(fresh?.state ?? row.state, profile),
    });
  }
  const patch: Record<string, unknown> = {};
  if (profile.role === 'buyer' && draft) patch.draft = draft;
  if (link) Object.assign(patch, link);
  let linked = profile;
  if (Object.keys(patch).length) {
    await (
      admin as {
        from: (t: string) => {
          update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> };
        };
      }
    )
      .from('profiles')
      .update(patch)
      .eq('id', profile.id);
    linked = { ...profile, ...patch } as Profile;
  }
  return json({
    conflict: false,
    version: written.version,
    state: filterFor(next, linked),
    profile: linked,
  });
}

/**
 * Allows a newly invited user to activate as a buyer organization.
 * Staff roles cannot be self-selected; they must be provisioned by operations.
 */
async function become(admin: ReturnType<typeof Object>, profile: Profile, role: string) {
  if (role !== 'buyer') return json({ error: 'Choose a buyer organisation registration.' }, 400);
  if (profile.role !== 'pending' && profile.role !== 'buyer')
    return json({ error: 'Operations assigns staff access.' }, 403);
  await (
    admin as {
      from: (t: string) => {
        update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> };
      };
    }
  )
    .from('profiles')
    .update({ role: 'buyer' })
    .eq('id', profile.id);
  return json({ profile: { ...profile, role: 'buyer' } });
}

async function roster(admin: ReturnType<typeof Object>, profile: Profile) {
  if (profile.role !== 'ops') return json({ error: 'Operations only.' }, 403);
  const { data, error } = await (
    admin as {
      from: (t: string) => {
        select: (c: string) => {
          order: (c: string) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    }
  )
    .from('profiles')
    .select(
      'id, role, display_name, phone, org_id, buyer_user_id, farmer_id, ops_user_id, device_id, created_at',
    )
    .order('created_at');
  if (error) return json({ error: error.message }, 400);
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const requested = await requestedRoleByUser(
    admin,
    rows.map((row) => String(row.id ?? '')),
  );
  return json({
    roster: rows.map((row) => ({
      ...row,
      requested_role: requested.get(String(row.id ?? '')) ?? null,
    })),
  });
}

async function invite(
  admin: ReturnType<typeof Object>,
  actorEmail: string,
  profile: Profile,
  body: Record<string, unknown>,
) {
  if (profile.role !== 'ops') return json({ error: 'Operations only.' }, 403);
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  const role = String(body.role ?? '');
  const displayName = String(body.displayName ?? '').trim();
  if (!email || !displayName) return json({ error: 'Name and email are required.' }, 400);
  if (!['buyer', 'farmer', 'agent', 'driver', 'ops'].includes(role))
    return json({ error: 'Unknown role.' }, 400);
  const row = await readWorkspace(admin as never);
  if (!row) return json({ error: 'Open the node before inviting staff.' }, 409);
  // Verification requirement: Field agent must register farmer at farm gate before online portal access.
  const farmerId = role === 'farmer' ? findFarmerId(row.state, body.farmerId) : '';
  if (role === 'farmer' && !farmerId) return json({ error: FARMER_NOT_ON_REGISTER }, 400);
  const redirectTo = appOrigin(body.redirectTo);
  const created = await (
    admin as {
      auth: {
        admin: {
          inviteUserByEmail: (
            e: string,
            o: unknown,
          ) => Promise<{
            data: { user: { id: string } | null };
            error: { message: string } | null;
          }>;
        };
      };
    }
  ).auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName, needs_password: true },
    ...(redirectTo ? { redirectTo } : {}),
  });
  if (created.error || !created.data.user)
    return json(
      { error: created.error?.message ?? 'Invite failed. Check Auth email settings in Supabase.' },
      400,
    );
  const userId = created.data.user.id;
  const state = structuredClone(row.state);
  const patch: Record<string, unknown> = { role, display_name: displayName };
  const seq = Number(state.seq ?? 1000);
  if (role === 'ops') {
    const id = `OU-${seq + 1}`;
    state.seq = seq + 1;
    const approver = Boolean(body.approver);
    const users = Array.isArray(state.opsUsers)
      ? (state.opsUsers as Record<string, unknown>[])
      : [];
    users.push({ id, name: displayName, title: String(body.title ?? 'Staff'), approver });
    state.opsUsers = users;
    if (approver) {
      const config = state.config as { approverIds?: string[] };
      config.approverIds = [...(config.approverIds ?? []), id];
    }
    patch.ops_user_id = id;
  }
  if (role === 'agent' || role === 'driver') {
    const id = `DEV-${crypto.randomUUID().slice(0, 8)}`;
    const devices = Array.isArray(state.devices)
      ? (state.devices as Record<string, unknown>[])
      : [];
    devices.push({
      id,
      role,
      userName: displayName,
      online: true,
      outbox: [],
      seq: 0,
      appVersion: '1.0.0',
      storageMb: 0,
      clockSkewMin: 0,
    });
    state.devices = devices;
    patch.device_id = id;
  }
  if (role === 'farmer') patch.farmer_id = farmerId;
  const audit = Array.isArray(state.audit) ? (state.audit as Record<string, unknown>[]) : [];
  audit.unshift({
    id: `AU-${Number(state.seq ?? seq) + 2}`,
    at: Date.now(),
    actor: profile.display_name || actorEmail,
    action: 'Invited login',
    entity: email,
    detail: role,
  });
  state.audit = audit;
  blankSession(state);
  const written = await writeWorkspace(admin as never, row.version, state);
  if (!written) return json({ error: 'The record changed while inviting. Try again.' }, 409);
  await (
    admin as {
      from: (t: string) => {
        update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> };
      };
    }
  )
    .from('profiles')
    .update(patch)
    .eq('id', userId);
  return json({ ok: true, version: written.version });
}

const FIELD_ROLES = ['farmer', 'agent', 'driver'];

async function requestRole(admin: ReturnType<typeof Object>, profile: Profile, role: string) {
  if (profile.role !== 'pending') return json({ error: 'This login already has a role.' }, 403);
  if (!FIELD_ROLES.includes(role))
    return json({ error: 'Choose field agent, driver, or farmer.' }, 400);
  const saved = await writeRequestedRole(admin, profile.id, role);
  if (saved) return json({ error: saved }, 400);
  return json({ ok: true, requestedRole: role });
}

async function approve(
  admin: ReturnType<typeof Object>,
  actorEmail: string,
  profile: Profile,
  body: Record<string, unknown>,
) {
  if (profile.role !== 'ops') return json({ error: 'Operations only.' }, 403);
  const userId = String(body.userId ?? '');
  const role = String(body.role ?? '');
  if (!userId) return json({ error: 'Choose a pending person.' }, 400);
  if (!FIELD_ROLES.includes(role))
    return json({ error: 'Approve a field agent, driver, or farmer.' }, 400);
  const found = await (
    admin as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from('profiles')
    .select('id, role, display_name, device_id')
    .eq('id', userId)
    .maybeSingle();
  if (found.error || !found.data)
    return json({ error: found.error?.message ?? 'That login is not on this node.' }, 400);
  if (found.data.role !== 'pending')
    return json({ error: 'Only a login that is still waiting can be approved.' }, 400);
  const row = await readWorkspace(admin as never);
  if (!row) return json({ error: 'Open the node before approving access.' }, 409);
  const displayName = String(found.data.display_name ?? '').trim() || 'Staff';
  const farmerId = role === 'farmer' ? findFarmerId(row.state, body.farmerId) : '';
  if (role === 'farmer' && !farmerId) return json({ error: FARMER_NOT_ON_REGISTER }, 400);
  const state = structuredClone(row.state);
  const patch: Record<string, unknown> = { role, display_name: displayName };
  if (role === 'agent' || role === 'driver') {
    const currentId = typeof found.data.device_id === 'string' ? found.data.device_id : '';
    if (currentId) patch.device_id = currentId;
    else {
      const id = `DEV-${crypto.randomUUID().slice(0, 8)}`;
      const devices = Array.isArray(state.devices)
        ? (state.devices as Record<string, unknown>[])
        : [];
      devices.push({
        id,
        role,
        userName: displayName,
        online: true,
        outbox: [],
        seq: 0,
        appVersion: '1.0.0',
        storageMb: 0,
        clockSkewMin: 0,
      });
      state.devices = devices;
      patch.device_id = id;
    }
  }
  if (role === 'farmer') patch.farmer_id = farmerId;
  const audit = Array.isArray(state.audit) ? (state.audit as Record<string, unknown>[]) : [];
  audit.unshift({
    id: `AU-${Number(state.seq ?? 1000) + 2}`,
    at: Date.now(),
    actor: profile.display_name || actorEmail,
    action: 'Approved login',
    entity: displayName,
    detail: role,
  });
  state.audit = audit;
  blankSession(state);
  const written = await writeWorkspace(admin as never, row.version, state);
  if (!written) return json({ error: 'The record changed while approving. Try again.' }, 409);
  await (
    admin as {
      from: (t: string) => {
        update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> };
      };
    }
  )
    .from('profiles')
    .update(patch)
    .eq('id', userId);
  await writeRequestedRole(admin, userId, '');
  return json({ ok: true, version: written.version });
}

type ListedUser = { id: string; user_metadata?: Record<string, unknown> };

function authAdmin(admin: ReturnType<typeof Object>) {
  return (
    admin as {
      auth: {
        admin: {
          getUserById: (id: string) => Promise<{
            data: { user: ListedUser | null };
            error: { message: string } | null;
          }>;
          updateUserById: (
            id: string,
            attrs: { user_metadata: Record<string, unknown> },
          ) => Promise<{ error: { message: string } | null }>;
          listUsers: (opts: { page: number; perPage: number }) => Promise<{
            data: { users: ListedUser[] } | null;
            error: { message: string } | null;
          }>;
        };
      };
    }
  ).auth.admin;
}

async function writeRequestedRole(admin: ReturnType<typeof Object>, userId: string, role: string) {
  const auth = authAdmin(admin);
  const current = await auth.getUserById(userId);
  if (current.error) return current.error.message;
  const metadata = { ...(current.data.user?.user_metadata ?? {}) };
  if (role) metadata.requested_role = role;
  else delete metadata.requested_role;
  const updated = await auth.updateUserById(userId, { user_metadata: metadata });
  return updated.error?.message ?? '';
}

async function requestedRoleByUser(admin: ReturnType<typeof Object>, ids: string[]) {
  const wanted = new Set(ids);
  const found = new Map<string, string>();
  try {
    const auth = authAdmin(admin);
    for (let page = 1; page <= 5; page++) {
      const listed = await auth.listUsers({ page, perPage: 200 });
      const users = listed.data?.users ?? [];
      for (const user of users) {
        const role = user.user_metadata?.requested_role;
        if (!wanted.has(user.id) || typeof role !== 'string' || !FIELD_ROLES.includes(role))
          continue;
        found.set(user.id, role);
      }
      if (users.length < 200) break;
    }
  } catch {
    /* The roster still loads when Auth listing is unavailable. */
  }
  return found;
}
