import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { completeStop } from '../../../services/driver.route.service';
import { recordHandover, type DeliveryOrder, type DropoffStop, type PickupStop } from '../../../services/driver.deliveries.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { NOTE_MAX, parseReading } from '../reading';
import { Empty } from '../../ops/components/OpsBits';
import { useAction } from '../../ops/components/useAction';
import { BackButton, Fact, NextCard, openMaps, openPhone, QuickActions, RowCard, StepDot } from './bits';

const kgText = (n: number) => `${n} kg`;

/** The stop the driver should go to next: first farmer still to collect, else the buyer. */
export function nextStop(order: DeliveryOrder): { kind: 'pickup'; pickup: PickupStop } | { kind: 'dropoff' } | null {
  const pickup = order.pickups.find((p) => p.state === 'pending');
  if (pickup) return { kind: 'pickup', pickup };
  return order.dropoff?.state === 'pending' ? { kind: 'dropoff' } : null;
}

export function DeliveryList({ orders, past, onOpen }: { orders: DeliveryOrder[]; past: boolean; onOpen: (id: string) => void }) {
  const s = useThemedStyles(styles);
  const rows = orders.filter((o) => (past ? !o.ongoing : o.ongoing));
  if (rows.length === 0) {
    return (
      <Empty
        icon="package"
        title={past ? 'No past deliveries' : 'No ongoing deliveries'}
        hint={past ? 'Deliveries you have finished will be listed here.' : 'Paid orders near you are added here once your location is on.'}
      />
    );
  }
  return (
    <View style={s.list}>
      {rows.map((o) => (
        <RowCard
          key={o.id}
          title={o.buyerName}
          lead={past ? <StepDot n={0} done /> : undefined}
          sub={`${o.code} · ${o.pickups.length} farmer${o.pickups.length === 1 ? '' : 's'}${past ? ` · ${kgText(Math.round(o.pickups.reduce((sum, p) => sum + (p.recordedKg ?? p.expectedKg), 0) * 10) / 10)}` : ''}`}
          done={past}
          right={past ? undefined : <Badge label={`${o.pickups.filter((p) => p.state === 'pending').length} to collect`} tone="info" />}
          onPress={() => onOpen(o.id)}
        />
      ))}
    </View>
  );
}

/** The route as numbered steps: farmers first, then the buyer. The next step is the only one with a button. */
export function DeliveryOrderPage({
  order, onBack, onPickup, onDropoff,
}: {
  order: DeliveryOrder;
  onBack?: () => void;
  onPickup: (stopId: string) => void;
  onDropoff: () => void;
}) {
  const s = useThemedStyles(styles);
  const next = nextStop(order);
  const steps = order.pickups.length + (order.dropoff ? 1 : 0);
  const done = order.pickups.filter((p) => p.state === 'done').length + (order.dropoff?.state === 'done' ? 1 : 0);
  return (
    <View style={s.list}>
      {onBack ? <BackButton label="Delivery" onPress={onBack} /> : null}
      <View style={s.top}>
        <Text style={s.name}>{onBack ? order.code : `Current route · ${order.code}`}</Text>
        <Badge label={`${done} of ${steps} done`} tone={done === steps && steps > 0 ? 'success' : 'info'} />
      </View>
      {next?.kind === 'pickup' ? (
        <NextCard
          eyebrow="Next stop"
          title={next.pickup.farmerName}
          lines={[`${next.pickup.product} · grade ${next.pickup.expectedGrade} · ${kgText(next.pickup.expectedKg)}`, next.pickup.place]}
          label="Start pickup"
          onPress={() => onPickup(next.pickup.stopId)}
        />
      ) : next?.kind === 'dropoff' ? (
        <NextCard eyebrow="Last stop" title={order.buyerName} lines={[order.address || 'Buyer address']} label="Deliver to buyer" onPress={onDropoff} />
      ) : null}
      <Card style={s.route}>
        {order.pickups.map((p, i) => {
          const isDone = p.state === 'done';
          return (
            <RouteStop
              key={p.stopId}
              n={i + 1}
              title={p.farmerName}
              sub={isDone && p.recordedKg != null ? `${kgText(p.recordedKg)} collected` : `${p.product} · ${kgText(p.expectedKg)}`}
              done={isDone}
              now={next?.kind === 'pickup' && next.pickup.stopId === p.stopId}
              last={!order.dropoff && i === order.pickups.length - 1}
              onPress={() => onPickup(p.stopId)}
            />
          );
        })}
        {order.dropoff ? (
          <RouteStop
            n={order.pickups.length + 1}
            title={`Deliver to ${order.buyerName}`}
            sub={order.address || 'Buyer address'}
            done={order.dropoff.state === 'done'}
            now={next?.kind === 'dropoff'}
            last
            onPress={onDropoff}
          />
        ) : <Text style={s.meta}>The buyer drop-off is not on your route yet.</Text>}
        {order.pickups.length === 0 ? <Text style={s.meta}>No farm pickups on this order yet.</Text> : null}
      </Card>
    </View>
  );
}

