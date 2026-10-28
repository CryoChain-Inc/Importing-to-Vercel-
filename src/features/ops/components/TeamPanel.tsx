import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { inviteStaff, type StaffRole, type TeamMember } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { EMAIL_MAX, NAME_MAX, formatPhone, isEmail, isPhone } from '../../../utils/format';
import { Empty, SectionTitle, Stat, StatGrid } from './OpsBits';
import { useAction } from './useAction';

const ROLES: StaffRole[] = ['driver', 'ops'];
const LABEL: Record<StaffRole, string> = { driver: 'Drivers', ops: 'Operations' };

/** Roster grouped by role, with an invite form for new staff. */
export function TeamPanel({ team, onChange }: { team: TeamMember[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [role, setRole] = useState<StaffRole>('driver');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const phoneOk = !phone.trim() || isPhone(phone);
  const emailOk = !email.trim() || isEmail(email);
  const valid = name.trim().length >= 2 && name.trim().length <= NAME_MAX && (phone.trim() || email.trim()) && phoneOk && emailOk;

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <StatGrid>
        {ROLES.map((r) => <Stat key={r} label={LABEL[r]} value={String(team.filter((m) => m.role === r).length)} />)}
      </StatGrid>

      <Card style={s.form}>
        <Text style={s.title}>Invite a team member</Text>
        <Text style={s.meta}>Give a phone number, an email, or both. They sign in with a code sent there.</Text>
        <ChoiceChips label="Role" options={ROLES} value={role} onChange={(r) => setRole(r as StaffRole)} />
        <Input label="Name" value={name} onChangeText={setName} maxLength={NAME_MAX} />
        <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="024 123 4567" error={phoneOk ? undefined : 'Enter a valid Ghana number'} />
        <Input label="Email" value={email} onChangeText={setEmail} maxLength={EMAIL_MAX} keyboardType="email-address" autoCapitalize="none" error={emailOk ? undefined : 'Enter a valid email'} />
        {done ? <Banner tone="info" text={done} /> : null}
        <Button label="Send invite" loading={busy} disabled={!valid}
          onPress={() => run(async () => {
            await inviteStaff({ name, phone, email, role });
            setDone(`${name.trim()} invited as ${role}.`);
            setName(''); setPhone(''); setEmail('');
          })} />
      </Card>

      {team.length === 0 ? <Empty icon="users" title="No team yet" hint="Invite a driver or an operations user." /> : null}
      {ROLES.map((r) => {
        const members = team.filter((m) => m.role === r);
        if (!members.length) return null;
        return (
          <View key={r} style={s.group}>
            <SectionTitle title={LABEL[r]} />
            {members.map((m) => (
              <Card key={m.id} style={s.item}>
                <View style={s.avatar}><Text style={s.avatarText}>{m.name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={s.grow}>
                  <Text style={s.name}>{m.name}</Text>
                  <Text style={s.meta}>{[formatPhone(m.phone), m.email].filter(Boolean).join(' · ') || 'No contact saved'}</Text>
                  {m.detail ? <Text style={s.meta}>{m.detail}</Text> : null}
                </View>
                <Badge label={m.role} tone={m.role === 'ops' ? 'info' : 'neutral'} />
              </Card>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  form: { gap: 12 },
  group: { gap: 8 },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14, flexWrap: 'wrap' as const },
  grow: { flex: 1, gap: 2, minWidth: 160 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  avatarText: { fontFamily: fonts.sansBold, fontSize: 16, color: c.brandInk },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
