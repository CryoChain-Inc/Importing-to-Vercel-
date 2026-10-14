import type { Account } from '../types/auth';

// Demo credentials. Replace with Supabase auth later.
export const DEMO_OTP = '123456';
export const DEMO_STAFF_MFA = '654321';

export const demoAccounts: Account[] = [
  { id: 'a1', name: 'Ama Mensah', phone: '233244000001', roles: ['farmer'], status: 'active', staff: false, payoutReady: false },
  { id: 'a2', name: 'Kofi Traders', phone: '233200000002', email: 'buyer@demo.test', roles: ['buyer'], status: 'active', staff: false, businessVerified: false },
  { id: 'a3', name: 'Efua Owusu', email: 'ops@cryochain.test', roles: ['agent', 'ops'], status: 'active', staff: true },
  { id: 'a4', name: 'Yaw Boateng', email: 'driver@cryochain.test', roles: ['driver'], status: 'invite_expired', staff: true },
  { id: 'a5', name: 'Locked Farmer', phone: '233244000009', roles: ['farmer'], status: 'locked', staff: false },
];

export const DEMO_HINT =
  'Demo: farmer 0244000001 · buyer buyer@demo.test or 0200000002 · staff ops@cryochain.test · code 123456 · staff MFA 654321';
