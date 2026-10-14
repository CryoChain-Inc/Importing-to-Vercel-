import { authService, type UserProfile, type UserRole } from '../services/auth.service';
import type { Account, BuyerForm, Role } from '../types/auth';
import { normalizePhone } from '../utils/format';

// Auth runs on Supabase (services/auth.service.ts). Payout and review are still demo stand-ins.
export const demoFlags = { offline: false };

export type SignInKind = 'otp';
export type VerifyResult =
  | { status: 'ok'; account: Account }
  | { status: 'unknown' } // code was right, but no role yet: offer registration
  | { status: 'wrong' };

const STAFF: UserRole[] = ['agent', 'driver', 'ops'];

export const toAccount = (p: UserProfile): Account => ({
  id: p.id,
  name: p.display_name ?? '',
  phone: p.phone ? normalizePhone(p.phone) : undefined,
  email: p.email ?? undefined,
  roles: [p.role as Role],
  status: 'active',
  staff: STAFF.includes(p.role),
  businessVerified: false,
});

async function net<T>(fn: () => Promise<T> | T): Promise<T> {
  if (demoFlags.offline) throw new Error('offline');
  return fn();
}

export const startSignIn = async (identifier: string): Promise<SignInKind> => {
  await net(() => authService.sendOtp(identifier));
  return 'otp';
};

export const sendCode = (identifier: string) => net(() => authService.sendOtp(identifier));

export const verifySignIn = (identifier: string, code: string) =>
  net(async (): Promise<VerifyResult> => {
    if (!(await authService.verifyOtp(identifier, code))) return { status: 'wrong' };
    const profile = await authService.getProfile();
    if (!profile || profile.role === 'pending') return { status: 'unknown' };
    return { status: 'ok', account: toAccount(profile) };
  });

type Registered = { account: Account } | { duplicate: true };

async function onboard(name: string): Promise<Registered> {
  await authService.completeOnboarding('buyer', name);
  const profile = (await authService.getProfile())!;
  const account = toAccount(profile);
  return { account };
}

export const registerBuyer = (f: BuyerForm) => net(() => onboard(f.business.trim()));

export const requestReview = () => net(() => `RV-${Math.floor(1000 + Math.random() * 9000)}`);
