import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { completeStop } from '../../../services/driver.route.service';
import { recordHandover, type DeliveryOrder, type DropoffStop, type PickupStop } from '../../../services/driver.deliveries.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { NOTE_MAX, parseReading } from '../reading';
import { Empty } from '../../ops/components/OpsBits';
import { useAction } from '../../ops/components/useAction';
import { BackButton, DetailCard, openMaps, openPhone } from './bits';

const kgText = (n: number) => `${n} kg`;

export function DeliveryList({ orders, past, onOpen }: { orders: DeliveryOrder[]; past: boolean; onOpen: (id: string) => void }) {
  const s = useThemedStyles(styles);
  const rows = orders.filter((o) => (past ? !o.ongoing : o.ongoing));
  if (rows.length === 0) {
    return (
      <Empty
        icon="package"
        title={past ? 'No past deliveries' : 'No ongoing deliveries'}
        hint={past
          ? 'Deliveries you have finished will be listed here.'
          : 'Paid orders near you are added here once your location is on. Open one to see each farmer and the buyer.'}
      />
    );
  }
  return (
    <View style={s.list}>
      {rows.map((o) => {
        const next = o.pickups.find((p) => p.state === 'pending');
        const pending = o.pickups.filter((p) => p.state === 'pending').length;
        return (
          <Card key={o.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name}>{o.code}</Text>
              <Badge label={o.ongoing ? (pending ? `${pending} to collect` : 'Ready to deliver') : 'Delivered'} tone={o.ongoing ? 'info' : 'success'} />
            </View>
            <Text style={s.meta}>Buyer {o.buyerName}</Text>
            <Text style={s.meta}>{o.pickups.length} farmer{o.pickups.length === 1 ? '' : 's'}</Text>
            {next ? <Text style={s.meta}>Next: {next.farmerName} · {next.product}</Text> : null}
            {!next && o.dropoff?.state === 'pending' ? <Text style={s.meta}>Next: deliver to {o.buyerName}</Text> : null}
            <Button size="sm" label="Open delivery" onPress={() => onOpen(o.id)} />
          </Card>
        );
      })}
    </View>
  );
}

