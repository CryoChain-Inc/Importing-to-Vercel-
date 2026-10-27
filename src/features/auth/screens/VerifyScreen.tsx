import React from 'react';
import { AuthLayout } from '../../../components/layout';
import { sendCode, verifySignIn } from '../../../data/demoAuth';
import { useNav, type Route } from '../../../navigation';
import type { Account } from '../../../types/auth';
import { isEmail, maskPhone } from '../../../utils/format';
import { VerifyCode } from '../components/VerifyCode';

type VerifyRoute = Extract<Route, { name: 'verify' }>;

// Wrong and expired codes share one message so the screen never reveals account state.
const NEUTRAL = "We couldn't sign you in with that code. Check it and try again, or contact support if this keeps happening.";

export const afterSignIn = (account: Account): Route =>
  account.roles.length > 1 ? { name: 'workspace', account } : { name: 'home', account, role: account.roles[0] };

export function VerifyScreen({ route }: { route: VerifyRoute }) {
  const { identifier } = route;
  const { push, reset } = useNav();
  const target = isEmail(identifier) ? identifier : maskPhone(identifier);

  const submit = async (code: string) => {
    const r = await verifySignIn(identifier, code);
    if (r.status === 'ok') {
      reset(afterSignIn(r.account));
      return null;
    }
    if (r.status === 'unknown') {
      push({ name: 'role', identifier });
      return null;
    }
    return NEUTRAL;
  };
  const resend = () => sendCode(identifier);

  return (
    <AuthLayout title="Enter your code" subtitle={`We sent a 6-digit code to ${target}.`}>
      <VerifyCode identifier={identifier} onSubmit={submit} onResend={resend} />
    </AuthLayout>
  );
}
