import { Host } from '../../ui/host';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from '../../domain/store';
import {
  CONS_LABEL,
  CONS_TONE,
  SETT_LABEL,
  SETT_TONE,
  fmtDay,
  fmtStamp,
  ghs,
  maskMomo,
  round2,
} from '../../domain/logic';
import { BottomNav, Chip, Empty, KV, Logo, Money, TopBar } from '../../ui/kit';
import { Phone } from '../../layouts/shells';
const NAV = [
  {
    to: '/farmer',
    label: 'Home',
    end: true,
  },
  {
    to: '/farmer/pickups',
    label: 'Pickups',
  },
  {
    to: '/farmer/payments',
    label: 'Payments',
  },
  {
    to: '/farmer/messages',
    label: 'Messages',
  },
];
function useFarmer() {
  const { state, now } = useStore();
  const f = state.farmers.find((x) => x.id === state.session.farmerId)!;
  const cons = state.consignments
    .filter((c) => c.farmerId === f.id)
    .sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0));
  const sett = state.settlements.filter((s) => s.farmerId === f.id);
  const sms = state.sms.filter((m) => m.farmerId === f.id);
  return {
    state,
    now,
    f,
    cons,
    sett,
    sms,
  };
}
function Home() {
  const { state, f, cons, sett } = useFarmer();
  const upcoming = cons.filter((c) => c.status === 'planned');
  const paid = sett.filter((s) => s.status === 'paid').reduce((a, s) => a + s.net, 0);
  const owed = sett
    .filter((s) => ['payable', 'in_run', 'pending_delivery', 'failed', 'held'].includes(s.status))
    .reduce((a, s) => a + s.net, 0);
  return (
    <Phone>
      <Host
        tag="div"
        className="row"
        style={{
          padding: '14px 16px',
          background: '#fff',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <Logo h={22} />
        <Host tag="span" className="cap">
          {f.code}
        </Host>
      </Host>
      <Host
        tag="div"
        className="body"
        style={{
          gap: 16,
          fontSize: 16,
        }}
      >
        <Host tag="div">
          <Host
            tag="div"
            className="hero"
            style={{
              fontSize: 26,
            }}
          >
            Hello, {f.name.split(' ')[0]}.
          </Host>
          <Host tag="div" className="muted">
            Your pickups, your prices, your payments.
          </Host>
        </Host>
        <Host tag="div" className="card card-pad col gap8">
          <KV k="Owed to you" v={<Money v={round2(owed)} />} />
          <KV k="Paid so far" v={<Money v={round2(paid)} color="var(--green)" />} />
          <KV
            k="Paid to"
            v={
              <Host tag="span" className="tabular">
                {f.network} {maskMomo(f.momo)}
              </Host>
            }
          />
        </Host>
        <Host tag="div" className="lbl">
          Next pickup
        </Host>
        {upcoming.length === 0 ? (
          <Host tag="div" className="card card-pad muted">
            No pickup booked yet. You will get an SMS when a truck is coming.
          </Host>
        ) : (
          upcoming.slice(0, 2).map((c) => {
            const o = state.orders.find((x) => x.id === c.orderId);
            const run = state.runs.find((r) => r.id === c.runId);
            const stop = run?.stops.find((s) => s.seq === c.stopSeq);
            return (
              <Host tag="div" key={c.id} className="card card-pad col gap6">
                <Host tag="div" className="row">
                  <Host tag="span" className="h16">
                    {c.productName}
                  </Host>
                  <Chip tone="info">{o ? fmtDay(o.deliveryDate) : ''}</Chip>
                </Host>
                <Host tag="div" className="row">
                  <Host tag="span" className="muted">
                    {c.plannedKg} kg planned
                  </Host>
                  <Host
                    tag="span"
                    style={{
                      fontWeight: 600,
                    }}
                    className="tabular"
                  >
                    {c.pricePerKg.toFixed(2)} / kg
                  </Host>
                </Host>
                {stop && (
                  <Host tag="div" className="cap">
                    Truck window {stop.window}
                  </Host>
                )}
              </Host>
            );
          })
        )}
        <Host tag="div" className="lbl">
          Last collected
        </Host>
        {cons
          .filter((c) => c.farmGateKg)
          .slice(0, 3)
          .map((c) => (
            <Host tag="div" key={c.id} className="card card-pad row">
              <Host tag="div">
                <Host tag="div" className="h16">
                  {c.productName} · {c.farmGateKg} kg · grade {c.grade}
                </Host>
                <Host tag="div" className="cap">
                  {c.capturedAt ? fmtStamp(c.capturedAt) : ''}
                </Host>
              </Host>
              <Money v={round2((c.farmGateKg ?? 0) * c.pricePerKg)} />
            </Host>
          ))}
      </Host>
      <BottomNav items={NAV} />
    </Phone>
  );
}
function Pickups() {
  const { state, cons } = useFarmer();
  return (
    <Phone>
      <TopBar title="Pickups" />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
        }}
      >
        {cons.length === 0 && <Empty title="Nothing yet." sub="Your consignments appear here." />}
        {cons.map((c) => {
          const o = state.orders.find((x) => x.id === c.orderId);
          return (
            <Host tag="div" key={c.id} className="item">
              <Host tag="div" className="row">
                <Host tag="span" className="h16">
                  {c.productName}
                </Host>
                <Chip tone={CONS_TONE[c.status]} field>
                  {CONS_LABEL[c.status]}
                </Chip>
              </Host>
              <Host tag="div" className="row muted">
                <Host tag="span">
                  {c.farmGateKg
                    ? `${c.farmGateKg} kg · grade ${c.grade}`
                    : `${c.plannedKg} kg planned`}
                </Host>
                <Host tag="span" className="tabular">
                  {c.pricePerKg.toFixed(2)} / kg
                </Host>
              </Host>
              {c.farmGateKg ? (
                <Host tag="div" className="row">
                  <Host tag="span" className="cap">
                    {c.coldBoxAt ? `Into cold box ${fmtStamp(c.coldBoxAt)}` : ''}
                  </Host>
                  <Money v={round2(c.farmGateKg * c.pricePerKg)} />
                </Host>
              ) : (
                <Host tag="div" className="cap">
                  Truck on {o ? fmtDay(o.deliveryDate) : ''}
                </Host>
              )}
            </Host>
          );
        })}
      </Host>
      <BottomNav items={NAV} />
    </Phone>
  );
}
function Payments() {
  const { state, sett, now } = useFarmer();
  return (
    <Phone>
      <TopBar title="Payments" />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
        }}
      >
        {sett.length === 0 && (
          <Empty title="No payments yet." sub="You are paid within 24 hours of delivery." />
        )}
        {sett.map((s) => {
          const c = state.consignments.find((x) => x.id === s.consignmentId);
          const t = state.transfers.filter((x) => x.settlementId === s.id).pop();
          return (
            <Host tag="div" key={s.id} className="item">
              <Host tag="div" className="row">
                <Host tag="span" className="h16">
                  {c?.productName} · {s.payableKg} kg
                </Host>
                <Chip tone={SETT_TONE[s.status]} field>
                  {SETT_LABEL[s.status]}
                </Chip>
              </Host>
              <Host tag="div" className="row">
                <Host tag="span" className="muted">
                  {s.payableKg} kg × {s.pricePerKg.toFixed(2)}
                </Host>
                <Money v={s.net} />
              </Host>
              <Host tag="div" className="cap">
                {s.status === 'paid' && t
                  ? `Sent ${t.at ? fmtStamp(t.at) : ''} · ref ${t.providerRef}`
                  : s.status === 'failed'
                    ? 'Payment delayed. We are fixing it. Call 030 274 1100.'
                    : s.deadlineAt
                      ? `Due by ${fmtStamp(s.deadlineAt)}${s.deadlineAt < now ? ' · overdue' : ''}`
                      : 'Paid within 24 hours of delivery'}
              </Host>
            </Host>
          );
        })}
      </Host>
      <BottomNav items={NAV} />
    </Phone>
  );
}
function Messages() {
  const { sms } = useFarmer();
  return (
    <Phone>
      <TopBar
        title="Messages"
        right={
          <Host tag="span" className="cap">
            SMS
          </Host>
        }
      />
      <Host tag="div" className="body">
        {sms.length === 0 && <Empty title="No messages yet." sub="" />}
        {sms.map((m) => (
          <Host
            tag="div"
            key={m.id}
            className="card card-pad col gap4"
            style={{
              fontSize: 15,
            }}
          >
            <Host tag="div">{m.body}</Host>
            <Host tag="div" className="row cap">
              <Host tag="span">{fmtStamp(m.at)}</Host>
              <Host tag="span">
                {m.status} · {m.ref.split(':')[0]}
              </Host>
            </Host>
          </Host>
        ))}
      </Host>
      <BottomNav items={NAV} />
    </Phone>
  );
}
export function farmerGhs(n: number) {
  return ghs(n);
}
export const FarmerLink = () => <Link to="/farmer">Farmer</Link>;
export default function FarmerApp() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="pickups" element={<Pickups />} />
      <Route path="payments" element={<Payments />} />
      <Route path="messages" element={<Messages />} />
      <Route path="*" element={<Navigate to="/farmer" />} />
    </Routes>
  );
}
