import { Host } from '../../ui/host';
import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../../domain/store';
import type { Device, Exception, Order, Run, Settlement } from '../../domain/types';
import {
  CONS_LABEL,
  CONS_TONE,
  ORDER_LABEL,
  ORDER_TONE,
  PR_LABEL,
  PR_TONE,
  SETT_LABEL,
  SETT_TONE,
  TR_LABEL,
  TR_TONE,
  approvalsNeeded,
  assignedStaffName,
  canApprove,
  approvalStillOpen,
  payoutRequiresTwo,
  fmtDay,
  fmtStamp,
  ghs,
  allocationClosed,
  lineCoverage,
  maskMomo,
  round2,
  runAssignedTo,
} from '../../domain/logic';
import {
  Btn,
  Chip,
  Countdown,
  Empty,
  Field,
  KV,
  Money,
  Sheet,
  Stamped,
  Stepper,
} from '../../ui/kit';
import { Desk } from '../../layouts/shells';
import { colors } from '../../ui/theme';
import { TeamFields } from '../../backend/Team';
import { remoteEnabled } from '../../backend/config';
import { payoutPreflight, resolveWallet, verifyTransfer } from '../../backend/remote';
import { downloadCsv } from '../buyer/Buyer';
import { capturePhoto } from '../../backend/media';
const NAV = [
  {
    to: '/ops',
    label: 'Order book',
    end: true,
    group: 'Trade',
  },
  {
    to: '/ops/catalog',
    label: 'Product listing',
    group: 'Trade',
  },
  {
    to: '/ops/runs',
    label: 'Runs',
    group: 'Trade',
  },
  {
    to: '/ops/capture',
    label: 'Capture arriving',
    group: 'Trade',
  },
  {
    to: '/ops/deliveries',
    label: 'Deliveries',
    group: 'Trade',
  },
  {
    to: '/ops/settlements',
    label: 'Settlements',
    group: 'Money',
  },
  {
    to: '/ops/payouts',
    label: 'Payout runs',
    group: 'Money',
  },
  {
    to: '/ops/exceptions',
    label: 'Exceptions',
    group: 'Control',
  },
  {
    to: '/ops/buyers',
    label: 'Buyers',
    group: 'Control',
  },
  {
    to: '/ops/farmers',
    label: 'Farmers',
    group: 'Control',
  },
  {
    to: '/ops/config',
    label: 'Config',
    group: 'Control',
  },
  {
    to: '/ops/sync',
    label: 'Sync health',
    group: 'Control',
  },
  {
    to: '/ops/messages',
    label: 'Messages',
    group: 'Control',
  },
  {
    to: '/ops/audit',
    label: 'Audit',
    group: 'Control',
  },
  {
    to: '/ops/team',
    label: 'Team access',
    group: 'Control',
  },
];
function useOps() {
  const { state, act, now, getState } = useStore();
  const me = state.opsUsers.find((u) => u.id === state.session.opsUserId)!;
  const openEx = state.exceptions.filter(
    (e) => e.status === 'open' || e.status === 'in_progress',
  ).length;
  return {
    state,
    act,
    now,
    me,
    openEx,
    isApprover: state.config.approverIds.includes(me.id),
    getState,
  };
}
function Shell({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const { me, openEx } = useOps();
  return (
    <Desk
      nav={NAV.map((n) =>
        n.to === '/ops/exceptions' && openEx
          ? {
              ...n,
              label: `Exceptions · ${openEx}`,
            }
          : n,
      )}
      footer={
        <>
          Nsawam node
          <Host tag="br" />
          {me.name} · {me.title}
        </>
      }
    >
      <Host tag="div" className="row">
        <Host tag="span" className="h20">
          {title}
        </Host>
        {right}
      </Host>
      {children}
    </Desk>
  );
}
type ColSize = { flex: number; minWidth: number };

function columnFor(label: string, numeric: boolean): ColSize {
  const name = label.trim().toLowerCase();
  if (numeric) return { flex: 0.7, minWidth: 72 };
  if (
    /body|detail|note|buyer|farmer|product|receiver|organisation|wallet|reference|payment method|dedicated|flags|lines|message|contact/.test(
      name,
    )
  )
    return { flex: 2.2, minWidth: 150 };
  if (
    /when|date|time|sent|captured|delivered|received|occurred|deadline|last sync|cold box/.test(
      name,
    )
  )
    return { flex: 1.15, minWidth: 112 };
  if (
    /status|grade|role|tier|seq|photo|photos|size|app|online|sync|type|stops|orders|users|country|action|source|code|pending/.test(
      name,
    )
  )
    return { flex: 0.85, minWidth: 80 };
  if (name.length <= 6) return { flex: 0.75, minWidth: 72 };
  return { flex: 1, minWidth: 96 };
}

function sizeRow(row: ReactNode, cols: ColSize[]) {
  if (!isValidElement(row)) return row;
  const cells = (row.props as { children?: ReactNode }).children;
  return cloneElement(row, {
    children: Children.map(cells, (cell, i) => {
      if (!isValidElement(cell) || !cols[i]) return cell;
      const prev = (cell.props as { style?: object }).style ?? {};
      return cloneElement(cell as ReactElement<{ style?: object }>, {
        style: { ...cols[i], ...prev },
      });
    }),
  } as { children: ReactNode });
}

const Tbl = ({
  head,
  children,
  foot,
  empty,
  cols,
}: {
  head: ReactNode[];
  children: ReactNode;
  foot?: ReactNode;
  empty?: ReactNode;
  cols?: ColSize[];
}) => {
  const rows = Children.toArray(children).filter(Boolean);
  const widths =
    cols ??
    head.map((cell) =>
      columnFor(
        typeof cell === 'string' ? cell.replace(/^#/, '') : '',
        typeof cell === 'string' && cell.startsWith('#'),
      ),
    );
  const sized = rows.map((row) => sizeRow(row, widths));
  return (
    <Host tag="div" className="tbl">
      <Host tag="table">
        <Host tag="thead">
          <Host tag="tr" className="head">
            {head.map((h, i) => (
              <Host
                tag="th"
                key={i}
                className={typeof h === 'string' && h.startsWith('#') ? 'num' : ''}
                style={widths[i]}
              >
                {typeof h === 'string' ? h.replace(/^#/, '') : h}
              </Host>
            ))}
          </Host>
        </Host>
        {sized.length ? (
          <Host tag="tbody">{sized}</Host>
        ) : (
          <Host
            tag="div"
            className="empty"
            style={{ paddingVertical: 32, paddingHorizontal: 20, width: '100%' }}
          >
            <Host tag="div" className="cap" style={{ textAlign: 'center', maxWidth: 460 }}>
              {empty ?? 'Nothing to show.'}
            </Host>
          </Host>
        )}
      </Host>
      {foot && sized.length > 0 ? (
        <Host
          tag="div"
          className="cap"
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: colors.lineSoft,
          }}
        >
          {foot}
        </Host>
      ) : null}
    </Host>
  );
};
function orgName(state: ReturnType<typeof useOps>['state'], id: string) {
  return state.orgs.find((o) => o.id === id)?.name ?? id;
}
function coverage(state: ReturnType<typeof useOps>['state'], o: Order) {
  const per = o.lines.map((l) =>
    lineCoverage(
      l,
      state.consignments.filter((c) => c.lineId === l.id),
    ),
  );
  const short = per.some((p) => p.shortfall > 0);
  const any = state.consignments.some((c) => c.orderId === o.id);
  return {
    any,
    short,
    label: !any ? 'Pending' : short ? 'Short' : 'Allocated',
    tone: (!any ? 'neutral' : short ? 'warn' : 'info') as 'neutral' | 'warn' | 'info',
  };
}
const ORDER_COLS = [
  { flex: 0.7, minWidth: 72 },
  { flex: 2.6, minWidth: 160 },
  { flex: 1, minWidth: 96 },
  { flex: 0.9, minWidth: 88 },
  { flex: 1.1, minWidth: 108 },
  { flex: 1.05, minWidth: 104 },
  { flex: 0.75, minWidth: 72 },
];

function inThisWeek(iso: string) {
  const day = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(day.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return day >= start && day < end;
}

function OrderBook() {
  const { state } = useOps();
  const [f, setF] = useState<'Open' | 'All'>('Open');
  const [when, setWhen] = useState<'week' | 'all'>('all');
  const open = [
    'paid',
    'allocated',
    'in_collection',
    'delivered',
    'held',
    'awaiting_payment',
    'submitted',
    'approved',
  ];
  const list = state.orders
    .filter((o) => f === 'All' || open.includes(o.status))
    .filter((o) => when === 'all' || inThisWeek(o.deliveryDate))
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  return (
    <Shell
      title="Order book"
      right={
        <>
          <Btn kind="secondary" md to="/ops/catalog">
            Product listing
          </Btn>
        <Host
          tag="button"
          className="f btn btn-secondary btn-md"
          onClick={() =>
            downloadCsv(
              'order-book.csv',
              list.map((o) => ({
                order: o.id,
                buyer: orgName(state, o.orgId),
                delivery: o.deliveryDate,
                total: o.total,
                status: ORDER_LABEL[o.status],
              })),
            )
          }
        >
          Export CSV
        </Host>
        </>
      }
    >
      <Host tag="div" className="toolbar">
        <Host
          tag="button"
          className={`f${f === 'Open' ? ' on' : ''}`}
          onClick={() => setF((x) => (x === 'Open' ? 'All' : 'Open'))}
        >
          Status: {f} {f === 'Open' ? '×' : '▾'}
        </Host>
        <Host
          tag="button"
          className={`f${when === 'week' ? ' on' : ''}`}
          onClick={() => setWhen((value) => (value === 'week' ? 'all' : 'week'))}
        >
          Delivery date: {when === 'week' ? 'This week ×' : 'All ▾'}
        </Host>
      </Host>
      <Tbl
        cols={ORDER_COLS}
        head={['Order', 'Buyer', 'Delivery ↓', '#Total GHS', 'Payment', 'Allocation', 'Run']}
        foot={`${list.length} ${list.length === 1 ? 'order' : 'orders'}`}
        empty={
          when === 'week'
            ? 'No orders are booked for delivery this week.'
            : f === 'Open'
              ? 'No open orders. Submitted, paid, and in-progress orders show here.'
              : 'No orders yet.'
        }
      >
        {list.map((o) => {
          const c = coverage(state, o);
          return (
            <Host tag="tr" key={o.id}>
              <Host tag="td">
                <Link to={`/ops/allocation/${o.id}`}>{o.id}</Link>
              </Host>
              <Host tag="td">
                {orgName(state, o.orgId)}
                <Host tag="div" className="cap">
                  {o.lines.map((l) => `${l.name.split(',')[0]} ${l.qtyKg} kg`).join(', ')}
                </Host>
              </Host>
              <Host tag="td">{fmtDay(o.deliveryDate)}</Host>
              <Host tag="td" className="num">
                {o.total.toLocaleString('en-GH', {
                  minimumFractionDigits: 2,
                })}
              </Host>
              <Host tag="td">
                <Chip tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Chip>
              </Host>
              <Host tag="td">
                {['paid', 'allocated', 'in_collection', 'delivered', 'closed'].includes(
                  o.status,
                ) ? (
                  <Chip tone={c.tone}>{c.label}</Chip>
                ) : (
                  <Host tag="span" className="cap">
                    Not paid
                  </Host>
                )}
              </Host>
              <Host tag="td">
                {o.runId ? (
                  <Link to={`/ops/runs/${o.runId}`}>{o.runId}</Link>
                ) : (
                  <Host tag="span" className="cap">
                    —
                  </Host>
                )}
              </Host>
            </Host>
          );
        })}
      </Tbl>
    </Shell>
  );
}
function Allocation() {
  const { id } = useParams();
  const { state, act, getState } = useOps();
  const o = state.orders.find((x) => x.id === id);
  const [rows, setRows] = useState<
    Record<
      string,
      {
        farmerId: string;
        kg: string;
        price: string;
      }[]
    >
  >({});
  if (!o) return <Navigate to="/ops" />;
  const run = state.runs.find((r) => r.id === o.runId);
  const handedOver = allocationClosed(o.status, run?.status);
  const paid =
    ['paid', 'allocated', 'in_collection', 'delivered', 'closed'].includes(o.status) &&
    !handedOver;
  return (
    <Shell
      title={`${o.id} · ${orgName(state, o.orgId)}`}
      right={
        <Chip lg tone={ORDER_TONE[o.status]}>
          {ORDER_LABEL[o.status]}
        </Chip>
      }
    >
      <Host
        tag="div"
        className="row"
        style={{
          fontSize: 13,
        }}
      >
        <Host tag="span" className="muted">
          Delivery {fmtDay(o.deliveryDate)} · {o.address} · paid{' '}
          {o.paidAt ? fmtStamp(o.paidAt) : 'not yet'} · allocation v{o.allocationVersion}
          {run ? (
            <>
              {' '}
              · run <Link to={`/ops/runs/${run.id}`}>{run.id}</Link>
            </>
          ) : (
            ''
          )}
        </Host>
        <Money v={o.total} />
      </Host>
      {!paid && !handedOver && (
        <Host tag="div" className="tint-amber">
          Allocation only from paid orders. This one is {ORDER_LABEL[o.status].toLowerCase()}.
        </Host>
      )}
      {(o.status === 'awaiting_payment' || o.status === 'held') && (
        <Host tag="div" className="card card-pad col gap8">
          <Host tag="div" className="cap">
            Card and mobile money are confirmed by the Paystack webhook. For a bank transfer,
            confirm here only after the statement shows the full amount with this order as the
            reference.
          </Host>
          <Btn md onClick={() => act.confirmBankPayment(o.id, o.total)}>
            Confirm {ghs(o.total)} received
          </Btn>
        </Host>
      )}
      {o.lines.map((l) => {
        const cs = state.consignments
          .filter((c) => c.lineId === l.id)
          .sort((a, b) => a.version - b.version);
        const cov = lineCoverage(l, cs);
        const pct = Math.min(100, Math.round((cov.covered / l.qtyKg) * 100));
        const avail = state.availability.filter((a) => a.productId === l.productId);
        const draft = rows[l.id] ?? [];
        const setDraft = (d: typeof draft) =>
          setRows((r) => ({
            ...r,
            [l.id]: d,
          }));
        const guide = state.config.farmGatePrice[l.productId] ?? round2(l.unitPrice / 2);
        const already = new Set(
          cs
            .filter((c) => c.status !== 'cancelled' && c.status !== 'declined')
            .map((c) => c.farmerId),
        );
        const suggestions = state.farmers
          .filter((f) => !already.has(f.id) && !draft.some((d) => d.farmerId === f.id))
          .map((f) => ({
            f,
            av: avail.find((a) => a.farmerId === f.id),
          }))
          .sort((a, b) => (b.av ? 1 : 0) - (a.av ? 1 : 0));
        const tol = state.config.tolerancePct;
        return (
          <Host
            tag="div"
            key={l.id}
            className="card"
            style={{
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <Host tag="div" className="row">
              <Host tag="div">
                <Host tag="div" className="h16">
                  {l.name}, grade {l.grade} · {l.qtyKg} kg
                </Host>
                <Host tag="div" className="cap">
                  Buyer price {l.unitPrice.toFixed(2)} / kg · farm gate guide {guide.toFixed(2)} /
                  kg · tolerance {tol}%
                </Host>
              </Host>
              <Host
                tag="div"
                style={{
                  textAlign: 'right',
                }}
              >
                <Host
                  tag="div"
                  style={{
                    fontWeight: 600,
                  }}
                  className="tabular"
                >
                  {cov.covered} / {l.qtyKg} kg
                </Host>
                <Host tag="div" className="cap">
                  {cov.shortfall > 0 ? (
                    <Host
                      tag="span"
                      style={{
                        color: 'var(--amber)',
                        fontWeight: 600,
                      }}
                    >
                      Shortfall {cov.shortfall} kg
                    </Host>
                  ) : (
                    'Covered'
                  )}
                </Host>
              </Host>
            </Host>
            <Host
              tag="div"
              style={{
                height: 8,
                background: 'var(--line-soft)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <Host
                tag="div"
                style={{
                  width: pct + '%',
                  height: '100%',
                  background: cov.shortfall > 0 ? 'var(--amber)' : 'var(--green)',
                }}
              />
            </Host>
            {cs.length > 0 && (
              <Tbl
                head={[
                  'Farmer',
                  'Village',
                  '#Planned kg',
                  '#Captured kg',
                  '#Price / kg',
                  'Status',
                  'Version',
                ]}
              >
                {cs.map((c) => {
                  const f = state.farmers.find((x) => x.id === c.farmerId)!;
                  return (
                    <Host tag="tr" key={c.id}>
                      <Host tag="td">
                        {f.name}
                        {c.adHoc && (
                          <>
                            {' '}
                            <Chip tone="warn">Ad hoc</Chip>
                          </>
                        )}
                      </Host>
                      <Host tag="td">{f.village}</Host>
                      <Host tag="td" className="num">
                        {c.plannedKg}
                      </Host>
                      <Host tag="td" className="num">
                        {c.farmGateKg ?? '—'}
                        {c.short && (
                          <>
                            {' '}
                            <Chip tone="warn">Short</Chip>
                          </>
                        )}
                      </Host>
                      <Host tag="td" className="num">
                        {c.pricePerKg.toFixed(2)}
                      </Host>
                      <Host tag="td">
                        <Chip tone={CONS_TONE[c.status]}>{CONS_LABEL[c.status]}</Chip>
                        {c.pendingSync && (
                          <Host tag="span" className="cap">
                            {' '}
                            pending sync
                          </Host>
                        )}
                      </Host>
                      <Host tag="td" className="cap">
                        v{c.version}
                      </Host>
                    </Host>
                  );
                })}
              </Tbl>
            )}
            {paid && (
              <Host tag="div" className="col gap8">
                <Host tag="div" className="lbl">
                  {cs.length ? 'Re-cut: add farmers for the shortfall' : 'Allocate across farmers'}
                </Host>
                {draft.map((d, i) => {
                  const f = state.farmers.find((x) => x.id === d.farmerId)!;
                  return (
                    <Host
                      tag="div"
                      key={i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 120px 120px 40px',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Host tag="div">
                        <Host
                          tag="div"
                          style={{
                            fontWeight: 600,
                          }}
                        >
                          {f.name}
                        </Host>
                        <Host tag="div" className="cap">
                          {f.village} · {f.tier} wallet
                          {f.walletBad ? ' · wallet flagged' : ''}
                        </Host>
                      </Host>
                      <Host
                        tag="input"
                        className="input tabular"
                        style={{
                          height: 40,
                        }}
                        value={d.kg}
                        onChange={(e) =>
                          setDraft(
                            draft.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    kg: e.target.value.replace(/[^0-9.]/g, ''),
                                  }
                                : x,
                            ),
                          )
                        }
                        placeholder="kg"
                      />
                      <Host
                        tag="input"
                        className="input tabular"
                        style={{
                          height: 40,
                        }}
                        value={d.price}
                        onChange={(e) =>
                          setDraft(
                            draft.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    price: e.target.value.replace(/[^0-9.]/g, ''),
                                  }
                                : x,
                            ),
                          )
                        }
                        placeholder="price"
                      />
                      <Host
                        tag="button"
                        className="muted"
                        onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                      >
                        ✕
                      </Host>
                    </Host>
                  );
                })}
                <Host
                  tag="div"
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {suggestions.slice(0, 8).map(({ f, av }) => (
                    <Host
                      tag="button"
                      key={f.id}
                      className="f"
                      style={{
                        height: 36,
                        padding: '0 10px',
                        border: '1px solid var(--steel)',
                        borderRadius: 6,
                        background: av ? 'var(--mist)' : '#fff',
                        fontSize: 13,
                      }}
                      onClick={() =>
                        setDraft([
                          ...draft,
                          {
                            farmerId: f.id,
                            kg: String(
                              av
                                ? Math.min(
                                    av.expectedKg,
                                    Math.max(cov.shortfall, 0) || av.expectedKg,
                                  )
                                : '',
                            ),
                            price: String(guide),
                          },
                        ])
                      }
                    >
                      + {f.name}
                      {av ? ` · ${av.expectedKg} kg ready` : ''}
                    </Host>
                  ))}
                </Host>
                {draft.length > 0 && (
                  <Host
                    tag="div"
                    style={{
                      display: 'flex',
                      gap: 8,
                    }}
                  >
                    <Btn
                      md
                      onClick={() => {
                        const items = draft
                          .map((d) => ({
                            farmerId: d.farmerId,
                            kg: Number(d.kg),
                            price: Number(d.price),
                          }))
                          .filter((i) => i.kg > 0 && i.price > 0);
                        act.allocate(o.id, l.id, items);
                        setDraft([]);
                        if (o.runId) {
                          const r = state.runs.find((x) => x.id === o.runId);
                          if (r && r.status !== 'closed' && r.status !== 'delivered') {
                            const fresh = getState();
                            const news = fresh.consignments.filter(
                              (c) => c.orderId === o.id && !c.runId && c.status === 'planned',
                            );
                            news.forEach((c) => act.addToRun(o.runId!, c.id));
                          }
                        }
                      }}
                    >
                      {cs.length ? `Save re-cut (v${o.allocationVersion + 1})` : 'Save allocation'}
                    </Btn>
                    {o.runId && (
                      <Host tag="span" className="cap">
                        New consignments join {o.runId} as extra stops. Each farmer gets an SMS with
                        date and price.
                      </Host>
                    )}
                  </Host>
                )}
              </Host>
            )}
          </Host>
        );
      })}
    </Shell>
  );
}
function handsets(devices: Device[], role: Device['role']) {
  return devices.filter((d) => d.role === role);
}

function Runs() {
  const { state, act } = useOps();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [truck, setTruck] = useState('GS 2140-26');
  const drivers = handsets(state.devices, 'driver');
  const agents = handsets(state.devices, 'agent');
  const [driverId, setDriverId] = useState('');
  const [agentId, setAgentId] = useState('');
  const unassigned = state.consignments.filter((c) => !c.runId && c.status === 'planned');
  const byOrder = [...new Set(unassigned.map((c) => c.orderId))];
  const orgOf = (cid: string) =>
    state.orgs.find(
      (x) =>
        x.id ===
        state.orders.find((o) => o.id === state.consignments.find((c) => c.id === cid)!.orderId)!
          .orgId,
    )!;
  return (
    <Shell
      title="Collection runs"
      right={
        <Btn
          md
          onClick={() => {
            setSel(unassigned.map((c) => c.id));
            setDriverId((current) =>
              drivers.some((d) => d.id === current) ? current : (drivers[0]?.id ?? ''),
            );
            setAgentId((current) =>
              agents.some((d) => d.id === current) ? current : (agents[0]?.id ?? ''),
            );
            setOpen(true);
          }}
          disabled={!unassigned.length}
        >
          New run
          {unassigned.length ? ` · ${unassigned.length} consignments waiting` : ''}
        </Btn>
      }
    >
      <Tbl head={['Run', 'Date', 'Truck', 'Driver', 'Agent', 'Stops', 'Orders', 'Status']}>
        {[...state.runs]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((r) => (
            <Host tag="tr" key={r.id}>
              <Host tag="td">
                <Link to={`/ops/runs/${r.id}`}>{r.id}</Link>
              </Host>
              <Host tag="td">{fmtDay(r.date)}</Host>
              <Host tag="td">{r.truck}</Host>
              <Host tag="td">{assignedStaffName(state.devices, r.driverId)}</Host>
              <Host tag="td">{assignedStaffName(state.devices, r.agentId)}</Host>
              <Host tag="td">{r.stops.filter((s) => s.kind === 'farm').length} farms</Host>
              <Host tag="td">
                {[
                  ...new Set(r.stops.flatMap((s) => s.orderIds ?? (s.orderId ? [s.orderId] : []))),
                ].join(', ')}
              </Host>
              <Host tag="td">
                <Chip
                  tone={
                    r.status === 'in_progress'
                      ? 'info'
                      : r.status === 'delivered'
                        ? 'ok'
                        : 'neutral'
                  }
                >
                  {r.status.replace('_', ' ')}
                </Chip>
              </Host>
            </Host>
          ))}
      </Tbl>
      <Sheet open={open} onClose={() => setOpen(false)} title="Build a run">
        <Field label="Truck">
          <Host
            tag="select"
            className="input"
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
          >
            <Host tag="option">GS 2140-26</Host>
            <Host tag="option">GS 2141-26</Host>
          </Host>
        </Field>
        <Field label="Driver">
          <Host
            tag="select"
            className="input"
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
          >
            {drivers.length === 0 ? (
              <Host tag="option" value="">
                No driver linked yet
              </Host>
            ) : null}
            {drivers.map((d) => (
              <Host key={d.id} tag="option" value={d.id}>
                {d.userName}
              </Host>
            ))}
          </Host>
        </Field>
        <Field label="Field agent">
          <Host
            tag="select"
            className="input"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          >
            {agents.length === 0 ? (
              <Host tag="option" value="">
                No field agent linked yet
              </Host>
            ) : null}
            {agents.map((d) => (
              <Host key={d.id} tag="option" value={d.id}>
                {d.userName}
              </Host>
            ))}
          </Host>
        </Field>
        {!drivers.length || !agents.length ? (
          <Host tag="div" className="tint-amber">
            Link a field agent and a driver from Team access before publishing a run. The manifest
            goes only to the handsets you pick here.
          </Host>
        ) : null}
        <Host tag="div" className="lbl">
          Consignments (in stop order)
        </Host>
        {byOrder.map((oid) => (
          <Host tag="div" key={oid} className="card" style={{ width: '100%', overflow: 'hidden' }}>
            <Host
              tag="div"
              style={{
                fontWeight: 600,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: colors.lineSoft,
              }}
            >
              {oid} · {orgName(state, state.orders.find((o) => o.id === oid)!.orgId)}
            </Host>
            {unassigned
              .filter((c) => c.orderId === oid)
              .map((c) => {
                const farmer = state.farmers.find((f) => f.id === c.farmerId);
                return (
                  <Host
                    tag="div"
                    key={c.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.line,
                    }}
                  >
                    <Host
                      tag="input"
                      type="checkbox"
                      checked={sel.includes(c.id)}
                      onChange={(e) =>
                        setSel((s) =>
                          e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id),
                        )
                      }
                    />
                    <Host tag="div" style={{ flex: 1, minWidth: 0 }}>
                      <Host tag="div" style={{ fontWeight: 600 }}>
                        {farmer?.name ?? 'Farmer'}
                      </Host>
                      <Host tag="div" className="cap">
                        {`${c.productName} · ${c.plannedKg} kg`}
                      </Host>
                    </Host>
                    <Host tag="div" className="cap">
                      {farmer?.village ?? ''}
                    </Host>
                  </Host>
                );
              })}
          </Host>
        ))}
        <Btn
          disabled={!sel.length || !driverId || !agentId}
          onClick={() => {
            const org = orgOf(sel[0]);
            act.createRun({
              date: state.orders.find(
                (o) => o.id === state.consignments.find((c) => c.id === sel[0])!.orderId,
              )!.deliveryDate,
              truck,
              driverId,
              agentId,
              consignmentIds: sel,
              deliveryLabel: org.name,
              deliveryAddress: org.address,
            });
            setOpen(false);
          }}
        >
          Create run and publish manifest
        </Btn>
      </Sheet>
    </Shell>
  );
}
function linkedHandset(devices: Device[], role: Device['role'], assigned: string) {
  return devices.find((d) => d.role === role && runAssignedTo(assigned, d))?.id ?? '';
}

function RunCrew({ run }: { run: Run }) {
  const { state, act } = useOps();
  const drivers = handsets(state.devices, 'driver');
  const agents = handsets(state.devices, 'agent');
  const [driverPick, setDriverPick] = useState<string | null>(null);
  const [agentPick, setAgentPick] = useState<string | null>(null);
  const driverId = driverPick ?? linkedHandset(state.devices, 'driver', run.driverId);
  const agentId = agentPick ?? linkedHandset(state.devices, 'agent', run.agentId);
  const driverLinked = Boolean(linkedHandset(state.devices, 'driver', run.driverId));
  const agentLinked = Boolean(linkedHandset(state.devices, 'agent', run.agentId));
  return (
    <Host tag="div" className="card card-pad col gap8" style={{ maxWidth: 480 }}>
      <Host tag="div" className="lbl">
        Driver and field agent
      </Host>
      {!driverLinked || !agentLinked ? (
        <Host tag="div" className="tint-amber">
          This run is not on a linked handset, so the phones will not show it. Pick the driver and
          the field agent who should receive the manifest.
        </Host>
      ) : null}
      <Field label="Driver">
        <Host
          tag="select"
          className="input"
          value={driverId}
          onChange={(e) => setDriverPick(e.target.value)}
        >
          {drivers.length === 0 ? (
            <Host tag="option" value="">
              No driver linked yet
            </Host>
          ) : null}
          {drivers.map((d) => (
            <Host key={d.id} tag="option" value={d.id}>
              {d.userName}
            </Host>
          ))}
        </Host>
      </Field>
      <Field label="Field agent">
        <Host
          tag="select"
          className="input"
          value={agentId}
          onChange={(e) => setAgentPick(e.target.value)}
        >
          {agents.length === 0 ? (
            <Host tag="option" value="">
              No field agent linked yet
            </Host>
          ) : null}
          {agents.map((d) => (
            <Host key={d.id} tag="option" value={d.id}>
              {d.userName}
            </Host>
          ))}
        </Host>
      </Field>
      <Btn
        kind="secondary"
        disabled={
          !driverId ||
          !agentId ||
          (driverId === linkedHandset(state.devices, 'driver', run.driverId) &&
            agentId === linkedHandset(state.devices, 'agent', run.agentId))
        }
        onClick={() => act.assignRunCrew(run.id, driverId, agentId)}
      >
        Assign to these handsets
      </Btn>
    </Host>
  );
}
function RunDetail() {
  const { id } = useParams();
  const { state, act } = useOps();
  const r = state.runs.find((x) => x.id === id);
  const [reason, setReason] = useState('');
  if (!r) return <Navigate to="/ops/runs" />;
  const temps = state.temps.filter((t) => t.runId === r.id).sort((a, b) => a.at - b.at);
  return (
    <Shell
      title={`${r.id} · ${fmtDay(r.date)} · ${r.truck}`}
      right={
        <Chip
          lg
          tone={r.status === 'in_progress' ? 'info' : r.status === 'delivered' ? 'ok' : 'neutral'}
        >
          {r.status.replace('_', ' ')}
        </Chip>
      }
    >
      <Host tag="div" className="cap">
        Driver {assignedStaffName(state.devices, r.driverId)} · Agent{' '}
        {assignedStaffName(state.devices, r.agentId)} · range {r.tempMin} to {r.tempMax} °C ·
        position {r.positionOn ? 'on' : 'off'}
        {r.position ? ` · ${r.position.lat.toFixed(5)}, ${r.position.lng.toFixed(5)}` : ''}
      </Host>
      {r.status === 'planned' ? <RunCrew key={r.id} run={r} /> : null}
      <Tbl
        head={[
          '#',
          'Stop',
          'Window',
          'Arrived',
          'Collected / delivered',
          'Departed',
          'Consignments',
        ]}
      >
        {r.stops.map((s) => (
          <Host tag="tr" key={s.seq}>
            <Host tag="td">{s.seq}</Host>
            <Host tag="td">
              {s.kind === 'farm' ? state.farmers.find((f) => f.id === s.farmerId)?.name : s.label}
              <Host tag="div" className="cap">
                {s.address}
              </Host>
            </Host>
            <Host tag="td">{s.window}</Host>
            <Host tag="td">{s.arrivedAt ? <Stamped t={s.arrivedAt} /> : '—'}</Host>
            <Host tag="td">
              {s.collectedAt ? (
                <Stamped t={s.collectedAt} />
              ) : s.deliveredAt ? (
                <Stamped t={s.deliveredAt} />
              ) : (
                '—'
              )}
            </Host>
            <Host tag="td">{s.departedAt ? <Stamped t={s.departedAt} /> : '—'}</Host>
            <Host tag="td">
              {s.kind === 'farm'
                ? state.consignments
                    .filter((c) => c.runId === r.id && c.stopSeq === s.seq)
                    .map((c) => (
                      <Host tag="div" key={c.id}>
                        {c.productName} {c.farmGateKg ?? c.plannedKg} kg{' '}
                        <Chip tone={CONS_TONE[c.status]}>{CONS_LABEL[c.status]}</Chip>
                      </Host>
                    ))
                : (s.orderIds ?? []).join(', ')}
            </Host>
          </Host>
        ))}
      </Tbl>
      <Host tag="div" className="h16">
        Temperature checkpoints
      </Host>
      <Tbl head={['Checkpoint', '#°C', 'Time', 'Source', 'Photo', 'Note']}>
        {temps.map((t) => (
          <Host
            tag="tr"
            key={t.id}
            style={
              t.outOfRange
                ? {
                    background: 'var(--red-tint)',
                  }
                : undefined
            }
          >
            <Host tag="td">{t.label}</Host>
            <Host
              tag="td"
              className="num"
              style={{
                fontWeight: 600,
                color: t.outOfRange ? 'var(--red)' : undefined,
              }}
            >
              {t.valueC.toFixed(1)}
            </Host>
            <Host tag="td">{fmtStamp(t.at)}</Host>
            <Host tag="td">
              <Chip outline>{t.source === 'manual' ? 'Manual' : 'Device'}</Chip>
            </Host>
            <Host tag="td">{t.photo ? '✓' : '—'}</Host>
            <Host tag="td" className="cap">
              {t.outOfRange ? 'Out of range. ' : ''}
              {t.note ?? ''}
            </Host>
          </Host>
        ))}
      </Tbl>
      {r.status !== 'closed' && (
        <Host
          tag="div"
          className="card card-pad col gap8"
          style={{
            maxWidth: 480,
          }}
        >
          <Host tag="div" className="lbl">
            Close without delivery (reason required)
          </Host>
          <Host
            tag="input"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Truck breakdown at Fotobi, produce moved to node cold store"
          />
          <Btn kind="secondary" disabled={!reason} onClick={() => act.closeRun(r.id, reason)}>
            Close run
          </Btn>
          <Host tag="div" className="cap">
            Farmer settlements on this run become payable now. CryoChain owns the crop from the cold
            box.
          </Host>
        </Host>
      )}
    </Shell>
  );
}
function Capture() {
  const { state, act } = useOps();
  const list = state.consignments
    .filter((c) => c.capturedAt && !c.pendingSync)
    .sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0));
  const pending = state.consignments.filter((c) => c.capturedAt && c.pendingSync).length;
  return (
    <Shell
      title="Capture arriving"
      right={
        pending ? (
          <Chip tone="warn" lg>
            {pending} still on a device
          </Chip>
        ) : undefined
      }
    >
      <Tbl
        head={[
          'Captured',
          'Farmer',
          'Order',
          'Product',
          '#Planned',
          '#Farm gate',
          'Grade',
          'Photos',
          'Cold box',
          'Flags',
        ]}
      >
        {list.map((c) => {
          const f = state.farmers.find((x) => x.id === c.farmerId)!;
          return (
            <Host tag="tr" key={c.id}>
              <Host tag="td">{c.capturedAt ? fmtStamp(c.capturedAt) : ''}</Host>
              <Host tag="td">
                {f.name}
                <Host tag="div" className="cap">
                  {f.village}
                </Host>
              </Host>
              <Host tag="td">
                <Link to={`/ops/allocation/${c.orderId}`}>{c.orderId}</Link>
              </Host>
              <Host tag="td">{c.productName}</Host>
              <Host tag="td" className="num">
                {c.plannedKg}
              </Host>
              <Host
                tag="td"
                className="num"
                style={{
                  fontWeight: 600,
                }}
              >
                {c.farmGateKg}
              </Host>
              <Host tag="td">{c.grade}</Host>
              <Host tag="td">{c.photos.length} ✓</Host>
              <Host tag="td">
                {c.coldBoxAt ? <Stamped t={c.coldBoxAt} /> : <Chip>Not yet</Chip>}
              </Host>
              <Host
                tag="td"
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                {c.short && <Chip tone="warn">Short</Chip>}
                {c.adHoc && !c.adHocConfirmed && (
                  <>
                    <Chip tone="warn">Ad hoc</Chip>
                    <Host
                      tag="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => act.confirmAdHoc(c.id)}
                    >
                      Confirm
                    </Host>
                  </>
                )}
                {c.adHoc && c.adHocConfirmed && <Chip tone="ok">Ad hoc confirmed</Chip>}
                <Chip tone={CONS_TONE[c.status]}>{CONS_LABEL[c.status]}</Chip>
              </Host>
            </Host>
          );
        })}
      </Tbl>
    </Shell>
  );
}
function Deliveries() {
  const { state, act } = useOps();
  const rej = state.exceptions.filter(
    (e) => e.type === 'delivery_rejection' && e.status !== 'resolved',
  );
  const [disp, setDisp] = useState<Record<string, string>>({});
  return (
    <Shell title="Deliveries">
      <Tbl head={['Delivered', 'Order', 'Buyer', 'Receiver', 'Lines', 'Handover °C']}>
        {state.orders
          .filter((o) => o.deliveredAt)
          .sort((a, b) => (b.deliveredAt ?? 0) - (a.deliveredAt ?? 0))
          .map((o) => (
            <Host tag="tr" key={o.id}>
              <Host tag="td">
                <Stamped t={o.deliveredAt!} />
              </Host>
              <Host tag="td">
                <Link to={`/ops/allocation/${o.id}`}>{o.id}</Link>
              </Host>
              <Host tag="td">{orgName(state, o.orgId)}</Host>
              <Host tag="td">{o.receiver}</Host>
              <Host tag="td">
                {o.lines.map((l) => (
                  <Host tag="div" key={l.id}>
                    {l.name} {(l.deliveredKg ?? l.qtyKg).toFixed(1)} kg
                    {l.rejectedKg ? (
                      <>
                        {' '}
                        <Chip tone="alert">Rejected {l.rejectedKg} kg</Chip>
                      </>
                    ) : (
                      ''
                    )}
                  </Host>
                ))}
              </Host>
              <Host tag="td">{o.handoverTemp?.toFixed(1) ?? '—'}</Host>
            </Host>
          ))}
      </Tbl>
      <Host tag="div" className="h16">
        Rejections awaiting disposition
      </Host>
      {rej.length === 0 && (
        <Host tag="div" className="card card-pad muted">
          None open.
        </Host>
      )}
      {rej.map((e) => {
        const o = state.orders.find((x) => x.id === e.entity?.id);
        const line = o?.lines.find((l) => l.rejectedKg && e.title.includes(l.name));
        return (
          <Host tag="div" key={e.id} className="card card-pad row">
            <Host tag="div">
              <Host
                tag="div"
                style={{
                  fontWeight: 600,
                }}
              >
                {e.title}
              </Host>
              <Host tag="div" className="cap">
                {e.detail}
              </Host>
              {line &&
                (line.credit ? (
                  <Host
                    tag="div"
                    className="cap"
                    style={{
                      color: 'var(--green)',
                    }}
                  >
                    Credit note issued: {ghs(line.credit)}
                  </Host>
                ) : (
                  <Host
                    tag="button"
                    className="btn btn-secondary btn-sm"
                    style={{
                      marginTop: 6,
                    }}
                    onClick={() => act.issueCredit(o!.id, line.id)}
                  >
                    Issue credit note {ghs(round2((line.rejectedKg ?? 0) * line.unitPrice))}
                  </Host>
                ))}
            </Host>
            <Host
              tag="div"
              style={{
                display: 'flex',
                gap: 8,
              }}
            >
              <Host
                tag="select"
                className="input"
                style={{
                  height: 40,
                  width: 200,
                }}
                value={disp[e.id] ?? 'Redirected to another buyer'}
                onChange={(ev) =>
                  setDisp((d) => ({
                    ...d,
                    [e.id]: ev.target.value,
                  }))
                }
              >
                {['Redirected to another buyer', 'Sold at node', 'Written off'].map((x) => (
                  <Host tag="option" key={x}>
                    {x}
                  </Host>
                ))}
              </Host>
              <Btn
                md
                kind="secondary"
                onClick={() =>
                  act.resolveException(
                    e.id,
                    `Disposition: ${disp[e.id] ?? 'Redirected to another buyer'}. Farmer settlement unchanged.`,
                  )
                }
              >
                Record
              </Btn>
            </Host>
          </Host>
        );
      })}
    </Shell>
  );
}
function Settlements() {
  const { state, now } = useOps();
  const [f, setF] = useState<'Open' | 'All'>('Open');
  const list = state.settlements
    .filter((s) => f === 'All' || s.status !== 'paid')
    .sort((a, b) => (a.deadlineAt ?? Infinity) - (b.deadlineAt ?? Infinity));
  return (
    <Shell
      title="Settlements"
      right={
        <Host
          tag="button"
          className="btn btn-secondary btn-md"
          onClick={() =>
            downloadCsv(
              'settlements.csv',
              list.map((s) => ({
                settlement: s.id,
                consignment: s.consignmentId,
                farmer: state.farmers.find((x) => x.id === s.farmerId)?.name,
                kg: s.payableKg,
                price: s.pricePerKg,
                net: s.net,
                status: s.status,
              })),
            )
          }
        >
          Export CSV
        </Host>
      }
    >
      <Host tag="div" className="toolbar">
        <Host
          tag="button"
          className={`f${f === 'Open' ? ' on' : ''}`}
          onClick={() => setF((x) => (x === 'Open' ? 'All' : 'Open'))}
        >
          Status: {f === 'Open' ? 'Not paid ×' : 'All ▾'}
        </Host>
        <Host tag="span" className="cap" style={{ flex: 1, minWidth: 220 }}>
          A settlement is fixed at the cold box: kg × price. It is never edited; a correction is a
          new linked record with two approvers.
        </Host>
      </Host>
      <Tbl
        head={['Settlement', 'Farmer', 'Order', '#kg', '#Price', '#Net GHS', 'Status', 'Deadline']}
        foot={`${list.length} settlements`}
      >
        {list.map((s) => {
          const f = state.farmers.find((x) => x.id === s.farmerId)!;
          const c = state.consignments.find((x) => x.id === s.consignmentId);
          return (
            <Host tag="tr" key={s.id}>
              <Host tag="td">
                {s.id}
                <Host tag="div" className="cap">
                  {c?.productName}
                </Host>
              </Host>
              <Host tag="td">
                {f.name}
                <Host tag="div" className="cap">
                  {f.network} {maskMomo(f.momo)}
                </Host>
              </Host>
              <Host tag="td">
                <Link to={`/ops/allocation/${s.orderId}`}>{s.orderId}</Link>
              </Host>
              <Host tag="td" className="num">
                {s.payableKg}
              </Host>
              <Host tag="td" className="num">
                {s.pricePerKg.toFixed(2)}
              </Host>
              <Host
                tag="td"
                className="num"
                style={{
                  fontWeight: 600,
                }}
              >
                {s.net.toLocaleString('en-GH', {
                  minimumFractionDigits: 2,
                })}
              </Host>
              <Host tag="td">
                <Chip tone={SETT_TONE[s.status]}>{SETT_LABEL[s.status]}</Chip>
                {s.heldReason && (
                  <Host tag="div" className="cap">
                    {s.heldReason}
                  </Host>
                )}
              </Host>
              <Host tag="td">
                {s.deadlineAt && s.status !== 'paid' ? (
                  <Countdown deadline={s.deadlineAt} now={now} />
                ) : s.status === 'paid' ? (
                  <Host tag="span" className="cap">
                    Paid
                  </Host>
                ) : (
                  <Host tag="span" className="cap">
                    After delivery
                  </Host>
                )}
              </Host>
            </Host>
          );
        })}
      </Tbl>
    </Shell>
  );
}
/** One line on what the payout provider knows about a farmer's wallet. */
function walletCheckLabel(f: {
  name: string;
  momoVerifiedAt?: number;
  momoName?: string;
  momoVerifyError?: string;
}) {
  if (!f.momoVerifiedAt) return { text: 'Wallet not yet checked', tone: 'neutral' as const };
  if (f.momoName)
    return {
      text: `Wallet name ${f.momoName}`,
      tone: namesAlike(f.name, f.momoName) ? ('ok' as const) : ('alert' as const),
    };
  return { text: f.momoVerifyError ?? 'Wallet name not returned', tone: 'warn' as const };
}
function namesAlike(a: string, b: string) {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  const y = new Set(tokens(b));
  return tokens(a).some((t) => y.has(t));
}

