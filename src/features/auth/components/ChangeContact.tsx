import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native';
import { Button, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { authService } from '../../../services/auth.service';
import { EMAIL_MAX, isEmail } from '../../../utils/format';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { errorMessage } from '../errors';

// Where the confirmation link in the email lands: the site on web, the app's scheme on devices (must be an allowed redirect URL in Supabase).
const EMAIL_REDIRECT = Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/email-verified` : 'cryochain://email-verified';

/** Adds or changes the signed-in user's email: sends a confirmation link. Saved only once the link is opened. */
export function ChangeContact({ current, onDone, onCancel }: {
  current: string;
  onDone: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState('');
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isEmail(value);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await authService.requestContactChange(value, EMAIL_REDIRECT);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // After the link is tapped (on any device) Supabase confirms server-side; notice it by polling and when the app returns to the foreground.
  const waiting = sent;
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const check = async () => {
      try {
        await authService.refreshSession();
        const profile = await authService.getProfile();
        if (live && profile?.email?.toLowerCase() === value.trim().toLowerCase()) {
          live = false;
          await done.current();
        }
      } catch {
        // transient network error: the next tick retries
      }
    };
    const timer = setInterval(check, 3000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => {
      live = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [waiting, value]);

  if (waiting)
    return (
      <View style={s.waiting}>
        <ActivityIndicator color={colors.brandInk} />
        <Text style={s.title}>Check your inbox</Text>
        <Text style={s.copy}>We sent a link to {value.trim()}. Tap it and this page updates on its own.</Text>
        {error ? <Banner text={error} /> : null}
        <Button label="Resend email" variant="ghost" size="sm" onPress={send} disabled={busy} />
        <Button label="Wrong address? Edit" variant="ghost" size="sm" onPress={() => { setSent(false); setError(null); }} />
      </View>
    );

  return (
    <View style={{ gap: 12 }}>
      {error ? <Banner text={error} /> : null}
      <Input
        label="Email"
        value={value}
        onChangeText={setValue}
        maxLength={EMAIL_MAX}
        keyboardType="email-address"
        autoCapitalize="none"
        hint={current ? `Currently ${current}. We'll email a link to confirm the new one.` : "We'll email a link to confirm it."}
      />
      <Button label="Send confirmation email" onPress={send} loading={busy} disabled={!valid} />
      {onCancel ? <Button label="Not now" variant="ghost" onPress={onCancel} /> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  waiting: { gap: 10, alignItems: 'center' as const, paddingVertical: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
