import { completeStop, reassignOrder, saveLogistics } from '../ops.control.service';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;
beforeEach(() => jest.clearAllMocks());

test('a move returns the capacity warning from the server', async () => {
  rpc.mockResolvedValue({ data: 'The truck now carries 200 against a capacity of 150.', error: null });
  await expect(reassignOrder('o1', 'd1', 'flat tyre')).resolves.toMatch('capacity of 150');
  expect(rpc).toHaveBeenCalledWith('ops_reassign_order', { p_order: 'o1', p_driver: 'd1', p_reason: 'flat tyre' });
});

test('refusals become plain sentences', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'quantity must be between 0 and 100.00' } });
  await expect(completeStop('s1', 150, 4, 'phone dead')).rejects.toThrow('between 0 and 100');
  rpc.mockResolvedValue({ data: null, error: { message: 'give a reason' } });
  await expect(completeStop('s1', 50, 4, '')).rejects.toThrow('Give a reason');
});

test('logistics settings are saved as numbers and times', async () => {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq }));
  (supabase.from as jest.Mock).mockReturnValue({ update });
  await saveLogistics({ dispatchWaitMinutes: '90', dispatchStart: '07:00', dispatchEnd: '16:30', detourKm: '20', pickupTolerancePct: '3',
    avgSpeedKmh: '35', roadFactor: '1.3', stopMinutes: '10', etaBufferPct: '25' });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ dispatch_wait_minutes: 90, dispatch_start: '07:00', road_factor: 1.3 }));
});
