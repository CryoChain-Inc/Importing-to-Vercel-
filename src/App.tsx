import { Link, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './domain/store';
import { DemoBar } from './layouts/shells';
import { Logo } from './ui/kit';
import BuyerApp from './roles/buyer/Buyer';
import FarmerApp from './roles/farmer/Farmer';
import AgentApp from './roles/agent/Agent';
import DriverApp from './roles/driver/Driver';
import OpsApp from './roles/ops/Ops';

const ROLES = [
  { to: '/buyer', name: 'Buyer', sub: 'Order by category, approve, pay in full, accept on delivery', who: 'Hotels, grocery chains, mining camps, caterers, exporters' },
  { to: '/farmer', name: 'Farmer', sub: 'Your pickups, your prices, your payments', who: 'Feature phone by SMS, browser for those with a smartphone' },
  { to: '/agent', name: 'Field agent', sub: 'Weigh, grade, photograph, into cold box. No signal needed', who: 'Company handset, native app' },
  { to: '/driver', name: 'Driver', sub: 'Stops, temperature checkpoints, delivery signature', who: 'Company handset, native app' },
  { to: '/ops', name: 'Operations', sub: 'Order book, allocation, runs, settlements, payout runs, exceptions', who: 'Node manager and approvers, desktop' },
];
const LOOP = ['Order and pay', 'Allocate', 'Weigh and grade', 'Collect cold', 'Deliver', 'Pay farmers'];
function Landing() {
  return <div style={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', background: 'var(--paper)' }} className="landing">
    <style>{`@media (max-width:900px){.landing{grid-template-columns:1fr !important}.landing .dark{min-height:auto}}`}</style>
    <div className="dark" style={{ background: 'var(--ink)', color: '#fff', padding: '48px 44px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Logo h={26} style={{ filter: 'brightness(0) invert(1)', alignSelf: 'flex-start' }} />
      <div className="hero" style={{ fontSize: 40, maxWidth: 520, marginTop: 24 }}>Cold from the farm gate to your door.</div>
      <div style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--steel)', maxWidth: 520 }}>One operational system for buyers, farmers, field agents, drivers and operations. Buyers pay before collection. Farmers are paid within 24 hours of delivery. Everything the field captures works with no signal.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 520 }}>{LOOP.map((s, i) => <div key={s} style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, fontSize: 13 }}><div style={{ fontSize: 11, color: 'var(--steel)' }}>0{i + 1}</div><div style={{ fontWeight: 600 }}>{s}</div></div>)}</div>
      <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--steel)' }}>Version one prototype · Nsawam node · demo data resets from the bar below</div>
    </div>
    <div style={{ padding: '48px 44px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div className="lbl">Choose a role to explore</div>
      <div className="h24">Every role, one account, one backend.</div>
      <div className="muted" style={{ marginBottom: 8 }}>Demo accounts are already signed in. The bar at the bottom left switches role and the person you are acting as.</div>
      {ROLES.map(r => <Link key={r.to} to={r.to} className="item" style={{ padding: 16, gap: 4 }}><div className="row"><span className="h16">{r.name}</span><span style={{ color: 'var(--blue)', fontWeight: 600 }}>Open →</span></div><div style={{ fontSize: 14 }}>{r.sub}</div><div className="cap">{r.who}</div></Link>)}
      <div className="card card-pad" style={{ fontSize: 13, lineHeight: 1.5 }}><strong>Five flows to walk.</strong> A buyer places and pays an order. Ops allocates it across seven farmers and builds the run. The agent captures with no signal, one comes in short, ops re-cuts. The driver runs the stops with checkpoints and delivers with one rejected line. Ops raises a payout run above the threshold, two approvers approve, one transfer fails into Exceptions, the rest pay and the farmer gets the SMS.</div>
    </div>
  </div>;
}
export default function App() {
  return <StoreProvider><Routes><Route path="/" element={<Landing />} /><Route path="/buyer/*" element={<BuyerApp />} /><Route path="/farmer/*" element={<FarmerApp />} /><Route path="/agent/*" element={<AgentApp />} /><Route path="/driver/*" element={<DriverApp />} /><Route path="/ops/*" element={<OpsApp />} /></Routes><DemoBar /></StoreProvider>;
}
