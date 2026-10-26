import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import { AuthLayout } from '../../../components/layout';
import { toAccount } from '../../../data/demoAuth';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { afterSignIn } from './VerifyScreen';

/** Where the emailed confirmation link lands. It only confirms the address; it never signs this browser or device in. */
export function EmailVerifiedScreen({ ok }: { ok: boolean }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const { reset } = useNav();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  // The address is already confirmed server-side by the time the link redirects here; the pause just shows the user it was checked.
  useEffect(() => {
    const id = setTimeout(() => setChecking(false), 1200);
    return () => clearTimeout(id);
  }, []);

  // Someone already signed in here goes back to their workspace; anyone else to the login page.
  const next = async () => {
    setBusy(true);
    const p = await authService.getProfile().catch(() => null);
    reset(p && p.role !== 'pending' ? afterSignIn(toAccount(p)) : { name: 'landing' });
  };

  if (checking)
    return (
      <AuthLayout title="Confirming your email" subtitle="Checking your link. This takes a moment.">
        <View style={s.badge}><ActivityIndicator size="large" color={colors.brandInk} /></View>
      </AuthLayout>
    );

  if (!ok)
    return (
      <AuthLayout title="Link didn't work" subtitle="This confirmation link is invalid or has expired.">
        <View style={s.badge}><Icon name="close" size={32} color={colors.dangerInk} /></View>
        <Text style={s.copy}>Open your account, then add the email again to get a fresh link.</Text>
        <Button label="Open CryoChain" size="lg" onPress={next} loading={busy} />
      </AuthLayout>
    );

  return (
    <AuthLayout title="Email verified" subtitle="Your new email address is confirmed and now on your CryoChain account.">
      <View style={s.badge}><Icon name="check" size={32} color={colors.brandInk} /></View>
      <Text style={s.copy}>You can close this tab. The device you started on updates by itself.</Text>
      <Button label="Open CryoChain" size="lg" onPress={next} loading={busy} />
    </AuthLayout>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  badge: { width: 72, height: 72, borderRadius: 24, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  copy: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: c.inkMuted },
});
