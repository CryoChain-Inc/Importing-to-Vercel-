/**
 * Reads the outcome of Supabase's email-change link from the URL it redirected to.
 * Success carries `access_token` + `type=email_change` in the hash; a bad or expired link carries `error`.
 * Anything else (someone typing /email-verified by hand) is null.
 */
export function verifyLinkStatus(url: string | null | undefined): 'ok' | 'failed' | null {
  const hash = url?.split('#')[1];
  if (!hash) return null;
  const q = new URLSearchParams(hash);
  if (q.get('error') || q.get('error_code')) return 'failed';
  return q.get('access_token') && q.get('type') === 'email_change' ? 'ok' : null;
}
