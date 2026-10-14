import type { Account, BuyerForm, FarmerForm } from '../types/auth';
import { isEmail, normalizePhone } from '../utils/format';
import { DEMO_OTP, DEMO_STAFF_MFA, demoAccounts } from './accounts';

// Stand-in for the backend. Same async shape a Supabase call would have.
export const demoFlags = { offline: false };

export type SignInKind = 'otp' | 'magic-link' | 'staff' | 'invite-expired';
export type VerifyResult =
  | { status: 'ok'; account: Account }
  | { status: 'unknown' } // code was right, but no account: offer registration
  | { status: 'mfa' }
  | { status: 'wrong' }
  | { status: 'locked' };

const accounts = [...demoAccounts];

async function net<T>(fn: () => T): Promise<T> {
  await new Promise((r) => setTimeout(r, 400));
  if (demoFlags.offline) throw new Error('offline');
  return fn();
}

const find = (identifier: string) => {
  const key = isEmail(identifier) ? identifier.trim().toLowerCase() : normalizePhone(identifier);
  return accounts.find((a) => a.email === key || a.phone === key);
};

export const startSignIn = (identifier: string) =>
  net((): SignInKind => {
    const a = find(identifier);
    if (a?.staff) return a.status === 'invite_expired' ? 'invite-expired' : 'staff';
    return isEmail(identifier) ? 'magic-link' : 'otp';
  });

/** Always succeeds for any well-formed target so registration can't probe for accounts. */
export const sendCode = (_target: string) => net(() => true);

export const checkCode = (code: string) => net(() => code === DEMO_OTP);

export const verifySignIn = (identifier: string, code: string, step: 'primary' | 'mfa' = 'primary') =>
  net((): VerifyResult => {
    const a = find(identifier);
    if (step === 'mfa') return code === DEMO_STAFF_MFA && a ? { status: 'ok', account: a } : { status: 'wrong' };
    if (code !== DEMO_OTP) return { status: 'wrong' };
    if (!a) return { status: 'unknown' };
    if (a.status === 'locked') return { status: 'locked' };
    return a.staff ? { status: 'mfa' } : { status: 'ok', account: a };
  });

type Registered = { account: Account } | { duplicate: true };

function add(a: Omit<Account, 'id' | 'status' | 'staff'>): Registered {
  const dup = accounts.some(
    (x) => (a.phone && x.phone === a.phone) || (a.email && x.email === a.email),
  );
  if (dup) return { duplicate: true };
  const account: Account = { ...a, id: `a${accounts.length + 1}`, status: 'active', staff: false };
  accounts.push(account);
  return { account };
}

export const registerFarmer = (f: FarmerForm, email?: string) =>
  net(() => add({ name: f.name.trim(), phone: normalizePhone(f.phone), email, roles: ['farmer'], payoutReady: false }));

export const registerBuyer = (f: BuyerForm) =>
  net(() =>
    add({
      name: f.business.trim(),
      phone: normalizePhone(f.phone) || undefined,
      email: f.email.trim().toLowerCase() || undefined,
      roles: ['buyer'],
      businessVerified: false,
    }),
  );

export const requestReview = () => net(() => `RV-${Math.floor(1000 + Math.random() * 9000)}`);

export const savePayout = (accountId: string) =>
  net(() => {
    const a = accounts.find((x) => x.id === accountId);
    if (a) a.payoutReady = true;
    return a;
  });