/** One stop on the route: marker, a line down to the next stop, and the stop's details. */
function RouteStop({ n, title, sub, done, now, last, onPress }: { n: number; title: string; sub: string; done: boolean; now: boolean; last?: boolean; onPress: () => void }) {
  const s = useThemedStyles(styles);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.stop, pressed ? { opacity: 0.85 } : null]}>
      <View style={s.rail}>
        <StepDot n={n} done={done} now={now} />
        {last ? null : <View style={[s.line, done ? s.lineDone : null]} />}
      </View>
      <View style={[s.stopText, last ? null : s.stopGap]}>
        <View style={s.top}>
          <Text style={[s.name, done ? s.muted : null]} numberOfLines={1}>{title}</Text>
          {now ? <Badge label="Next" tone="info" /> : null}
        </View>
        <Text style={s.meta} numberOfLines={2}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function StopHeader({ title, lines, phone, call, spot }: { title: string; lines: string[]; phone: string; call: string; spot: { lat: number; lng: number } | null }) {
  const s = useThemedStyles(styles);
  const actions = [
    ...(phone ? [{ icon: 'phone' as const, label: call, onPress: () => openPhone(phone) }] : []),
    ...(spot ? [{ icon: 'pin' as const, label: 'Navigate', onPress: () => openMaps(spot.lat, spot.lng) }] : []),
  ];
  return (
    <Card style={s.item}>
      <Text style={s.title}>{title}</Text>
      {lines.filter(Boolean).map((line) => <Text key={line} style={s.meta}>{line}</Text>)}
      <QuickActions items={actions} />
    </Card>
  );
}

