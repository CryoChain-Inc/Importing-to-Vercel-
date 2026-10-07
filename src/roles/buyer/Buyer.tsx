import { Host } from '../../ui/host';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useStore } from '../../domain/store';
import { remoteEnabled } from '../../backend/config';
import type { Order, OrderLine } from '../../domain/types';
import {
  ORDER_LABEL,
  ORDER_TONE,
  addDays,
  creditBalance,
  expiresIn,
  fmtDay,
  fmtDayLong,
  fmtStamp,
  ghs,
  isoDay,
  kg,
  orderStepIndex,
  round2,
} from '../../domain/logic';
import { colors, fontFamily } from '../../ui/theme';
import {
  Btn,
  BottomNav,
  Chip,
  Countdown,
  Empty,
  Field,
  I,
  KV,
  Logo,
  Money,
  Ph,
  Sheet,
  Stamped,
  Tabs,
  TopBar,
  copy,
  useMedia,
} from '../../ui/kit';
import { Desk, Phone } from '../../layouts/shells';
const NAV = [
  {
    to: '/buyer/new-order',
    label: 'New order',
  },
  {
    to: '/buyer/orders',
    label: 'Orders',
  },
  {
    to: '/buyer/payments',
    label: 'Payments',
  },
  {
    to: '/buyer/users',
    label: 'Users',
  },
];
function useBuyer() {
  const { state, act, now } = useStore();
  const user = state.buyerUsers.find((u) => u.id === state.session.buyerUserId)!;
  const org = state.orgs.find((o) => o.id === user.orgId)!;
  const seen = new Set<string>();
  const orders = state.orders
    .filter((o) => o.orgId === org.id)
    .filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    })
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  return {
    state,
    act,
    now,
    user,
    org,
    orders,
    credit: creditBalance(state, org.id),
    isApprover: user.roles.includes('approver') || user.roles.includes('admin'),
    isAdmin: user.roles.includes('admin'),
    canRequest:
      user.roles.includes('requester') ||
      user.roles.includes('admin') ||
      user.roles.includes('approver'),
  };
}
function Shell({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  const desk = useMedia('(min-width: 1024px)');
  const { org, user, credit } = useBuyer();
  if (desk && nav)
    return (
      <Desk
        logoHeight={48}
        nav={[
          {
            to: '/buyer/orders',
            label: 'Orders',
          },
          {
            to: '/buyer/deliveries',
            label: 'Deliveries',
          },
          {
            to: '/buyer/temperature',
            label: 'Temperature records',
          },
          {
            to: '/buyer/payments',
            label: 'Payments',
          },
          {
            to: '/buyer/users',
            label: 'Users',
          },
          {
            to: '/buyer/new-order',
            label: 'New order',
          },
        ]}
        footer={
          <>
            {org.name}
            <Host tag="br" />
            {user.name} · {user.roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(', ')}
            <Host tag="br" />
            Credit{' '}
            <Host
              tag="strong"
              style={{
                color: 'var(--green)',
              }}
            >
              {ghs(credit)}
            </Host>
          </>
        }
      >
        <Host
          tag="div"
          style={{
            maxWidth: 980,
          }}
        >
          {children}
        </Host>
      </Desk>
    );
  return (
    <Phone>
      {children}
      {nav && <BottomNav items={NAV} />}
    </Phone>
  );
}
function SignIn() {
  const nav = useNavigate();
  const [ph, setPh] = useState('24 555 0192');
  return (
    <Phone>
      <Host
        tag="div"
        style={{
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <Logo
          h={28}
          style={{
            alignSelf: 'flex-start',
          }}
        />
        <Host
          tag="div"
          className="hero"
          style={{
            margin: '56px 0 8px',
          }}
        >
          Cold from the farm gate to your door.
        </Host>
        <Host
          tag="div"
          style={{
            fontSize: 16,
            lineHeight: 1.5,
            color: 'var(--steel-ink)',
            marginBottom: 40,
          }}
        >
          Sign in with the phone number on your organisation account.
        </Host>
        <Field label="Phone number">
          <Host
            tag="div"
            className="input"
            style={{
              gap: 6,
            }}
          >
            +233{' '}
            <Host
              tag="input"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
              style={{
                border: 0,
                outline: 0,
                flex: 1,
                fontSize: 16,
                background: 'transparent',
              }}
              placeholder="24 000 0000"
            />
          </Host>
        </Field>
        <Host
          tag="div"
          style={{
            marginTop: 16,
          }}
        >
          <Btn onClick={() => nav('/buyer/code')}>Send code</Btn>
        </Host>
        <Host
          tag="div"
          style={{
            marginTop: 'auto',
            fontSize: 14,
            color: 'var(--steel-ink)',
            paddingTop: 24,
          }}
        >
          New buyer?{' '}
          <Link
            to="/buyer/register"
            style={{
              fontWeight: 600,
            }}
          >
            Register your organisation
          </Link>
        </Host>
      </Host>
    </Phone>
  );
}
function Code() {
  const nav = useNavigate();
  const [d, setD] = useState('481');
  const full = d.length === 6;
  return (
    <Phone>
      <Host
        tag="div"
        style={{
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <Link
          to="/buyer"
          style={{
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ← Change number
        </Link>
        <Host
          tag="div"
          className="h20"
          style={{
            margin: '32px 0 6px',
          }}
        >
          Enter the code
        </Host>
        <Host
          tag="div"
          className="muted"
          style={{
            marginBottom: 24,
          }}
        >
          Sent by SMS to +233 24 555 0192.
        </Host>
        <Host
          tag="div"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6,1fr)',
            gap: 8,
            fontSize: 24,
            fontWeight: 600,
          }}
          className="tabular"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Host
              tag="button"
              key={i}
              onClick={() => setD((v) => (v.length < 6 ? v + String((i + 4) % 10) : v))}
              style={{
                height: 56,
                display: 'grid',
                placeItems: 'center',
                background: '#fff',
                border: i === d.length ? '2px solid var(--blue)' : '1px solid var(--steel)',
                borderRadius: 6,
              }}
            >
              {d[i] ?? ''}
            </Host>
          ))}
        </Host>
        <Host
          tag="div"
          className="cap"
          style={{
            marginTop: 8,
          }}
        >
          Tap the boxes to fill the demo code.
        </Host>
        <Host
          tag="div"
          style={{
            marginTop: 24,
          }}
        >
          <Btn disabled={!full} onClick={() => nav('/buyer/new-order')}>
            Sign in
          </Btn>
        </Host>
        <Host
          tag="div"
          className="muted"
          style={{
            marginTop: 16,
          }}
        >
          Resend code in{' '}
          <Host
            tag="span"
            className="tabular"
            style={{
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            0:42
          </Host>
        </Host>
      </Host>
    </Phone>
  );
}
function Register() {
  const { act } = useStore();
  const nav = useNavigate();
  const [f, setF] = useState({
    name: '',
    type: 'Hotel',
    country: 'Ghana',
    address: '',
    contact: '',
    phone: '+233',
  });
  const up = (k: string, v: string) =>
    setF((x) => ({
      ...x,
      [k]: v,
    }));
  return (
    <Phone>
      <Host
        tag="div"
        style={{
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          flex: 1,
        }}
      >
        <Host tag="div" className="cap">
          Signed in. Submit this form to open your organisation. The node manager approves it before
          you can order.
        </Host>
        <Host
          tag="div"
          className="h20"
          style={{
            marginTop: 8,
          }}
        >
          Register your organisation
        </Host>
        <Field label="Organisation name">
          <Host
            tag="input"
            className="input"
            value={f.name}
            onChange={(e) => up('name', e.target.value)}
          />
        </Field>
        <Field label="Type">
          <Host
            tag="select"
            className="input"
            value={f.type}
            onChange={(e) => up('type', e.target.value)}
          >
            {['Hotel', 'Grocery chain', 'Mining camp', 'Caterer', 'Exporter', 'Other'].map((t) => (
              <Host tag="option" key={t}>
                {t}
              </Host>
            ))}
          </Host>
        </Field>
        <Field
          label="Country"
          hint={
            f.country !== 'Ghana' ? 'Outside Ghana: bank transfer only in version one.' : undefined
          }
        >
          <Host
            tag="select"
            className="input"
            value={f.country}
            onChange={(e) => up('country', e.target.value)}
          >
            {['Ghana', 'Nigeria', 'United Kingdom', 'United States', 'Other'].map((t) => (
              <Host tag="option" key={t}>
                {t}
              </Host>
            ))}
          </Host>
        </Field>
        <Field label="Delivery address">
          <Host
            tag="textarea"
            className="input"
            value={f.address}
            onChange={(e) => up('address', e.target.value)}
          />
        </Field>
        <Field label="Contact name">
          <Host
            tag="input"
            className="input"
            value={f.contact}
            onChange={(e) => up('contact', e.target.value)}
          />
        </Field>
        <Field label="Admin phone">
          <Host
            tag="input"
            className="input"
            value={f.phone}
            onChange={(e) => up('phone', e.target.value)}
          />
        </Field>
        <Host
          tag="div"
          style={{
            marginTop: 'auto',
            paddingTop: 8,
          }}
        >
          <Btn
            onClick={() => {
              act.registerOrg(f);
              nav('/buyer/pending');
            }}
          >
            Submit registration
          </Btn>
        </Host>
      </Host>
    </Phone>
  );
}
function Pending() {
  const { org } = useBuyer();
  return (
    <Phone>
      <Host
        tag="div"
        style={{
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <Logo
          h={28}
          style={{
            alignSelf: 'flex-start',
          }}
        />
        <Host
          tag="div"
          style={{
            margin: 'auto 0',
            textAlign: 'center',
          }}
        >
          <Chip lg>Pending approval</Chip>
          <Host
            tag="div"
            className="hero"
            style={{
              fontSize: 26,
              margin: '16px 0 10px',
            }}
          >
            {org.name} is registered.
          </Host>
          <Host
            tag="div"
            style={{
              fontSize: 16,
              lineHeight: 1.5,
              color: 'var(--steel-ink)',
            }}
          >
            CryoChain reviews new buyers within one working day. You will get an SMS when you can
            order.
          </Host>
        </Host>
        <Host
          tag="div"
          className="card card-pad row"
          style={{
            fontSize: 14,
          }}
        >
          <Host tag="span" className="muted">
            Submitted
          </Host>
          <Host
            tag="span"
            className="tabular"
            style={{
              fontWeight: 600,
            }}
          >
            {fmtStamp(org.submittedAt)}
          </Host>
        </Host>
        <Host
          tag="div"
          style={{
            marginTop: 12,
          }}
        >
          <Btn kind="secondary" to="/ops/buyers">
            Open node manager approval queue
          </Btn>
        </Host>
      </Host>
    </Phone>
  );
}
function Home() {
  const { state, org, credit, orders, act } = useBuyer();
  const nav = useNavigate();
  const desk = useMedia('(min-width: 1024px)');
  const last = orders.find((o) => o.status === 'closed');
  return (
    <Shell>
      {desk ? (
        <Host
          tag="div"
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Host tag="span" className="h20">
            New order
          </Host>
          <Host tag="span" className="cap">
            {org.name}
          </Host>
        </Host>
      ) : (
        <TopBar title="New order" />
      )}
      <Host
        tag="div"
        className="body"
        style={{
          gap: 16,
        }}
      >
        {credit > 0 && (
          <Host tag="div" className="tint-green row">
            <Host
              tag="span"
              style={{
                fontWeight: 600,
              }}
            >
              Credit balance
            </Host>
            <Money v={credit} color="var(--green)" size={16} />
          </Host>
        )}
        {org.status !== 'approved' && (
          <Host tag="div" className="tint-amber">
            <Host tag="strong">Pending approval.</Host> You can browse, but ordering opens when
            CryoChain approves the organisation.
          </Host>
        )}
        <Host
          tag="div"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          {state.categories.map((c, i) => (
            <Link
              key={c.id}
              to={`/buyer/c/${c.id}`}
              className={`tile${i === 0 ? ' wide' : ''}`}
              style={{ backgroundColor: '#fff' }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFamily('600'),
                    fontSize: 16,
                    color: colors.ink,
                  }}
                >
                  {c.name}
                </Text>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.blue,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 18, lineHeight: 20 }}>›</Text>
                </View>
              </View>
            </Link>
          ))}
        </Host>
        {last && (
          <>
            <Host
              tag="div"
              className="lbl"
              style={{
                marginTop: 4,
              }}
            >
              Reorder
            </Host>
            <Host
              tag="button"
              className="item"
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                textAlign: 'left',
              }}
              onClick={() => {
                act.draftReorder(last.id);
                nav('/buyer/summary');
              }}
            >
              <Host tag="div">
                <Host tag="div" className="h16">
                  {last.id} · {last.lines.length} lines
                </Host>
                <Host tag="div" className="cap">
                  {last.lines.map((l) => `${l.name.split(',')[0]} ${l.qtyKg} kg`).join(', ')} ·
                  delivered {fmtDay(last.deliveryDate).slice(4)}
                </Host>
              </Host>
              <Host
                tag="span"
                style={{
                  color: 'var(--blue)',
                  fontWeight: 600,
                }}
              >
                Reorder
              </Host>
            </Host>
          </>
        )}
      </Host>
    </Shell>
  );
}
function Category() {
  const { state } = useBuyer();
  const { id } = useParams();
  const cat = state.categories.find((c) => c.id === id)!;
  const ps = state.products.filter((p) => p.categoryId === id);
  return (
    <Shell>
      <TopBar
        back="/buyer/new-order"
        title={cat.name}
        right={
          <Host tag="span" className="cap">
            {ps.length} products
          </Host>
        }
      />
      <Host tag="div" className="body">
        {ps.map((p) =>
          p.available ? (
            <Link
              key={p.id}
              to={`/buyer/p/${p.id}`}
              className="item"
              style={{
                flexDirection: 'row',
                gap: 12,
                padding: 12,
              }}
            >
              <Ph label={p.photo} />
              <Host
                tag="div"
                className="col"
                style={{
                  flex: 1,
                  gap: 2,
                }}
              >
                <Host tag="div" className="h16">
                  {p.name}
                </Host>
                <Host tag="div" className="cap">
                  Grades {p.grades.map((g) => g.grade).join(' · ')} · min {p.minKg} kg
                </Host>
                <Host
                  tag="div"
                  style={{
                    marginTop: 'auto',
                    fontWeight: 600,
                  }}
                  className="tabular"
                >
                  GHS {p.grades[0].pricePerKg.toFixed(2)}{' '}
                  <Host
                    tag="span"
                    className="muted"
                    style={{
                      fontWeight: 400,
                    }}
                  >
                    / kg
                  </Host>
                </Host>
              </Host>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: colors.mist,
                  alignItems: 'center',
                  justifyContent: 'center',
                  alignSelf: 'center',
                }}
              >
                <Text style={{ color: colors.blue, fontSize: 18, lineHeight: 20 }}>›</Text>
              </View>
            </Link>
          ) : (
            <Host
              tag="div"
              key={p.id}
              className="item muted"
              style={{
                flexDirection: 'row',
                gap: 12,
                padding: 12,
              }}
            >
              <Host
                tag="div"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 6,
                  background: 'var(--line-soft)',
                  position: 'relative',
                  flex: 'none',
                }}
              >
                <Host
                  tag="span"
                  style={{
                    position: 'absolute',
                    left: 4,
                    top: 4,
                    font: '10px ui-monospace,monospace',
                  }}
                >
                  {p.photo}
                </Host>
              </Host>
              <Host
                tag="div"
                className="col"
                style={{
                  flex: 1,
                  gap: 2,
                }}
              >
                <Host tag="div" className="h16">
                  {p.name}
                </Host>
                <Host tag="div" className="cap">
                  Grade {p.grades.map((g) => g.grade).join(' · ')} · min {p.minKg} kg
                </Host>
                <Host
                  tag="span"
                  style={{
                    marginTop: 'auto',
                    alignSelf: 'flex-start',
                  }}
                >
                  <Chip>Not available this week</Chip>
                </Host>
              </Host>
            </Host>
          ),
        )}
      </Host>
    </Shell>
  );
}
function Product() {
  const { state, act, org } = useBuyer();
  const { id } = useParams();
  const nav = useNavigate();
  const p = state.products.find((x) => x.id === id)!;
  const [grade, setGrade] = useState(p.grades[0].grade);
  const [q, setQ] = useState(Math.max(p.minKg, 300));
  const draft = state.session.draft;
  const earliest = addDays(isoDay(Date.now()), state.config.leadDays);
  useEffect(() => {
    if (draft.deliveryDate) return;
    act.draftSet({ deliveryDate: earliest });
  }, [act, draft.deliveryDate, earliest]);
  const price = p.grades.find((g) => g.grade === grade)!.pricePerKg;
  return (
    <Shell>
      <TopBar back={`/buyer/c/${p.categoryId}`} title={p.name} />
      <Host
        tag="div"
        style={{
          height: 160,
        }}
        className="ph"
      >
        <Host
          tag="span"
          style={{
            left: 12,
            top: 12,
            fontSize: 11,
          }}
        >
          product photo: {p.photo}, crate, 3:2
        </Host>
      </Host>
      <Host
        tag="div"
        className="body"
        style={{
          gap: 16,
        }}
      >
        <Host
          tag="div"
          className="row"
          style={{
            alignItems: 'baseline',
          }}
        >
          <Host tag="div">
            <Host tag="div" className="h20">
              {p.name}, grade {grade}
            </Host>
            <Host tag="div" className="cap">
              Minimum {p.minKg} kg · lead time {state.config.leadDays} days
            </Host>
          </Host>
          <Host tag="div" className="h20 tabular">
            {price.toFixed(2)}
            <Host
              tag="span"
              className="cap"
              style={{
                fontWeight: 400,
              }}
            >
              {' '}
              /kg
            </Host>
          </Host>
        </Host>
        <Host
          tag="div"
          style={{
            display: 'flex',
            gap: 8,
          }}
        >
          {p.grades.map((g) => (
            <Host
              tag="button"
              key={g.grade}
              className={`pill${grade === g.grade ? ' on' : ''}`}
              onClick={() => setGrade(g.grade)}
            >
              {g.grade} · {g.pricePerKg.toFixed(2)}
            </Host>
          ))}
        </Host>
        <Host tag="div" className="field">
          <Host tag="span" className="lbl">
            Quantity, kg
          </Host>
          <Host
            tag="div"
            style={{
              display: 'flex',
              gap: 8,
            }}
          >
            <Host
              tag="button"
              onClick={() => setQ((v) => Math.max(p.minKg, v - 10))}
              style={{
                width: 56,
                height: 56,
                border: '1px solid var(--steel)',
                borderRadius: 6,
                background: '#fff',
                fontSize: 24,
              }}
            >
              −
            </Host>
            <Host
              tag="input"
              className="tabular"
              value={q}
              onChange={(e) =>
                setQ(Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0))
              }
              style={{
                flex: 1,
                height: 56,
                textAlign: 'center',
                border: '1px solid var(--steel)',
                borderRadius: 6,
                background: '#fff',
                fontSize: 24,
                fontWeight: 600,
                width: 60,
              }}
            />
            <Host
              tag="button"
              onClick={() => setQ((v) => v + 10)}
              style={{
                width: 56,
                height: 56,
                border: '1px solid var(--steel)',
                borderRadius: 6,
                background: '#fff',
                fontSize: 24,
              }}
            >
              +
            </Host>
          </Host>
          <Host tag="span" className="cap">
            {q < p.minKg ? (
              <Host
                tag="span"
                style={{
                  color: 'var(--red)',
                }}
              >
                Minimum {p.minKg} kg.
              </Host>
            ) : (
              'Steps of 10 kg. Tap the number to type.'
            )}
          </Host>
        </Host>
        <Field label="Delivery date">
          <Host
            tag="input"
            type="date"
            className="input"
            min={earliest}
            value={draft.deliveryDate < earliest ? earliest : draft.deliveryDate}
            onChange={(e) =>
              act.draftSet({
                deliveryDate: e.target.value,
              })
            }
          />
          <Host tag="span" className="cap">
            Earliest {fmtDay(earliest)}
          </Host>
        </Field>
        <Field label="Deliver to">
          <Host
            tag="select"
            className="input"
            value={draft.address}
            onChange={(e) =>
              act.draftSet({
                address: e.target.value,
              })
            }
          >
            <Host tag="option">Main kitchen, Gamel Abdul Nasser Ave</Host>
            <Host tag="option">{org.address}</Host>
            <Host tag="option">Staff canteen, service entrance</Host>
          </Host>
        </Field>
      </Host>
      <Host tag="div" className="footer">
        <Host
          tag="div"
          className="row"
          style={{
            fontSize: 14,
          }}
        >
          <Host tag="span" className="muted">
            {q} kg × {price.toFixed(2)}
          </Host>
          <Money v={round2(q * price)} />
        </Host>
        <Btn
          disabled={q < p.minKg || org.status !== 'approved'}
          onClick={() => {
            act.draftAdd(p.id, grade, q);
            nav('/buyer/summary');
          }}
        >
          Add to order
        </Btn>
      </Host>
    </Shell>
  );
}
function Summary() {
  const { state, act, user, credit, canRequest } = useBuyer();
  const nav = useNavigate();
  const d = state.session.draft;
  const linesTotal = round2(d.lines.reduce((a, l) => a + l.total, 0));
  const cr = Math.min(credit, linesTotal);
  const approver = state.buyerUsers.find(
    (u) =>
      u.orgId === user.orgId &&
      u.roles.includes('approver') &&
      u.id !== user.id &&
      u.status === 'active',
  );
  if (!d.lines.length)
    return (
      <Shell>
        <TopBar back="/buyer/new-order" title="Order summary" />
        <Host tag="div" className="body">
          <Empty
            title="No lines yet."
            sub="Add produce from a category to start an order."
            action={
              <Btn
                to="/buyer/new-order"
                style={{
                  width: 'auto',
                  display: 'inline-flex',
                }}
              >
                Browse produce
              </Btn>
            }
          />
        </Host>
      </Shell>
    );
  return (
    <Shell>
      <TopBar back="/buyer/new-order" title="Order summary" />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 14,
        }}
      >
        <Host tag="div" className="card">
          {d.lines.map((l, i) => (
            <Host
              tag="div"
              key={l.id}
              className="row"
              style={{
                padding: '12px 14px',
                borderBottom: i < d.lines.length - 1 ? '1px solid var(--line-soft)' : undefined,
              }}
            >
              <Host tag="div">
                <Host tag="div" className="h16">
                  {l.name}, {l.grade}
                </Host>
                <Host tag="div" className="cap">
                  {l.qtyKg} kg × {l.unitPrice.toFixed(2)} ·{' '}
                  <Host
                    tag="button"
                    onClick={() => act.draftRemove(l.id)}
                    style={{
                      color: 'var(--red)',
                      fontWeight: 600,
                    }}
                  >
                    remove
                  </Host>
                </Host>
              </Host>
              <Host
                tag="span"
                className="tabular"
                style={{
                  fontWeight: 600,
                }}
              >
                {l.total.toLocaleString('en-GH', {
                  minimumFractionDigits: 2,
                })}
              </Host>
            </Host>
          ))}
        </Host>
        <Host tag="div" className="card card-pad col gap8">
          <KV
            k="Lines"
            v={
              <Host
                tag="span"
                className="tabular"
                style={{
                  fontWeight: 400,
                }}
              >
                {linesTotal.toLocaleString('en-GH', {
                  minimumFractionDigits: 2,
                })}
              </Host>
            }
          />
          {cr > 0 && (
            <KV
              k="Credit applied"
              v={
                <Host
                  tag="span"
                  className="tabular"
                  style={{
                    color: 'var(--green)',
                    fontWeight: 400,
                  }}
                >
                  − {cr.toFixed(2)}
                </Host>
              }
            />
          )}
          <Host
            tag="div"
            className="row h16"
            style={{
              borderTop: '1px solid var(--line)',
              paddingTop: 8,
            }}
          >
            <Host tag="span">Total to pay</Host>
            <Money v={round2(linesTotal - cr)} />
          </Host>
        </Host>
        <KV k="Delivery" v={`${fmtDay(d.deliveryDate)} · ${d.address.split(',')[0]}`} />
        <KV k="Requester" v={user.name} />
        <Link
          to="/buyer/new-order"
          style={{
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          + Add another product
        </Link>
      </Host>
      <Host tag="div" className="footer">
        <Btn
          disabled={!canRequest}
          onClick={() => {
            const id = act.submitDraft();
            nav(`/buyer/o/${id}`);
          }}
        >
          Submit for approval
        </Btn>
        <Host
          tag="div"
          className="cap"
          style={{
            textAlign: 'center',
          }}
        >
          {approver ? `Goes to ${approver.name}, approver` : 'Goes to your approver'}
        </Host>
      </Host>
    </Shell>
  );
}
const ORDER_TRACK = [
  { label: 'Submitted', now: 'Waiting for an approver.' },
  { label: 'Approved', now: 'Approved. Payment is the next step.' },
  { label: 'Paid', now: 'Payment confirmed. CryoChain is allocating this order across farmers.' },
  {
    label: 'Allocated',
    now: 'Allocated across farmers. Collection is scheduled for the delivery date.',
  },
  { label: 'In collection', now: 'The truck is collecting from the farms now.' },
  {
    label: 'Delivered',
    now: 'At the door. Accept the delivery, or reject a line before the window closes.',
  },
  { label: 'Closed', now: 'You accepted this delivery.' },
];

