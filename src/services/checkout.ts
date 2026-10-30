import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { paymentReturnReference } from '../utils/paymentReturn';

/** Where Paystack sends the buyer back to on the mobile app (the `cryochain` scheme in app.json). */
export const NATIVE_CALLBACK = 'cryochain://payment/verify';

const listeners = new Set<(reference: string) => void>();
/** Called when the buyer comes back from Paystack inside the app; returns an unsubscribe. */
export const onPaymentReturn = (fn: (reference: string) => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/**
 * Opens Paystack checkout. On the web the page navigates away and Paystack redirects to /payment/verify.
 * In the app it opens an in-app auth session that closes itself when Paystack redirects to NATIVE_CALLBACK,
 * then hands the reference to whoever listens (App.tsx shows the verification screen).
 */
export async function openCheckout(url: string): Promise<void> {
  if (Platform.OS === 'web') return window.location.assign(url);
  const res = await WebBrowser.openAuthSessionAsync(url, NATIVE_CALLBACK);
  const reference = res.type === 'success' ? paymentReturnReference(res.url) : null;
  if (reference) listeners.forEach((fn) => fn(reference));
}
