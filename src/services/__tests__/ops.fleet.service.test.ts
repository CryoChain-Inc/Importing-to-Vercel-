import { saveTruck } from '../ops.fleet.service';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

const insert = jest.fn();
const eq = jest.fn();
const update = jest.fn(() => ({ eq }));
beforeEach(() => {
  jest.clearAllMocks();
  (supabase.from as jest.Mock).mockReturnValue({ insert, update });
});

test('a new truck is stored with a tidy plate', async () => {
  insert.mockResolvedValue({ error: null });
  await saveTruck({ plate: ' gr-123-24 ', name: ' Cold van ', capacityKg: 1000, driverId: 'd1', active: true });
  expect(insert).toHaveBeenCalledWith({ plate: 'GR-123-24', name: 'Cold van', capacity_kg: 1000, driver_id: 'd1', active: true });
});

test('retiring a truck takes it off its driver', async () => {
  eq.mockResolvedValue({ error: null });
  await saveTruck({ id: 't1', plate: 'GR-1', name: '', capacityKg: 1000, driverId: 'd1', active: false });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ driver_id: null, active: false }));
  expect(eq).toHaveBeenCalledWith('id', 't1');
});

test('a taken plate and a busy driver give plain messages', async () => {
  insert.mockResolvedValueOnce({ error: { message: 'duplicate key value violates unique constraint "trucks_plate_key"' } });
  await expect(saveTruck({ plate: 'gr-1', name: '', capacityKg: 1, driverId: null, active: true })).rejects.toThrow('plate GR-1 already exists');
  insert.mockResolvedValueOnce({ error: { message: 'duplicate key value violates unique constraint "trucks_driver_key"' } });
  await expect(saveTruck({ plate: 'gr-2', name: '', capacityKg: 1, driverId: 'd1', active: true })).rejects.toThrow('already has a truck');
});