function shownStatus(o: Order) {
  return o.acceptedAt && o.status === 'delivered' ? 'closed' : o.status;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  ...(
    [
      'submitted',
      'approved',
      'awaiting_payment',
      'paid',
      'allocated',
      'in_collection',
      'delivered',
      'closed',
      'held',
      'expired',
      'cancelled',
    ] as const
  ).map((status) => ({ value: status, label: ORDER_LABEL[status] })),
];

function isOpenOrder(o: Order) {
  return !['closed', 'cancelled', 'expired'].includes(shownStatus(o));
}

function matchesStatus(o: Order, status: string) {
  if (status === 'all') return true;
  if (status === 'open') return isOpenOrder(o);
  return shownStatus(o) === status;
}

function matchesWhen(o: Order, when: string) {
  if (!when) return true;
  return o.deliveryDate.slice(0, 10) === when;
}

function matchesQuery(o: Order, q: string) {
  if (!q) return true;
  const lines = o.lines.map((l) => `${l.name} ${l.grade}`).join(' ');
  return `${o.id} ${lines}`.toLowerCase().includes(q);
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const chipStyle = {
  height: 36,
  paddingHorizontal: 12,
  borderWidth: 1,
  borderColor: colors.steel,
  borderRadius: 6,
  backgroundColor: '#fff',
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 8,
};

const popShadow =
  Platform.OS === 'web'
    ? ({ boxShadow: '0 8px 24px rgba(26,35,48,.16)' } as object)
    : { elevation: 8 };

function Anchored({
  label,
  panelWidth = 220,
  children,
}: {
  label: string;
  panelWidth?: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <View style={{ position: 'relative', zIndex: open ? 30 : 1 }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={chipStyle}>
        <Text
          numberOfLines={1}
          style={{ color: colors.ink, fontSize: 13, fontFamily: fontFamily('500') }}
        >
          {label}
        </Text>
        <Text style={{ color: colors.steelInk, fontSize: 12 }}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View
          style={[
            {
              position: 'absolute',
              top: 40,
              left: 0,
              width: panelWidth,
              zIndex: 2,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 8,
              overflow: 'hidden',
            },
            popShadow,
          ]}
        >
          {children(close)}
        </View>
      ) : null}
    </View>
  );
}

