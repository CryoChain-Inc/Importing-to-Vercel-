import { useEffect, useState } from 'react';
import { Host } from '../ui/host';
import { Btn, Field } from '../ui/kit';
import { commit, type Profile } from './remote';

export function TeamFields() {
  const [roster, setRoster] = useState<Profile[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('ops');
  const [farmerId, setFarmerId] = useState('');
  const [title, setTitle] = useState('Staff');
  const [approver, setApprover] = useState(false);
  const [note, setNote] = useState('');

  const load = () => { void commit({ op: 'roster' }).then(res => { if (res.roster) setRoster(res.roster); if (res.error) setNote(res.error); }); };
  useEffect(load, []);

  const send = async () => {
    setNote('');
    const res = await commit({ op: 'invite', email, displayName, role, farmerId, title, approver });
    if (res.error) setNote(res.error);
    else { setNote(`Invite sent to ${email}. They set a password from the Supabase email.`); setEmail(''); setDisplayName(''); load(); }
  };

  return <>
    <Host tag="div" className="h20">Team access</Host>
    <Host tag="div" className="cap">Staff receive an email to set a password. Link a farmer only after a field agent has registered them. An agent or driver invite creates their handset record.</Host>
    <Field label="Name"><Host tag="input" className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} /></Field>
    <Field label="Email"><Host tag="input" className="input" value={email} onChange={e => setEmail(e.target.value)} /></Field>
    <Field label="Role">
      <Host tag="select" className="input" value={role} onChange={e => setRole(e.target.value)}>
        <Host tag="option" value="ops">Operations</Host>
        <Host tag="option" value="buyer">Buyer</Host>
        <Host tag="option" value="farmer">Farmer</Host>
        <Host tag="option" value="agent">Field agent</Host>
        <Host tag="option" value="driver">Driver</Host>
      </Host>
    </Field>
    {role === 'farmer' ? <Field label="Farmer number, for example F-1001"><Host tag="input" className="input" value={farmerId} onChange={e => setFarmerId(e.target.value)} /></Field> : null}
    {role === 'ops' ? <Field label="Title"><Host tag="input" className="input" value={title} onChange={e => setTitle(e.target.value)} /></Field> : null}
    {role === 'ops' ? <Host tag="button" className={`pill${approver ? ' on' : ''}`} onClick={() => setApprover(v => !v)}>Named payout approver</Host> : null}
    <Btn onClick={() => void send()}>Send invite</Btn>
    {note ? <Host tag="div" className="tint-amber">{note}</Host> : null}
    <Host tag="div" className="h16">People</Host>
    {roster.map(person => <Host tag="div" key={person.id} className="item">
      <Host tag="div" className="row"><Host tag="span" className="h16">{person.display_name || 'Unnamed'}</Host><Host tag="span" className="cap">{person.role}</Host></Host>
      <Host tag="div" className="cap">{person.farmer_id || person.ops_user_id || person.device_id || person.org_id || ''}</Host>
    </Host>)}
  </>;
}
