import React from 'react';
import { Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import { Dialog } from '../../../components/feedback';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** "Sign out?" confirmation shared by the buyer and farmer account screens; mount it only while open. */
export function SignOutDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <Dialog
      title="Sign out?"
      onClose={onClose}
      footer={
        <View style={s.row}>
          <Button label="Stay signed in" variant="outline" style={s.btn} onPress={onClose} />
          <Button
            label="Sign out"
            variant="danger"
            style={s.btn}
            onPress={() => {
              onClose();
              onConfirm();
            }}
          />
        </View>
      }
    >
      <View style={s.body}>
        <View style={s.badge}>
          <Icon name="logOut" size={28} color="#c93636" />
        </View>
        <Text style={s.text}>
          You'll need to verify your phone number again to get back into your account.
        </Text>
      </View>
    </Dialog>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  body: { alignItems: 'center' as const, gap: 14 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.dangerTint,
  },
  text: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center' as const,
    color: c.inkMuted,
  },
  row: { flexDirection: 'row' as const, gap: 10 },
  btn: { flex: 1 },
});