function StatusMenu({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const current = STATUS_OPTIONS.find((option) => option.value === value) ?? STATUS_OPTIONS[0];
  return (
    <Anchored label={`Status: ${current.label}`} panelWidth={220}>
      {(close) => (
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
          {STATUS_OPTIONS.map((option) => {
            const on = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  close();
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: on ? colors.mist : '#fff',
                }}
              >
                <Text
                  style={{
                    color: on ? colors.blueInk : colors.ink,
                    fontSize: 14,
                    fontFamily: fontFamily(on ? '600' : '400'),
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Anchored>
  );
}

function DeliveryCalendar({
  value,
  onChange,
  marked,
}: {
  value: string;
  onChange: (iso: string) => void;
  marked: Set<string>;
}) {
  const selected = value ? new Date(`${value}T12:00:00`) : new Date();
  const [cursor, setCursor] = useState({
    y: selected.getFullYear(),
    m: selected.getMonth(),
  });
  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const today = isoDay(Date.now());
  return (
    <Anchored label={value ? `Delivery: ${fmtDay(value)}` : 'Delivery date'} panelWidth={292}>
      {(close) => (
        <View style={{ padding: 12, gap: 8 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Pressable
              onPress={() =>
                setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))
              }
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18, color: colors.ink }}>‹</Text>
            </Pressable>
            <Text style={{ fontFamily: fontFamily('600'), fontSize: 14, color: colors.ink }}>
              {MONTH_NAMES[cursor.m]} {cursor.y}
            </Text>
            <Pressable
              onPress={() =>
                setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))
              }
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18, color: colors.ink }}>›</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
              <Text
                key={day}
                style={{
                  width: 36,
                  textAlign: 'center',
                  fontSize: 11,
                  color: colors.steelInk,
                  fontFamily: fontFamily('600'),
                }}
              >
                {day}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 252 }}>
            {cells.map((day, i) => {
              if (!day) return <View key={`e-${i}`} style={{ width: 36, height: 36 }} />;
              const iso = isoDay(new Date(cursor.y, cursor.m, day, 12).getTime());
              const has = marked.has(iso);
              const on = iso === value;
              return (
                <Pressable
                  key={iso}
                  onPress={() => {
                    onChange(iso);
                    close();
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 18,
                    backgroundColor: on ? colors.blue : has ? colors.greenTint : 'transparent',
                    borderWidth: !on && iso === today ? 1 : 0,
                    borderColor: colors.steel,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: on ? '#fff' : has ? colors.green : colors.ink,
                      fontFamily: fontFamily(has || on ? '600' : '400'),
                    }}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: 12, color: colors.steelInk }}>
            Green marks a day that already has a delivery.
          </Text>
          <Pressable
            onPress={() => {
              onChange('');
              close();
            }}
            style={{ paddingVertical: 6 }}
          >
            <Text style={{ color: colors.blueInk, fontFamily: fontFamily('600'), fontSize: 13 }}>
              All dates
            </Text>
          </Pressable>
        </View>
      )}
    </Anchored>
  );
}

