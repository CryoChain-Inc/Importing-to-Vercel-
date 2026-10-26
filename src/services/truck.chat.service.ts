import { Linking, Platform } from 'react-native';
import { requireUserId, supabase } from './supabase';

export interface TruckMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

const mapMessage = (r: { id: string; sender_id: string; body: string; created_at: string }): TruckMessage => ({
  id: r.id,
  senderId: r.sender_id,
  body: r.body,
  createdAt: r.created_at,
});

/** A number the phone dialer can open. Returns null when nothing usable is stored. */
export function dialable(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** Opens the device phone app for the other person on this trip. */
export async function callPhone(raw: string): Promise<void> {
  const number = dialable(raw);
  if (!number) throw new Error('No phone number is saved for this trip.');
  const url = `tel:${number}`;
  if (Platform.OS === 'web') {
    window.location.href = url;
    return;
  }
  await Linking.openURL(url);
}

export async function fetchTruckMessages(bookingId: string): Promise<TruckMessage[]> {
  const { data, error } = await supabase
    .from('truck_messages')
    .select('id, sender_id, body, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });
  if (error) {
    if (/truck_messages|schema cache/i.test(error.message)) {
      throw new Error('Chat is not available yet. Apply the latest database update, then try again.');
    }
    throw new Error('Could not load messages.');
  }
  return (data ?? []).map(mapMessage);
}

export async function sendTruckMessage(bookingId: string, text: string): Promise<TruckMessage> {
  const senderId = await requireUserId();
  const body = text.trim().slice(0, 500);
  if (!body) throw new Error('Write a message first.');
  const { data, error } = await supabase
    .from('truck_messages')
    .insert({ booking_id: bookingId, sender_id: senderId, body })
    .select('id, sender_id, body, created_at')
    .single();
  if (error || !data) {
    if (/truck_messages|schema cache/i.test(error?.message ?? '')) {
      throw new Error('Chat is not available yet. Apply the latest database update, then try again.');
    }
    if (/row-level security|violates/i.test(error?.message ?? '')) {
      throw new Error('Messaging opens once a driver is assigned to this trip.');
    }
    throw new Error('Could not send that message.');
  }
  return mapMessage(data);
}