export function PickupPage({
  order, pickup, range, onBack, onChange,
}: {
  order: DeliveryOrder;
  pickup: PickupStop;
  range: { min: number | null; max: number | null };
  onBack: () => void;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const done = pickup.state === 'done';
  return (
    <View style={s.list}>
      <BackButton label="Route" onPress={onBack} />
      <StopHeader
        title={pickup.farmerName}
        lines={[pickup.place || 'Farm address not set']}
        phone={pickup.farmerPhone}
        call="Call farmer"
        spot={{ lat: pickup.lat, lng: pickup.lng }}
      />
      <Card tone="tint" style={s.facts}>
        <Fact label="Product" value={pickup.product} />
        <Fact label="Listed grade" value={pickup.expectedGrade} />
        <Fact label="Listed weight" value={kgText(pickup.expectedKg)} />
      </Card>
      {done ? <SavedReading kg={pickup.recordedKg} grade={pickup.recordedGrade} temp={pickup.temperatureC} note={pickup.note} onBack={onBack} backLabel="Back to route" /> : (
        <ReadingForm
          kind="pickup"
          range={range}
          initial={{ kg: pickup.recordedKg ?? pickup.expectedKg, grade: pickup.recordedGrade ?? pickup.expectedGrade, temp: pickup.temperatureC, note: pickup.note }}
          blocked={false}
          completeLabel="Confirm pickup"
          onSave={(reading) => recordHandover(pickup.stopId, reading)}
          onComplete={() => completeStop(pickup.stopId)}
          onChange={onChange}
        />
      )}
    </View>
  );
}

export function DropoffPage({
  order, dropoff, range, onBack, onChange,
}: {
  order: DeliveryOrder;
  dropoff: DropoffStop;
  range: { min: number | null; max: number | null };
  onBack: () => void;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const waiting = order.pickups.filter((p) => p.state === 'pending').length;
  const done = dropoff.state === 'done';
  const kgTotal = order.pickups.reduce((sum, p) => sum + (p.recordedKg ?? p.expectedKg), 0);
  return (
    <View style={s.list}>
      <BackButton label="Route" onPress={onBack} />
      <StopHeader
        title={order.buyerName}
        lines={[order.address || 'Buyer address']}
        phone={order.buyerPhone}
        call="Call buyer"
        spot={{ lat: dropoff.lat, lng: dropoff.lng }}
      />
      <Card tone="tint" style={s.facts}>
        <Fact label="Farmers" value={String(order.pickups.length)} />
        <Fact label="Total weight" value={kgText(Math.round(kgTotal * 10) / 10)} />
      </Card>
      {done ? <SavedReading kg={null} grade={null} temp={dropoff.temperatureC} note={dropoff.note} onBack={onBack} backLabel="Back to route" /> : (
        <ReadingForm
          kind="dropoff"
          range={range}
          initial={{ kg: null, grade: null, temp: dropoff.temperatureC, note: dropoff.note }}
          blocked={waiting > 0}
          blockedText={`Collect from ${waiting} more farmer${waiting === 1 ? '' : 's'} before delivering.`}
          completeLabel="Confirm delivery"
          onSave={(reading) => recordHandover(dropoff.stopId, reading)}
          onComplete={() => completeStop(dropoff.stopId)}
          onChange={onChange}
        />
      )}
    </View>
  );
}

function SavedReading({ kg, grade, temp, note, onBack, backLabel }: { kg: number | null; grade: string | null; temp: number | null; note: string; onBack: () => void; backLabel: string }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Card style={s.item}>
      <View style={s.top}>
        <Text style={s.title}>Done</Text>
        <Icon name="check" size={22} color={colors.brandInk} />
      </View>
      {kg != null ? <Text style={s.meta}>{kgText(kg)} · grade {grade}</Text> : null}
      <Text style={s.meta}>{temp == null ? 'No temperature recorded' : `${temp} °C on record`}</Text>
      {note ? <Text style={s.meta}>{note}</Text> : null}
      <Button label={backLabel} variant="tonal" onPress={onBack} />
    </Card>
  );
}

function ReadingForm({
  kind, range, initial, blocked, blockedText, completeLabel, onSave, onComplete, onChange,
}: {
  kind: 'pickup' | 'dropoff';
  range: { min: number | null; max: number | null };
  initial: { kg: number | null; grade: string | null; temp: number | null; note: string };
  blocked: boolean;
  blockedText?: string;
  completeLabel: string;
  onSave: (reading: { kg: number | null; grade: string | null; temp: number; note: string | null }) => Promise<void>;
  onComplete: () => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [kg, setKg] = useState(initial.kg == null ? '' : String(initial.kg));
  const [grade, setGrade] = useState(initial.grade ?? '');
  const [temp, setTemp] = useState(initial.temp == null ? '' : String(initial.temp));
  const [note, setNote] = useState(initial.note);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    setKg(initial.kg == null ? '' : String(initial.kg));
    setGrade(initial.grade ?? '');
    setTemp(initial.temp == null ? '' : String(initial.temp));
    setNote(initial.note);
  }, [initial.kg, initial.grade, initial.temp, initial.note]);

  const parsed = parseReading({ kind, kg, grade, temp, note, min: range.min, max: range.max });
  const lo = range.min ?? -100;
  const hi = range.max ?? 100;

  return (
    <Card style={s.item}>
      <Text style={s.title}>{kind === 'pickup' ? 'Check the produce' : 'Check the temperature'}</Text>
      {kind === 'pickup' ? (
        <>
          <Input label="Weight collected (kg)" value={kg} onChangeText={setKg} keyboardType="decimal-pad" maxLength={8} />
          <ChoiceChips label="Grade" options={['A', 'B', 'C']} value={grade} onChange={setGrade} />
        </>
      ) : null}
      <Input label="Temperature (°C)" value={temp} onChangeText={setTemp} keyboardType="numbers-and-punctuation" maxLength={6} hint={`Safe range ${lo} to ${hi} °C`} />
      <Input label="Notes (optional)" value={note} onChangeText={setNote} maxLength={NOTE_MAX} />
      {tried && !parsed.ok ? <Banner text={parsed.error} /> : null}
      {error ? <Banner text={error} /> : null}
      {blocked && blockedText ? <Banner tone="info" text={blockedText} /> : null}
      <Button size="lg" label={completeLabel} icon="check" loading={busy} disabled={blocked} onPress={() => {
        setTried(true);
        if (!parsed.ok) return;
        const value = parsed.value;
        // Save the reading first so the stop is never completed without it.
        run(async () => { await onSave(value); await onComplete(); });
      }} />
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 10 },
  facts: { flexDirection: 'row' as const, gap: 12, padding: 16 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  title: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  route: { padding: 16 },
  stop: { flexDirection: 'row' as const, gap: 12 },
  rail: { alignItems: 'center' as const, width: 32 },
  line: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1, backgroundColor: c.borderSubtle },
  lineDone: { backgroundColor: c.brand600 },
  stopText: { flex: 1, gap: 2, paddingTop: 5 },
  stopGap: { paddingBottom: 18 },
  muted: { color: c.inkMuted },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
