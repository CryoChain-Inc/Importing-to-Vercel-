import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/** The only mailbox that may use /govt; the database checks it too (private.can_view_farmer_report). */
export const GOVT_EMAIL = 'govt@cryochain.co';

/** One row per farmer and listing; farmers with nothing listed come once with listingId null. */
export interface ReportRow {
  farmerId: string;
  farmerName: string;
  phone: string;
  locality: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  walletVerified: boolean;
  joinedAt: string;
  listingId: string | null;
  product: string;
  unit: string;
  listed: number;
  sold: number;
  delivered: number;
  remaining: number;
  listedAt: string | null;
}

const num = (v: unknown) => Number(v ?? 0);

/** Every farmer with their listings and stock; ops and the government account only. */
export async function fetchFarmerReport(): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('farmer_report');
  if (error) throw new Error('Could not load the farmer report.');
  return ((data ?? []) as any[]).map((r) => ({
    farmerId: r.farmer_id,
    farmerName: r.farmer_name ?? 'Unnamed farmer',
    phone: r.phone ?? '',
    locality: r.locality ?? '',
    address: r.address ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
    walletVerified: Boolean(r.wallet_verified),
    joinedAt: r.joined_at,
    listingId: r.listing_id,
    product: r.product ?? '',
    unit: r.unit ?? '',
    listed: num(r.listed),
    sold: num(r.sold),
    delivered: num(r.delivered),
    remaining: num(r.remaining),
    listedAt: r.listed_at,
  }));
}

/** Downloads the CSV on web; on a phone it opens the share sheet (save to Files, email, WhatsApp). */
export async function saveCsv(csv: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Farmer report' });
}
