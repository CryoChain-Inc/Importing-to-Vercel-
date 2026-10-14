import type { Account } from '../types/auth';
import { isEmail, normalizePhone } from '../utils/format';
import { isSupabaseConfigured, supabase, EdgeFunction } from './supabase';

export interface FarmerProfile {
  id: string;
  role: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
}

export interface ProduceListing {
  id: string;
  product: string;
  weightKg: number;
  createdAt: string;
}

export interface FarmerDetails {
  name: string;
  phone: string;
  address: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
}

interface ProfileRow {
  id: string;
  role: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
}

interface ListingRow {
  id: string;
  product: string;
  weight_kg: number | string;
  created_at: string;
}

const PROFILE_COLUMNS =
  'id, role, display_name, phone, email, address, bank_name, account_holder, account_number';

/** Phone signups have no inbox, so they get a stable login email derived from the number. */
export function farmerLoginEmail(identifier: string): string {
  const trimmed = identifier.trim();
  if (isEmail(trimmed)) return trimmed.toLowerCase();
  return `${normalizePhone(trimmed)}@farmers.cryochain.app`;
}

function mapProfile(row: ProfileRow): FarmerProfile {
  return {
    id: row.id,
    role: row.role,
    displayName: row.display_name?.trim() ?? '',
    phone: row.phone,
    email: row.email,
    address: row.address,
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    accountNumber: row.account_number,
  };
}

export function toAccount(profile: FarmerProfile): Account {
  return {
    id: profile.id,
    name: profile.displayName || 'Farmer',
    phone: profile.phone ?? undefined,
    email: profile.email ?? undefined,
    roles: ['farmer'],
    status: 'active',
    staff: false,
    payoutReady: Boolean(profile.accountNumber),
  };
}

function ensureConfigured() {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
}

async function requireUserId(): Promise<string> {
  ensureConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Sign in again to continue.');
  return data.user.id;
}

export async function fetchMyProfile(): Promise<FarmerProfile | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw new Error('Could not load your profile.');
  return data ? mapProfile(data as ProfileRow) : null;
}

function profilePatch(details: FarmerDetails) {
  return {
    display_name: details.name.trim(),
    phone: normalizePhone(details.phone),
    address: details.address.trim(),
    bank_name: details.bankName.trim(),
    account_holder: details.accountHolder.trim(),
    account_number: details.accountNumber.replace(/\s/g, ''),
  };
}

function mapWriteError(error: { message: string; code?: string }): Error {
  const msg = error.message.toLowerCase();
  if (msg.includes('profiles_phone_unique') || error.code === '23505') {
    return new Error('That phone number is already registered.');
  }
  if (msg.includes('account_number')) return new Error('Enter the account number as 6 to 20 digits.');
  if (msg.includes('address') || msg.includes('bank_name') || msg.includes('account_holder')) {
    return new Error('Check the address and bank details and try again.');
  }
  return new Error('Could not save your details.');
}

export async function saveFarmerProfile(details: FarmerDetails): Promise<FarmerProfile> {
  const userId = await requireUserId();
  const { error } = await supabase.from('profiles').update(profilePatch(details)).eq('id', userId);
  if (error) throw mapWriteError(error);
  const profile = await fetchMyProfile();
  if (!profile || (profile.role !== 'farmer' && profile.role !== 'pending')) {
    throw new Error('Could not save your details.');
  }
  return profile;
}

export async function registerFarmerAccount(
  details: FarmerDetails & { email?: string; password: string },
): Promise<{ account: Account } | { duplicate: true }> {
  ensureConfigured();
  const email = details.email ? details.email.trim().toLowerCase() : farmerLoginEmail(details.phone);
  const { data, error } = await supabase.auth.signUp({ email, password: details.password });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) return { duplicate: true };
    if (/password/i.test(error.message)) throw new Error('Use a password of at least 8 characters.');
    throw new Error('Could not create your account.');
  }
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { duplicate: true };

  if (!data.session) {
    const signed = await supabase.auth.signInWithPassword({ email, password: details.password });
    if (signed.error || !signed.data.session) {
      if (signed.error && /confirm/i.test(signed.error.message)) {
        throw new Error('Check your email to confirm the account, then sign in.');
      }
      throw new Error('Could not create your account.');
    }
  }

  const profile = await saveFarmerProfile(details);
  return { account: toAccount(profile) };
}

export async function signInFarmer(identifier: string, password: string): Promise<Account> {
  ensureConfigured();
  const { error } = await supabase.auth.signInWithPassword({
    email: farmerLoginEmail(identifier),
    password,
  });
  if (error) throw new Error('That password does not match this account.');
  return accountFromSession();
}

/**
 * Code sign-in for an existing farm account. Returns null when the phone or email
 * has no farmer yet, so the caller can open registration instead.
 */
export async function signInFarmerWithCode(identifier: string, code: string): Promise<Account | null> {
  ensureConfigured();
  const { data, error } = await supabase.functions.invoke(EdgeFunction.FarmerOtpSignIn, {
    body: { identifier, code },
  });
  if (error) {
    const context = (error as { context?: { status?: number; json?: () => Promise<{ error?: string }> } }).context;
    const status = context?.status ?? 0;
    const body = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    if (status === 404 || body?.error === 'not_found') return null;
    throw new Error('Could not sign you in with that code.');
  }
  if (!data?.token_hash) return null;
  const verified = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (verified.error) throw new Error('Could not sign you in with that code.');
  return accountFromSession();
}

async function accountFromSession(): Promise<Account> {
  const profile = await fetchMyProfile();
  if (!profile?.displayName || (profile.role !== 'farmer' && profile.role !== 'pending')) {
    throw new Error('This account does not have a farmer profile yet.');
  }
  return toAccount(profile);
}

export async function fetchListings(): Promise<ProduceListing[]> {
  await requireUserId();
  const { data, error } = await supabase
    .from('produce_listings')
    .select('id, product, weight_kg, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load your listings.');
  return ((data ?? []) as ListingRow[]).map((row) => ({
    id: row.id,
    product: row.product,
    weightKg: Number(row.weight_kg),
    createdAt: row.created_at,
  }));
}

export async function createListing(product: string, weightKg: number): Promise<void> {
  const farmerId = await requireUserId();
  const { error } = await supabase.from('produce_listings').insert({
    farmer_id: farmerId,
    product: product.trim(),
    weight_kg: weightKg,
  });
  if (error) throw new Error('Could not save that listing.');
}

export async function deleteListing(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from('produce_listings').delete().eq('id', id);
  if (error) throw new Error('Could not remove that listing.');
}

export async function signOutFarmer() {
  if (isSupabaseConfigured) await supabase.auth.signOut();
}
