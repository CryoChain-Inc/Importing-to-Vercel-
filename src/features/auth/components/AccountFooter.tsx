import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { authService } from '../../../services/auth.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

// The public site hosts the policies; Google Play also needs these URLs in the store listing.
const SITE = 'https://www.cryochain.co';

/** Privacy / terms links plus a two-step "delete my account" for farmers and buyers. */
export function AccountFooter({ onDeleted }: { onDeleted: () => void }) {
  const s = useThemedStyles(styles);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const erase = async () => {
    setBusy(true);
    setError(null);
    try {
      await authService.deleteAccount();
      await authService.signOut();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account. Please try again.');
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <View style={s.links}>
        <Text accessibilityRole="link" style={s.link} onPress={() => Linking.openURL(`${SITE}/privacy.html`)}>Privacy Policy</Text>
        <Text accessibilityRole="link" style={s.link} onPress={() => Linking.openURL(`${SITE}/terms.html`)}>Terms of Use</Text>
      </View>
      {error ? <Banner text={error} /> : null}
      {confirming ? (
        <View style={s.confirm}>
          <Text style={s.warn}>
            This permanently removes your name, phone, email, addresses and payout wallet and signs you out. Payment records are kept without your personal details. This cannot be undone.
          </Text>
          <Button label="Yes, delete my account" variant="danger" loading={busy} onPress={erase} />
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => setConfirming(false)} />
        </View>
      ) : (
        <Button label="Delete account" variant="ghost" size="sm" onPress={() => setConfirming(true)} style={s.delete} />
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12, marginTop: 8 },
  links: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 20 },
  link: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted, textDecorationLine: 'underline' as const },
  confirm: { gap: 8 },
  warn: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, color: c.dangerInk },
  delete: { alignSelf: 'center' as const },
});
