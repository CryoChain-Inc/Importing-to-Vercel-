import { Children, useEffect, useState, type ReactNode } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { Host } from '../ui/host';
import { Btn, Chip, Field } from '../ui/kit';
import { colors } from '../ui/theme';
import { supabaseUrl } from './config';
import { commit, type Profile } from './remote';

const FIELD_ROLES = [
  { value: 'agent', label: 'Field agent' },
  { value: 'driver', label: 'Driver' },
  { value: 'farmer', label: 'Farmer' },
] as const;

const ROLE_LABEL: Record<string, string> = {
  ops: 'Node manager',
  buyer: 'Buyer',
  farmer: 'Farmer',
  agent: 'Field agent',
  driver: 'Driver',
  pending: 'Pending',
};

function roleLabel(role: string) {
  return ROLE_LABEL[role] ?? role;
}

function roleTone(role: string): 'neutral' | 'info' | 'ok' | 'warn' {
  if (role === 'pending') return 'warn';
  if (role === 'ops' || role === 'agent' || role === 'driver') return 'info';
  if (role === 'farmer') return 'ok';
  return 'neutral';
}

function linkedRecord(person: Profile) {
  const bits = [
    person.ops_user_id ? `Node manager ${person.ops_user_id}` : '',
    person.org_id ? `Organisation ${person.org_id}` : '',
    person.farmer_id ? `Farmer ${person.farmer_id}` : '',
    person.device_id ? `Handset ${person.device_id}` : '',
    person.phone ?? '',
  ].filter(Boolean);
  return bits.join(' · ') || 'Not linked yet';
}

