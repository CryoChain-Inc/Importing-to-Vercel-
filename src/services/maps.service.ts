import { supabase } from './supabase';

export interface PlaceInfo {
  /** Street address from Google. */
  address: string;
  city: string;
  postcode: string;
  latitude: number;
  longitude: number;
}

/** A map-picked address with the details people type themselves. Shared by buyer and farmer profiles. */
export interface AddressValue {
  address: string;
  line1: string;
  landmark: string;
  city: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
}

export const emptyAddress: AddressValue = { address: '', line1: '', landmark: '', city: '', postcode: '', latitude: null, longitude: null };

/** Ready to save: a pin, a street address and the flat/house line. */
export const addressReady = (v: AddressValue) =>
  v.latitude != null && v.address.trim().length >= 2 && v.line1.trim().length >= 1;

/** One-line form for lists and summaries: house/flat first, then the street address. */
export const composeAddress = (v: Pick<AddressValue, 'line1' | 'address'>) => [v.line1.trim(), v.address.trim()].filter(Boolean).join(', ');

export interface Suggestion {
  placeId: string;
  title: string;
  subtitle: string;
}

/** Ghana (Accra): where the picker opens when there is no saved pin and no location permission. */
export const DEFAULT_CENTER = { latitude: 5.6037, longitude: -0.187 };

async function call<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('maps-proxy', { body });
  if (error || !data || data.error) throw new Error(data?.error ?? fallback);
  return data as T;
}

export const searchPlaces = (query: string, near?: { latitude: number; longitude: number }) =>
  call<{ suggestions: Suggestion[] }>({ action: 'autocomplete', query, ...near }, 'Search failed. Try again.').then((r) => r.suggestions);

export const placeDetails = (placeId: string) => call<PlaceInfo>({ action: 'place', placeId }, 'Could not load that place.');

export const reverseGeocode = (latitude: number, longitude: number) =>
  call<PlaceInfo>({ action: 'reverse', latitude, longitude }, 'Could not read the address here.');
