// SMS copy. Auth OTPs are rendered by Supabase Auth (GoTrue), not by our code, so this string must be kept in sync
// by hand with `[auth.sms] template` in supabase/config.toml and the Auth > SMS template in the hosted dashboard.
// Plain GSM-7 characters only, so it stays one 160-char segment.
export const OTP_SMS_TEMPLATE = 'CryoChain: {{ .Code }} is your verification code. Never share it, we will never ask for it.';