export function TeamFields() {
  const [roster, setRoster] = useState<Profile[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('ops');
  const [farmerId, setFarmerId] = useState('');
  const [title, setTitle] = useState('Staff');
  const [approver, setApprover] = useState(false);
  const [note, setNote] = useState('');
  const { width } = useWindowDimensions();

  const load = () => {
    void commit({ op: 'roster' }).then((res) => {
      if (res.roster) setRoster(res.roster);
      if (res.error) setNote(res.error);
    });
  };
  useEffect(load, []);

  const send = async () => {
    setNote('');
    const redirectTo =
      Platform.OS === 'web' && typeof window !== 'undefined' && window.location
        ? window.location.origin
        : '';
    const res = await commit({
      op: 'invite',
      email,
      displayName,
      role,
      farmerId,
      title,
      approver,
      redirectTo,
    });
    if (res.error) setNote(res.error);
    else {
      const local = /localhost|127\.0\.0\.1/.test(supabaseUrl);
      setNote(
        local
          ? `Invite sent to ${email}. Open Mailpit at http://127.0.0.1:54324, follow the link, and choose a password. Or, on the sign-in screen, create an account with this same email — that password is saved on the invite.`
          : `Invite sent to ${email}. The email link opens a page where they choose a password for this account.`,
      );
      setEmail('');
      setDisplayName('');
      load();
    }
  };

  const pending = roster.filter((person) => person.role === 'pending');
  const people = roster.filter((person) => person.role !== 'pending');
  const wide = width >= 1100;

  return (
    <View
      style={{
        width: '100%',
        flexDirection: wide ? 'row' : 'column',
        alignItems: 'flex-start',
        gap: 16,
      }}
    >
      <Host
        tag="div"
        className="card"
        style={{
          width: wide ? 400 : '100%',
          flexShrink: 0,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <Host tag="div" className="h16">
          Invite
        </Host>
        <Host tag="div" className="cap">
          People who already created an account choose field agent, driver, or farmer and wait here.
          Approve that request below. Send invite is only for someone who does not have a login yet.
          Link a farmer only after a field agent has registered them.
        </Host>
        <Field label="Name">
          <Host
            tag="input"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <Host
            tag="input"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <Host
            tag="select"
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <Host tag="option" value="ops">
              Node manager
            </Host>
            <Host tag="option" value="buyer">
              Buyer
            </Host>
            <Host tag="option" value="farmer">
              Farmer
            </Host>
            <Host tag="option" value="agent">
              Field agent
            </Host>
            <Host tag="option" value="driver">
              Driver
            </Host>
          </Host>
        </Field>
        {role === 'farmer' ? (
          <Field label="Farmer number, for example FM-0101">
            <Host
              tag="input"
              className="input"
              value={farmerId}
              onChange={(e) => setFarmerId(e.target.value)}
            />
          </Field>
        ) : null}
        {role === 'ops' ? (
          <Field label="Title">
            <Host
              tag="input"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        ) : null}
        {role === 'ops' ? (
          <Host
            tag="button"
            className={`pill${approver ? ' on' : ''}`}
            onClick={() => setApprover((v) => !v)}
          >
            Named payout approver
          </Host>
        ) : null}
        <Btn onClick={() => void send()}>Send invite</Btn>
        {note ? (
          <Host tag="div" className="tint-amber">
            {note}
          </Host>
        ) : null}
      </Host>
      <View
        style={{
          flexGrow: wide ? 1 : 0,
          flexShrink: 1,
          flexBasis: wide ? 0 : 'auto',
          width: wide ? undefined : '100%',
          minWidth: 0,
          alignSelf: 'stretch',
          gap: 16,
        }}
      >
        <Roster
          title="Waiting for approval"
          count={pending.length}
          head={['Name', 'Asked for', 'Approve as', 'Action']}
          cols={[NAME, ASKED, ASSIGN, ACTION]}
          empty="No one is waiting. People who choose a role on Waiting for access show up here."
        >
          {pending.map((person) => (
            <PendingApproval
              key={person.id}
              person={person}
              onDone={(message) => {
                setNote(message);
                load();
              }}
            />
          ))}
        </Roster>
        <Roster
          title="People"
          count={people.length}
          head={['Name', 'Role', 'Linked record']}
          cols={[NAME, ROLE, LINKED]}
          empty="No one has access yet. Send an invite, or approve someone who is waiting."
        >
          {people.map((person) => (
            <Host tag="tr" key={person.id}>
              <Host tag="td" style={NAME}>
                <Host tag="div" style={{ fontWeight: 600 }}>
                  {person.display_name || 'Unnamed'}
                </Host>
              </Host>
              <Host tag="td" style={ROLE}>
                <Host tag="div">
                  <Chip tone={roleTone(person.role)}>{roleLabel(person.role)}</Chip>
                </Host>
              </Host>
              <Host tag="td" style={LINKED}>
                {linkedRecord(person)}
              </Host>
            </Host>
          ))}
        </Roster>
      </View>
    </View>
  );
}

const NAME = { flex: 1.5, minWidth: 140 };
const ASKED = { flex: 1.15, minWidth: 120 };
const ASSIGN = { flex: 1.45, minWidth: 180 };
const ACTION = { flex: 0.7, minWidth: 108 };
const ROLE = { flex: 0.9, minWidth: 120 };
const LINKED = { flex: 1.8, minWidth: 180 };

function Roster({
  title,
  count,
  head,
  cols,
  empty,
  children,
}: {
  title: string;
  count: number;
  head: string[];
  cols: { flex: number; minWidth: number }[];
  empty: string;
  children: ReactNode;
}) {
  const filled = Children.toArray(children).length > 0;
  return (
    <Host tag="div" className="tbl">
      <Host
        tag="div"
        className="row"
        style={{
          width: '100%',
          paddingHorizontal: 14,
          paddingVertical: 12,
          justifyContent: 'space-between',
          borderBottomWidth: filled ? 1 : 0,
          borderBottomColor: colors.line,
        }}
      >
        <Host tag="span" className="h16">
          {title}
        </Host>
        <Host tag="span" className="cap">
          {count}
        </Host>
      </Host>
      {filled ? (
        <Host tag="table">
          <Host tag="thead">
            <Host tag="tr" className="head">
              {head.map((label, i) => (
                <Host tag="th" key={label || i} style={cols[i]}>
                  {label}
                </Host>
              ))}
            </Host>
          </Host>
          <Host tag="tbody">{children}</Host>
        </Host>
      ) : (
        <Host tag="div" className="cap" style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {empty}
        </Host>
      )}
    </Host>
  );
}

function PendingApproval({
  person,
  onDone,
}: {
  person: Profile;
  onDone: (message: string) => void;
}) {
  const requested = FIELD_ROLES.some((item) => item.value === person.requested_role)
    ? person.requested_role!
    : 'agent';
  const [role, setRole] = useState<string>(requested);
  const [farmerId, setFarmerId] = useState('');
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    const res = await commit({
      op: 'approve',
      userId: person.id,
      role,
      farmerId,
      displayName: person.display_name,
    });
    setBusy(false);
    if (res.error) onDone(res.error);
    else
      onDone(
        `${person.display_name || 'This login'} is now a ${roleLabel(role).toLowerCase()}. They press Check again on Waiting for access.`,
      );
  };

  return (
    <Host tag="tr">
      <Host tag="td" style={NAME}>
        <Host tag="div" style={{ fontWeight: 600 }}>
          {person.display_name || 'Unnamed'}
        </Host>
        <Host tag="div" className="cap">
          Waiting
        </Host>
      </Host>
      <Host tag="td" style={ASKED}>
        {person.requested_role ? (
          <Host tag="div">
            <Chip tone="warn">{roleLabel(person.requested_role)}</Chip>
          </Host>
        ) : (
          <Host tag="span" className="cap">
            No role chosen yet
          </Host>
        )}
      </Host>
      <Host tag="td" style={ASSIGN}>
        <Host tag="div" style={{ gap: 8, width: '100%' }}>
          <Host
            tag="select"
            className="input"
            style={{ width: '100%', minHeight: 36 }}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {FIELD_ROLES.map((option) => (
              <Host key={option.value} tag="option" value={option.value}>
                {option.label}
              </Host>
            ))}
          </Host>
          {role === 'farmer' ? (
            <Host
              tag="input"
              className="input"
              style={{ width: '100%', minHeight: 36 }}
              value={farmerId}
              placeholder="Farmer number, FM-0101"
              onChange={(e) => setFarmerId(e.target.value)}
            />
          ) : null}
        </Host>
      </Host>
      <Host tag="td" style={ACTION}>
        <Btn kind="secondary" md disabled={busy} onClick={() => void approve()}>
          {busy ? 'Approving…' : 'Approve'}
        </Btn>
      </Host>
    </Host>
  );
}
