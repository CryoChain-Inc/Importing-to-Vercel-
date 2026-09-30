import { Host } from '../../ui/host';
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../../domain/store';
import type { Consignment, Farmer } from '../../domain/types';
import { CONS_LABEL, CONS_TONE, fmtStamp, fmtTime, ghs, round2 } from '../../domain/logic';
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
  SyncBar,
  TopBar,
} from '../../ui/kit';
import { Phone } from '../../layouts/shells';
import { capturePhoto, readPosition, shotDone } from '../../backend/media';
function useAgent() {
  const { state, act, now } = useStore();
  const dev = state.devices.find((d) => d.id === state.session.agentDeviceId)!;
  const mine = state.runs.filter((r) => r.agentId === dev.userName);
  const run =
    mine
      .filter((r) => r.status === 'in_progress' || r.status === 'planned')
      .sort((a, b) => a.date.localeCompare(b.date))[0] ??
    [...mine].sort((a, b) => b.date.localeCompare(a.date))[0];
  const cons = state.consignments
    .filter((c) => c.runId === run?.id)
    .sort((a, b) => (a.stopSeq ?? 99) - (b.stopSeq ?? 99));
  const pending = dev.outbox.length;
  const photos = dev.outbox
    .filter((e) => e.type === 'consignment.captured' || e.type === 'farmer.registered')
    .reduce(
      (a, e) =>
        a +
        (e.type === 'consignment.captured'
          ? Number(
              (
                e.payload as {
                  photos?: number;
                }
              ).photos ?? 2,
            )
          : 1),
      0,
    );
  return {
    state,
    act,
    now,
    dev,
    run,
    cons,
    pending,
    photos,
  };
}
function Bar() {
  const { act, dev, pending } = useAgent();
  const photos = dev.outbox.filter((e) => (e.sizeKb ?? 0) > 100).length;
  return (
    <SyncBar
      online={dev.online}
      pending={pending}
      photos={photos}
      lastSyncAt={dev.lastSyncAt}
      onToggle={() => act.setOnline(dev.id, !dev.online)}
      onSync={() => act.sync(dev.id)}
    />
  );
}
function Manifest() {
  const { state, run, cons, dev } = useAgent();
  const [locked, setLocked] = useState(false);
  if (locked)
    return (
      <Phone>
        <Host
          tag="div"
          style={{
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <Host
            tag="div"
            className="hero"
            style={{
              fontSize: 26,
            }}
          >
            Enter your PIN.
          </Host>
          <Host tag="div" className="muted">
            Device stays signed in for thirty days behind this PIN.
          </Host>
          <Host
            tag="div"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 8,
            }}
          >
            {[1, 2, 3, 4].map((i) => (
              <Host
                tag="div"
                key={i}
                style={{
                  height: 56,
                  border: '1px solid var(--steel)',
                  borderRadius: 6,
                  background: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 24,
                }}
              >
                •
              </Host>
            ))}
          </Host>
          <Btn kind="field" onClick={() => setLocked(false)}>
            Unlock
          </Btn>
        </Host>
      </Phone>
    );
  return (
    <Phone>
      <Bar />
      <TopBar
        title="Today's manifest"
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
        }}
      >
        {run ? (
          <Host tag="div" className="card card-pad col gap4">
            <Host tag="div" className="row">
              <Host tag="span" className="h16">
                {run.id} · {run.truck}
              </Host>
              <Chip
                tone={
                  run.status === 'in_progress'
                    ? 'info'
                    : run.status === 'delivered' || run.status === 'closed'
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
            <Host tag="div" className="cap">
              {run.stops.filter((s) => s.kind === 'farm').length} farm stops · delivery{' '}
              {run.stops.find((s) => s.kind === 'delivery')?.label}
            </Host>
          </Host>
        ) : (
          <Host tag="div" className="tint-amber">
            No run assigned today.
          </Host>
        )}
        <Host
          tag="div"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <Btn kind="secondary" to="/agent/register">
            Register farmer
          </Btn>
          <Btn kind="secondary" to="/agent/adhoc">
            Farmer not on list
          </Btn>
        </Host>
        {run?.stops
          .filter((s) => s.kind === 'farm')
          .map((s) => {
            const f = state.farmers.find((x) => x.id === s.farmerId)!;
            const cs = cons.filter((c) => c.farmerId === f.id);
            return (
              <Host tag="div" key={s.seq} className="card card-pad col gap8">
                <Host tag="div" className="row">
                  <Host
                    tag="div"
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Host
                      tag="div"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        background: 'var(--line-soft)',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      {f.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </Host>
                    <Host tag="div">
                      <Host tag="div" className="h16">
                        {s.seq}. {f.name}
                      </Host>
                      <Host tag="div" className="cap">
                        {f.village} · {s.window}
                      </Host>
                    </Host>
                  </Host>
                </Host>
                {cs.map((c) => (
                  <Link
                    key={c.id}
                    to={c.status === 'planned' ? `/agent/stop/${c.id}` : `/agent/done/${c.id}`}
                    className="row"
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      padding: '10px 12px',
                      background: 'var(--paper)',
                      borderRadius: 6,
                    }}
                  >
                    <Host tag="div">
                      <Host
                        tag="div"
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {c.productName} ·{' '}
                        {c.farmGateKg ? `${c.farmGateKg} kg` : `${c.plannedKg} kg planned`}
                      </Host>
                      <Host tag="div" className="cap tabular">
                        {c.pricePerKg.toFixed(2)} / kg
                        {c.adHoc ? ' · ad hoc' : ''}
                      </Host>
                    </Host>
                    <Host
                      tag="div"
                      className="col"
                      style={{
                        alignItems: 'flex-end',
                        gap: 4,
                      }}
                    >
                      <Chip tone={CONS_TONE[c.status]} field>
                        {c.status === 'planned' ? 'Pending' : CONS_LABEL[c.status]}
                      </Chip>
                      {c.pendingSync && (
                        <Host
                          tag="span"
                          className="cap"
                          style={{
                            color: 'var(--amber)',
                          }}
                        >
                          pending sync
                        </Host>
                      )}
                    </Host>
                  </Link>
                ))}
              </Host>
            );
          })}
        <Btn kind="secondary" to="/agent/queue">
          Sync queue ({dev.outbox.length})
        </Btn>
        <Host
          tag="button"
          className="cap"
          style={{
            textAlign: 'center',
            padding: 8,
          }}
          onClick={() => setLocked(true)}
        >
          Lock device
        </Host>
      </Host>
    </Phone>
  );
}
function Register() {
  const { act, state } = useAgent();
  const nav = useNavigate();
  const [f, setF] = useState({
    name: '',
    phone: '',
    alt: '',
    momo: '',
    network: 'MTN' as Farmer['network'],
    tier: 'unknown' as Farmer['tier'],
    village: '',
    product: 'tomato',
    kgReady: '',
  });
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [gps, setGps] = useState('Waiting for a position…');
  useEffect(() => {
    void readPosition().then((position) => {
      if (position) setGps(`${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
    });
  }, []);
  const up = (k: string, v: string) =>
    setF((x) => ({
      ...x,
      [k]: v,
    }));
  const dup = state.farmers.find((x) => f.momo.length >= 10 && x.momo === f.momo);
  const momoOk = /^0\d{9}$/.test(f.momo);
  const [dupOk, setDupOk] = useState(false);
  const net =
    f.momo.startsWith('024') ||
    f.momo.startsWith('054') ||
    f.momo.startsWith('055') ||
    f.momo.startsWith('059')
      ? 'MTN'
      : f.momo.startsWith('020') || f.momo.startsWith('050')
        ? 'Telecel'
        : f.momo.startsWith('026') ||
            f.momo.startsWith('027') ||
            f.momo.startsWith('056') ||
            f.momo.startsWith('057')
          ? 'AirtelTigo'
          : f.network;
  const ok = f.name && momoOk && f.village && consent && photo && (!dup || dupOk);
  return (
    <Phone>
      <Bar />
      <TopBar back="/agent" title="Register farmer" />
      <Host
        tag="div"
        className="body"
        style={{
          gap: 14,
          fontSize: 16,
        }}
      >
        <Field label="Full name">
          <Host
            tag="input"
            className="input"
            value={f.name}
            onChange={(e) => up('name', e.target.value)}
          />
        </Field>
        <Field label="Phone (optional)">
          <Host
            tag="input"
            className="input"
            placeholder="+233"
            value={f.phone}
            onChange={(e) => up('phone', e.target.value)}
          />
        </Field>
        <Field
          label="Mobile money number"
          error={
            f.momo && !momoOk
              ? 'Enter all ten digits, starting with 0.'
              : dup && !dupOk
                ? `${dup.name} in ${dup.village} already has this number.`
                : undefined
          }
        >
          <Host
            tag="input"
            className={`input tabular${f.momo && !momoOk ? ' err' : ''}`}
            inputMode="numeric"
            placeholder="024 000 0000"
            value={f.momo}
            onChange={(e) => up('momo', e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
        </Field>
        {dup && !dupOk && (
          <Btn kind="secondary" onClick={() => setDupOk(true)}>
            Different person, continue
          </Btn>
        )}
        <Host
          tag="div"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <Field label="Network" hint={momoOk ? `Detected ${net}` : undefined}>
            <Host
              tag="select"
              className="input"
              value={momoOk ? net : f.network}
              onChange={(e) => up('network', e.target.value)}
            >
              <Host tag="option">MTN</Host>
              <Host tag="option">Telecel</Host>
              <Host tag="option">AirtelTigo</Host>
            </Host>
          </Field>
          <Field label="Wallet tier">
            <Host
              tag="select"
              className="input"
              value={f.tier}
              onChange={(e) => up('tier', e.target.value)}
            >
              <Host tag="option" value="unknown">
                Unknown
              </Host>
              <Host tag="option" value="minimum">
                Minimum
              </Host>
              <Host tag="option" value="medium">
                Medium
              </Host>
              <Host tag="option" value="enhanced">
                Enhanced
              </Host>
            </Host>
          </Field>
        </Host>
        <Field label="Village">
          <Host
            tag="input"
            className="input"
            value={f.village}
            onChange={(e) => up('village', e.target.value)}
          />
        </Field>
        <Host tag="div" className="card card-pad row">
          <Host tag="span" className="muted">
            GPS
          </Host>
          <Host
            tag="span"
            className="tabular"
            style={{
              fontWeight: 600,
            }}
          >
            {gps}
          </Host>
        </Host>
        <Host tag="div" className="photo-grid">
          <PhotoSlot
            label="Portrait"
            done={photo}
            required
            onTake={() => {
              void capturePhoto('portrait').then((shot) => {
                if (shot) setPhoto(true);
              });
            }}
          />
          <Host tag="div" className="card card-pad col gap6">
            <Host tag="span" className="lbl">
              Ready to sell (optional)
            </Host>
            <Host
              tag="select"
              className="input"
              value={f.product}
              onChange={(e) => up('product', e.target.value)}
            >
              {state.products.map((p) => (
                <Host tag="option" key={p.id} value={p.id}>
                  {p.name}
                </Host>
              ))}
            </Host>
            <Host
              tag="input"
              className="input tabular"
              placeholder="kg"
              value={f.kgReady}
              onChange={(e) => up('kgReady', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Host>
        </Host>
        <Host tag="div" className="col gap10">
          <Host
            tag="div"
            style={{
              fontWeight: 600,
            }}
          >
            Consent · read aloud
          </Host>
          <Host
            tag="div"
            className="card card-pad"
            style={{
              lineHeight: 1.5,
            }}
          >
            "CryoChain will keep your name, phone, mobile money number, village and photo to buy
            your produce and pay you. We will send you SMS about collections and payments. Do you
            agree?"
          </Host>
          <Host
            tag="label"
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              minHeight: 48,
            }}
          >
            <Host
              tag="input"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{
                width: 28,
                height: 28,
              }}
            />
            <Host tag="span">Farmer heard this and agreed</Host>
          </Host>
        </Host>
      </Host>
      <Host tag="div" className="footer">
        <Btn
          kind="field"
          disabled={!ok}
          onClick={() => {
            act.registerFarmer({
              name: f.name,
              phone: f.phone || undefined,
              momo: f.momo,
              network: (momoOk ? net : f.network) as Farmer['network'],
              tier: f.tier,
              village: f.village,
              availability: f.kgReady
                ? {
                    productId: f.product,
                    expectedKg: Number(f.kgReady),
                  }
                : undefined,
            });
            nav('/agent');
          }}
        >
          Register farmer
        </Btn>
      </Host>
    </Phone>
  );
}
function Stop() {
  const { id } = useParams();
  const { state, act, cons } = useAgent();
  const nav = useNavigate();
  const c = cons.find((x) => x.id === id) ?? state.consignments.find((x) => x.id === id);
  const [step, setStep] = useState(() =>
    state.consignments.find((x) => x.id === id)?.status === 'captured' ? 2 : 0,
  );
  const [kgv, setKg] = useState(() =>
    String(state.consignments.find((x) => x.id === id)?.farmGateKg ?? ''),
  );
  const [grade, setGrade] = useState(
    () => state.consignments.find((x) => x.id === id)?.grade ?? '',
  );
  const [picked, setPicked] = useState(fmtTime(Date.now() - 3600000));
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [decline, setDecline] = useState(false);
  const [reason, setReason] = useState('Price not accepted');
  if (!c) return <Navigate to="/agent" />;
  if (c.status !== 'planned' && c.status !== 'captured')
    return <Navigate to={`/agent/done/${c.id}`} />;
  const f = state.farmers.find((x) => x.id === c.farmerId)!;
  const p = state.products.find((x) => x.id === c.productId)!;
  const w = Number(kgv || 0);
  const canWeigh = w > 0 && !!grade && shotDone(photos, 'crate') && shotDone(photos, 'scale');
  const toggle = async (k: string) => {
    if (shotDone(photos, k)) {
      setPhotos((ps) => ps.filter((item) => item !== k && !item.startsWith(`${k}:`)));
      return;
    }
    const shot = await capturePhoto(k);
    if (shot)
      setPhotos((ps) => [...ps.filter((item) => item !== k && !item.startsWith(`${k}:`)), shot]);
  };
  const steps = ['Identity', 'Weigh and grade', 'Into cold box'];
  return (
    <Phone>
      <Bar />
      <TopBar
        back="/agent"
        title={`${c.stopSeq ? c.stopSeq + '. ' : ''}${f.name}`}
        right={
          <Host tag="span" className="cap">
            {step + 1} of 3
          </Host>
        }
      />
      <Host
        tag="div"
        style={{
          display: 'flex',
          gap: 4,
          padding: '8px 16px 0',
        }}
      >
        {steps.map((s, i) => (
          <Host
            tag="div"
            key={s}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= step ? 'var(--blue)' : 'var(--steel)',
            }}
          />
        ))}
      </Host>
      {step === 0 && (
        <>
          <Host
            tag="div"
            className="body"
            style={{
              fontSize: 16,
              gap: 16,
            }}
          >
            <Host
              tag="div"
              className="card"
              style={{
                padding: 16,
                display: 'flex',
                gap: 14,
                alignItems: 'center',
              }}
            >
              <Host
                tag="div"
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  background: 'var(--line-soft)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 600,
                  fontSize: 22,
                }}
              >
                {f.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </Host>
              <Host tag="div">
                <Host tag="div" className="h20">
                  {f.name}
                </Host>
                <Host tag="div" className="muted">
                  {f.village} · {f.code}
                </Host>
                <Host tag="div" className="cap tabular">
                  {f.network} ••• ••• •{f.momo.slice(-3)}
                </Host>
              </Host>
            </Host>
            <Host tag="div" className="card card-pad col gap8">
              <KV k="Product" v={`${c.productName}`} />
              <KV k="Planned" v={`${c.plannedKg} kg`} />
              <KV
                k="Price to farmer"
                v={
                  <Host tag="span" className="tabular">
                    {c.pricePerKg.toFixed(2)} / kg
                  </Host>
                }
              />
              <KV k="Order" v={c.orderId} />
            </Host>
            <Host tag="div" className="muted">
              Confirm this is the farmer in front of you before weighing.
            </Host>
          </Host>
          <Host tag="div" className="footer">
            <Btn onClick={() => setStep(1)}>Confirm it is {f.name.split(' ')[0]}</Btn>
            <Btn kind="danger" onClick={() => setDecline(true)}>
              Decline sale
            </Btn>
          </Host>
        </>
      )}
      {step === 1 && (
        <>
          <Host
            tag="div"
            className="body"
            style={{
              fontSize: 16,
              gap: 14,
            }}
          >
            <Host tag="div" className="lbl">
              Weight from the scale
            </Host>
            <Keypad value={kgv} onChange={setKg} />
            {/* If weight falls below tolerance threshold, flag as short to trigger an ops allocation re-cut */}
            {w > 0 && w < c.plannedKg * (1 - state.config.tolerancePct / 100) && (
              <Host tag="div" className="tint-amber">
                Short: {round2(c.plannedKg - w)} kg under the {c.plannedKg} kg planned. Ops will
                re-cut.
              </Host>
            )}
            <Host tag="div" className="lbl">
              Grade
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
                  style={{
                    flex: 1,
                    height: 48,
                  }}
                  onClick={() => setGrade(g.grade)}
                >
                  {g.grade}
                </Host>
              ))}
            </Host>
            <Field
              label="Time picked, as told by the farmer"
              hint="The capture time is stamped by the app separately."
            >
              <Host
                tag="input"
                type="time"
                className="input"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
              />
            </Field>
            <Host tag="div" className="lbl">
              Photographs
            </Host>
            <Host tag="div" className="photo-grid">
              <PhotoSlot
                label="Crate"
                done={shotDone(photos, 'crate')}
                required
                onTake={() => {
                  void toggle('crate');
                }}
              />
              <PhotoSlot
                label="Scale display"
                done={shotDone(photos, 'scale')}
                required
                onTake={() => {
                  void toggle('scale');
                }}
              />
              <PhotoSlot
                label="Extra"
                done={shotDone(photos, 'extra1')}
                onTake={() => {
                  void toggle('extra1');
                }}
              />
              <PhotoSlot
                label="Extra"
                done={shotDone(photos, 'extra2')}
                onTake={() => {
                  void toggle('extra2');
                }}
              />
            </Host>
            <Field label="Notes (optional)">
              <Host
                tag="input"
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </Host>
          <Host tag="div" className="footer">
            <Btn
              disabled={!canWeigh}
              onClick={() => {
                act.capture(c.id, {
                  kg: w,
                  grade,
                  pickedAt: picked,
                  photos,
                  notes,
                });
                setStep(2);
              }}
            >
              Confirm weight and grade
            </Btn>
            {!canWeigh && (
              <Host
                tag="div"
                className="cap"
                style={{
                  textAlign: 'center',
                }}
              >
                Weight, grade and both required photographs before you continue.
              </Host>
            )}
          </Host>
        </>
      )}
      {step === 2 && (
        <>
          <Host
            tag="div"
            className="body"
            style={{
              fontSize: 16,
              gap: 14,
            }}
          >
            <Host tag="div" className="card card-pad col gap8">
              <KV k="Farmer" v={f.name} />
              <KV
                k="Weight"
                v={
                  <Host tag="span" className="tabular">
                    {w} kg
                  </Host>
                }
              />
              <KV k="Grade" v={grade} />
              <KV
                k="Amount owed"
                v={
                  <Host tag="span" className="tabular">
                    {ghs(round2(w * c.pricePerKg))}
                  </Host>
                }
              />
            </Host>
            <Host tag="div" className="muted">
              From the moment the crop is in the cold box it is CryoChain's. The record locks. The
              time is stamped by the app.
            </Host>
          </Host>
          <Host tag="div" className="footer">
            <Btn
              kind="field"
              onClick={() => {
                act.coldBox(c.id);
                nav(`/agent/done/${c.id}`);
              }}
            >
              Into cold box
            </Btn>
            <Btn kind="danger" onClick={() => setDecline(true)}>
              Decline sale
            </Btn>
          </Host>
        </>
      )}
      <Sheet open={decline} onClose={() => setDecline(false)} title="Decline sale">
        <Host tag="div" className="muted">
          Before the cold box the farmer can decline, and so can you. Nothing is owed.
        </Host>
        <Field label="Reason">
          <Host
            tag="select"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {[
              'Price not accepted',
              'Quality below grade C',
              'Farmer not present',
              'Produce not ready',
              'Quantity too small',
            ].map((r) => (
              <Host tag="option" key={r}>
                {r}
              </Host>
            ))}
          </Host>
        </Field>
        <Btn
          kind="danger"
          onClick={() => {
            act.declineSale(c.id, reason);
            setDecline(false);
            nav('/agent');
          }}
        >
          Confirm decline
        </Btn>
      </Sheet>
    </Phone>
  );
}
function Done() {
  const { id } = useParams();
  const { state, act } = useAgent();
  const c = state.consignments.find((x) => x.id === id);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  if (!c) return <Navigate to="/agent" />;
  const f = state.farmers.find((x) => x.id === c.farmerId)!;
  return (
    <Phone>
      <Bar />
      <TopBar
        back="/agent"
        title={f.name}
        right={
          <Chip tone={CONS_TONE[c.status]} field>
            {CONS_LABEL[c.status]}
          </Chip>
        }
      />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
          gap: 14,
        }}
      >
        {c.status === 'declined' ? (
          <Host tag="div" className="tint-red">
            <Host tag="strong">Sale declined.</Host> {c.declineReason}. Nothing is owed. Ops will
            re-cut the order.
          </Host>
        ) : c.status === 'captured' ? (
          <Host tag="div" className="tint-amber col gap8">
            <Host tag="div">
              <Host tag="strong">Weighed, not in the cold box yet.</Host> Nothing is owed until the
              crop is in the box.
            </Host>
            <Btn kind="field" to={`/agent/stop/${c.id}`}>
              Into cold box
            </Btn>
          </Host>
        ) : (
          <Host
            tag="div"
            className="tint-green"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            {I.lock('var(--green)', 20)}
            <Host tag="div">
              <Host
                tag="div"
                style={{
                  fontWeight: 600,
                }}
              >
                Locked at {c.coldBoxAt ? fmtStamp(c.coldBoxAt) : ''}
              </Host>
              <Host
                tag="div"
                style={{
                  fontSize: 13,
                }}
              >
                Read only on this device. Changes go to ops as a correction request.
              </Host>
            </Host>
          </Host>
        )}
        <Host tag="div" className="card card-pad col gap8">
          <KV k="Product" v={c.productName} />
          <KV k="Weight" v={c.farmGateKg ? `${c.farmGateKg} kg` : '—'} />
          <KV k="Grade" v={c.grade ?? '—'} />
          <KV k="Picked" v={c.pickedAt ?? '—'} />
          <KV k="Captured" v={c.capturedAt ? fmtStamp(c.capturedAt) : '—'} />
          <KV
            k="Photos"
            v={
              c.photos.length
                ? `${c.photos.length} · ${c.pendingSync ? 'pending upload' : 'uploaded'}`
                : '—'
            }
          />
          {c.farmGateKg && <KV k="Amount" v={ghs(round2(c.farmGateKg * c.pricePerKg))} />}
        </Host>
        {c.pendingSync && (
          <Host tag="div" className="tint-amber">
            Held on this device. It uploads when the phone finds signal.
          </Host>
        )}
        {c.status !== 'declined' && (
          <Host tag="div" className="card card-pad col gap8">
            <Host
              tag="div"
              style={{
                fontWeight: 600,
              }}
            >
              Request a correction
            </Host>
            <Host tag="div" className="cap">
              Goes to the node manager. The locked record does not change.
            </Host>
            <Host
              tag="input"
              className="input"
              placeholder="What is wrong and why"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Btn
              kind="secondary"
              disabled={!note || sent}
              onClick={() => {
                act.requestCorrection(c.id, note);
                setSent(true);
              }}
            >
              {sent ? 'Sent to ops' : 'Send request'}
            </Btn>
          </Host>
        )}
      </Host>
    </Phone>
  );
}
function AdHoc() {
  const { state, act, run } = useAgent();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [farmerId, setFarmerId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [kgv, setKg] = useState('80');
  const orders = state.orders.filter(
    (o) => o.runId === run?.id && o.status !== 'delivered' && o.status !== 'closed',
  );
  const fs = state.farmers
    .filter(
      (f) =>
        !q ||
        f.name.toLowerCase().includes(q.toLowerCase()) ||
        f.village.toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 6);
  const o = orders.find((x) => x.id === orderId);
  return (
    <Phone>
      <Bar />
      <TopBar back="/agent" title="Farmer not on manifest" />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
          gap: 14,
        }}
      >
        <Host tag="div" className="tint-amber">
          Ad hoc consignments are captured now and confirmed by ops before the settlement becomes
          payable.
        </Host>
        <Field label="Find farmer">
          <Host
            tag="input"
            className="input"
            placeholder="Name or village"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <Host tag="div" className="col gap6">
          {fs.map((f) => (
            <Host
              tag="button"
              key={f.id}
              className="card card-pad row"
              style={{
                textAlign: 'left',
                borderColor: farmerId === f.id ? 'var(--blue)' : undefined,
              }}
              onClick={() => setFarmerId(f.id)}
            >
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
                  {f.village}
                </Host>
              </Host>
              {farmerId === f.id && I.check('var(--blue)', 18)}
            </Host>
          ))}
          <Link
            to="/agent/register"
            className="cap"
            style={{
              fontWeight: 600,
            }}
          >
            Not registered yet? Register first →
          </Link>
        </Host>
        <Field label="Against order">
          <Host
            tag="select"
            className="input"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          >
            <Host tag="option" value="">
              Choose
            </Host>
            {orders.map((x) => (
              <Host tag="option" key={x.id} value={x.id}>
                {x.id} · {x.lines.map((l) => l.name).join(', ')}
              </Host>
            ))}
          </Host>
        </Field>
        <Field label="Expected kg">
          <Host
            tag="input"
            className="input tabular"
            value={kgv}
            onChange={(e) => setKg(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </Field>
      </Host>
      <Host tag="div" className="footer">
        <Btn
          disabled={!farmerId || !o || !Number(kgv)}
          onClick={() => {
            const id = act.adHoc(farmerId, o!.id, o!.lines[0].id, Number(kgv));
            nav(`/agent/stop/${id}`);
          }}
        >
          Start capture
        </Btn>
      </Host>
    </Phone>
  );
}
function Queue() {
  const { state, act, dev } = useAgent();
  const errs = state.events.filter((e) => e.deviceId === dev.id && e.status === 'error');
  const recent = state.events.filter((e) => e.deviceId === dev.id).slice(0, 8);
  return (
    <Phone>
      <Bar />
      <TopBar
        back="/agent"
        title="Sync queue"
        right={
          <Host tag="span" className="cap">
            {dev.storageMb > 1000
              ? (dev.storageMb / 1024).toFixed(1) + ' GB free'
              : dev.storageMb + ' MB free'}
          </Host>
        }
      />
      <Host
        tag="div"
        className="body"
        style={{
          fontSize: 16,
        }}
      >
        {dev.clockSkewMin > 10 && (
          <ErrBanner
            title="Device clock is wrong"
            sub="Set the time to automatic. Readings keep the time they were taken."
          />
        )}
        {dev.storageMb < 200 && (
          <ErrBanner title="Storage nearly full" sub="Delete synced photos below, then retake." />
        )}
        <Host tag="div" className="lbl">
          Waiting to upload · {dev.outbox.length}
        </Host>
        {dev.outbox.length === 0 && (
          <Host tag="div" className="card card-pad muted">
            Nothing waiting. Everything on this device has reached the node.
          </Host>
        )}
        {dev.outbox.map((e) => (
          <Host tag="div" key={e.id} className="card card-pad row">
            <Host tag="div">
              <Host
                tag="div"
                style={{
                  fontWeight: 600,
                }}
              >
                {e.type}
              </Host>
              <Host tag="div" className="cap">
                seq {e.seq} · {fmtStamp(e.occurredAt)} · {e.sizeKb} KB
              </Host>
            </Host>
            <Chip tone="warn" field>
              Pending
            </Chip>
          </Host>
        ))}
        {dev.online && dev.outbox.length > 0 && (
          <Btn onClick={() => act.sync(dev.id)}>Sync now</Btn>
        )}
        {errs.length > 0 && (
          <>
            <Host tag="div" className="lbl">
              Needs ops
            </Host>
            {errs.map((e) => (
              <Host tag="div" key={e.id} className="card card-pad row">
                <Host tag="div">
                  <Host
                    tag="div"
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    {e.type}
                  </Host>
                  <Host tag="div" className="cap">
                    seq {e.seq}
                  </Host>
                </Host>
                <Chip tone="alert" field>
                  Needs ops
                </Chip>
              </Host>
            ))}
          </>
        )}
        <Host tag="div" className="lbl">
          Recently synced
        </Host>
        {recent.map((e) => (
          <Host tag="div" key={e.id} className="card card-pad row">
            <Host tag="div">
              <Host
                tag="div"
                style={{
                  fontWeight: 600,
                }}
              >
                {e.type}
              </Host>
              <Host tag="div" className="cap">
                seq {e.seq} · took {e.occurredAt ? fmtTime(e.occurredAt) : ''} · arrived{' '}
                {e.receivedAt ? fmtTime(e.receivedAt) : ''}
              </Host>
            </Host>
            <Chip tone="ok" field>
              Applied
            </Chip>
          </Host>
        ))}
      </Host>
    </Phone>
  );
}
export function consLabel(c: Consignment) {
  return CONS_LABEL[c.status];
}
export default function AgentApp() {
  return (
    <Routes>
      <Route index element={<Manifest />} />
      <Route path="register" element={<Register />} />
      <Route path="stop/:id" element={<Stop />} />
      <Route path="done/:id" element={<Done />} />
      <Route path="adhoc" element={<AdHoc />} />
      <Route path="queue" element={<Queue />} />
      <Route path="*" element={<Navigate to="/agent" />} />
    </Routes>
  );
}
