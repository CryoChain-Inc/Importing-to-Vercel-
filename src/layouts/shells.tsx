import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../domain/store';
import { Logo } from '../ui/kit';

export const Phone = ({ children }: { children: ReactNode }) => <div className="phone">{children}</div>;
export function Desk({ nav, footer, children }: { nav: { to: string; label: string; end?: boolean; group?: string }[]; footer?: ReactNode; children: ReactNode }) {
  let lastGroup = '';
  return <div className="desk"><nav><Logo h={24} style={{ margin: '0 8px 24px', alignSelf: 'flex-start' }} />{nav.map(n => { const g = n.group && n.group !== lastGroup ? <div className="grp" key={'g' + n.group}>{n.group}</div> : null; lastGroup = n.group ?? lastGroup; return [g, <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>{n.label}</NavLink>]; })}{footer && <div style={{ marginTop: 'auto', padding: 12, fontSize: 12, color: 'var(--steel-ink)', lineHeight: 1.5 }}>{footer}</div>}</nav><main>{children}</main></div>;
}
export function DemoBar() {
  const { state, act } = useStore(); const loc = useLocation(); const nav = useNavigate();
  const role = loc.pathname.split('/')[1] || 'home';
  const actor = role === 'buyer' ? <select value={state.session.buyerUserId} onChange={e => act.setBuyerUser(e.target.value)} title="Acting as">{state.buyerUsers.filter(u => u.status !== 'deactivated').map(u => <option key={u.id} value={u.id}>{u.name} · {u.roles.join('/')}{u.orgId !== 'O1' ? ' · ' + state.orgs.find(o => o.id === u.orgId)?.name : ''}</option>)}</select>
    : role === 'ops' ? <select value={state.session.opsUserId} onChange={e => act.setOpsUser(e.target.value)} title="Acting as">{state.opsUsers.map(u => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}</select>
    : role === 'farmer' ? <select value={state.session.farmerId} onChange={e => act.setFarmer(e.target.value)} title="Farmer">{state.farmers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select> : null;
  return <div className="demo-bar"><span>Demo</span><select value={role} onChange={e => nav(e.target.value === 'home' ? '/' : `/${e.target.value}`)}><option value="home">Choose role</option><option value="buyer">Buyer</option><option value="farmer">Farmer</option><option value="agent">Field agent</option><option value="driver">Driver</option><option value="ops">Operations</option></select>{actor}<a href="#reset" onClick={e => { e.preventDefault(); if (confirm('Reset all demo data to the seed?')) { act.reset(); nav('/'); } }}>Reset</a></div>;
}