function Payouts() {
  const { state, act, now, me } = useOps();
  const nav = useNavigate();
  const payable = state.settlements
    .filter((s) => s.status === 'payable')
    .sort((a, b) => (a.deadlineAt ?? 0) - (b.deadlineAt ?? 0));
  const [sel, setSel] = useState<string[] | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [walletNote, setWalletNote] = useState('');
  const chosen = sel ?? payable.map((s) => s.id);
  const selected = payable.filter((s) => chosen.includes(s.id));
  const total = round2(selected.reduce((a, s) => a + s.net, 0));
  const hasCorrection = selected.some((s) => !!s.correctionOf);
  const two = payoutRequiresTwo(total, state.config.payoutThreshold, hasCorrection);
  return (
    <Shell title="Payout runs">
      <Host tag="div" className="two">
        <Host
          tag="div"
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <Host tag="div" className="row">
            <Host tag="span" className="h16">
              Payable now · {payable.length}
            </Host>
            <Host tag="span" className="cap">
              Threshold {ghs(state.config.payoutThreshold)} per run
            </Host>
          </Host>
          {payable.length === 0 && (
            <Host tag="div" className="card card-pad muted">
              Nothing payable. Settlements become payable when a delivery is confirmed.
            </Host>
          )}
          {payable.map((s) => {
            const f = state.farmers.find((x) => x.id === s.farmerId)!;
            const c = state.consignments.find((x) => x.id === s.consignmentId);
            return (
              <Host
                tag="label"
                key={s.id}
                className="card card-pad row"
                style={{
                  cursor: 'pointer',
                }}
              >
                <Host
                  tag="span"
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <Host
                    tag="input"
                    type="checkbox"
                    checked={chosen.includes(s.id)}
                    onChange={(e) =>
                      setSel(
                        e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id),
                      )
                    }
                  />
                  <Host tag="span">
                    <Host
                      tag="span"
                      style={{
                        fontWeight: 600,
                      }}
                    >
                      {f.name}
                    </Host>{' '}
                    <Host tag="span" className="cap">
                      {c?.productName} {s.payableKg} kg · {s.orderId}
                    </Host>
                    <Host tag="div" className="cap">
                      {f.network} {maskMomo(f.momo)} · {f.tier} wallet
                      {f.walletBad ? ' · flagged' : ''}
                      {s.net >
                      state.config.walletLimits[f.tier === 'unknown' ? 'minimum' : f.tier] ? (
                        <Host
                          tag="span"
                          style={{
                            color: 'var(--amber)',
                            fontWeight: 600,
                          }}
                        >
                          {' '}
                          · over tier limit
                        </Host>
                      ) : (
                        ''
                      )}
                    </Host>
                    {remoteEnabled ? (
                      <Host tag="div" className="cap row" style={{ gap: 8 }}>
                        <Chip tone={walletCheckLabel(f).tone}>{walletCheckLabel(f).text}</Chip>
                        {!f.momoName ? (
                          <Host
                            tag="button"
                            className="btn btn-secondary btn-sm"
                            disabled={checking === f.id}
                            onClick={() => {
                              setChecking(f.id);
                              setWalletNote('');
                              void resolveWallet(f.id).then((res) => {
                                setChecking(null);
                                if (res.error) setWalletNote(`${f.name}: ${res.error}`);
                                else if (res.name)
                                  setWalletNote(
                                    `${f.name}: wallet is registered to ${res.name}${res.match ? '' : ' (does not match the farmer name)'}.`,
                                  );
                              });
                            }}
                          >
                            {checking === f.id ? 'Checking…' : 'Check wallet name'}
                          </Host>
                        ) : null}
                      </Host>
                    ) : null}
                  </Host>
                </Host>
                <Host
                  tag="span"
                  style={{
                    textAlign: 'right',
                  }}
                >
                  <Money v={s.net} />
                  <Host tag="div">
                    {s.deadlineAt && <Countdown deadline={s.deadlineAt} now={now} />}
                  </Host>
                </Host>
              </Host>
            );
          })}
          <Host tag="div" className="card card-pad col gap8">
            <KV k="Selected" v={`${chosen.length} transfers`} />
            <KV k="Total" v={<Money v={total} />} />
            <KV
              k="Approval"
              v={
                two
                  ? hasCorrection && total <= state.config.payoutThreshold
                    ? 'Two approvers, includes a correction'
                    : 'Two approvers, above threshold'
                  : 'One approver, within threshold'
              }
            />
            <Btn
              disabled={!chosen.length}
              onClick={() => {
                const id = act.createPayoutRun(chosen);
                setSel(null);
                if (id) nav(`/ops/payouts/${id}`);
              }}
            >
              Create payout run
            </Btn>
            <Host tag="div" className="cap">
              Raised by {me.name}. Creating the run counts as your approval.
              {two
                ? ' Another person must approve it before Paystack is paid.'
                : ' That single approval is enough, and Paystack can be paid now.'}
            </Host>
            {remoteEnabled ? (
              <Host tag="div" className="cap">
                Before money moves, each wallet is checked with Paystack and the name is stored on
                the farmer. A name that does not match the farmer fails the transfer so the node
                manager can decide.
              </Host>
            ) : null}
            {walletNote ? (
              <Host tag="div" className="tint-amber">
                {walletNote}
              </Host>
            ) : null}
          </Host>
        </Host>
        <Host tag="div" className="side">
          <Host tag="div" className="h16">
            Runs
          </Host>
          {state.payoutRuns.map((r) => (
            <Link key={r.id} to={`/ops/payouts/${r.id}`} className="item">
              <Host tag="div" className="row">
                <Host
                  tag="span"
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {r.id}
                </Host>
                <Chip tone={PR_TONE[r.status]}>{PR_LABEL[r.status]}</Chip>
              </Host>
              <Host tag="div" className="row cap">
                <Host tag="span">
                  {r.count} transfers · {fmtStamp(r.createdAt)}
                  {approvalStillOpen(r)
                    ? ` · ${r.approvals.length} of ${approvalsNeeded(r)} approvals`
                    : ''}
                </Host>
                <Money v={r.total} />
              </Host>
            </Link>
          ))}
        </Host>
      </Host>
    </Shell>
  );
}
function PayoutDetail() {
  const { id } = useParams();
  const { state, act, me } = useOps();
  const r = state.payoutRuns.find((x) => x.id === id);
  const [note, setNote] = useState('');
  const [manual, setManual] = useState<string | null>(null);
  const [ref, setRef] = useState('PSK-MAN-');
  const [fix, setFix] = useState<string | null>(null);
  const [newMomo, setNewMomo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState('');
  if (!r) return <Navigate to="/ops/payouts" />;
  const runId = r.id;
  // Spec 8: a run does not execute against an insufficient balance. Paystack is asked first.
  const execute = async () => {
    setErr('');
    setInfo('');
    if (!remoteEnabled) {
      act.executePayoutRun(runId);
      return;
    }
    setBusy('execute');
    const check = await payoutPreflight(runId);
    setBusy(null);
    if (check.error || !check.ok) {
      setErr(check.error ?? 'Paystack balance check failed.');
      return;
    }
    const mine = state.transfers.filter((t) => t.runId === runId);
    const held = mine.some((t) => t.status === 'held');
    const sendable = mine.some(
      (t) =>
        t.status === 'queued' || t.status === 'held' || (t.status === 'failed' && t.attempts < 3),
    );
    if (!sendable) {
      setInfo('Nothing on this run is waiting to be sent.');
      return;
    }
    setInfo(
      held
        ? `Paystack balance GHS ${(check.balance ?? 0).toFixed(2)} covers GHS ${(check.needed ?? 0).toFixed(2)}. The held transfer is being sent now.`
        : `Paystack balance GHS ${(check.balance ?? 0).toFixed(2)} covers GHS ${(check.needed ?? 0).toFixed(2)}. Transfers are being sent.`,
    );
    act.executePayoutRun(runId);
  };
  const checkWithPaystack = async (transferId: string) => {
    setErr('');
    setBusy(transferId);
    const res = await verifyTransfer(transferId);
    setBusy(null);
    if (res.error) setErr(res.error);
    else
      setInfo(
        res.status === 'sent'
          ? `Paystack still has ${transferId} as ${res.provider ?? 'pending'}. The webhook will finish it.`
          : `Paystack reports ${transferId} as ${res.status}.`,
      );
  };
  const ts = state.transfers.filter((t) => r.transferIds.includes(t.id));
  const need = approvalsNeeded(r);
  const can = canApprove(r, me.id, state.config.approverIds);
  const iApproved = r.approvals.some((a) => a.userId === me.id);
  const creatorApproved = r.approvals.some((a) => a.userId === r.createdBy);
  const aboveThreshold = r.total > r.threshold;
  const waiting = approvalStillOpen(r);
  const steps = [
    {
      title: `Created by ${r.createdByName}`,
      sub: `Node manager · ${fmtStamp(r.createdAt)}`,
      done: true,
    },
    ...Array.from(
      {
        length: need,
      },
      (_, i) =>
        r.approvals[i]
          ? {
              title: `Approver ${i === 0 ? 'one' : 'two'} · ${r.approvals[i].name}`,
              sub:
                r.approvals[i].userId === r.createdBy
                  ? `Approved by creating the run · ${fmtStamp(r.approvals[i].at)}`
                  : `Approved · ${fmtStamp(r.approvals[i].at)}`,
              done: true,
            }
          : {
              title: `Approver ${i === 0 ? 'one' : 'two'}`,
              sub: 'Waiting',
              done: false,
            },
    ),
  ];
  const fixT = ts.find((t) => t.id === fix);
  return (
    <Shell
      title={`${r.id}`}
      right={
        <Chip lg tone={PR_TONE[r.status]}>
          {PR_LABEL[r.status]}
        </Chip>
      }
    >
      <Host tag="div" className="two">
        <Host
          tag="div"
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <Host
            tag="div"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 10,
            }}
          >
            {[
              ['Transfers', String(r.count)],
              ['Total', ghs(r.total)],
              ['Threshold', ghs(r.threshold)],
              ['Approvals', `${r.approvals.length} of ${need}`],
            ].map(([k, v]) => (
              <Host tag="div" key={k} className="card card-pad">
                <Host tag="div" className="cap">
                  {k}
                </Host>
                <Host tag="div" className="h16 tabular">
                  {v}
                </Host>
              </Host>
            ))}
          </Host>
          <Tbl
            head={[
              'Farmer',
              'Wallet',
              '#Amount',
              'Attempts',
              'Status',
              'Reference / error',
              'Action',
            ]}
          >
            {ts.map((t) => {
              const f = state.farmers.find((x) => x.id === t.farmerId)!;
              return (
                <Host tag="tr" key={t.id}>
                  <Host tag="td">
                    {f.name}
                    <Host tag="div" className="cap">
                      {t.settlementId}
                    </Host>
                  </Host>
                  <Host tag="td" className="tabular">
                    {t.network} {maskMomo(t.momo)}
                    {remoteEnabled ? (
                      <Host tag="div" className="cap">
                        <Chip tone={walletCheckLabel(f).tone}>{walletCheckLabel(f).text}</Chip>
                      </Host>
                    ) : null}
                  </Host>
                  <Host
                    tag="td"
                    className="num"
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    {t.amount.toLocaleString('en-GH', {
                      minimumFractionDigits: 2,
                    })}
                  </Host>
                  <Host tag="td">{t.attempts}</Host>
                  <Host tag="td">
                    <Chip tone={TR_TONE[t.status]}>{TR_LABEL[t.status]}</Chip>
                  </Host>
                  <Host tag="td" className="cap">
                    {t.status === 'held'
                      ? waiting
                        ? 'Over the wallet daily limit. Paystack is called after the second approval.'
                        : 'Over the wallet daily limit, so it was not sent. Re-execute sends it to Paystack.'
                      : (t.providerRef ?? t.lastError ?? '—')}
                    {t.status === 'failed' && t.providerRef && t.lastError ? (
                      <Host tag="div">{t.lastError}</Host>
                    ) : null}
                    {t.verifiedAt ? (
                      <Host tag="div">Confirmed by Paystack {fmtStamp(t.verifiedAt)}</Host>
                    ) : null}
                  </Host>
                  <Host
                    tag="td"
                    style={{
                      display: 'flex',
                      gap: 6,
                    }}
                  >
                    {t.status === 'failed' && (
                      <>
                        <Host
                          tag="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => act.retryTransfer(t.id)}
                        >
                          Retry
                        </Host>
                        <Host
                          tag="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setFix(t.id);
                            setNewMomo('');
                          }}
                        >
                          Fix wallet
                        </Host>
                        <Host
                          tag="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setManual(t.id)}
                        >
                          Paid manually
                        </Host>
                      </>
                    )}
                    {t.status === 'held' && (
                      <Host
                        tag="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setManual(t.id)}
                      >
                        Paid manually
                      </Host>
                    )}
                    {t.status === 'sent' && remoteEnabled && (
                      <Host
                        tag="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy === t.id}
                        onClick={() => void checkWithPaystack(t.id)}
                      >
                        {busy === t.id ? 'Checking…' : 'Check with Paystack'}
                      </Host>
                    )}
                  </Host>
                </Host>
              );
            })}
          </Tbl>
          <Host tag="div" className="cap">
            Every transfer carries its own idempotency key. Re-executing the run only touches
            transfers that are queued or failed; nothing that succeeded is sent again.
            {remoteEnabled
              ? ' A transfer is marked paid only after Paystack confirms it, through the signed webhook or a verify call, never from the send response alone.'
              : ''}
          </Host>
          <Host
            tag="button"
            className="btn btn-secondary btn-md"
            style={{
              alignSelf: 'flex-start',
            }}
            onClick={() =>
              downloadCsv(
                `${r.id}.csv`,
                ts.map((t) => ({
                  farmer: state.farmers.find((x) => x.id === t.farmerId)?.name,
                  network: t.network,
                  wallet: t.momo,
                  amount: t.amount,
                  reference: t.settlementId,
                  status: t.status,
                })),
              )
            }
          >
            Export run CSV (manual path)
          </Host>
        </Host>
        <Host tag="div" className="side">
          <Stepper steps={steps} />
          <Host tag="div" className="cap">
            {r.requiresTwo
              ? `${aboveThreshold ? `Above ${ghs(r.threshold)}` : 'Includes a corrected settlement'}, so two approvers are required.${creatorApproved ? ` ${r.createdByName} counts as one.` : ''}`
              : `Within ${ghs(r.threshold)}, so one approver is enough.${creatorApproved ? ` ${r.createdByName} approved it.` : ''}`}
          </Host>
          {waiting && (
            <>
              <Field label="Note (optional)">
                <Host
                  tag="input"
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              {can.ok ? (
                <Btn
                  disabled={busy === 'execute'}
                  onClick={() => {
                    const res = act.approvePayoutRun(r.id, note);
                    if (!res.ok) {
                      setErr(res.why);
                      return;
                    }
                    void execute();
                  }}
                >
                  {busy === 'execute' ? 'Approving and paying…' : `Approve and pay as ${me.name}`}
                </Btn>
              ) : iApproved ? (
                <Host tag="div" className="tint-amber">
                  You approved this run by creating it. Another person must approve it before
                  Paystack is paid.
                </Host>
              ) : (
                <Host tag="div" className="tint-amber">
                  {can.why}
                </Host>
              )}
              {r.status === 'pending_approval' && (
                <Btn
                  kind="link-danger"
                  onClick={() => act.rejectPayoutRun(r.id, note || 'Rejected')}
                >
                  Reject run
                </Btn>
              )}
            </>
          )}
          {!waiting &&
            (r.status === 'approved' || r.status === 'executing' || r.status === 'partial') && (
              <>
                <Btn kind="field" disabled={busy === 'execute'} onClick={() => void execute()}>
                  {busy === 'execute'
                    ? 'Checking Paystack balance…'
                    : ts.some((t) => t.status === 'held')
                      ? 'Send held transfer'
                      : r.status === 'approved'
                        ? 'Execute payout run'
                        : 'Re-execute remaining'}
                </Btn>
                {r.status === 'approved' && !remoteEnabled && (
                  <Btn kind="secondary" onClick={() => act.executePayoutRun(r.id, 1)}>
                    Demo: crash the worker after 1 transfer
                  </Btn>
                )}
              </>
            )}
          {r.status === 'completed' && (
            <Host tag="div" className="tint-green">
              <Host tag="strong">Completed.</Host> Every farmer paid. SMS sent with the reference.
            </Host>
          )}
          {r.status === 'partial' && !waiting && (
            <Host tag="div" className="tint-amber">
              <Host tag="strong">Partial.</Host> Failed transfers sit in Exceptions with the 24 hour
              clock running. The rest are paid.
            </Host>
          )}
          {r.note && (
            <Host tag="div" className="cap">
              Note: {r.note}
            </Host>
          )}
          {info && (
            <Host tag="div" className="tint-green">
              {info}
            </Host>
          )}
          {err && (
            <Host tag="div" className="tint-red">
              {err}
            </Host>
          )}
        </Host>
      </Host>
      <Sheet open={!!manual} onClose={() => setManual(null)} title="Paid by hand">
        <Host tag="div" className="muted">
          Pay through the Paystack dashboard, then record its transfer code (TRF_…) here. The ledger
          gets a manual transfer entry and the farmer gets the SMS.
        </Host>
        <Field label="Provider reference">
          <Host
            tag="input"
            className="input"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        </Field>
        <Btn
          onClick={() => {
            if (manual) act.markManual(manual, ref);
            setManual(null);
          }}
        >
          Record manual payment
        </Btn>
      </Sheet>
      <Sheet
        open={!!fixT}
        onClose={() => setFix(null)}
        title={`Fix wallet · ${state.farmers.find((f) => f.id === fixT?.farmerId)?.name}`}
      >
        <Host tag="div" className="tint-amber">
          A wallet number change needs two approvers and is logged against the farmer. This demo
          records both approvals at once.
        </Host>
        <Field label="New mobile money number">
          <Host
            tag="input"
            className="input tabular"
            value={newMomo}
            onChange={(e) => setNewMomo(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="024 000 0000"
          />
        </Field>
        <Btn
          disabled={newMomo.length !== 10}
          onClick={() => {
            if (fixT) act.fixWallet(fixT.farmerId, newMomo, 'MTN');
            setFix(null);
          }}
        >
          Apply with two approvals, then retry
        </Btn>
      </Sheet>
    </Shell>
  );
}
function Exceptions() {
  const { state, act, now } = useOps();
  const [f, setF] = useState<'Open' | 'All'>('Open');
  const [res, setRes] = useState<Record<string, string>>({});
  const list = state.exceptions.filter(
    (e) => f === 'All' || e.status === 'open' || e.status === 'in_progress',
  );
  const link = (e: Exception) =>
    e.entity?.type === 'order'
      ? `/ops/allocation/${e.entity.id}`
      : e.entity?.type === 'transfer'
        ? `/ops/payouts/${state.transfers.find((t) => t.id === e.entity!.id)?.runId}`
        : e.entity?.type === 'run'
          ? `/ops/runs/${e.entity.id}`
          : e.entity?.type === 'consignment'
            ? `/ops/allocation/${state.consignments.find((c) => c.id === e.entity!.id)?.orderId}`
            : '/ops';
  return (
    <Shell
      title="Exceptions"
      right={
        <Host
          tag="button"
          className={`f btn btn-secondary btn-md`}
          onClick={() => setF((x) => (x === 'Open' ? 'All' : 'Open'))}
        >
          {f === 'Open' ? 'Showing open' : 'Showing all'}
        </Host>
      }
    >
      {list.length === 0 && (
        <Host tag="div" className="card card-pad muted">
          Nothing open. Every case that needs a human decision lands here with a clock on it.
        </Host>
      )}
      {list.map((e) => (
        <Host
          tag="div"
          key={e.id}
          className="card"
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <Host tag="div" className="row">
            <Host
              tag="div"
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Chip
                tone={
                  e.severity === 'high' ? 'alert' : e.severity === 'medium' ? 'warn' : 'neutral'
                }
              >
                {e.severity}
              </Chip>
              <Host
                tag="span"
                style={{
                  fontWeight: 600,
                }}
              >
                {e.title}
              </Host>
              <Host tag="span" className="cap">
                {e.type.replace(/_/g, ' ')} · {e.id} · opened {fmtStamp(e.openedAt)}
                {e.assignee ? ` · ${e.assignee}` : ''}
              </Host>
            </Host>
            {e.deadlineAt && e.status !== 'resolved' ? (
              <Countdown deadline={e.deadlineAt} now={now} />
            ) : (
              <Chip
                tone={
                  e.status === 'resolved' ? 'ok' : e.status === 'in_progress' ? 'info' : 'neutral'
                }
              >
                {e.status.replace('_', ' ')}
              </Chip>
            )}
          </Host>
          <Host
            tag="div"
            style={{
              fontSize: 14,
            }}
          >
            {e.detail}
          </Host>
          {e.type === 'sync_conflict_pay_affecting' && e.payload?.agent ? (
            <Host
              tag="div"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <Host tag="div" className="card card-pad">
                <Host tag="div" className="lbl">
                  Agent version (physical)
                </Host>
                <pre
                  style={{
                    margin: 0,
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(e.payload.agent, null, 1)}
                </pre>
              </Host>
              <Host tag="div" className="card card-pad">
                <Host tag="div" className="lbl">
                  Node manager version (commercial)
                </Host>
                <pre
                  style={{
                    margin: 0,
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(e.payload.ops, null, 1)}
                </pre>
              </Host>
            </Host>
          ) : null}
          {e.status !== 'resolved' && e.status !== 'dismissed' ? (
            <Host
              tag="div"
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link
                to={link(e)}
                className="btn btn-secondary btn-md"
                style={{
                  width: 'auto',
                }}
              >
                Open {e.entity?.type ?? 'item'}
              </Link>
              {e.status === 'open' && (
                <Host
                  tag="button"
                  className="btn btn-secondary btn-md"
                  onClick={() => act.assignException(e.id)}
                >
                  Take it
                </Host>
              )}
              <Host
                tag="input"
                className="input"
                style={{
                  height: 40,
                  flex: 1,
                  minWidth: 200,
                }}
                placeholder="Resolution, who decided what"
                value={res[e.id] ?? ''}
                onChange={(ev) =>
                  setRes((r) => ({
                    ...r,
                    [e.id]: ev.target.value,
                  }))
                }
              />
              <Btn md disabled={!res[e.id]} onClick={() => act.resolveException(e.id, res[e.id])}>
                Resolve
              </Btn>
            </Host>
          ) : (
            <Host tag="div" className="cap">
              {e.resolution} · {e.resolvedAt ? fmtStamp(e.resolvedAt) : ''}
            </Host>
          )}
        </Host>
      ))}
    </Shell>
  );
}
function Buyers() {
  const { state, act } = useOps();
  const pending = state.orgs.filter((o) => o.status === 'pending');
  return (
    <Shell title="Buyers">
      <Host tag="div" className="h16">
        Approval queue · {pending.length}
      </Host>
      {pending.length === 0 && (
        <Host tag="div" className="card card-pad muted">
          No organisations waiting.
        </Host>
      )}
      {pending.map((o) => (
        <Host tag="div" key={o.id} className="card card-pad row">
          <Host tag="div">
            <Host
              tag="div"
              style={{
                fontWeight: 600,
              }}
            >
              {o.name}{' '}
              <Host tag="span" className="cap">
                {o.type} · {o.country}
              </Host>
            </Host>
            <Host tag="div" className="cap">
              {o.address} · {o.contact} · submitted {fmtStamp(o.submittedAt)}
            </Host>
            {o.country !== 'Ghana' && (
              <Host
                tag="div"
                className="cap"
                style={{
                  color: 'var(--amber)',
                }}
              >
                Outside Ghana: bank transfer only.
              </Host>
            )}
          </Host>
          <Btn md onClick={() => act.approveOrg(o.id)}>
            Approve
          </Btn>
        </Host>
      ))}
      <Host tag="div" className="h16">
        Approved
      </Host>
      <Tbl
        head={[
          'Organisation',
          'Type',
          'Country',
          'Contact',
          'Payment methods',
          'Dedicated account',
          'Users',
        ]}
      >
        {state.orgs
          .filter((o) => o.status === 'approved')
          .map((o) => (
            <Host tag="tr" key={o.id}>
              <Host
                tag="td"
                style={{
                  fontWeight: 600,
                }}
              >
                {o.name}
              </Host>
              <Host tag="td">{o.type}</Host>
              <Host tag="td">{o.country}</Host>
              <Host tag="td">{o.contact}</Host>
              <Host tag="td">
                {o.country === 'Ghana' ? 'Bank transfer, card, mobile money' : 'Bank transfer only'}
              </Host>
              <Host tag="td" className="tabular">
                <AccountCell
                  orgId={o.id}
                  bank={o.virtualAccount?.bank ?? ''}
                  number={o.virtualAccount?.number ?? ''}
                />
              </Host>
              <Host tag="td">{state.buyerUsers.filter((u) => u.orgId === o.id).length}</Host>
            </Host>
          ))}
      </Tbl>
    </Shell>
  );
}
function Farmers() {
  const { state, act } = useOps();
  const [reveal, setReveal] = useState<string | null>(null);
  return (
    <Shell
      title="Farmers"
      right={
        <Host tag="span" className="cap">
          {state.farmers.length} registered
        </Host>
      }
    >
      <Tbl
        head={['Code', 'Name', 'Village', 'Wallet', 'Tier', 'Identity', 'Registered by', 'Sync']}
      >
        {state.farmers.map((f) => (
          <Host tag="tr" key={f.id}>
            <Host tag="td">{f.code}</Host>
            <Host
              tag="td"
              style={{
                fontWeight: 600,
              }}
            >
              {f.name}
              {f.walletBad && (
                <>
                  {' '}
                  <Chip tone="alert">Wallet flagged</Chip>
                </>
              )}
            </Host>
            <Host tag="td">{f.village}</Host>
            <Host tag="td" className="tabular">
              {f.network} {reveal === f.id ? f.momo : maskMomo(f.momo)}{' '}
              <Host
                tag="button"
                className="btn btn-secondary btn-sm"
                style={{
                  display: 'inline-flex',
                  height: 28,
                }}
                onClick={() => {
                  setReveal(reveal === f.id ? null : f.id);
                  if (reveal !== f.id) {
                    act.updateConfig({}, `reveal ${f.id}`);
                    setTimeout(() => setReveal(null), 30000);
                  }
                }}
              >
                {reveal === f.id ? 'Hide' : 'Reveal'}
              </Host>
            </Host>
            <Host tag="td">{f.tier}</Host>
            <Host tag="td">
              {f.kyc === 'unverified' ? (
                <Chip tone="warn">Ghana Card before first payout</Chip>
              ) : (
                <Chip tone="ok">
                  {f.kyc === 'verified_manual' ? 'Verified by the node manager' : 'Verified by provider'}
                </Chip>
              )}
            </Host>
            <Host tag="td">{f.registeredBy}</Host>
            <Host tag="td">
              {f.pendingSync ? <Chip tone="warn">On device</Chip> : <Chip tone="ok">Synced</Chip>}
            </Host>
          </Host>
        ))}
      </Tbl>
      <Host tag="div" className="cap">
        Revealing a wallet number writes an audit entry and hides again after thirty seconds. Wallet
        changes need two approvers.
      </Host>
    </Shell>
  );
}
function Config() {
  const { state, act, isApprover } = useOps();
  const c = state.config;
  const [th, setTh] = useState(String(c.payoutThreshold));
  const [min, setMin] = useState(String(c.tempMin));
  const [max, setMax] = useState(String(c.tempMax));
  const [tol, setTol] = useState(String(c.tolerancePct));
  const [lead, setLead] = useState(String(c.leadDays));
  const [exp, setExp] = useState(String(c.paymentExpiryHours));
  const [ping, setPing] = useState(String(c.pingMinutes));
  const [appr, setAppr] = useState<string[]>(c.approverIds);
  const [second, setSecond] = useState('');
  const hist = state.audit.filter((a) => a.action === 'Changed config');
  return (
    <Shell title="Config">
      <Host
        tag="div"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Host
          tag="div"
          className="card"
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <Host tag="div" className="h16">
            Money controls
          </Host>
          <Host tag="div" className="tint-amber">
            Two approvers to change. Each payout run snapshots the values it ran under.
          </Host>
          <Field label="Payout threshold, GHS per run">
            <Host
              tag="input"
              className="input tabular"
              value={th}
              onChange={(e) => setTh(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
          <Host tag="div" className="field">
            <Host tag="span" className="lbl">
              Named approvers
            </Host>
            {state.opsUsers.map((u) => (
              <Host
                tag="label"
                key={u.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  minHeight: 40,
                }}
              >
                <Host
                  tag="input"
                  type="checkbox"
                  checked={appr.includes(u.id)}
                  onChange={(e) =>
                    setAppr((a) => (e.target.checked ? [...a, u.id] : a.filter((x) => x !== u.id)))
                  }
                />
                {u.name}{' '}
                <Host tag="span" className="cap">
                  {u.title}
                </Host>
              </Host>
            ))}
          </Host>
          <Field label="Second approver for this change">
            <Host
              tag="select"
              className="input"
              value={second}
              onChange={(e) => setSecond(e.target.value)}
            >
              <Host tag="option" value="">
                Choose
              </Host>
              {state.opsUsers
                .filter((u) => c.approverIds.includes(u.id) && u.id !== state.session.opsUserId)
                .map((u) => (
                  <Host tag="option" key={u.id} value={u.name}>
                    {u.name}
                  </Host>
                ))}
            </Host>
          </Field>
          <Btn
            disabled={!second || !isApprover}
            onClick={() =>
              act.updateConfig(
                {
                  payoutThreshold: Number(th),
                  approverIds: appr,
                },
                `${state.opsUsers.find((u) => u.id === state.session.opsUserId)?.name} and ${second}`,
              )
            }
          >
            Save money controls
          </Btn>
          {!isApprover && (
            <Host tag="div" className="cap">
              Only a named approver can change money controls. Use the demo bar to act as one.
            </Host>
          )}
        </Host>
        <Host
          tag="div"
          className="card"
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <Host tag="div" className="h16">
            Node settings
          </Host>
          <Host
            tag="div"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}
          >
            <Field label="Temperature min °C">
              <Host
                tag="input"
                className="input tabular"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </Field>
            <Field label="Temperature max °C">
              <Host
                tag="input"
                className="input tabular"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </Field>
            <Field label="Allocation tolerance %">
              <Host
                tag="input"
                className="input tabular"
                value={tol}
                onChange={(e) => setTol(e.target.value)}
              />
            </Field>
            <Field label="Order lead time, days">
              <Host
                tag="input"
                className="input tabular"
                value={lead}
                onChange={(e) => setLead(e.target.value)}
              />
            </Field>
            <Field label="Payment expiry, hours">
              <Host
                tag="input"
                className="input tabular"
                value={exp}
                onChange={(e) => setExp(e.target.value)}
              />
            </Field>
            <Field label="Position ping, minutes">
              <Host
                tag="input"
                className="input tabular"
                value={ping}
                onChange={(e) => setPing(e.target.value)}
              />
            </Field>
          </Host>
          <Host tag="div" className="field">
            <Host tag="span" className="lbl">
              Checkpoints (fixed order)
            </Host>
            <Host tag="div" className="cap">
              {c.checkpoints.join(' → ')}
            </Host>
          </Host>
          <Host tag="div" className="field">
            <Host tag="span" className="lbl">
              Wallet tier daily limits, GHS
            </Host>
            <Host tag="div" className="cap">
              minimum {c.walletLimits.minimum.toLocaleString()} · medium{' '}
              {c.walletLimits.medium.toLocaleString()} · enhanced{' '}
              {c.walletLimits.enhanced.toLocaleString()}
            </Host>
          </Host>
          <Btn
            kind="secondary"
            onClick={() =>
              act.updateConfig({
                tempMin: Number(min),
                tempMax: Number(max),
                tolerancePct: Number(tol),
                leadDays: Number(lead),
                paymentExpiryHours: Number(exp),
                pingMinutes: Number(ping),
              })
            }
          >
            Save node config
          </Btn>
        </Host>
      </Host>
      <Host tag="div" className="h16">
        History
      </Host>
      <Tbl head={['When', 'Who', 'Keys', 'Detail']}>
        {hist.map((a) => (
          <Host tag="tr" key={a.id}>
            <Host tag="td">{fmtStamp(a.at)}</Host>
            <Host tag="td">{a.actor}</Host>
            <Host tag="td">{a.entity}</Host>
            <Host tag="td" className="cap">
              {a.detail}
            </Host>
          </Host>
        ))}
      </Tbl>
    </Shell>
  );
}
function SyncHealth() {
  const { state } = useOps();
  return (
    <Shell title="Sync health">
      <Tbl
        head={[
          'Device',
          'Role',
          'Online',
          'Pending',
          'Last sync',
          'App',
          'Free storage',
          'Clock skew',
        ]}
      >
        {state.devices.map((d) => (
          <Host tag="tr" key={d.id}>
            <Host
              tag="td"
              style={{
                fontWeight: 600,
              }}
            >
              {d.userName}
              <Host tag="div" className="cap">
                {d.id}
              </Host>
            </Host>
            <Host tag="td">{d.role}</Host>
            <Host tag="td">
              {d.online ? <Chip tone="ok">Online</Chip> : <Chip tone="warn">Offline</Chip>}
            </Host>
            <Host tag="td">
              {d.outbox.length ? <Chip tone="warn">{d.outbox.length} events</Chip> : '0'}
            </Host>
            <Host tag="td">{d.lastSyncAt ? fmtStamp(d.lastSyncAt) : '—'}</Host>
            <Host tag="td">{d.appVersion}</Host>
            <Host tag="td" className="tabular">
              {(d.storageMb / 1024).toFixed(1)} GB
            </Host>
            <Host tag="td">
              {d.clockSkewMin > 10 ? (
                <Chip tone="alert">{d.clockSkewMin} min</Chip>
              ) : (
                `${d.clockSkewMin} min`
              )}
            </Host>
          </Host>
        ))}
      </Tbl>
      <Host tag="div" className="h16">
        Recent events
      </Host>
      <Tbl head={['Received', 'Device', 'Seq', 'Type', 'Occurred', 'Size', 'Status']}>
        {state.events.slice(0, 40).map((e) => (
          <Host tag="tr" key={e.id}>
            <Host tag="td">{e.receivedAt ? fmtStamp(e.receivedAt) : '—'}</Host>
            <Host tag="td">{e.deviceId}</Host>
            <Host tag="td">{e.seq}</Host>
            <Host tag="td">{e.type}</Host>
            <Host tag="td">{fmtStamp(e.occurredAt)}</Host>
            <Host tag="td">{e.sizeKb} KB</Host>
            <Host tag="td">
              <Chip tone={e.status === 'applied' ? 'ok' : e.status === 'error' ? 'alert' : 'warn'}>
                {e.status}
              </Chip>
            </Host>
          </Host>
        ))}
      </Tbl>
    </Shell>
  );
}
function Messages() {
  const { state } = useOps();
  return (
    <Shell
      title="Messages"
      right={
        <Host tag="span" className="cap">
          {state.sms.length} SMS
        </Host>
      }
    >
      <Tbl head={['Sent', 'To', 'Farmer', 'Template', 'Body', 'Status']}>
        {state.sms.map((m) => (
          <Host tag="tr" key={m.id}>
            <Host tag="td">{fmtStamp(m.at)}</Host>
            <Host tag="td" className="tabular">
              {m.to}
            </Host>
            <Host tag="td">{state.farmers.find((f) => f.id === m.farmerId)?.name}</Host>
            <Host tag="td">{m.template}</Host>
            <Host
              tag="td"
              style={{
                maxWidth: 420,
              }}
            >
              {m.body}
            </Host>
            <Host tag="td">
              <Chip tone={m.status === 'failed' ? 'alert' : 'ok'}>{m.status}</Chip>
              <Host tag="div" className="cap">
                {m.ref.split(':')[0]}
              </Host>
            </Host>
          </Host>
        ))}
      </Tbl>
    </Shell>
  );
}
function Audit() {
  const { state } = useOps();
  return (
    <Shell title="Audit">
      <Tbl head={['When', 'Actor', 'Action', 'Entity', 'Detail']}>
        {state.audit.map((a) => (
          <Host tag="tr" key={a.id}>
            <Host tag="td">{fmtStamp(a.at)}</Host>
            <Host tag="td">{a.actor}</Host>
            <Host tag="td">{a.action}</Host>
            <Host tag="td">{a.entity}</Host>
            <Host tag="td" className="cap">
              {a.detail}
            </Host>
          </Host>
        ))}
      </Tbl>
    </Shell>
  );
}
function AccountCell({ orgId, bank, number }: { orgId: string; bank: string; number: string }) {
  const { act } = useOps();
  const [b, setB] = useState(bank);
  const [n, setN] = useState(number);
  if (!remoteEnabled && bank && number)
    return (
      <Host tag="span">
        {bank} · {number}
      </Host>
    );
  return (
    <Host tag="div" className="col gap4" style={{ minWidth: 180 }}>
      <Host
        tag="input"
        className="input"
        style={{ minHeight: 36, height: 36 }}
        value={b}
        placeholder="Bank"
        onChange={(e) => setB(e.target.value)}
      />
      <Host
        tag="input"
        className="input"
        style={{ minHeight: 36, height: 36 }}
        value={n}
        placeholder="Account number"
        onChange={(e) => setN(e.target.value)}
      />
      <Btn md onClick={() => act.setVirtualAccount(orgId, b, n)}>
        Save account
      </Btn>
    </Host>
  );
}
function Catalog() {
  const { state, act } = useOps();
  const listed = state.categories.filter((c) => c.listed);
  const products = state.products.filter((p) => p.listed);
  const [catName, setCatName] = useState('');
  const [catImage, setCatImage] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [minKg, setMinKg] = useState('50');
  const [grades, setGrades] = useState([{ grade: 'A', price: '' }]);
  const [note, setNote] = useState('');
  const parsedGrades = grades
    .map((g) => ({ grade: g.grade.trim(), pricePerKg: Number(g.price) }))
    .filter((g) => g.grade && g.pricePerKg > 0);
  return (
    <Shell title="Product listing">
      <Host
        tag="div"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Host
          tag="div"
          className="col"
          style={{
            gap: 12,
            padding: 16,
            border: '1px solid var(--line)',
            borderRadius: 8,
          }}
        >
          <Host tag="div" className="h16">
            New category
          </Host>
          <Field label="Name">
            <Host
              tag="input"
              className="input"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
          </Field>
          <Field label="Image">
            <Btn
              kind="secondary"
              onClick={() => {
                void capturePhoto('category').then((shot) => {
                  if (shot) setCatImage(shot);
                });
              }}
            >
              {catImage ? 'Replace image' : 'Upload image'}
            </Btn>
            {catImage ? <Host tag="div" className="cap">{catImage}</Host> : null}
          </Field>
          <Btn
            disabled={!catName.trim() || !catImage}
            onClick={() => {
              act.addCategory({ name: catName, image: catImage });
              setCatName('');
              setCatImage('');
              setNote('Category saved. It is on the buyer new-order screen.');
            }}
          >
            Save category
          </Btn>
        </Host>
        <Host
          tag="div"
          className="col"
          style={{
            gap: 12,
            padding: 16,
            border: '1px solid var(--line)',
            borderRadius: 8,
          }}
        >
          <Host tag="div" className="h16">
            New product
          </Host>
          <Field label="Name">
            <Host
              tag="input"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Category">
            <Host
              tag="select"
              className="input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <Host tag="option" value="">
                Select
              </Host>
              {listed.map((c) => (
                <Host tag="option" key={c.id} value={c.id}>
                  {c.name}
                </Host>
              ))}
            </Host>
          </Field>
          <Field label="Minimum purchase, kg">
            <Host
              tag="input"
              className="input tabular"
              value={minKg}
              onChange={(e) => setMinKg(e.target.value)}
            />
          </Field>
          <Host tag="div" className="lbl">
            Grades
          </Host>
          {grades.map((g, i) => (
            <Host tag="div" className="row" key={i} style={{ gap: 8 }}>
              <Host
                tag="input"
                className="input"
                value={g.grade}
                placeholder="Grade"
                onChange={(e) =>
                  setGrades((rows) =>
                    rows.map((row, idx) => (idx === i ? { ...row, grade: e.target.value } : row)),
                  )
                }
              />
              <Host
                tag="input"
                className="input tabular"
                value={g.price}
                placeholder="GHS / kg"
                onChange={(e) =>
                  setGrades((rows) =>
                    rows.map((row, idx) => (idx === i ? { ...row, price: e.target.value } : row)),
                  )
                }
              />
            </Host>
          ))}
          <Btn
            kind="secondary"
            onClick={() => setGrades((rows) => [...rows, { grade: '', price: '' }])}
          >
            Add grade
          </Btn>
          <Btn
            disabled={!name.trim() || !categoryId || !(Number(minKg) > 0) || parsedGrades.length === 0}
            onClick={() => {
              act.addProduct({
                name,
                categoryId,
                grades: parsedGrades,
                minKg: Number(minKg),
              });
              setName('');
              setMinKg('50');
              setGrades([{ grade: 'A', price: '' }]);
              setNote('Product saved. Buyers can order it from that category.');
            }}
          >
            Save product
          </Btn>
        </Host>
      </Host>
      {note ? <Host tag="div" className="cap">{note}</Host> : null}
      <Host tag="div" className="h16">
        Listed categories
      </Host>
      {listed.length === 0 ? (
        <Empty title="No categories yet." sub="Add one to open the buyer catalog." />
      ) : (
        <Tbl head={['Category', 'Image', 'Products']}>
          {listed.map((c) => (
            <Host tag="tr" key={c.id}>
              <Host tag="td">{c.name}</Host>
              <Host tag="td" className="cap">
                {c.image ?? '—'}
              </Host>
              <Host tag="td">{products.filter((p) => p.categoryId === c.id).length}</Host>
            </Host>
          ))}
        </Tbl>
      )}
      <Host tag="div" className="h16">
        Listed products
      </Host>
      {products.length === 0 ? (
        <Empty title="No products yet." sub="Each product needs a category, grades, and a minimum kg." />
      ) : (
        <Tbl head={['Product', 'Category', 'Grades', 'Min kg']}>
          {products.map((p) => (
            <Host tag="tr" key={p.id}>
              <Host tag="td">{p.name}</Host>
              <Host tag="td">{listed.find((c) => c.id === p.categoryId)?.name ?? '—'}</Host>
              <Host tag="td">
                {p.grades.map((g) => `${g.grade} ${ghs(g.pricePerKg)}`).join(' · ')}
              </Host>
              <Host tag="td" className="tabular">
                {p.minKg}
              </Host>
            </Host>
          ))}
        </Tbl>
      )}
    </Shell>
  );
}
function TeamPage() {
  return (
    <Shell title="Team access">
      <TeamFields />
    </Shell>
  );
}
export function settlementLabel(s: Settlement) {
  return SETT_LABEL[s.status];
}
export function EmptyOps() {
  return <Empty title="Nothing here." sub="" />;
}
export default function OpsApp() {
  return (
    <Routes>
      <Route index element={<OrderBook />} />
      <Route path="allocation/:id" element={<Allocation />} />
      <Route path="runs" element={<Runs />} />
      <Route path="runs/:id" element={<RunDetail />} />
      <Route path="capture" element={<Capture />} />
      <Route path="deliveries" element={<Deliveries />} />
      <Route path="settlements" element={<Settlements />} />
      <Route path="payouts" element={<Payouts />} />
      <Route path="payouts/:id" element={<PayoutDetail />} />
      <Route path="exceptions" element={<Exceptions />} />
      <Route path="buyers" element={<Buyers />} />
      <Route path="farmers" element={<Farmers />} />
      <Route path="config" element={<Config />} />
      <Route path="sync" element={<SyncHealth />} />
      <Route path="messages" element={<Messages />} />
      <Route path="audit" element={<Audit />} />
      <Route path="catalog" element={<Catalog />} />
      <Route path="team" element={<TeamPage />} />
      <Route path="*" element={<Navigate to="/ops" />} />
    </Routes>
  );
}
