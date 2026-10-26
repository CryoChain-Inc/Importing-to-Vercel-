import { authService } from '../auth.service';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({
  supabase: { auth: { signInWithOtp: jest.fn(), updateUser: jest.fn(), verifyOtp: jest.fn(), getSession: jest.fn() }, rpc: jest.fn(), from: jest.fn() },
}));

const auth = supabase.auth as unknown as { signInWithOtp: jest.Mock; updateUser: jest.Mock; verifyOtp: jest.Mock };

beforeEach(() => jest.clearAllMocks());

test('local Ghana phone is sent as +233 E.164', async () => {
  auth.signInWithOtp.mockResolvedValue({ error: null });
  await authService.sendOtp('0244000001');
  expect(auth.signInWithOtp).toHaveBeenCalledWith({ phone: '+233244000001' });
});

test('email is lower-cased and verified as an email code', async () => {
  auth.verifyOtp.mockResolvedValue({ error: null });
  expect(await authService.verifyOtp(' Ops@Cryo.co ', '123456')).toBe(true);
  expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'ops@cryo.co', token: '123456', type: 'email' });
});

test('wrong phone code returns false', async () => {
  auth.verifyOtp.mockResolvedValue({ error: new Error('bad') });
  expect(await authService.verifyOtp('233244000001', '000000')).toBe(false);
  expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: '+233244000001', token: '000000', type: 'sms' });
});

test('adding an email asks auth to change it, then confirms with an email_change code', async () => {
  auth.updateUser.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ error: null });
  await authService.requestContactChange('New@Cryo.co');
  expect(auth.updateUser).toHaveBeenCalledWith({ email: 'new@cryo.co' });
  expect(await authService.confirmContactChange('New@Cryo.co', '123456')).toBe(true);
  expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'new@cryo.co', token: '123456', type: 'email_change' });
});

test('phone change confirms with a phone_change code', async () => {
  auth.verifyOtp.mockResolvedValue({ error: null });
  await authService.confirmContactChange('0244000001', '123456');
  expect(auth.verifyOtp).toHaveBeenCalledWith({ phone: '+233244000001', token: '123456', type: 'phone_change' });
});

test('a contact owned by another account is rejected with a clear message', async () => {
  auth.updateUser.mockResolvedValue({ error: { code: 'phone_exists', message: 'x' } });
  await expect(authService.requestContactChange('0244000001')).rejects.toThrow('belongs to another account');
});
