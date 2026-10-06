import { Host } from '../../ui/host';
import { useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../../domain/store';
import type { Checkpoint } from '../../domain/types';
import { CONS_LABEL, fmtStamp, fmtTime, runAssignedTo, stopCollection } from '../../domain/logic';
import {
  Btn,
  Chip,
  ErrBanner,
  Field,
  I,
  KV,
  Keypad,
  PhotoSlot,
  Sheet,
  SignaturePad,
  Stamped,
  SyncBar,
  TopBar,
} from '../../ui/kit';
import { Phone } from '../../layouts/shells';
import { capturePhoto, readPosition } from '../../backend/media';
function useDriver() {
  const { state, act, now } = useStore();
  const dev = state.devices.find((d) => d.id === state.session.driverDeviceId)!;
  const mine = state.runs.filter((r) => runAssignedTo(r.driverId, dev));
  const run =
    mine
      .filter((r) => r.status === 'in_progress' || r.status === 'planned')
      .sort((a, b) => a.date.localeCompare(b.date))[0] ??
    [...mine].sort((a, b) => b.date.localeCompare(a.date))[0];
  const temps = state.temps.filter((t) => t.runId === run?.id);
  return {
    state,
    act,
    now,
    dev,
    run,
    temps,
  };
}
function Bar() {
  const { act, dev } = useDriver();
  const photos = dev.outbox.filter((e) => (e.sizeKb ?? 0) > 100).length;
  return (
    <SyncBar
      online={dev.online}
      pending={dev.outbox.length}
      photos={photos}
      lastSyncAt={dev.lastSyncAt}
      onToggle={() => act.setOnline(dev.id, !dev.online)}
      onSync={() => act.sync(dev.id)}
    />
  );
}
function TempSheet({
  open,
  onClose,
  checkpoint,
  stopSeq,
  title,
}: {
  open: boolean;
  onClose: () => void;
  checkpoint: Checkpoint;
  stopSeq?: number;
  title: string;
}) {
  const { act, run } = useDriver();
  const [v, setV] = useState('');
  const [photo, setPhoto] = useState(false);
  const [note, setNote] = useState('');
  const val = Number(v);
  const oor = v !== '' && run ? val < run.tempMin || val > run.tempMax : false;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <Host
        tag="div"
        className="cap"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {I.thermo('var(--steel-ink)', 16)} Range {run?.tempMin} to {run?.tempMax} °C · time is
        stamped by the app · source Manual
      </Host>
      <Keypad value={v} onChange={setV} unit="°C" max={4} />
      {oor && (
        <Host tag="div" className="tint-red">
          <Host tag="strong">Out of range.</Host> Record it anyway, add what happened, and keep the
          doors shut. Ops is alerted on the next sync.
        </Host>
      )}
      <Host
        tag="div"
        style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10, width: '100%' }}
      >
        <Host tag="div" style={{ width: 112 }}>
          <PhotoSlot
            label="Gauge"
            done={photo}
            required
            onTake={() => {
              void capturePhoto('gauge').then((shot) => {
                if (shot) setPhoto(true);
              });
            }}
          />
        </Host>
        <Host
          tag="div"
          className="card card-pad col gap4"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Host tag="span" className="lbl">
            Time
          </Host>
          <Host tag="span" className="tabular h16">
            {fmtTime(Date.now())}
          </Host>
          <Host tag="span" className="cap">
            Not editable
          </Host>
        </Host>
      </Host>
      {/* Temperature breach: Require driver explanation to attach to the high-severity exception ticket */}
      {oor && (
        <Field label="What happened">
          <Host
            tag="input"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Door open 9 min at loading"
          />
        </Field>
      )}
      <Btn
        kind={oor ? 'danger' : 'primary'}
        disabled={v === '' || !photo}
        onClick={() => {
          if (run) act.recordTemp(run.id, checkpoint, val, stopSeq, note || undefined);
          onClose();
        }}
      >
        Record {v ? `${val.toFixed(1)} °C` : 'reading'}
      </Btn>
    </Sheet>
  );
}
function Run() {
  const { state, act, run, temps, dev } = useDriver();
  const [sheet, setSheet] = useState<null | 'load'>(null);
  if (!run)
    return (
      <Phone>
        <Bar />
        <TopBar title="Today's run" />
        <Host tag="div" className="body">
          <Host tag="div" className="tint-amber">
            No run assigned.
          </Host>
        </Host>
      </Phone>
    );
  const load = temps.find((t) => t.checkpoint === 'load');
  const pendingStops = run.stops.filter(
    (s) => (s.kind === 'farm' && !s.departedAt) || (s.kind === 'delivery' && !s.deliveredAt),
  ).length;
  return (
    <Phone>
      <Bar />
      <TopBar
        title="Today's run"
        right={
          <Host tag="span" className="cap">
            {dev.userName}
          </Host>
        }
      />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
          gap: 12,
        }}
      >
        <Host tag="div" className="card card-pad col gap6">
          <Host tag="div" className="row">
            <Host tag="span" className="h16">
              {run.id} · {run.truck}
            </Host>
            <Chip
              tone={
                run.status === 'in_progress'
                  ? 'info'
                  : run.status === 'delivered'
                    ? 'ok'
                    : 'neutral'
              }
              field
            >
              {run.status === 'in_progress'
                ? 'In progress'
                : run.status === 'delivered'
                  ? 'Delivered'
                  : run.status === 'closed'
                    ? 'Closed'
                    : 'Planned'}
            </Chip>
          </Host>
          <KV
            k="Route"
            v={`${run.stops.filter((s) => s.kind === 'farm').length} farms, then ${run.stops.find((s) => s.kind === 'delivery')?.label}`}
          />
          <KV k="Pending actions" v={pendingStops} />
          <KV
            k="Position sharing"
            v={
              <Host
                tag="button"
                onClick={() => {
                  const turningOn = !run.positionOn;
                  act.togglePosition(run.id);
                  if (turningOn)
                    void readPosition().then((position) => {
                      if (position) act.setRunPosition(run.id, position);
                    });
                }}
                style={{
                  fontWeight: 600,
                  color: run.positionOn ? 'var(--green)' : 'var(--red)',
                }}
              >
                {run.positionOn ? `On · every ${state.config.pingMinutes} min` : 'Off'}
              </Host>
            }
          />
        </Host>
        <Host tag="div" className="card card-pad row">
          <Host tag="div">
            <Host
              tag="div"
              style={{
                fontWeight: 600,
              }}
            >
              Load reading
            </Host>
            <Host tag="div" className="cap">
              Before leaving the node
            </Host>
          </Host>
          {load ? (
            <Host
              tag="span"
              className="tabular"
              style={{
                fontWeight: 600,
                color: load.outOfRange ? 'var(--red)' : undefined,
              }}
            >
              {load.valueC.toFixed(1)} °C · {fmtTime(load.at)}
            </Host>
          ) : (
            <Host
              tag="button"
              className="btn btn-secondary btn-md"
              onClick={() => setSheet('load')}
            >
              Record
            </Host>
          )}
        </Host>
        {run.stops.map((s) => {
          const done = s.kind === 'farm' ? !!s.departedAt : !!s.deliveredAt;
          const active =
            !done &&
            (s.seq === 1 || run.stops[s.seq - 2].departedAt || run.stops[s.seq - 2].deliveredAt);
          return (
            <Link
              key={s.seq}
              to={s.kind === 'farm' ? `/driver/stop/${s.seq}` : `/driver/deliver/${s.seq}`}
              className="item"
              style={{
                borderColor: active ? 'var(--blue)' : undefined,
              }}
            >
              <Host tag="div" className="row">
                <Host tag="div">
                  <Host tag="div" className="h16">
                    {s.seq}. {s.kind === 'farm' ? 'Collection' : 'Delivery'} · {s.label}
                  </Host>
                  <Host tag="div" className="cap">
                    {s.address} · {s.window}
                  </Host>
                </Host>
                <Chip tone={done ? 'ok' : s.arrivedAt ? 'info' : 'neutral'} field>
                  {done
                    ? s.kind === 'farm'
                      ? 'Collected'
                      : 'Delivered'
                    : s.arrivedAt
                      ? 'On site'
                      : 'Pending'}
                </Chip>
              </Host>
            </Link>
          );
        })}
        <Btn kind="secondary" to="/driver/complete">
          Complete run
        </Btn>
      </Host>
      <TempSheet
        open={sheet === 'load'}
        onClose={() => setSheet(null)}
        checkpoint="load"
        title="Load reading · node"
      />
    </Phone>
  );
}
function Stop() {
  const { seq } = useParams();
  const { state, act, run, temps } = useDriver();
  const [sheet, setSheet] = useState<null | 'farm_stop' | 'depart_last'>(null);
  if (!run) return <Navigate to="/driver" />;
  const s = run.stops.find((x) => x.seq === Number(seq));
  if (!s || s.kind !== 'farm') return <Navigate to="/driver" />;
  const f = state.farmers.find((x) => x.id === s.farmerId);
  const cons = state.consignments.filter((c) => c.runId === run.id && c.stopSeq === s.seq);
  const gate = stopCollection(cons);
  const reading = temps.find((t) => t.checkpoint === 'farm_stop' && t.stopSeq === s.seq);
  const isLast =
    s.seq === Math.max(...run.stops.filter((x) => x.kind === 'farm').map((x) => x.seq));
  const departLast = temps.find((t) => t.checkpoint === 'depart_last');
  return (
    <Phone>
      <Bar />
      <TopBar
        back="/driver"
        title={`${s.seq}. ${s.label}`}
        right={
          <Host tag="span" className="cap">
            {s.window}
          </Host>
        }
      />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
          gap: 12,
        }}
      >
        <Host tag="div" className="card card-pad col gap6">
          <KV k="Farmer" v={f?.name ?? ''} />
          <KV k="Address" v={s.address} />
          <KV k="Phone" v={f?.phone ?? 'No phone, ask the agent'} />
          <KV
            k="Consignments"
            v={
              cons.length
                ? cons
                    .map(
                      (c) =>
                        `${c.productName} ${c.farmGateKg ?? c.plannedKg} kg · ${CONS_LABEL[c.status]}`,
                    )
                    .join(', ')
                : 'Agent captures here'
            }
          />
        </Host>
        {!s.collectedAt && !gate.ready && !gate.nothingToCollect && (
          <Host tag="div" className="tint-amber">
            Collected stays locked until the agent has weighed this stop and put it in the cold box.
          </Host>
        )}
        {!s.departedAt && gate.nothingToCollect && (
          <Host tag="div" className="muted">
            Sale declined. Nothing to collect on this stop.
          </Host>
        )}
        <Host tag="div" className="lbl">
          Stamps
        </Host>
        {(['arrived', 'collected', 'departed'] as const).map((k, i) => {
          const t =
            k === 'arrived' ? s.arrivedAt : k === 'collected' ? s.collectedAt : s.departedAt;
          const prev =
            i === 0
              ? true
              : k === 'collected'
                ? !!s.arrivedAt && gate.ready
                : !!s.arrivedAt && (Boolean(s.collectedAt) || gate.nothingToCollect);
          const needReading = k === 'departed' && !reading;
          return t ? (
            <Host tag="div" key={k} className="card card-pad row">
              <Host
                tag="span"
                style={{
                  fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >
                {k}
              </Host>
              <Stamped t={t} />
            </Host>
          ) : (
            <Btn
              key={k}
              kind={k === 'departed' ? 'primary' : 'secondary'}
              disabled={!prev || needReading}
              onClick={() => act.stamp(run.id, s.seq, k)}
              style={{
                height: 56,
              }}
            >
              {k === 'arrived' ? 'Arrived' : k === 'collected' ? 'Collected' : 'Departed'}
            </Btn>
          );
        })}
        <Host
          tag="div"
          className="card card-pad row"
          style={{
            borderColor: !reading && s.arrivedAt ? 'var(--amber)' : undefined,
          }}
        >
          <Host tag="div">
            <Host
              tag="div"
              style={{
                fontWeight: 600,
              }}
            >
              Temperature at this stop
            </Host>
            <Host tag="div" className="cap">
              {reading ? `Photo ✓ · ${fmtStamp(reading.at)}` : 'Required before you depart'}
            </Host>
          </Host>
          {reading ? (
            <Host
              tag="span"
              className="tabular"
              style={{
                fontWeight: 600,
                color: reading.outOfRange ? 'var(--red)' : undefined,
              }}
            >
              {reading.valueC.toFixed(1)} °C
              {reading.outOfRange ? ' · out of range' : ''}
            </Host>
          ) : (
            <Host
              tag="button"
              className="btn btn-secondary btn-md"
              onClick={() => setSheet('farm_stop')}
            >
              Record
            </Host>
          )}
        </Host>
        {isLast && s.departedAt && (
          <Host
            tag="div"
            className="card card-pad row"
            style={{
              borderColor: !departLast ? 'var(--amber)' : undefined,
            }}
          >
            <Host tag="div">
              <Host
                tag="div"
                style={{
                  fontWeight: 600,
                }}
              >
                Departure from last stop
              </Host>
              <Host tag="div" className="cap">
                Checkpoint before the corridor
              </Host>
            </Host>
            {departLast ? (
              <Host
                tag="span"
                className="tabular"
                style={{
                  fontWeight: 600,
                }}
              >
                {departLast.valueC.toFixed(1)} °C
              </Host>
            ) : (
              <Host
                tag="button"
                className="btn btn-secondary btn-md"
                onClick={() => setSheet('depart_last')}
              >
                Record
              </Host>
            )}
          </Host>
        )}
      </Host>
      <TempSheet
        open={sheet === 'farm_stop'}
        onClose={() => setSheet(null)}
        checkpoint="farm_stop"
        stopSeq={s.seq}
        title={`Reading · stop ${s.seq} ${s.label}`}
      />
      <TempSheet
        open={sheet === 'depart_last'}
        onClose={() => setSheet(null)}
        checkpoint="depart_last"
        title="Reading · departure from last stop"
      />
    </Phone>
  );
}
function Deliver() {
  const { seq } = useParams();
  const { state, act, run, temps } = useDriver();
  const nav = useNavigate();
  const [sheet, setSheet] = useState<null | 'arrival' | 'handover'>(null);
  const [receiver, setReceiver] = useState('Yaw Ofori, receiving');
  const [signed, setSigned] = useState(false);
  const [rej, setRej] = useState<
    Record<
      string,
      {
        kg: string;
        reason: string;
      }
    >
  >({});
  if (!run) return <Navigate to="/driver" />;
  const s = run.stops.find((x) => x.seq === Number(seq));
  if (!s || s.kind !== 'delivery') return <Navigate to="/driver" />;
  const orders = state.orders.filter((o) => (s.orderIds ?? [s.orderId]).includes(o.id));
  const arrival = temps.find((t) => t.checkpoint === 'arrival');
  const handover = temps.find((t) => t.checkpoint === 'handover');
  const lines = orders.flatMap((o) =>
    o.lines.map((l) => ({
      o,
      l,
      delivered: state.consignments
        .filter(
          (c) =>
            c.lineId === l.id &&
            c.farmGateKg &&
            c.status !== 'declined' &&
            c.status !== 'cancelled',
        )
        .reduce((a, c) => a + (c.farmGateKg ?? 0), 0),
    })),
  );
  if (s.deliveredAt)
    return (
      <Phone>
        <Bar />
        <TopBar back="/driver" title={`${s.seq}. ${s.label}`} />
        <Host
          tag="div"
          className="body"
          style={{
            fontSize: 16,
          }}
        >
          <Host tag="div" className="tint-green">
            <Host tag="strong">Delivered.</Host> Signed {fmtStamp(s.deliveredAt)} by{' '}
            {orders[0]?.receiver}. Farmer payouts are now due within 24 hours.
          </Host>
          {orders.map((o) => (
            <Host tag="div" key={o.id} className="card card-pad col gap6">
              <Host tag="div" className="h16">
                {o.id}
              </Host>
              {o.lines.map((l) => (
                <KV
                  key={l.id}
                  k={l.name}
                  v={`${(l.deliveredKg ?? 0).toFixed(1)} kg${l.rejectedKg ? ` · ${l.rejectedKg} kg rejected` : ''}`}
                />
              ))}
            </Host>
          ))}
        </Host>
      </Phone>
    );
  return (
    <Phone>
      <Bar />
      <TopBar
        back="/driver"
        title={`${s.seq}. ${s.label}`}
        right={
          <Host tag="span" className="cap">
            {s.window}
          </Host>
        }
      />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
          gap: 12,
        }}
      >
        <Host tag="div" className="card card-pad row">
          <Host tag="div">
            <Host
              tag="div"
              style={{
                fontWeight: 600,
              }}
            >
              Arrival reading
            </Host>
            <Host tag="div" className="cap">
              {arrival ? fmtStamp(arrival.at) : 'On arrival at the buyer'}
            </Host>
          </Host>
          {arrival ? (
            <Host
              tag="span"
              className="tabular"
              style={{
                fontWeight: 600,
              }}
            >
              {arrival.valueC.toFixed(1)} °C
            </Host>
          ) : (
            <Host
              tag="button"
              className="btn btn-secondary btn-md"
              onClick={() => setSheet('arrival')}
            >
              Record
            </Host>
          )}
        </Host>
        {!s.arrivedAt ? (
          <Btn
            kind="secondary"
            style={{
              height: 56,
            }}
            onClick={() => act.stamp(run.id, s.seq, 'arrived')}
          >
            Arrived
          </Btn>
        ) : (
          <Host tag="div" className="card card-pad row">
            <Host
              tag="span"
              style={{
                fontWeight: 600,
              }}
            >
              Arrived
            </Host>
            <Stamped t={s.arrivedAt} />
          </Host>
        )}
        <Host tag="div" className="lbl">
          Lines · accepted and rejected kg
        </Host>
        {lines.map(({ o, l, delivered }) => {
          const r = rej[l.id];
          return (
            <Host tag="div" key={l.id} className="card card-pad col gap8">
              <Host tag="div" className="row">
                <Host tag="div">
                  <Host
                    tag="div"
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    {l.name}, {l.grade}{' '}
                    <Host tag="span" className="cap">
                      {o.id}
                    </Host>
                  </Host>
                  <Host tag="div" className="cap">
                    Ordered {l.qtyKg} kg · on truck {delivered.toFixed(1)} kg
                  </Host>
                </Host>
                {r ? (
                  <Chip tone="alert" field>
                    Rejected {r.kg || 0} kg
                  </Chip>
                ) : (
                  <Host
                    tag="button"
                    className="btn btn-secondary btn-md"
                    onClick={() =>
                      setRej((x) => ({
                        ...x,
                        [l.id]: {
                          kg: '',
                          reason: 'Bruised on arrival',
                        },
                      }))
                    }
                  >
                    Reject some
                  </Host>
                )}
              </Host>
              {r && (
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
                    placeholder="kg"
                    value={r.kg}
                    onChange={(e) =>
                      setRej((x) => ({
                        ...x,
                        [l.id]: {
                          ...r,
                          kg: e.target.value.replace(/[^0-9.]/g, ''),
                        },
                      }))
                    }
                    style={{
                      width: 90,
                    }}
                  />
                  <Host
                    tag="select"
                    className="input"
                    value={r.reason}
                    onChange={(e) =>
                      setRej((x) => ({
                        ...x,
                        [l.id]: {
                          ...r,
                          reason: e.target.value,
                        },
                      }))
                    }
                  >
                    {[
                      'Bruised on arrival',
                      'Below grade',
                      'Short weight',
                      'Temperature concern',
                    ].map((z) => (
                      <Host tag="option" key={z}>
                        {z}
                      </Host>
                    ))}
                  </Host>
                  <Host
                    tag="button"
                    className="cap"
                    onClick={() =>
                      setRej((x) => {
                        const y = {
                          ...x,
                        };
                        delete y[l.id];
                        return y;
                      })
                    }
                  >
                    ✕
                  </Host>
                </Host>
              )}
            </Host>
          );
        })}
        <Host tag="div" className="card card-pad row">
          <Host tag="div">
            <Host
              tag="div"
              style={{
                fontWeight: 600,
              }}
            >
              Handover reading
            </Host>
            <Host tag="div" className="cap">
              {handover ? fmtStamp(handover.at) : 'At the moment of handover'}
            </Host>
          </Host>
          {handover ? (
            <Host
              tag="span"
              className="tabular"
              style={{
                fontWeight: 600,
              }}
            >
              {handover.valueC.toFixed(1)} °C
            </Host>
          ) : (
            <Host
              tag="button"
              className="btn btn-secondary btn-md"
              onClick={() => setSheet('handover')}
            >
              Record
            </Host>
          )}
        </Host>
        <Field label="Receiver name">
          <Host
            tag="input"
            className="input"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
          />
        </Field>
        <Host tag="div" className="lbl">
          Signature
        </Host>
        <SignaturePad onChange={setSigned} />
      </Host>
      <Host tag="div" className="footer">
        <Btn
          kind="field"
          disabled={!s.arrivedAt || !signed || !receiver || !handover || !arrival}
          onClick={() => {
            act.deliver(
              run.id,
              s.seq,
              lines.map(({ o, l, delivered }) => {
                const r = rej[l.id];
                const rk = r ? Number(r.kg || 0) : 0;
                return {
                  orderId: o.id,
                  lineId: l.id,
                  acceptedKg: Math.max(0, +(delivered - rk).toFixed(1)),
                  rejectedKg: rk,
                  reason: r?.reason,
                };
              }),
              receiver,
            );
            nav('/driver');
          }}
        >
          Confirm delivery
        </Btn>
        {(!handover || !arrival) && (
          <Host
            tag="div"
            className="cap"
            style={{
              textAlign: 'center',
            }}
          >
            Arrival and handover readings are required.
          </Host>
        )}
      </Host>
      <TempSheet
        open={sheet === 'arrival'}
        onClose={() => setSheet(null)}
        checkpoint="arrival"
        stopSeq={s.seq}
        title={`Reading · arrival ${s.label}`}
      />
      <TempSheet
        open={sheet === 'handover'}
        onClose={() => setSheet(null)}
        checkpoint="handover"
        stopSeq={s.seq}
        title="Reading · handover"
      />
    </Phone>
  );
}
function Complete() {
  const { act, run } = useDriver();
  const nav = useNavigate();
  const [missing, setMissing] = useState<string[] | null>(null);
  if (!run) return <Navigate to="/driver" />;
  return (
    <Phone>
      <Bar />
      <TopBar back="/driver" title="Complete run" />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
        }}
      >
        {run.status === 'closed' ? (
          <Host tag="div" className="tint-green">
            <Host tag="strong">Run closed.</Host> {run.closedReason}
          </Host>
        ) : (
          <>
            <Host tag="div" className="muted">
              The run closes only when every checkpoint reading exists and the delivery is
              confirmed. Missing items are listed, not skipped.
            </Host>
            {missing && missing.length > 0 && (
              <ErrBanner title="Cannot complete yet" sub={missing.join(' · ')} />
            )}
            {missing && missing.length === 0 && (
              <Host tag="div" className="tint-green">
                All checkpoints present.
              </Host>
            )}
          </>
        )}
      </Host>
      <Host tag="div" className="footer">
        {run.status !== 'closed' && (
          <Btn
            kind="field"
            onClick={() => {
              const m = act.completeRun(run.id);
              setMissing(m);
              if (!m.length) nav('/driver');
            }}
          >
            Complete run
          </Btn>
        )}
      </Host>
    </Phone>
  );
}
export default function DriverApp() {
  return (
    <Routes>
      <Route index element={<Run />} />
      <Route path="stop/:seq" element={<Stop />} />
      <Route path="deliver/:seq" element={<Deliver />} />
      <Route path="complete" element={<Complete />} />
      <Route path="*" element={<Navigate to="/driver" />} />
    </Routes>
  );
}
