import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone } from '../../../utils/format';
import { ChangeContact } from './ChangeContact';
import { PhoneChange } from './PhoneChange';

/** Sign-in contacts for any role: add or change the phone (SMS code) and the email (confirmation link). */
export function SignInCard({ phone, email, onRefresh }: { phone: string; email: string; onRefresh: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [editing, setEditing] = useState<'email' | 'phone' | null>(null);
  const done = async () => {
    setEditing(null);
    await onRefresh();
  };

  return (
    <Card style={s.card}>
      <Text style={s.title}>Sign-in</Text>
      <Text style={s.hint}>Your phone number is what you sign in with.</Text>
      <View style={s.contact}>
        <View style={s.icon}><Icon name="phone" size={18} color={colors.brandInk} /></View>
        <View style={s.text}>
          <Text style={s.value} numberOfLines={1}>{phone ? formatPhone(phone) : 'No phone number'}</Text>
          {phone ? <View style={s.badge}><Badge label="Verified" tone="success" /></View> : null}
        </View>
        {editing === 'phone' ? null : <Button label={phone ? 'Change' : 'Add'} variant="ghost" size="sm" onPress={() => setEditing('phone')} />}
      </View>
      {editing === 'phone' ? <PhoneChange current={phone} onDone={done} onCancel={() => setEditing(null)} /> : null}
      <View style={s.contact}>
        <View style={s.icon}><Icon name="mail" size={18} color={colors.brandInk} /></View>
        <View style={s.text}>
          <Text style={s.value} numberOfLines={1} ellipsizeMode="middle">{email || 'No email yet'}</Text>
          {email ? <View style={s.badge}><Badge label="Verified" tone="success" /></View> : null}
        </View>
        {editing === 'email' ? null : <Button label={email ? 'Change' : 'Add'} variant="ghost" size="sm" onPress={() => setEditing('email')} />}
      </View>
      {editing === 'email' ? <ChangeContact current={email} onDone={done} onCancel={() => setEditing(null)} /> : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  contact: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  icon: { flexShrink: 0, width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  text: { flex: 1, minWidth: 0, gap: 4 },
  badge: { alignSelf: 'flex-start' as const },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
});
