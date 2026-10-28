/** The Paystack reference on the page Paystack sends the buyer back to (?reference=...&trxref=...), or null. */
export function paymentReturnReference(url: string | null | undefined): string | null {
  const m = url?.match(/[?&](?:reference|trxref)=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
