import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { inviteStaff, type StaffRole, type TeamMember } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, isEmail, isPhone } from '../../../utils/format';
import { useAction } from './useAction';

const ROLES: StaffRole[] = ['agent', 'driver', 'ops'];

export function TeamPanel({ team, onChange }: { team: TeamMember[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [role, setRole] = useState<StaffRole>('agent');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const phoneOk = !phone.trim() || isPhone(phone);
  const emailOk = !email.trim() || isEmail(email);
  const valid = name.trim().length >= 2 && (phone.trim() || email.trim()) && phoneOk && emailOk;

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>Invite team member</Text>
        <Text style={s.meta}>Provide a phone number, an email, or both. They sign in with a code sent there.</Text>
        <ChoiceChips label="Role" options={ROLES} value={role} onChange={(r) => setRole(r as StaffRole)} />
        <Input label="Name" value={name} onChangeText={setName} />
        <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="024 123 4567" error={phoneOk ? undefined : 'Enter a valid Ghana number'} />
        <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={emailOk ? undefined : 'Enter a valid email'} />
        {done ? <Text style={s.meta}>{done}</Text> : null}
        <Button label="Invite" loading={busy} disabled={!valid}
          onPress={() => run(async () => {
            await inviteStaff({ name, phone, email, role });
            setDone(`${name.trim()} invited as ${role}.`);
            setName(''); setPhone(''); setEmail('');
          })} />
      </Card>

      <Text style={s.meta}>{team.length} team member{team.length === 1 ? '' : 's'}</Text>
      {team.map((m) => (
        <Card key={m.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{m.name}</Text>
            <Badge label={m.role} tone={m.role === 'ops' ? 'info' : 'neutral'} />
          </View>
          <Text style={s.meta}>{[formatPhone(m.phone), m.email].filter(Boolean).join(' · ')}</Text>
          {m.detail ? <Text style={s.meta}>{m.detail}</Text> : null}
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  item: { gap: 4 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