export function DeliveryOrderPage({
  order, onBack, onPickup, onDropoff,
}: {
  order: DeliveryOrder;
  onBack?: () => void;
  onPickup: (stopId: string) => void;
  onDropoff: () => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.list}>
      {onBack ? <BackButton label="Delivery" onPress={onBack} /> : null}
      <DetailCard
        title={`Buyer · ${order.buyerName}`}
        lines={[order.buyerPhone ? `Phone ${order.buyerPhone}` : '', order.address || 'Address not set']}
        actions={
          <>
            {order.buyerPhone ? <Button size="sm" variant="outline" icon="phone" label="Call buyer" onPress={() => openPhone(order.buyerPhone)} /> : null}
            {order.lat != null && order.lng != null ? <Button size="sm" variant="outline" icon="pin" label="Navigate" onPress={() => openMaps(order.lat as number, order.lng as number)} /> : null}
          </>
        }
      />
      <Text style={s.section}>Farmers to collect from</Text>
      {order.pickups.length === 0 ? <Text style={s.meta}>No farm pickups on this order yet.</Text> : order.pickups.map((p) => (
        <Card key={p.stopId} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{p.farmerName}</Text>
            <Badge label={p.state === 'done' ? 'Collected' : 'Pick up'} tone={p.state === 'done' ? 'success' : 'info'} />
          </View>
          <Text style={s.meta}>{p.product} · grade {p.expectedGrade} · {kgText(p.expectedKg)}</Text>
          {p.place ? <Text style={s.meta}>{p.place}</Text> : null}
          <Button size="sm" label="Open pickup" onPress={() => onPickup(p.stopId)} />
        </Card>
      ))}
      <Text style={s.section}>Drop-off</Text>
      {order.dropoff ? (
        <Card style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{order.buyerName}</Text>
            <Badge label={order.dropoff.state === 'done' ? 'Delivered' : 'Deliver'} tone={order.dropoff.state === 'done' ? 'success' : 'info'} />
          </View>
          <Text style={s.meta}>{order.address || 'Buyer address'}</Text>
          <Button size="sm" label="Open drop-off" onPress={onDropoff} />
        </Card>
      ) : <Text style={s.meta}>The buyer drop-off is not on your route yet.</Text>}
    </View>
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
      <BackButton label="Back to delivery" onPress={onBack} />
      <DetailCard
        title={pickup.farmerName}
        lines={[
          pickup.farmerPhone ? `Phone ${pickup.farmerPhone}` : 'No phone on file',
          pickup.place || 'Farm address not set',
          `${pickup.product} · listed as grade ${pickup.expectedGrade} · ${kgText(pickup.expectedKg)}`,
        ]}
        actions={
          <>
            {pickup.farmerPhone ? <Button size="sm" variant="outline" icon="phone" label="Call farmer" onPress={() => openPhone(pickup.farmerPhone)} /> : null}
            <Button size="sm" variant="outline" icon="pin" label="Navigate" onPress={() => openMaps(pickup.lat, pickup.lng)} />
          </>
        }
      />
      {done ? <SavedReading kg={pickup.recordedKg} grade={pickup.recordedGrade} temp={pickup.temperatureC} note={pickup.note} /> : (
        <ReadingForm
          kind="pickup"
          range={range}
          initial={{ kg: pickup.recordedKg, grade: pickup.recordedGrade, temp: pickup.temperatureC, note: pickup.note }}
          blocked={false}
          completeLabel="Mark collected"
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
  const waiting = order.pickups.some((p) => p.state === 'pending');
  const done = dropoff.state === 'done';
  return (
    <View style={s.list}>
      <BackButton label="Back to delivery" onPress={onBack} />
      <DetailCard
        title={`Deliver to ${order.buyerName}`}
        lines={[order.buyerPhone ? `Phone ${order.buyerPhone}` : '', order.address || 'Buyer address']}
        actions={
          <>
            {order.buyerPhone ? <Button size="sm" variant="outline" icon="phone" label="Call buyer" onPress={() => openPhone(order.buyerPhone)} /> : null}
            <Button size="sm" variant="outline" icon="pin" label="Navigate" onPress={() => openMaps(dropoff.lat, dropoff.lng)} />
          </>
        }
      />
      <Text style={s.section}>Produce on this order</Text>
      {order.pickups.map((p) => (
        <Text key={p.stopId} style={s.meta}>
          {p.farmerName} · {p.product} · {p.recordedKg != null ? `${kgText(p.recordedKg)} collected, grade ${p.recordedGrade}` : `${kgText(p.expectedKg)} listed, grade ${p.expectedGrade}`}
          {p.state === 'pending' ? ' · still to collect' : ''}
        </Text>
      ))}
      {done ? <SavedReading kg={null} grade={null} temp={dropoff.temperatureC} note={dropoff.note} /> : (
        <ReadingForm
          kind="dropoff"
          range={range}
          initial={{ kg: null, grade: null, temp: dropoff.temperatureC, note: dropoff.note }}
          blocked={waiting}
          blockedText="Collect every farmer's produce before delivering this order."
          completeLabel="Mark delivered"
          onSave={(reading) => recordHandover(dropoff.stopId, reading)}
          onComplete={() => completeStop(dropoff.stopId)}
          onChange={onChange}
        />
      )}
    </View>
  );
}

function SavedReading({ kg, grade, temp, note }: { kg: number | null; grade: string | null; temp: number | null; note: string }) {
  const s = useThemedStyles(styles);
  return (
    <Card style={s.item}>
      <Text style={s.name}>Recorded</Text>
      {kg != null ? <Text style={s.meta}>{kgText(kg)} · grade {grade}</Text> : null}
      <Text style={s.meta}>{temp == null ? 'No temperature recorded' : `${temp} °C`}</Text>
      {note ? <Text style={s.meta}>{note}</Text> : null}
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
  const clean = parsed.ok
    && initial.temp === parsed.value.temp
    && initial.kg === parsed.value.kg
    && (initial.grade ?? null) === parsed.value.grade
    && (initial.note.trim() || null) === parsed.value.note;
  const lo = range.min ?? -100;
  const hi = range.max ?? 100;

  return (
    <Card style={s.item}>
      <Text style={s.name}>{kind === 'pickup' ? 'What you collected' : 'Temperature on arrival'}</Text>
      <Text style={s.meta}>Allowed temperature is {lo} to {hi} °C. This stays as you save it once the stop is done.</Text>
      {kind === 'pickup' ? (
        <>
          <Input label="Kilos collected" value={kg} onChangeText={setKg} keyboardType="decimal-pad" maxLength={8} />
          <ChoiceChips label="Grade collected" options={['A', 'B', 'C']} value={grade} onChange={setGrade} />
        </>
      ) : null}
      <Input label="Temperature (°C)" value={temp} onChangeText={setTemp} keyboardType="numbers-and-punctuation" maxLength={6} />
      <Input label="Condition notes" value={note} onChangeText={setNote} maxLength={NOTE_MAX} hint={`${note.length}/${NOTE_MAX}`} />
      {tried && !parsed.ok ? <Banner text={parsed.error} /> : null}
      {error ? <Banner text={error} /> : null}
      {blocked && blockedText ? <Banner tone="info" text={blockedText} /> : null}
      <View style={s.actions}>
        <Button size="sm" label="Save reading" loading={busy} disabled={clean} onPress={() => {
          setTried(true);
          if (!parsed.ok) return;
          run(() => onSave(parsed.value));
        }} />
        <Button size="sm" variant="outline" label={completeLabel} loading={busy} disabled={!clean || blocked} onPress={() => run(onComplete)} />
      </View>
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 8 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  section: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, marginTop: 4 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