function OrderTrack({ step }: { step: number }) {
  if (step < 0) return null;
  return (
    <Host tag="div" className="card" style={{ paddingVertical: 12, paddingHorizontal: 14 }}>
      {ORDER_TRACK.map((stage, i) => {
        const done = i < step;
        const current = i === step;
        const last = i === ORDER_TRACK.length - 1;
        return (
          <Host
            key={stage.label}
            tag="div"
            style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}
          >
            <Host tag="div" style={{ width: 16, alignItems: 'center' }}>
              <Host
                tag="div"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  marginTop: 4,
                  backgroundColor: done || current ? colors.green : colors.paper,
                  borderWidth: 2,
                  borderColor: done || current ? colors.green : colors.steel,
                }}
              />
              {last ? null : (
                <Host
                  tag="div"
                  style={{
                    width: 2,
                    flexGrow: 1,
                    minHeight: 16,
                    backgroundColor: i < step ? colors.green : colors.line,
                  }}
                />
              )}
            </Host>
            <Host tag="div" style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 12 }}>
              <Host
                tag="div"
                style={{
                  fontSize: 14,
                  fontWeight: current ? 600 : 500,
                  color: current ? colors.ink : done ? colors.slate : colors.steelInk,
                }}
              >
                {stage.label}
              </Host>
              {current ? (
                <Host tag="div" className="cap">
                  {stage.now}
                </Host>
              ) : null}
            </Host>
          </Host>
        );
      })}
    </Host>
  );
}

