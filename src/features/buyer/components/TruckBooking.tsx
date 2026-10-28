import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { Badge, Button, Card, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  bookTruck, cancelTruckBooking, fetchTruckBookings, payTruck, quoteTruck,
  type Place, type TruckBooking, type TruckPurpose, type TruckQuote,
} from '../../../services/truck.service';
import type { TransferDetails } from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from '../../ops/components/useAction';
import { labelFor, searchPlaces } from './places';
import { TripMap } from './TripMap';
import { TripChat } from '../../truck/components/TripChat';
import { TripProgress } from '../../truck/components/TripProgress';

const nextHour = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  return d;
};

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Book a cold truck from one place to another, then pay the way a lot is paid. */
export function TruckBooking({ transfer }: { transfer: TransferDetails | null }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [bookings, setBookings] = useState<TruckBooking[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<TruckPurpose>('transfer');
  const [active, setActive] = useState<'pickup' | 'dropoff'>('pickup');
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [when, setWhen] = useState<Date>(() => nextHour());
  const [quote, setQuote] = useState<TruckQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const { busy, error, run } = useAction(async () => { await load(); });

  const load = async () => {
    try {
      setBookings(await fetchTruckBookings());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your truck bookings.');
    }
  };

  useEffect(() => {
    let live = true;
    const tick = () => { if (live) load(); };
    tick();
    const timer = setInterval(tick, 8000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    const timer = setTimeout(() => { searchPlaces(q).then(setResults, () => setResults([])); }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!pickup || !dropoff) { setQuote(null); setQuoteError(null); return; }
    let live = true;
    quoteTruck(pickup, dropoff).then(
      (q) => { if (live) { setQuote(q); setQuoteError(null); } },
      (e) => { if (live) { setQuote(null); setQuoteError(e instanceof Error ? e.message : 'Could not price that trip.'); } },
    );
    return () => { live = false; };
  }, [pickup, dropoff]);

  const focusStop = (which: 'pickup' | 'dropoff') => {
    setActive(which);
    setQuery('');
    setResults([]);
    setLocateError(null);
  };

  const choose = (place: Place) => {
    if (active === 'pickup') {
      setPickup(place);
      if (!dropoff) setActive('dropoff');
    } else {
      setDropoff(place);
      if (!pickup) setActive('pickup');
    }
    setQuery('');
    setResults([]);
    setLocateError(null);
  };

  const here = async () => {
    setLocateError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocateError('Allow location access to use where you are, or search for the place.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      choose({ label: await labelFor(lat, lng), lat, lng });
    } catch {
      setLocateError('Could not read your location. Search for the place instead.');
    }
  };

  const book = () => run(async () => {
    if (!pickup || !dropoff || !quote) return;
    const id = await bookTruck({ purpose, pickup, dropoff, pickupAt: when });
    setPickup(null);
    setDropoff(null);
    setQuote(null);
    await load();
    await payTruck(id);
  });

  return (
    <View style={s.list}>
      <Text style={s.title}>Book a cold truck</Text>
      <Text style={s.lead}>A chilled truck for a one-way trip. You choose the places and the time. The fare is the distance times the rate operations has set.</Text>
      {loadError ? <Banner text={loadError} /> : null}
      {error ? <Banner text={error} /> : null}

      <View style={s.purposes}>
        <Purpose on={purpose === 'transfer'} icon="truck" title="Transfer" copy="Move produce you already have." onPress={() => setPurpose('transfer')} />
        <Purpose on={purpose === 'pickup'} icon="package" title="Pick up" copy="Collect produce and bring it to you." onPress={() => setPurpose('pickup')} />
      </View>

      <Card style={s.form}>
        <View style={s.stops}>
          <View style={s.spine} />
          <StopRow label="From" place={pickup} selected={active === 'pickup'} kind="start" onPress={() => focusStop('pickup')} />
          <StopRow label="To" place={dropoff} selected={active === 'dropoff'} kind="end" onPress={() => focusStop('dropoff')} />
        </View>
        <Text style={s.step}>{active === 'pickup' ? 'Choose the pickup. Search, use your location, or tap the map.' : 'Choose the drop-off. Search, use your location, or tap the map.'}</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={active === 'pickup' ? 'Search for the pickup' : 'Search for the drop-off'}
          placeholderTextColor={colors.inkMuted}
          style={[s.search, { outlineStyle: 'none' } as object]}
        />
        {query.trim().length > 0 && query.trim().length < 3 ? <Text style={s.meta}>Type at least 3 letters.</Text> : null}
        {results.map((r) => (
          <Pressable key={`${r.lat},${r.lng}`} onPress={() => choose(r)} style={s.result}>
            <Icon name="pin" size={16} color={colors.brandInk} />
            <Text style={s.resultText} numberOfLines={2}>{r.label}</Text>
          </Pressable>
        ))}
        {locateError ? <Banner text={locateError} /> : null}
        <Button label={active === 'pickup' ? 'Use my location as pickup' : 'Use my location as drop-off'} variant="outline" size="sm" icon="pin" onPress={here} />
        <TripMap
          pickup={pickup}
          dropoff={dropoff}
          onPick={choose}
          hint={active === 'pickup' ? 'Tap the map to set the pickup.' : 'Tap the map to set the drop-off.'}
        />
      </Card>

      <Card style={s.form}>
        <Text style={s.label}>Pickup time</Text>
        <Text style={s.meta}>When the truck should arrive at the pickup.</Text>
        {Platform.OS === 'web' ? (
          React.createElement('input', {
            type: 'datetime-local',
            value: stamp(when),
            onChange: (e: { target: { value: string } }) => e.target.value && setWhen(new Date(e.target.value)),
            style: {
              fontFamily: 'inherit', fontSize: 15, width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12,
              border: `1.5px solid ${colors.borderStrong}`, background: colors.surfaceSunken, color: colors.ink,
            },
          })
        ) : (
          <TextInput
            value={stamp(when).replace('T', ' ')}
            onChangeText={(v) => { const d = new Date(v.replace(' ', 'T')); if (!Number.isNaN(d.getTime())) setWhen(d); }}
            placeholder="YYYY-MM-DD HH:MM"
            placeholderTextColor={colors.inkMuted}
            style={[s.search, { outlineStyle: 'none' } as object]}
          />
        )}
      </Card>

      <Card style={s.fare}>
        <Text style={s.fareLabel}>Trip fare</Text>
        <Text style={s.fareAmount}>{quote ? ghs(quote.amount) : '—'}</Text>
        <Text style={s.meta}>
          {quote ? `${quote.distanceKm.toLocaleString('en-GH', { maximumFractionDigits: 1 })} km · ${ghs(quote.pricePerKm)} per km` : 'Choose both places to see the fare.'}
        </Text>
        {quoteError ? <Banner text={quoteError} /> : null}
        <Button label="Book this truck" loading={busy} disabled={!quote || when.getTime() < Date.now() - 10 * 60 * 1000} onPress={book} />
      </Card>

      <Text style={s.title}>Your trips</Text>
      {bookings.length === 0 ? <Card><Text style={s.meta}>No truck bookings yet.</Text></Card> : null}
      {bookings.map((b) => (
        <Card key={b.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{b.code} · {b.purpose === 'transfer' ? 'Transfer' : 'Pick up'}</Text>
            <Badge label={b.state === 'awaiting_payment' ? 'Awaiting payment' : b.completedAt ? 'Completed' : b.startedAt ? 'On the way' : b.state === 'paid' ? 'Paid' : 'Cancelled'} tone={b.state === 'paid' ? 'success' : b.state === 'cancelled' ? 'neutral' : 'warning'} />
          </View>
          <Text style={s.meta}>{b.pickupLabel}</Text>
          <Text style={s.meta}>to {b.dropoffLabel}</Text>
          <Text style={s.meta}>{new Date(b.pickupAt).toLocaleString('en-GH')} · {b.distanceKm} km</Text>
          <Text style={s.total}>{ghs(b.amount)}</Text>
          {b.driverName || b.driverPlate ? <Text style={s.meta}>Driver {b.driverName || 'Assigned'}{b.driverVehicle ? ` · ${b.driverVehicle}` : ''}{b.driverPlate ? ` · ${b.driverPlate}` : ''}{b.driverPhone ? ` · ${b.driverPhone}` : ''}</Text> : <Text style={s.meta}>No driver is free for this time yet.</Text>}
          {b.state === 'awaiting_payment' ? (
            <>
              {b.payment === 'failed' || b.payment === 'abandoned' ? <Banner text="The last payment was not completed. You can try again." /> : null}
              <Button label={b.payment === 'failed' || b.payment === 'abandoned' ? 'Try truck payment again' : 'Pay for this truck'} loading={busy} onPress={() => run(() => payTruck(b.id))} />
              <View style={s.box}>
                <Text style={s.boxTitle}>Or pay by bank transfer</Text>
                {transfer ? (
                  <>
                    <Text style={s.meta}>{transfer.bankName} · {transfer.accountName}</Text>
                    <Text style={s.meta}>Account {transfer.accountNumber} · Reference {b.code} · {ghs(b.amount)}</Text>
                  </>
                ) : <Text style={s.meta}>Bank details are not available yet.</Text>}
              </View>
              <Button size="sm" variant="outline" label="Cancel booking" loading={busy} onPress={() => run(() => cancelTruckBooking(b.id))} />
            </>
          ) : null}
          {b.state !== 'cancelled' ? <TripProgress booking={b} role="buyer" /> : null}
          {b.state !== 'cancelled' && (b.driverId || b.driverName || b.driverPhone) ? (
            <TripChat bookingId={b.id} peerName={b.driverName || 'your driver'} peerPhone={b.driverPhone} peerRole="driver" />
          ) : null}
        </Card>
      ))}
    </View>
  );
}

function Purpose({ on, icon, title, copy, onPress }: { on: boolean; icon: 'truck' | 'package'; title: string; copy: string; onPress: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[s.purpose, on && s.purposeOn]}>
      <Icon name={icon} size={18} color={on ? colors.brandInk : colors.inkMuted} />
      <Text style={s.purposeTitle}>{title}</Text>
      <Text style={s.meta}>{copy}</Text>
    </Pressable>
  );
}

function StopRow({ label, place, selected, kind, onPress }: { label: string; place: Place | null; selected: boolean; kind: 'start' | 'end'; onPress: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[s.stop, selected && s.stopOn]} accessibilityRole="button" accessibilityState={{ selected }}>
      <View style={[s.dot, kind === 'end' && s.dotEnd, (selected || place) && s.dotOn]} />
      <View style={s.grow}>
        <Text style={s.k}>{label}</Text>
        <Text style={place ? s.v : s.meta} numberOfLines={2}>{place?.label ?? 'Not chosen yet'}</Text>
      </View>
      {place ? <Icon name="check" size={16} color={colors.brandInk} /> : selected ? <Text style={s.choosing}>Choosing</Text> : null}
    </Pressable>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  lead: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  purposes: { flexDirection: 'row' as const, gap: 10 },
  purpose: { flex: 1, gap: 4, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: c.borderSubtle, backgroundColor: c.surfaceCard },
  purposeOn: { borderColor: c.brand500, backgroundColor: c.brandTint },
  purposeTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  form: { gap: 10 },
  stops: { gap: 8, position: 'relative' as const },
  spine: { position: 'absolute' as const, left: 15, top: 24, bottom: 24, width: 2, backgroundColor: c.borderStrong },
  stop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent' },
  stopOn: { backgroundColor: c.brandTint, borderColor: c.brand500 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.borderStrong },
  dotEnd: { borderRadius: 2 },
  dotOn: { backgroundColor: c.brand500 },
  grow: { flex: 1, gap: 2 },
  k: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  choosing: { fontFamily: fonts.sansBold, fontSize: 12, color: c.brandInk },
  v: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  step: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  search: {
    minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.borderStrong,
    backgroundColor: c.surfaceSunken, paddingHorizontal: 14, fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink,
  },
  result: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.surfaceSunken },
  resultText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, color: c.ink },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  fare: { gap: 8, alignItems: 'flex-start' as const },
  fareLabel: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted },
  fareAmount: { fontFamily: fonts.heading, fontSize: 36, letterSpacing: -0.8, color: c.ink },
  item: { gap: 6 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  total: { fontFamily: fonts.heading, fontSize: 22, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  box: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: c.surfaceSunken, alignSelf: 'stretch' as const },
  boxTitle: { fontFamily: fonts.sansBold, fontSize: 14, color: c.ink },
});
