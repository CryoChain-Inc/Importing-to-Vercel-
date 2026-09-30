import type { State } from '../domain/types';
import { emptyOperatingState } from '../domain/seed';
import { supabase } from './client';

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
  draft: { lines: State['session']['draft']['lines']; deliveryDate: string; address: string };
};

export type CommitResult = {
  empty?: boolean;
  conflict?: boolean;
  ok?: boolean;
  version: number;
  state?: State;
  profile?: Profile;
  error?: string;
  roster?: Profile[];
  link?: string;
};

const inflight = new Set<string>();
const STAFF = new Set(['ops', 'agent', 'driver']);

function needsStaffPolicy(message: string) {
  return /row-level security|permission denied/i.test(message);
}

const staffPolicyError = 'Run cryochain-mobile/supabase/migrations/20260929140000_staff_workspace.sql in the Supabase SQL editor, then reload.';

function withSession(state: State, profile: Profile): State {
  const next = structuredClone(state);
  next.session = {
    buyerUserId: profile.buyer_user_id ?? '',
    opsUserId: profile.ops_user_id ?? '',
    farmerId: profile.farmer_id ?? '',
    agentDeviceId: profile.role === 'agent' ? (profile.device_id ?? '') : '',
    driverDeviceId: profile.role === 'driver' ? (profile.device_id ?? '') : '',
    draft: profile.draft ?? { lines: [], deliveryDate: '', address: '' },
  };
  return next;
}

function withoutSession(state: State): State {
  const stored = structuredClone(state);
  stored.session = { buyerUserId: '', opsUserId: '', farmerId: '', agentDeviceId: '', driverDeviceId: '', draft: { lines: [], deliveryDate: '', address: '' } };
  return stored;
}

async function myProfile(): Promise<{ profile?: Profile; error?: string }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: 'Sign in required.' };
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userData.user.id).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Profile missing.' };
  return { profile: data as Profile };
}

async function directCommit(body: Record<string, unknown>): Promise<CommitResult> {
  const who = await myProfile();
  if (!who.profile) return { version: 0, error: who.error ?? 'Profile missing.' };
  const profile = who.profile;
  if (!STAFF.has(profile.role)) return { version: 0, error: 'Buyer and farmer access needs the commit Edge Function deployed on Supabase.' };
  const op = String(body.op ?? 'load');
  if (op === 'load') {
    const { data, error } = await supabase.from('workspace').select('version, state').eq('id', 1).maybeSingle();
    if (error) return { version: 0, error: needsStaffPolicy(error.message) ? staffPolicyError : error.message, profile };
    if (!data) return { empty: true, version: 0, profile };
    return { empty: false, version: data.version as number, state: withSession(data.state as State, profile), profile };
  }
  if (op === 'bootstrap') {
    const existing = await supabase.from('workspace').select('version, state').eq('id', 1).maybeSingle();
    if (existing.error) return { version: 0, error: needsStaffPolicy(existing.error.message) ? staffPolicyError : existing.error.message, profile };
    if (existing.data) return { empty: false, version: existing.data.version as number, state: withSession(existing.data.state as State, profile), profile };
    const stored = withoutSession(body.state as State);
    const inserted = await supabase.from('workspace').insert({ id: 1, version: 1, state: stored }).select('version').single();
    if (inserted.error) return { version: 0, error: needsStaffPolicy(inserted.error.message) ? staffPolicyError : inserted.error.message, profile };
    const opsId = stored.opsUsers[0]?.id ?? '';
    if (opsId) await supabase.rpc('attach_ops_user', { ops_id: opsId });
    const linked = { ...profile, ops_user_id: opsId || profile.ops_user_id };
    return { empty: false, version: 1, state: withSession(stored, linked), profile: linked };
  }
  if (op === 'save') {
    const version = Number(body.version);
    const stored = withoutSession(body.state as State);
    const updated = await supabase.from('workspace').update({ state: stored, version: version + 1, updated_at: new Date().toISOString() }).eq('id', 1).eq('version', version).select('version');
    if (updated.error) return { version: 0, error: needsStaffPolicy(updated.error.message) ? staffPolicyError : updated.error.message, profile };
    if (!updated.data?.length) {
      const fresh = await supabase.from('workspace').select('version, state').eq('id', 1).maybeSingle();
      if (!fresh.data) return { version: 0, error: 'The operating record is missing.', profile };
      return { conflict: true, version: fresh.data.version as number, state: withSession(fresh.data.state as State, profile), profile };
    }
    return { conflict: false, version: updated.data[0].version as number, state: withSession(stored, profile), profile };
  }
  return { version: 0, error: 'That action needs the commit Edge Function deployed on Supabase.' };
}

async function messageOf(error: { message?: string; context?: { json?: () => Promise<{ error?: string }> } }) {
  try {
    const body = await error.context?.json?.();
    if (body?.error) return String(body.error);
  } catch { /* the body is not JSON */ }
  return error.message ?? 'The request failed.';
}

export async function commit(body: Record<string, unknown>): Promise<CommitResult> {
  const op = String(body.op ?? 'load');
  if (op === 'load' || op === 'bootstrap' || op === 'save') {
    const who = await myProfile();
    if (who.profile && STAFF.has(who.profile.role)) return directCommit(body);
  }
  const { data, error } = await supabase.functions.invoke('commit', { body });
  if (error) {
    const message = await messageOf(error);
    if (message.includes('Failed to send a request')) return { version: 0, error: 'The commit function did not respond. Reload, and if it persists check the function logs in Supabase.' };
    return { version: 0, error: message };
  }
  return (data ?? { version: 0, error: 'Empty response.' }) as CommitResult;
}

export function stateForNewNode(name: string): State {
  const state = emptyOperatingState();
  const id = 'OU-1';
  state.opsUsers = [{ id, name: name || 'Node manager', title: 'Node manager', approver: true }];
  state.config.approverIds = [id];
  state.session.opsUserId = id;
  return state;
}

async function invoke(name: string, body: Record<string, unknown>, key: string): Promise<CommitResult> {
  if (inflight.has(key)) return { version: 0, ok: true };
  inflight.add(key);
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) return { version: 0, error: await messageOf(error) };
    return (data ?? { version: 0 }) as CommitResult;
  } finally {
    inflight.delete(key);
  }
}

export function dispatchSms(id: string) {
  return invoke('send-sms', { id }, `sms:${id}`);
}

export function dispatchTransfer(id: string) {
  return invoke('payout-transfer', { id }, `transfer:${id}`);
}

export function startCheckout(orderId: string, method: 'card' | 'momo', phone: string) {
  return invoke('charge-payment', { orderId, method, phone }, `pay:${orderId}`);
}
