import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);

/**
 * Standard enum for all Supabase Edge Function names.
 * Centralizing function names in an enum prevents magic strings,
 * provides autocomplete, and allows easy renaming across the codebase.
 */
export enum EdgeFunction {
  Commit = 'commit',
  ClaimInvite = 'claim-invite',
  SendSms = 'send-sms',
  ChargePayment = 'charge-payment',
  PayoutTransfer = 'payout-transfer',

  // V1 edge functions
  V1Orders = 'v1-orders',
  V1Payments = 'v1-payments',
  V1Telemetry = 'v1-telemetry',

  /** Exchanges a verified farmer code for a one-time sign-in token. */
  FarmerOtpSignIn = 'farmer-otp-signin',
}

/**
 * Universal helper for invoking Supabase Edge Functions using the EdgeFunction enum.
 * Handles both local (http://127.0.0.1:54321/functions/v1/...) and production endpoints automatically.
 *
 * @param functionName - Target EdgeFunction enum member or string name
 * @param body - Optional JSON payload to send in the request
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: EdgeFunction | string,
  body?: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    if (data?.error) {
      return { data: null, error: String(data.error) };
    }

    return { data: data as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown function error',
    };
  }
}
