import { requireUserId, supabase } from './supabase';

export interface PayableRow {
  /** order_allocations id */
  id: string;
  farmerId: string;
  farmer: string;
  orderCode: string;
  product: string;
  grade: string;
  kg: number;
  net: number;
  status: 'pending' | 'payable' | 'paid';
  deliveredAt: string | null;
  paidAt: string | null;
  /** Already part of a live payout run. */
  inRun: boolean;
}

export type TransferStatus = 'queued' | 'sent' | 'succeeded' | 'failed' | 'cancelled';

export interface TransferRow {
  id: string;
  farmer: string;
  amount: number;
  network: string;
  momoNumber: string;
  status: TransferStatus;
  attempts: number;
  lastError: string | null;
  walletCheck: 'verified' | 'unverified' | null;
  walletName: string | null;
}

export interface PayoutRun {
  id: string;
  code: string;
  status: 'review' | 'released' | 'partial' | 'completed' | 'cancelled';
  total: number;
  needsApproval: boolean;
  approved: boolean;
  /** The signed-in user created it, so they cannot approve it. */
  createdByMe: boolean;
  preflight: { balance: number | null; needed: number; balanceOk: boolean; test: boolean } | null;
  preflightAt: string | null;
  createdAt: string;
  transfers: TransferRow[];
}

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

/** One row per farmer share of a paid order. It turns payable when the order is delivered. */
export async function fetchPayables(): Promise<PayableRow[]> {
  const [{ data, error }, live] = await Promise.all([
    supabase
      .from('order_allocations')
      .select('id, farmer_id, grade, kg, amount, payout_status, delivered_at, paid_at, orders(code), products(name), profiles:farmer_id(display_name)')
      .in('status', ['offered', 'accepted', 'collected'])
      .order('created_at', { ascending: false }),
    supabase.from('payout_transfers').select('allocation_id').neq('status', 'cancelled').not('allocation_id', 'is', null),
  ]);
  fail('Could not load payouts.')(error ?? live.error);
  const inRun = new Set((live.data ?? []).map((t) => t.allocation_id as string));
  return (data ?? []).map((r: any) => ({
    id: r.id,
    farmerId: r.farmer_id,
    farmer: r.profiles?.display_name || 'Farmer',
    orderCode: r.orders?.code ?? '',
    product: r.products?.name ?? '',
    grade: r.grade,
    kg: Number(r.kg),
    net: Number(r.amount),
    status: r.payout_status,
    deliveredAt: r.delivered_at,
    paidAt: r.paid_at,
    inRun: inRun.has(r.id),
  }));
}

export async function fetchPayoutRuns(): Promise<PayoutRun[]> {
  const me = await requireUserId();
  const { data, error } = await supabase
    .from('payout_runs')
    .select('*, payout_transfers(*, profiles:farmer_id(display_name))')
    .order('created_at', { ascending: false });
  fail('Could not load payout runs.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    total: Number(r.total),
    needsApproval: r.needs_approval,
    approved: Boolean(r.approved_by),
    createdByMe: r.created_by === me,
    preflight: r.preflight,
    preflightAt: r.preflight_at,
    createdAt: r.created_at,
    transfers: (r.payout_transfers ?? [])
      .filter((t: any) => t.status !== 'cancelled')
      .map((t: any) => ({
        id: t.id,
        farmer: t.profiles?.display_name || 'Farmer',
        amount: Number(t.amount),
        network: t.network,
        momoNumber: t.momo_number,
        status: t.status,
        attempts: t.attempts,
        lastError: t.last_error,
        walletCheck: t.wallet_check,
        walletName: t.wallet_registered_name,
      })),
  }));
}

export async function createPayoutRun(allocationIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('create_payout_run', { p_allocations: allocationIds });
  fail('Could not create the payout run. Check each payout is for a delivered order and the farmer has a wallet.')(error);
}

export async function approvePayoutRun(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_payout_run', { p_run: id });
  fail('Another ops user must approve this run.')(error);
}

export async function cancelPayoutRun(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_payout_run', { p_run: id });
  fail('Only a run under review can be cancelled.')(error);
}

async function call(body: object): Promise<any> {
  const { data, error } = await supabase.functions.invoke('payout-run', { body });
  // A non-2xx carries the server's message in the response body.
  const msg = data?.error ?? (error ? await (error as any).context?.json?.().then((j: any) => j?.error).catch(() => null) : null);
  if (msg || error) throw new Error(msg ?? 'Payout service is unavailable.');
  return data;
}

export const runPreflight = (runId: string) => call({ op: 'preflight', runId });
export const releaseRun = (runId: string) => call({ op: 'release', runId });
export const retryTransfer = (transferId: string) => call({ op: 'send', transferId });
export const checkTransfer = (transferId: string) => call({ op: 'verify', transferId });
