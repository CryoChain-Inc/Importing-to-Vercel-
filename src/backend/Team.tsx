import { useEffect, useState } from 'react';
import { Host } from '../ui/host';
import { Btn, Field } from '../ui/kit';
import { supabaseUrl } from './config';
import { commit, type Profile } from './remote';

const FIELD_ROLES = [
  { value: 'agent', label: 'Field agent' },
  { value: 'driver', label: 'Driver' },
  { value: 'farmer', label: 'Farmer' },
] as const;

function roleLabel(role: string) {
  return FIELD_ROLES.find((item) => item.value === role)?.label ?? role;
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

  const load = () => {
    void commit({ op: 'roster' }).then((res) => {
      if (res.roster) setRoster(res.roster);
      if (res.error) setNote(res.error);
    });
  };
  useEffect(load, []);

  const send = async () => {
    setNote('');
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : '';
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

  return (
    <>
      <Host tag="div" className="h20">
        Team access
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
        <Host tag="select" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          <Host tag="option" value="ops">
            Operations
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
      <Host tag="div" className="h16">
        Waiting for approval
      </Host>
      {roster.filter((person) => person.role === 'pending').length === 0 ? (
        <Host tag="div" className="cap">
          No one is waiting.
        </Host>
      ) : null}
      {roster
        .filter((person) => person.role === 'pending')
        .map((person) => (
          <PendingApproval
            key={person.id}
            person={person}
            onDone={(message) => {
              setNote(message);
              load();
            }}
          />
        ))}
      <Host tag="div" className="h16">
        People
      </Host>
      {roster
        .filter((person) => person.role !== 'pending')
        .map((person) => (
          <Host tag="div" key={person.id} className="item">
            <Host tag="div" className="row">
              <Host tag="span" className="h16">
                {person.display_name || 'Unnamed'}
              </Host>
              <Host tag="span" className="cap">
                {person.role}
              </Host>
            </Host>
            <Host tag="div" className="cap">
              {person.farmer_id || person.ops_user_id || person.device_id || person.org_id || ''}
            </Host>
          </Host>
        ))}
    </>
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
    <Host tag="div" className="item">
      <Host tag="div" className="row">
        <Host tag="span" className="h16">
          {person.display_name || 'Unnamed'}
        </Host>
        <Host tag="span" className="cap">
          pending
        </Host>
      </Host>
      <Host tag="div" className="cap">
        {person.requested_role
          ? `Requested ${roleLabel(person.requested_role).toLowerCase()}`
          : 'No role requested yet. Choose one and approve.'}
      </Host>
      <Field label="Role">
        <Host tag="select" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          {FIELD_ROLES.map((option) => (
            <Host key={option.value} tag="option" value={option.value}>
              {option.label}
            </Host>
          ))}
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
      <Btn kind="secondary" md disabled={busy} onClick={() => void approve()}>
        {busy ? 'Approving…' : 'Approve'}
      </Btn>
    </Host>
  );
}
