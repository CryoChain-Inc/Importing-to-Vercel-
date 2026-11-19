import React, { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Badge, Button, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  inviteStaff,
  updateStaff,
  type StaffRole,
  type TeamMember,
} from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { EMAIL_MAX, NAME_MAX, formatPhone, isEmail, isPhone } from '../../../utils/format';
import { Empty, RevealCard, Segmented, Stat, StatGrid } from './OpsBits';
import { Sheet } from './Sheet';
import { useAction } from './useAction';

const ROLES: StaffRole[] = ['driver', 'ops'];
const ROLE_NAME: Record<StaffRole, string> = { driver: 'Driver', ops: 'Operations' };
type Filter = 'all' | StaffRole;

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

function Avatar({ m, size = 44 }: { m: TeamMember; size?: number }) {
  const s = useThemedStyles(styles);
  const box = { width: size, height: size, borderRadius: size * 0.3 };
  return m.photoUrl ? (
    <Image source={{ uri: m.photoUrl }} style={box} accessibilityLabel={`${m.name}'s photo`} />
  ) : (
    <View style={[s.avatar, box]}>
      <Text style={[s.avatarText, { fontSize: size * 0.36 }]}>{initials(m.name)}</Text>
    </View>
  );
}

/** Team roster: search, filter by role, open a person for full details and edits, invite from a sheet. */
export function TeamPanel({
  team,
  onChange,
}: {
  team: TeamMember[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const count = (r: StaffRole) => team.filter((m) => m.role === r).length;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return team.filter(
      (m) =>
        (filter === 'all' || m.role === filter) &&
        (!t ||
          [m.name, m.phone, m.email, m.plate, m.truck].some((v) => v.toLowerCase().includes(t))),
    );
  }, [team, filter, q]);
  const open = team.find((m) => m.id === openId) ?? null;

  return (
    <View style={s.list}>
      <View style={s.top}>
        <View style={s.topText}>
          <Text style={s.title}>Your team</Text>
          <Text style={s.meta}>Drivers on the road and the people running operations.</Text>
        </View>
        <Button size="sm" icon="users" label="Invite" onPress={() => setInviting(true)} />
      </View>
      {notice ? <Banner tone="info" text={notice} /> : null}
      <StatGrid>
        <Stat label="Drivers" value={String(count('driver'))} />
        <Stat label="Operations" value={String(count('ops'))} />
      </StatGrid>

      {team.length === 0 ? (
        <Empty
          icon="users"
          title="No team yet"
          hint="Invite a driver or an operations user. They sign in with a code sent to their phone or email."
        />
      ) : (
        <>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'all', label: 'Everyone', count: team.length },
              { key: 'driver', label: 'Drivers', count: count('driver') },
              { key: 'ops', label: 'Operations', count: count('ops') },
            ]}
          />
          <Input
            label="Search team"
            value={q}
            onChangeText={setQ}
            placeholder="Name, phone, email or plate"
          />
          {rows.length === 0 ? <Text style={s.meta}>No one matches “{q.trim()}”.</Text> : null}
          {rows.map((m) => (
            <RevealCard key={m.id} style={s.item}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${m.name}`}
                onPress={() => setOpenId(m.id)}
                style={({ pressed }) => [s.row, pressed && s.pressed]}
              >
                <Avatar m={m} />
                <View style={s.grow}>
                  <Text style={s.name} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text style={s.meta} numberOfLines={1}>
                    {formatPhone(m.phone) || m.email || 'No contact saved'}
                  </Text>
                  {m.role === 'driver' ? (
                    <Text style={s.meta} numberOfLines={1}>
                      {m.detail || 'No truck assigned'}
                    </Text>
                  ) : null}
                </View>
                <Badge label={ROLE_NAME[m.role]} tone={m.role === 'ops' ? 'info' : 'neutral'} />
                <Icon name="chevronRight" size={18} color={colors.inkMuted} />
              </Pressable>
            </RevealCard>
          ))}
        </>
      )}

      {open ? (
        <MemberSheet key={open.id} m={open} onClose={() => setOpenId(null)} onChange={onChange} />
      ) : null}
      {inviting ? (
        <InviteSheet
          onClose={() => setInviting(false)}
          onChange={onChange}
          onDone={(msg) => {
            setInviting(false);
            setNotice(msg);
          }}
        />
      ) : null}
    </View>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.detail}>
      <Text style={s.meta}>{k}</Text>
      <Text style={s.value}>{v || '—'}</Text>
    </View>
  );
}

function MemberSheet({
  m,
  onClose,
  onChange,
}: {
  m: TeamMember;
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  const [licence, setLicence] = useState(m.licence);
  const driver = m.role === 'driver';
  const valid = name.trim().length >= 2 && name.trim().length <= NAME_MAX;

  const save = () =>
    run(async () => {
      await updateStaff(m.id, { name, licence });
      setEditing(false);
    });

  return (
    <Sheet
      title={editing ? `Edit ${m.name}` : m.name}
      subtitle={ROLE_NAME[m.role]}
      onClose={onClose}
      footer={
        editing ? (
          <>
            <Button
              variant="ghost"
              label="Cancel"
              disabled={busy}
              onPress={() => {
                setEditing(false);
                setName(m.name);
                setLicence(m.licence);
              }}
            />
            <Button label="Save changes" loading={busy} disabled={!valid} onPress={save} />
          </>
        ) : (
          <Button icon="edit" label="Edit details" onPress={() => setEditing(true)} />
        )
      }
    >
      {error ? <Banner text={error} /> : null}
      {editing ? (
        <>
          <Input label="Name" value={name} onChangeText={setName} maxLength={NAME_MAX} />
          {driver ? (
            <>
              <Input
                label="Licence number"
                value={licence}
                onChangeText={setLicence}
                maxLength={40}
                autoCapitalize="characters"
              />
            </>
          ) : null}
          <Text style={s.meta}>
            Phone and email are how this person signs in, so they can’t be changed here. Vehicle and plate come from the assigned truck in Fleet.
          </Text>
        </>
      ) : (
        <>
          <View style={s.hero}>
            <Avatar m={m} size={72} />
            <View style={s.grow}>
              <Text style={s.name}>{m.name}</Text>
              <Text style={s.meta}>
                Joined {new Date(m.joinedAt).toLocaleDateString('en-GH', { dateStyle: 'medium' })}
              </Text>
            </View>
          </View>
          <Detail k="Phone" v={formatPhone(m.phone)} />
          <Detail k="Email" v={m.email} />
          {driver ? (
            <>
              <Detail k="Licence number" v={m.licence} />
              <Detail k="Assigned truck" v={m.truck} />
              <Detail k="Plate number" v={m.plate} />
              <Detail k="Capacity" v={m.capacityKg ? `${m.capacityKg} kg` : ''} />
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

function InviteSheet({
  onClose,
  onChange,
  onDone,
}: {
  onClose: () => void;
  onChange: () => Promise<void>;
  onDone: (msg: string) => void;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [role, setRole] = useState<StaffRole>('driver');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const phoneOk = !phone.trim() || isPhone(phone);
  const emailOk = !email.trim() || isEmail(email);
  const valid =
    name.trim().length >= 2 &&
    name.trim().length <= NAME_MAX &&
    !!(phone.trim() || email.trim()) &&
    phoneOk &&
    emailOk;

  return (
    <Sheet
      title="Invite a team member"
      subtitle="They sign in with a code sent to their phone or email."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" label="Cancel" disabled={busy} onPress={onClose} />
          <Button
            label="Send invite"
            loading={busy}
            disabled={!valid}
            onPress={() =>
              run(async () => {
                await inviteStaff({ name, phone, email, role });
                onDone(`${name.trim()} invited as ${ROLE_NAME[role].toLowerCase()}.`);
              })
            }
          />
        </>
      }
    >
      {error ? <Banner text={error} /> : null}
      <ChoiceChips
        label="Role"
        options={ROLES}
        value={role}
        onChange={(r) => setRole(r as StaffRole)}
      />
      <Input label="Name" value={name} onChangeText={setName} maxLength={NAME_MAX} />
      <Input
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="024 123 4567"
        error={phoneOk ? undefined : 'Enter a valid Ghana number'}
      />
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        maxLength={EMAIL_MAX}
        keyboardType="email-address"
        autoCapitalize="none"
        error={emailOk ? undefined : 'Enter a valid email'}
      />
      <Text style={s.meta}>Give a phone number, an email, or both.</Text>
    </Sheet>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  topText: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.heading, fontSize: 22, letterSpacing: -0.3, color: c.ink },
  item: { padding: 0, overflow: 'hidden' as const },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 14,
    minHeight: 72,
  },
  pressed: { backgroundColor: c.surfaceSunken },
  grow: { flex: 1, gap: 2, minWidth: 0 },
  avatar: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  avatarText: { fontFamily: fonts.sansBold, color: c.brandInk },
  hero: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  detail: {
    gap: 2,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
