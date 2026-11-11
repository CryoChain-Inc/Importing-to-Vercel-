import { approveRefund, markRefundDone } from '../ops.refunds.service';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn(), functions: { invoke: jest.fn() } } }));

const invoke = supabase.functions.invoke as jest.Mock;
beforeEach(() => jest.clearAllMocks());

test('approval goes through the server function and surfaces its reason on failure', async () => {
  invoke.mockResolvedValueOnce({ error: null });
  await approveRefund('r1');
  expect(invoke).toHaveBeenCalledWith('refund-order', { body: { refundId: 'r1' } });
  invoke.mockResolvedValueOnce({ error: { context: { json: async () => ({ error: 'Paystack did not accept the refund: low balance' }) } } });
  await expect(approveRefund('r1')).rejects.toThrow('low balance');
});

test('a hand refund needs a note', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ error: { message: 'say how it was refunded' } });
  await expect(markRefundDone('r1', '')).rejects.toThrow('Say how the refund was paid');
});