function Orders() {
  const { orders, now } = useBuyer();
  const [status, setStatus] = useState('all');
  const list = orders.filter((o) => matchesStatus(o, status));
  const desk = useMedia('(min-width: 1024px)');
  if (desk) return <OrdersDesk />;
  return (
    <Shell>
      <TopBar title="Orders" right={<StatusMenu value={status} onChange={setStatus} />} />
      <Host tag="div" className="body">
        {list.length === 0 && (
          <Empty
            title={orders.length === 0 ? 'No orders yet.' : 'No orders match.'}
            sub={orders.length === 0 ? 'Your first order will appear here.' : 'Try another status.'}
            action={
              orders.length === 0 ? (
                <Btn
                  to="/buyer/new-order"
                  style={{
                    width: 'auto',
                    display: 'inline-flex',
                  }}
                >
                  Browse produce
                </Btn>
              ) : undefined
            }
          />
        )}
        {list.map((o) => (
          <Link key={o.id} to={`/buyer/o/${o.id}`} className="item">
            <Host tag="div" className="row">
              <Host tag="span" className="h16">
                {o.id}
              </Host>
              <Chip tone={ORDER_TONE[shownStatus(o)]}>{ORDER_LABEL[shownStatus(o)]}</Chip>
            </Host>
            <Host tag="div" className="row cap">
              <Host tag="span">
                {o.lines.length} {o.lines.length === 1 ? 'line' : 'lines'} ·{' '}
                {fmtDay(o.deliveryDate)}
                {o.status === 'delivered' && o.deliveredAt
                  ? ` · accept by ${fmtStamp(o.deliveredAt + 86400000)}`
                  : ''}
                {o.status === 'awaiting_payment' && o.expiresAt
                  ? ` · expires in ${expiresIn(o.expiresAt, now).split(' ')[0]} h`
                  : ''}
              </Host>
              <Money v={o.total} />
            </Host>
          </Link>
        ))}
      </Host>
    </Shell>
  );
}
function OrdersDesk() {
  const { orders } = useBuyer();
  const [sp, setSp] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [when, setWhen] = useState('');
  const q = query.trim().toLowerCase();
  const list = orders.filter(
    (o) => matchesStatus(o, status) && matchesWhen(o, when) && matchesQuery(o, q),
  );
  const requested = sp.get('sel');
  const sel = list.some((o) => o.id === requested) ? requested : list[0]?.id;
  const marked = new Set(orders.map((o) => o.deliveryDate.slice(0, 10)).filter(Boolean));
  const exportRows = () =>
    downloadCsv(
      'orders.csv',
      list.map((o) => ({
        order: o.id,
        lines: o.lines.map((l) => l.name).join('; '),
        delivery: o.deliveryDate,
        total: o.total,
        status: ORDER_LABEL[shownStatus(o)],
      })),
    );
  return (
    <Shell>
      <Host tag="div" style={{ gap: 16, width: '100%' }}>
        <Host
          tag="div"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Host tag="span" className="h20">
            Orders
          </Host>
          <Host
            tag="div"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <Btn to="/buyer/new-order" md style={{ flexShrink: 0 }}>
              New order
            </Btn>
            <Host
              tag="button"
              className="btn btn-secondary btn-md"
              style={{ flexShrink: 0 }}
              onClick={exportRows}
            >
              Export CSV
            </Host>
          </Host>
        </Host>
        <Host
          tag="div"
          className="toolbar"
          style={{ zIndex: 20, position: 'relative', overflow: 'visible' }}
        >
          <Host
            tag="div"
            className="f"
            style={{ flexGrow: 1, flexBasis: 220, maxWidth: 320, minWidth: 180 }}
          >
            <Host
              tag="input"
              value={query}
              placeholder="Search order or line"
              onChange={(e) => setQuery(String(e.target.value))}
              style={{
                flex: 1,
                minWidth: 0,
                height: 34,
                borderWidth: 0,
                paddingHorizontal: 0,
                backgroundColor: 'transparent',
              }}
            />
          </Host>
          <StatusMenu value={status} onChange={setStatus} />
          <DeliveryCalendar value={when} onChange={setWhen} marked={marked} />
        </Host>
        <Host tag="div" className="two">
          <Host
            tag="div"
            className="tbl"
            style={{
              border: 0,
              borderRadius: 0,
            }}
          >
            <Host tag="table">
              <Host tag="thead">
                <Host tag="tr">
                  <Host tag="th">Order</Host>
                  <Host tag="th">Lines</Host>
                  <Host tag="th">Delivery ↓</Host>
                  <Host tag="th" className="num">
                    Total GHS
                  </Host>
                  <Host tag="th">Status</Host>
                </Host>
              </Host>
              <Host tag="tbody">
                {list.map((o) => (
                  <Host
                    tag="tr"
                    key={o.id}
                    className={o.id === sel ? 'sel' : ''}
                    onClick={() =>
                      setSp({
                        sel: o.id,
                      })
                    }
                    style={{
                      cursor: 'pointer',
                    }}
                  >
                    <Host tag="td">
                      <Host tag="a">{o.id}</Host>
                    </Host>
                    <Host tag="td">{o.lines.map((l) => l.name.split(',')[0]).join(', ')}</Host>
                    <Host tag="td">{fmtDay(o.deliveryDate)}</Host>
                    <Host tag="td" className="num">
                      {o.total.toLocaleString('en-GH', {
                        minimumFractionDigits: 2,
                      })}
                    </Host>
                    <Host tag="td">
                      <Chip tone={ORDER_TONE[shownStatus(o)]}>{ORDER_LABEL[shownStatus(o)]}</Chip>
                    </Host>
                  </Host>
                ))}
              </Host>
            </Host>
            {list.length === 0 ? (
              <Empty
                title={orders.length === 0 ? 'No orders yet.' : 'No orders'}
                sub={
                  orders.length === 0
                    ? 'Your first order will appear here.'
                    : when
                      ? `No orders are booked for ${fmtDayLong(when)}.`
                      : 'Nothing matches this search or status.'
                }
              />
            ) : null}
            <Host
              tag="div"
              className="cap"
              style={{
                padding: 12,
              }}
            >
              {list.length} {status === 'open' ? 'open ' : ''}
              {list.length === 1 ? 'order' : 'orders'}
            </Host>
          </Host>
          <Host tag="div" className="side">
            {sel ? <OrderDetailBody id={sel} compact /> : <Empty title="Select an order." sub="" />}
          </Host>
        </Host>
      </Host>
    </Shell>
  );
}
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(','),
    ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(',')),
  ].join('\n');
  Share.share({
    title: name,
    message: csv,
  }).catch(() => {});
}
function OrderDetail() {
  const { id } = useParams();
  const { orders } = useBuyer();
  const o = orders.find((x) => x.id === id);
  if (!o) return <Navigate to="/buyer/orders" />;
  return (
    <Shell>
      <TopBar
        back="/buyer/orders"
        title={o.status === 'submitted' ? `${o.id} · approval` : o.id}
        right={
          <Chip lg tone={ORDER_TONE[shownStatus(o)]}>
            {ORDER_LABEL[shownStatus(o)]}
          </Chip>
        }
      />
      <OrderDetailBody id={o.id} />
    </Shell>
  );
}
function Lines({ o }: { o: Order }) {
  return (
    <Host tag="div" className="card">
      {o.lines.map((l, i) => (
        <Host
          tag="div"
          key={l.id}
          className="row"
          style={{
            padding: '12px 14px',
            borderBottom: i < o.lines.length - 1 ? '1px solid var(--line-soft)' : undefined,
          }}
        >
          <Host tag="div">
            <Host tag="div" className="h16">
              {l.name}, {l.grade}
            </Host>
            <Host tag="div" className="cap">
              {l.qtyKg} kg × {l.unitPrice.toFixed(2)}
            </Host>
          </Host>
          <Host
            tag="span"
            className="tabular"
            style={{
              fontWeight: 600,
            }}
          >
            {l.total.toLocaleString('en-GH', {
              minimumFractionDigits: 2,
            })}
          </Host>
        </Host>
      ))}
    </Host>
  );
}
function OrderDetailBody({ id, compact }: { id: string; compact?: boolean }) {
  const { state, act, user, isApprover, orders, now } = useBuyer();
  const nav = useNavigate();
  const o = orders.find((x) => x.id === id)!;
  const req = state.buyerUsers.find((u) => u.id === o.requestedBy);
  const [rejectLine, setRejectLine] = useState<OrderLine | null>(null);
  const [rkg, setRkg] = useState('40');
  const [rreason, setRreason] = useState('Bruised on arrival');
  const [err, setErr] = useState('');
  const accepted = Boolean(o.acceptedAt) || o.status === 'closed';
  const step = accepted ? 6 : orderStepIndex(o.status);
  const track = <OrderTrack step={step} />;
  const wrap = (c: ReactNode, footer?: ReactNode) => (
    <>
      {compact && (
        <Host tag="div" className="row">
          <Host tag="span" className="h20">
            {o.id}
          </Host>
          <Chip lg tone={ORDER_TONE[shownStatus(o)]}>
            {ORDER_LABEL[shownStatus(o)]}
          </Chip>
        </Host>
      )}
      <Host
        tag="div"
        className={compact ? 'col gap14' : 'body'}
        style={{
          fontSize: 14,
          gap: 14,
        }}
      >
        {c}
      </Host>
      {footer &&
        (compact ? (
          <Host
            tag="div"
            className="col gap8"
            style={{
              marginTop: 'auto',
            }}
          >
            {footer}
          </Host>
        ) : (
          <Host tag="div" className="footer">
            {footer}
          </Host>
        ))}
    </>
  );
  const totals = (
    <Host tag="div" className="card card-pad col gap8">
      <KV
        k={`${o.lines.length} ${o.lines.length === 1 ? 'line' : 'lines'} · ${o.lines.reduce((a, l) => a + l.qtyKg, 0)} kg`}
        v={
          <Host
            tag="span"
            className="tabular"
            style={{
              fontWeight: 400,
            }}
          >
            {o.linesTotal.toLocaleString('en-GH', {
              minimumFractionDigits: 2,
            })}
          </Host>
        }
      />
      {o.creditApplied > 0 && (
        <KV
          k="Credit applied"
          v={
            <Host
              tag="span"
              className="tabular"
              style={{
                color: 'var(--green)',
                fontWeight: 400,
              }}
            >
              − {o.creditApplied.toFixed(2)}
            </Host>
          }
        />
      )}
      <Host
        tag="div"
        className="row"
        style={{
          borderTop: '1px solid var(--line)',
          paddingTop: 8,
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        <Host tag="span">Total</Host>
        <Money v={o.total} size={20} />
      </Host>
    </Host>
  );
  if (o.status === 'submitted') {
    const over = isApprover && user.limit !== undefined && o.total > user.limit;
    const other = state.buyerUsers.find(
      (u) =>
        u.orgId === user.orgId &&
        u.roles.includes('approver') &&
        (u.limit ?? Infinity) >= o.total &&
        u.id !== user.id,
    );
    return wrap(
      <>
        {track}
        <KV
          k="Requested by"
          v={[req?.name, o.submittedAt ? fmtStamp(o.submittedAt) : '']
            .filter(Boolean)
            .join(' · ')}
        />
        {totals}
        <KV
          k="Delivery"
          v={[fmtDay(o.deliveryDate), o.address.split(',')[0]?.trim()]
            .filter((part) => part && part !== '—')
            .join(' · ')}
        />
        <Lines o={o} />
        {isApprover &&
          (over ? (
            <>
              <Host tag="div" className="tint-red row">
                <Host tag="span">Your approval limit</Host>
                <Money v={user.limit!} color="var(--red)" />
              </Host>
              <Host
                tag="div"
                className="card card-pad"
                style={{
                  lineHeight: 1.5,
                }}
              >
                This order is {ghs(round2(o.total - user.limit!))} over your limit.{' '}
                {other ? (
                  <>
                    Ask {other.name} (limit{' '}
                    {(other.limit ?? 0).toLocaleString('en-GH', {
                      minimumFractionDigits: 2,
                    })}
                    ) to approve, or cancel it and reduce the lines.
                  </>
                ) : (
                  'Cancel it and reduce the lines.'
                )}
              </Host>
            </>
          ) : user.limit !== undefined ? (
            <Host tag="div" className="tint-blue row">
              <Host tag="span">Your approval limit</Host>
              <Money v={user.limit} color="var(--blue-ink)" />
            </Host>
          ) : null)}
        {!isApprover && (
          <Host tag="div" className="tint-amber">
            <Host tag="strong">Waiting for approval.</Host>{' '}
            {state.buyerUsers
              .filter((u) => u.orgId === user.orgId && u.roles.includes('approver'))
              .map((u) => u.name)
              .join(' or ')}{' '}
            can approve and pay. Use the demo bar to act as an approver.
          </Host>
        )}
        {err && (
          <Host tag="div" className="tint-red">
            {err}
          </Host>
        )}
      </>,
      isApprover ? (
        <>
          {over ? (
            <>
              <Btn disabled>Approve and pay</Btn>
              {other && (
                <Btn kind="secondary" onClick={() => act.setBuyerUser(other.id)}>
                  Send to {other.name}
                </Btn>
              )}
            </>
          ) : (
            <Btn
              onClick={() => {
                const r = act.approveOrder(o.id);
                if (!r.ok) setErr(r.why ?? '');
                else nav(`/buyer/o/${o.id}/pay`);
              }}
            >
              Approve and pay
            </Btn>
          )}
          <Btn
            kind="link-danger"
            onClick={() => {
              act.sendBack(o.id);
              nav('/buyer/summary');
            }}
          >
            Cancel
          </Btn>
        </>
      ) : undefined,
    );
  }
  if (o.status === 'approved' || o.status === 'awaiting_payment' || o.status === 'held')
    return wrap(
      <>
        {track}
        <PayBody o={o} compact />
      </>,
    );
  if (o.status === 'delivered' && !accepted) {
    const deadline = (o.deliveredAt ?? now) + 86400000;
    return wrap(
      <>
        {track}
        <Host tag="div" className="card card-pad col gap6">
          <KV k="Delivered" v={o.deliveredAt ? <Stamped t={o.deliveredAt} /> : ''} />
          <KV k="Signed by" v={o.receiver ?? ''} />
          {o.handoverTemp !== undefined && (
            <KV k="Handover temp" v={`${o.handoverTemp.toFixed(1)} °C`} />
          )}
          <Link
            to={`/buyer/o/${o.id}/temperature`}
            style={{
              fontWeight: 600,
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            Temperature record →
          </Link>
        </Host>
        <Host tag="div" className="tint-amber row">
          <Host
            tag="span"
            style={{
              fontWeight: 600,
            }}
          >
            Accept or dispute
          </Host>
          <Countdown deadline={deadline} now={now} />
        </Host>
        <Host tag="div" className="card">
          {o.lines.map((l, i) => (
            <Host
              tag="div"
              key={l.id}
              style={{
                padding: '12px 14px',
                borderBottom: i < o.lines.length - 1 ? '1px solid var(--line-soft)' : undefined,
              }}
              className="col gap8"
            >
              <Host tag="div" className="row">
                <Host tag="div">
                  <Host tag="div" className="h16">
                    {l.name}, {l.grade}
                  </Host>
                  <Host tag="div" className="cap">
                    Ordered {l.qtyKg} kg · delivered {(l.deliveredKg ?? l.qtyKg).toFixed(1)} kg
                  </Host>
                </Host>
                {l.rejectedKg ? (
                  <Chip tone="alert">Rejected {l.rejectedKg} kg</Chip>
                ) : (
                  <Host
                    tag="button"
                    className="btn btn-secondary btn-md"
                    onClick={() => {
                      setRejectLine(l);
                      setRkg(String(Math.min(40, l.qtyKg)));
                    }}
                  >
                    Reject
                  </Host>
                )}
              </Host>
              {l.rejectedKg ? (
                <Host
                  tag="div"
                  style={{
                    padding: '10px 12px',
                    background: 'var(--paper)',
                    borderRadius: 6,
                  }}
                  className="cap"
                >
                  Reason: {l.rejectReason} ·{' '}
                  {l.credit ? (
                    <>
                      credit note{' '}
                      <Host
                        tag="strong"
                        style={{
                          color: 'var(--green)',
                        }}
                      >
                        {ghs(l.credit)}
                      </Host>{' '}
                      issued to your balance
                    </>
                  ) : (
                    'recorded at handover, CryoChain is reviewing it and a credit note follows'
                  )}
                </Host>
              ) : null}
            </Host>
          ))}
        </Host>
        <Sheet
          open={!!rejectLine}
          onClose={() => setRejectLine(null)}
          title={`Reject · ${rejectLine?.name}`}
        >
          <Field label="Kilograms rejected">
            <Host
              tag="input"
              className="input tabular"
              value={rkg}
              onChange={(e) => setRkg(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </Field>
          <Field label="Reason">
            <Host
              tag="select"
              className="input"
              value={rreason}
              onChange={(e) => setRreason(e.target.value)}
            >
              {[
                'Bruised on arrival',
                'Below grade',
                'Short weight',
                'Temperature concern',
                'Wrong product',
              ].map((r) => (
                <Host tag="option" key={r}>
                  {r}
                </Host>
              ))}
            </Host>
          </Field>
          <Host tag="div" className="cap">
            A credit note for{' '}
            {rejectLine ? ghs(round2(Number(rkg || 0) * rejectLine.unitPrice)) : ''} is applied to
            your next order. The farmer is not affected.
          </Host>
          <Btn
            kind="danger"
            onClick={() => {
              if (rejectLine) act.rejectLine(o.id, rejectLine.id, Number(rkg), rreason);
              setRejectLine(null);
            }}
          >
            Confirm rejection
          </Btn>
        </Sheet>
      </>,
      <Btn onClick={() => act.acceptDelivery(o.id)}>Accept delivery</Btn>,
    );
  }
  return wrap(
    <>
      {track}
      {accepted && (
        <Host tag="div" className="card card-pad col gap6">
          <KV k="Delivered" v={o.deliveredAt ? <Stamped t={o.deliveredAt} /> : ''} />
          <KV k="Accepted" v={o.acceptedAt ? fmtStamp(o.acceptedAt) : ''} />
          <KV k="Signed by" v={o.receiver ?? ''} />
          <Link
            to={`/buyer/o/${o.id}/temperature`}
            style={{
              fontWeight: 600,
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            Temperature record →
          </Link>
        </Host>
      )}
      {o.payment && (
        <Host tag="div" className="card card-pad col gap6">
          <KV
            k="Payment"
            v={
              o.payment.status === 'confirmed' ? (
                <Host
                  tag="span"
                  style={{
                    color: 'var(--green)',
                  }}
                >
                  Confirmed · {o.payment.ref}
                </Host>
              ) : (
                o.payment.status
              )
            }
          />
          {o.paidAt && <KV k="Received" v={fmtStamp(o.paidAt)} />}
        </Host>
      )}
      <KV k="Delivery" v={`${fmtDay(o.deliveryDate)} · ${o.address.split(',')[0]}`} />
      {totals}
      <Lines o={o} />
    </>,
    accepted ? (
      <Btn kind="secondary" to="/buyer/payments">
        Receipt
      </Btn>
    ) : undefined,
  );
}
function PayPage() {
  const { id } = useParams();
  const { orders } = useBuyer();
  const o = orders.find((x) => x.id === id);
  if (!o) return <Navigate to="/buyer/orders" />;
  return (
    <Shell>
      <TopBar back={`/buyer/o/${o.id}`} title={`Pay ${o.id}`} right={<Money v={o.total} />} />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 14,
        }}
      >
        <PayBody o={o} />
      </Host>
    </Shell>
  );
}
function PayBody({ o, compact }: { o: Order; compact?: boolean }) {
  const { state, act, org, now } = useBuyer();
  const [momo, setMomo] = useState('024 555 0192');
  const overseas = org.country !== 'Ghana';
  const approverName = state.buyerUsers.find((u) => u.id === o.approvedBy)?.name;
  const va = org.virtualAccount;
  const [demoAmt, setDemoAmt] = useState(String(o.total));
  if (o.status === 'held')
    return (
      <>
        <Host tag="div" className="tint-red col gap4">
          <Host
            tag="span"
            style={{
              fontWeight: 600,
            }}
          >
            Mismatch held
          </Host>
          <Host tag="span">
            We received {ghs(o.payment?.amount ?? 0)}, not {ghs(o.total)}. The order is on hold.
            Transfer the remaining {ghs(round2(o.total - (o.payment?.amount ?? 0)))} with reference{' '}
            {o.id}, or call 030 274 1100 for a refund.
          </Host>
        </Host>
        <Host tag="div" className="card card-pad col gap8">
          <Host tag="div" className="lbl">
            Balance
          </Host>
          <Host tag="div" className="cap">
            {remoteEnabled
              ? 'The node manager confirms the balance when the bank reports it. The order stays on hold until the amounts match.'
              : 'Demo control for a second bank message.'}
          </Host>
          {remoteEnabled ? null : (
            <Btn kind="secondary" onClick={() => act.confirmBankPayment(o.id, o.total)}>
              Simulate balance received
            </Btn>
          )}
        </Host>
      </>
    );
  if (o.status === 'paid' || o.payment?.status === 'confirmed')
    return (
      <>
        <Host tag="div" className="tint-green row">
          <Host
            tag="span"
            style={{
              fontWeight: 600,
            }}
          >
            Payment confirmed
          </Host>
          <Host tag="span" className="tabular">
            {ghs(o.payment?.amount ?? o.total)} · {o.paidAt ? fmtStamp(o.paidAt) : ''}
          </Host>
        </Host>
        <Btn to={`/buyer/o/${o.id}`}>View order</Btn>
      </>
    );
  if (o.status === 'awaiting_payment')
    return (
      <>
        <Host tag="div" className="tint-amber row">
          <Host
            tag="span"
            style={{
              fontWeight: 600,
            }}
          >
            Awaiting confirmation
          </Host>
          <Host tag="span" className="tabular">
            expires in {expiresIn(o.expiresAt ?? now, now)}
          </Host>
        </Host>
        <Host
          tag="div"
          className="cap"
          style={{
            marginTop: -6,
          }}
        >
          Collection is scheduled only after payment is confirmed.
        </Host>
        <Host
          tag="div"
          className="card"
          style={{
            padding: 14,
          }}
        >
          <Host tag="div" className="col gap10">
            <Host tag="div" className="h16">
              1 · Bank transfer
            </Host>
            <Host tag="div" className="cap">
              Your organisation's dedicated account. Use the reference exactly.
            </Host>
            {[
              ['Bank', va?.bank ?? 'Assigned on approval'],
              ['Account number', va?.number ?? '—'],
              ['Reference', o.id],
              ['Amount', ghs(o.total)],
            ].map(([k, v]) => (
              <Host
                tag="div"
                key={k}
                className="row"
                style={{
                  padding: '10px 12px',
                  background: 'var(--paper)',
                  borderRadius: 6,
                }}
              >
                <Host tag="div">
                  <Host tag="div" className="cap">
                    {k}
                  </Host>
                  <Host
                    tag="div"
                    className="tabular"
                    style={{
                      fontWeight: 600,
                      letterSpacing: k === 'Account number' ? '.04em' : undefined,
                    }}
                  >
                    {v}
                  </Host>
                </Host>
                {k !== 'Bank' && (
                  <Host tag="button" className="btn btn-secondary btn-md" onClick={() => copy(v)}>
                    Copy
                  </Host>
                )}
              </Host>
            ))}
          </Host>
        </Host>
        {remoteEnabled ? (
          <Host tag="div" className="card card-pad col gap8">
            <Host tag="div" className="lbl">
              {o.payment?.method === 'bank_transfer'
                ? 'Waiting for the bank'
                : 'Waiting for Paystack'}
            </Host>
            <Host tag="div" className="cap">
              {o.payment?.checkoutError ||
                'The order is paid only after the provider confirms the amount. Keep this page open.'}
            </Host>
            {o.payment?.checkoutUrl ? (
              <Btn
                kind="secondary"
                onClick={() => {
                  if (typeof window !== 'undefined') window.open(o.payment?.checkoutUrl, '_blank');
                }}
              >
                Open the payment page
              </Btn>
            ) : null}
          </Host>
        ) : (
          <Host
            tag="div"
            className="card card-pad col gap8"
            style={{
              borderStyle: 'dashed',
            }}
          >
            <Host tag="div" className="lbl">
              Demo: what the bank sends back
            </Host>
            <Host
              tag="div"
              style={{
                display: 'flex',
                gap: 8,
              }}
            >
              <Host
                tag="input"
                className="input tabular"
                value={demoAmt}
                onChange={(e) => setDemoAmt(e.target.value)}
              />
              <Btn
                kind="secondary"
                style={{
                  width: 'auto',
                }}
                onClick={() => act.confirmBankPayment(o.id, Number(demoAmt))}
              >
                Webhook
              </Btn>
            </Host>
            <Host tag="div" className="cap">
              Exact amount confirms the order. Anything else is held as a mismatch.
            </Host>
          </Host>
        )}
      </>
    );
  // approved: choose a route
  return (
    <>
      <Host tag="div" className="tint-blue">
        {approverName ? `Approved by ${approverName}. ` : ''}
        Choose how to pay {ghs(o.total)}. Collection is scheduled only after payment is confirmed.
      </Host>
      <Host
        tag="div"
        className="card"
        style={{
          padding: 14,
        }}
      >
        <Host tag="div" className="col gap10">
          <Host tag="div" className="h16">
            1 · Bank transfer
          </Host>
          <Host tag="div" className="cap">
            Your organisation's dedicated account. Use the reference exactly.
          </Host>
          <Btn onClick={() => act.payOrder(o.id, 'bank_transfer')}>Show account details</Btn>
        </Host>
      </Host>
      {!overseas && (
        <Host
          tag="div"
          className="card"
          style={{
            padding: 14,
          }}
        >
          <Host tag="div" className="col gap10">
            <Host tag="div" className="h16">
              2 · Card
            </Host>
            <Host tag="div" className="cap">
              Ghana issued cards only. Opens the bank's secure page.
            </Host>
            <Btn kind="secondary" onClick={() => act.payOrder(o.id, 'card')}>
              Pay by card
            </Btn>
          </Host>
        </Host>
      )}
      {!overseas && (
        <Host
          tag="div"
          className="card"
          style={{
            padding: 14,
          }}
        >
          <Host tag="div" className="col gap10">
            <Host tag="div" className="h16">
              3 · Mobile money
            </Host>
            <Host
              tag="div"
              style={{
                display: 'flex',
                gap: 8,
                width: '100%',
                alignItems: 'center',
              }}
            >
              <Host
                tag="input"
                className="input"
                value={momo}
                onChange={(e) => setMomo(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  width: 'auto',
                }}
              />
              <Host
                tag="select"
                className="input"
                style={{
                  width: 108,
                  flexShrink: 0,
                  minHeight: 48,
                }}
              >
                <Host tag="option">MTN</Host>
                <Host tag="option">Telecel</Host>
                <Host tag="option">AirtelTigo</Host>
              </Host>
            </Host>
            <Btn kind="secondary" onClick={() => act.payOrder(o.id, 'momo')}>
              Send prompt
            </Btn>
          </Host>
        </Host>
      )}
      {overseas && (
        <Host tag="div" className="tint-amber">
          Buyers outside Ghana pay by bank transfer in version one.
        </Host>
      )}
      {compact ? null : null}
    </>
  );
}
function Temperature() {
  const { id } = useParams();
  const { state, orders } = useBuyer();
  const o = orders.find((x) => x.id === id);
  if (!o) return <Navigate to="/buyer/orders" />;
  const run = state.runs.find((r) => r.id === o.runId);
  const temps = state.temps.filter((t) => t.runId === o.runId).sort((a, b) => a.at - b.at);
  const oor = temps.filter((t) => t.outOfRange).length;
  return (
    <Shell>
      <TopBar
        back={`/buyer/o/${o.id}`}
        title={`Temperature · ${o.id}`}
        right={
          <Host
            tag="button"
            className="btn btn-secondary"
            style={{
              width: 40,
              height: 40,
              padding: 0,
            }}
            onClick={() =>
              downloadCsv(
                `${o.id}-temperature.csv`,
                temps.map((t) => ({
                  checkpoint: t.label,
                  value_c: t.valueC,
                  time: new Date(t.at).toISOString(),
                  source: t.source,
                  out_of_range: t.outOfRange,
                })),
              )
            }
            aria-label="Download"
          >
            {I.download()}
          </Host>
        }
      />
      <Host
        tag="div"
        className="body"
        style={{
          gap: 0,
          fontSize: 14,
        }}
      >
        <Host
          tag="div"
          className="cap"
          style={{
            paddingBottom: 12,
          }}
        >
          Range {run?.tempMin} °C to {run?.tempMax} °C · {temps.length} checkpoints · {oor} out of
          range · readings labelled Manual are typed by the driver against a gauge photograph
        </Host>
        {temps.length === 0 && (
          <Host tag="div" className="tint-blue">
            No readings yet. They appear as the truck syncs.
          </Host>
        )}
        {temps.map((t, i) => (
          <Host
            tag="div"
            key={t.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: t.outOfRange ? '10px 12px' : '10px 0',
              margin: t.outOfRange ? '0 -12px' : 0,
              borderTop: '1px solid var(--line)',
              borderBottom: i === temps.length - 1 ? '1px solid var(--line)' : undefined,
              background: t.outOfRange ? 'var(--red-tint)' : undefined,
              borderRadius: t.outOfRange ? 6 : 0,
            }}
          >
            <Ph label="" w={48} h={48} />
            <Host
              tag="div"
              style={{
                flex: 1,
              }}
            >
              <Host tag="div" className="row">
                <Host
                  tag="span"
                  style={{
                    fontWeight: 600,
                    color: t.outOfRange ? 'var(--red)' : undefined,
                  }}
                >
                  {t.label}
                </Host>
                <Host
                  tag="span"
                  className="tabular h16"
                  style={{
                    color: t.outOfRange ? 'var(--red)' : undefined,
                  }}
                >
                  {t.valueC.toFixed(1)} °C
                </Host>
              </Host>
              <Host
                tag="div"
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
                className="cap"
              >
                <Host
                  tag="span"
                  className="tabular"
                  style={{
                    color: t.outOfRange ? 'var(--red)' : undefined,
                  }}
                >
                  {fmtStamp(t.at)}
                </Host>
                <Host
                  tag="span"
                  className="chip chip-outline"
                  style={
                    t.outOfRange
                      ? {
                          borderColor: 'var(--red)',
                          color: 'var(--red)',
                        }
                      : undefined
                  }
                >
                  {t.source === 'manual' ? 'Manual' : 'Device'}
                </Host>
                {t.outOfRange && (
                  <Host
                    tag="span"
                    style={{
                      fontWeight: 600,
                      color: 'var(--red)',
                    }}
                  >
                    Out of range
                  </Host>
                )}
              </Host>
              {t.note && (
                <Host
                  tag="div"
                  className="cap"
                  style={{
                    color: 'var(--red)',
                    marginTop: 2,
                  }}
                >
                  {t.note}
                </Host>
              )}
            </Host>
          </Host>
        ))}
      </Host>
      <Host tag="div" className="footer">
        <Btn
          kind="secondary"
          onClick={() =>
            Share.share({
              message: 'CryoChain record',
            }).catch(() => {})
          }
        >
          Download record (PDF)
        </Btn>
      </Host>
    </Shell>
  );
}
function Payments() {
  const { state, orders, credit } = useBuyer();
  const [tab, setTab] = useState('Receipts');
  const receipts = orders
    .filter((o) => o.payment)
    .sort((a, b) => (b.payment?.at ?? b.expiresAt ?? 0) - (a.payment?.at ?? a.expiresAt ?? 0));
  const credits = state.ledger.filter(
    (l) => l.kind === 'credit_note' && orders.some((o) => o.id === l.orderId),
  );
  return (
    <Shell>
      <TopBar title="Payments" />
      <Tabs tabs={['Receipts', 'Credit notes']} value={tab} onChange={setTab} />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 14,
        }}
      >
        <Host tag="div" className="tint-green row">
          <Host
            tag="span"
            style={{
              fontWeight: 600,
            }}
          >
            Credit balance
          </Host>
          <Money v={credit} color="var(--green)" />
        </Host>
        {tab === 'Receipts'
          ? receipts.map((o) => (
              <Host tag="div" key={o.id} className="item">
                <Host tag="div" className="row">
                  <Host tag="span" className="h16">
                    {o.id}
                  </Host>
                  <Money v={o.payment!.amount} />
                </Host>
                <Host tag="div" className="row cap">
                  <Host tag="span">
                    {o.payment!.method === 'bank_transfer'
                      ? 'Bank transfer'
                      : o.payment!.method === 'card'
                        ? 'Card'
                        : 'Mobile money · MTN'}{' '}
                    · {o.payment!.status === 'awaiting' ? 'awaiting' : 'ref ' + o.payment!.ref}
                  </Host>
                  <Host tag="span" className="tabular">
                    {o.payment!.at
                      ? fmtStamp(o.payment!.at)
                      : o.expiresAt
                        ? `expires ${fmtStamp(o.expiresAt)}`
                        : ''}
                  </Host>
                </Host>
                <Host tag="div" className="row">
                  {o.payment!.status === 'confirmed' ? (
                    <Chip tone="ok">Confirmed</Chip>
                  ) : o.payment!.status === 'mismatch' ? (
                    <Chip tone="alert">Mismatch held</Chip>
                  ) : (
                    <Chip tone="warn">Awaiting confirmation</Chip>
                  )}
                  {o.payment!.status === 'confirmed' && (
                    <Host
                      tag="button"
                      style={{
                        fontWeight: 600,
                        color: 'var(--blue)',
                      }}
                      onClick={() =>
                        Share.share({
                          message: 'CryoChain record',
                        }).catch(() => {})
                      }
                    >
                      Receipt PDF
                    </Host>
                  )}
                </Host>
              </Host>
            ))
          : credits.map((l) => (
              <Host tag="div" key={l.id} className="item">
                <Host tag="div" className="row">
                  <Host tag="span" className="h16">
                    {l.ref} · {l.orderId}
                  </Host>
                  <Host
                    tag="span"
                    className="tabular"
                    style={{
                      fontWeight: 600,
                      color: 'var(--green)',
                    }}
                  >
                    + {ghs(l.amount)}
                  </Host>
                </Host>
                <Host tag="div" className="cap">
                  Credit note · {l.memo} · applied to balance
                </Host>
              </Host>
            ))}
        {tab === 'Credit notes' && credits.length === 0 && (
          <Empty title="No credit notes." sub="Rejected produce is credited here." />
        )}
      </Host>
    </Shell>
  );
}
function Users() {
  const { state, act, org, user, isAdmin } = useBuyer();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'viewer' | 'requester' | 'approver' | 'admin'>('requester');
  const [limit, setLimit] = useState('10000');
  const [edit, setEdit] = useState<string | null>(null);
  const users = state.buyerUsers.filter((u) => u.orgId === org.id);
  const eu = users.find((u) => u.id === edit);
  const [elimit, setElimit] = useState('');
  const [erole, setErole] = useState<'viewer' | 'requester' | 'approver' | 'admin'>('requester');
  return (
    <Shell>
      <TopBar
        title="Users"
        right={
          <Host tag="span" className="cap">
            {org.name}
          </Host>
        }
      />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 14,
        }}
      >
        {isAdmin && (
          <Host
            tag="div"
            className="card"
            style={{
              padding: 14,
            }}
          >
            <Host tag="div" className="col gap10">
              <Host tag="div" className="h16">
                Invite by phone
              </Host>
              <Host
                tag="input"
                className="input"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Host
                tag="div"
                style={{
                  display: 'flex',
                  gap: 8,
                }}
              >
                <Host
                  tag="input"
                  className="input"
                  placeholder="+233"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    flex: 1,
                  }}
                />
                <Host
                  tag="select"
                  className="input"
                  style={{
                    width: 140,
                  }}
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                >
                  <Host tag="option" value="viewer">
                    Viewer
                  </Host>
                  <Host tag="option" value="requester">
                    Requester
                  </Host>
                  <Host tag="option" value="approver">
                    Approver
                  </Host>
                  <Host tag="option" value="admin">
                    Admin
                  </Host>
                </Host>
              </Host>
              {role === 'approver' && (
                <Field label="Approval limit, GHS per order">
                  <Host
                    tag="input"
                    className="input tabular"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </Field>
              )}
              <Btn
                disabled={!phone}
                onClick={() => {
                  act.inviteUser(
                    org.id,
                    name,
                    phone,
                    role,
                    role === 'approver' ? Number(limit) : undefined,
                  );
                  setPhone('');
                  setName('');
                }}
              >
                Send invite
              </Btn>
            </Host>
          </Host>
        )}
        {users.map((u) => (
          <Host
            tag="div"
            key={u.id}
            className="item"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: u.status === 'deactivated' ? 'var(--steel-ink)' : undefined,
            }}
          >
            <Host tag="div">
              <Host tag="div" className="h16">
                {u.name}
              </Host>
              <Host tag="div" className="cap">
                {u.roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(' · ')}
                {u.limit !== undefined ? ` · limit ${ghs(u.limit)}` : ''}
                {u.status === 'invited'
                  ? ' · invited, not yet signed in'
                  : u.status === 'deactivated'
                    ? ' · deactivated'
                    : ''}
              </Host>
            </Host>
            {u.id === user.id ? (
              <Host tag="span" className="cap">
                You
              </Host>
            ) : u.status === 'invited' ? (
              <Chip>Invited</Chip>
            ) : u.status === 'deactivated' ? (
              isAdmin ? (
                <Host
                  tag="button"
                  style={{
                    fontWeight: 600,
                    color: 'var(--blue)',
                  }}
                  onClick={() =>
                    act.updateUser(u.id, {
                      status: 'active',
                    })
                  }
                >
                  Reactivate
                </Host>
              ) : null
            ) : isAdmin ? (
              <Host
                tag="button"
                className="btn btn-secondary btn-md"
                onClick={() => {
                  setEdit(u.id);
                  setElimit(String(u.limit ?? ''));
                  setErole(u.roles[0]);
                }}
              >
                Edit
              </Host>
            ) : null}
          </Host>
        ))}
        <Host tag="div" className="cap">
          Every buyer sets these themselves. CryoChain does not administer another company's staff
          list.
        </Host>
        <Sheet open={!!eu} onClose={() => setEdit(null)} title={`Edit · ${eu?.name}`}>
          <Field label="Role">
            <Host
              tag="select"
              className="input"
              value={erole}
              onChange={(e) => setErole(e.target.value as typeof erole)}
            >
              <Host tag="option" value="viewer">
                Viewer
              </Host>
              <Host tag="option" value="requester">
                Requester
              </Host>
              <Host tag="option" value="approver">
                Approver
              </Host>
              <Host tag="option" value="admin">
                Admin
              </Host>
            </Host>
          </Field>
          {(erole === 'approver' || erole === 'admin') && (
            <Field label="Approval limit, GHS per order">
              <Host
                tag="input"
                className="input tabular"
                value={elimit}
                onChange={(e) => setElimit(e.target.value)}
              />
            </Field>
          )}
          <Btn
            onClick={() => {
              if (eu)
                act.updateUser(eu.id, {
                  roles: erole === 'admin' ? ['admin', 'approver'] : [erole],
                  limit: elimit ? Number(elimit) : undefined,
                });
              setEdit(null);
            }}
          >
            Save
          </Btn>
          <Btn
            kind="link-danger"
            onClick={() => {
              if (eu)
                act.updateUser(eu.id, {
                  status: 'deactivated',
                });
              setEdit(null);
            }}
          >
            Deactivate
          </Btn>
        </Sheet>
      </Host>
    </Shell>
  );
}
function Deliveries() {
  const { orders } = useBuyer();
  const list = orders.filter((o) => o.deliveredAt);
  return (
    <Shell>
      <TopBar title="Deliveries" />
      <Host tag="div" className="body">
        {list.length === 0 ? (
          <Empty
            title="No deliveries yet."
            sub="Orders show here once they have been delivered."
          />
        ) : null}
        {list.map((o) => (
          <Link key={o.id} to={`/buyer/o/${o.id}`} className="item">
            <Host tag="div" className="row">
              <Host tag="span" className="h16">
                {o.id}
              </Host>
              <Chip tone={ORDER_TONE[shownStatus(o)]}>{ORDER_LABEL[shownStatus(o)]}</Chip>
            </Host>
            <Host tag="div" className="row cap">
              <Host tag="span">
                Delivered {o.deliveredAt ? fmtStamp(o.deliveredAt) : ''} · {o.receiver}
              </Host>
              <Host tag="span">
                {o.handoverTemp !== undefined ? `${o.handoverTemp.toFixed(1)} °C at handover` : ''}
              </Host>
            </Host>
          </Link>
        ))}
      </Host>
    </Shell>
  );
}
function TempRecords() {
  const { orders } = useBuyer();
  const list = orders.filter((o) => o.runId);
  return (
    <Shell>
      <TopBar title="Temperature records" />
      <Host tag="div" className="body">
        {list.length === 0 ? (
          <Empty
            title="No temperature records yet."
            sub="Readings show here once an order is on a truck."
          />
        ) : null}
        {list.map((o) => (
          <Link key={o.id} to={`/buyer/o/${o.id}/temperature`} className="item">
            <Host tag="div" className="row">
              <Host tag="span" className="h16">
                {o.id}
              </Host>
              <Host tag="span" className="cap">
                {fmtDayLong(o.deliveryDate)}
              </Host>
            </Host>
            <Host tag="div" className="cap">
              {o.lines.map((l) => l.name.split(',')[0]).join(', ')}
            </Host>
          </Link>
        ))}
      </Host>
    </Shell>
  );
}
function BuyerEntry() {
  const { state } = useStore();
  const user = state.buyerUsers.find((u) => u.id === state.session.buyerUserId);
  if (!user) return <Register />;
  const org = state.orgs.find((o) => o.id === user.orgId);
  if (!org || org.status === 'pending') return <Navigate to="/buyer/pending" />;
  return <Navigate to="/buyer/new-order" />;
}
export function kgLabel(n: number) {
  return kg(n);
}
export default function BuyerApp() {
  return (
    <Routes>
      <Route index element={<BuyerEntry />} />
      <Route path="code" element={<Code />} />
      <Route path="register" element={<Register />} />
      <Route path="pending" element={<Pending />} />
      <Route path="new-order" element={<Home />} />
      <Route path="home" element={<Navigate to="/buyer/new-order" />} />
      <Route path="c/:id" element={<Category />} />
      <Route path="p/:id" element={<Product />} />
      <Route path="summary" element={<Summary />} />
      <Route path="orders" element={<Orders />} />
      <Route path="deliveries" element={<Deliveries />} />
      <Route path="temperature" element={<TempRecords />} />
      <Route path="o/:id" element={<OrderDetail />} />
      <Route path="o/:id/pay" element={<PayPage />} />
      <Route path="o/:id/temperature" element={<Temperature />} />
      <Route path="payments" element={<Payments />} />
      <Route path="users" element={<Users />} />
      <Route path="*" element={<Navigate to="/buyer" />} />
    </Routes>
  );
}
