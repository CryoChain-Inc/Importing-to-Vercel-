import { supabase } from './supabase';

export type RefundStatus = 'requested' | 'sending' | 'sent' | 'refunded' | 'failed' | 'rejected';

export interface Refund {
  id: string;
  orderCode: string;
  buyer: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  /** False when the order was paid by bank transfer: ops refund it by hand. */
  online: boolean;
  lastError: string;
  note: string;
  createdAt: string;
  refundedAt: string | null;
}

export async function fetchRefunds(): Promise<Refund[]> {
  const { data, error } = await supabase
    .from('refunds')
    .select('id, amount, reason, status, payment_id, last_error, note, created_at, refunded_at, orders(code, buyers(organization_name))')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error('Could not load refunds.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    orderCode: r.orders?.code ?? '',
    buyer: r.orders?.buyers?.organization_name || 'Buyer',
    amount: Number(r.amount),
    reason: r.reason,
    status: r.status,
    online: r.payment_id != null,
    lastError: r.last_error ?? '',
    note: r.note ?? '',
    createdAt: r.created_at,
    refundedAt: r.refunded_at,
  }));
}

/** Approves the refund and asks Paystack to send it back to the account the buyer paid with. */
export async function approveRefund(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('refund-order', { body: { refundId: id } });
  if (!error) return;
  const res = (error as { context?: Response }).context;
  const msg = res ? (await res.json().catch(() => null))?.error : null;
  throw new Error(msg ?? 'Could not send the refund.');
}

/** For a refund paid back outside Paystack. The note says how. */
export async function markRefundDone(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('mark_refund_done', { p_id: id, p_note: note });
  if (error?.message.includes('say how')) throw new Error('Say how the refund was paid (up to 280 characters).');
  if (error) throw new Error('Could not mark that refund as paid.');
}

export async function rejectRefund(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('reject_refund', { p_id: id, p_note: note });
  if (error?.message.includes('say why')) throw new Error('Say why it is rejected (up to 280 characters).');
  if (error) throw new Error('Could not reject that refund.');
}
