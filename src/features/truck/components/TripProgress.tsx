import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Button, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { TripMap } from '../../buyer/components/TripMap';
import {
  completeTruckTrip, fetchStartCode, fetchTripLive, reportTruckLocation, startTruckTrip, type TruckBooking,
} from '../../../services/truck.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

const placed = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

/** Driving route for a booked trip, the buyer's start code, and the driver's live position after that code is entered. */
export function TripProgress({ booking, role }: { booking: TruckBooking; role: 'buyer' | 'driver' }) {
  const s = useThemedStyles(styles);
  const [startedAt, setStartedAt] = useState(booking.startedAt);
  const [completedAt, setCompletedAt] = useState(booking.completedAt);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [driver, setDriver] = useState(booking.driverLat != null && booking.driverLng != null ? { lat: booking.driverLat, lng: booking.driverLng } : null);
  const [seenAt, setSeenAt] = useState(booking.driverSeenAt);
  const [code, setCode] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<'pending' | 'on' | 'off'>('pending');
  const paid = booking.state === 'paid';
  const started = paid && !!startedAt;
  const ended = !!completedAt;
  const from = useMemo(
    () => (placed(booking.pickupLat, booking.pickupLng) ? { label: booking.pickupLabel, lat: booking.pickupLat, lng: booking.pickupLng } : null),
    [booking.pickupLabel, booking.pickupLat, booking.pickupLng],
  );
  const to = useMemo(
    () => (placed(booking.dropoffLat, booking.dropoffLng) ? { label: booking.dropoffLabel, lat: booking.dropoffLat, lng: booking.dropoffLng } : null),
    [booking.dropoffLabel, booking.dropoffLat, booking.dropoffLng],
  );

  useEffect(() => {
    if (booking.startedAt) setStartedAt(booking.startedAt);
    if (booking.completedAt) setCompletedAt(booking.completedAt);
  }, [booking.startedAt, booking.completedAt]);

  useEffect(() => {
    if (role !== 'buyer' || !paid || started) return;
    fetchStartCode(booking.id).then(setCode);
  }, [booking.id, paid, role, started]);

  useEffect(() => {
    if (role !== 'buyer' || !paid || ended) return;
    let live = true;
    const tick = () => {
      fetchTripLive(booking.id).then((row) => {
        if (!live || !row) return;
        setStartedAt(row.startedAt);
        setCompletedAt(row.completedAt);
        setSeenAt(row.driverSeenAt);
        if (row.driverLat != null && row.driverLng != null) {
          setDriver((prev) => (prev && prev.lat === row.driverLat && prev.lng === row.driverLng ? prev : { lat: row.driverLat as number, lng: row.driverLng as number }));
        }
      }, () => undefined);
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [booking.id, ended, paid, role]);

  useEffect(() => {
    if (role !== 'driver' || !started || ended) return;
    let live = true;
    const handle: { timer?: ReturnType<typeof setInterval> } = {};
    const watch = async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!live) return;
      if (perm.status !== 'granted') {
        setSharing('off');
        return;
      }
      setSharing('on');
      const send = async () => {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!live) return;
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriver(next);
        await reportTruckLocation(booking.id, next.lat, next.lng).catch(() => undefined);
      };
      await send().catch(() => undefined);
      if (!live) return;
      handle.timer = setInterval(() => { send().catch(() => undefined); }, 8000);
    };
    watch();
    return () => { live = false; if (handle.timer) clearInterval(handle.timer); };
  }, [booking.id, ended, role, started]);

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      await startTruckTrip(booking.id, entry);
      setStartedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start that trip.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await completeTruckTrip(booking.id);
      setCompletedAt(new Date().toISOString());
      setConfirmEnd(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end that trip.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      {from && to ? <TripMap pickup={from} dropoff={to} driver={started ? driver : null} height={220} /> : null}
      {paid && !started && role === 'buyer' ? (
        <View style={s.codeBox}>
          <Text style={s.k}>Share this code with your driver</Text>
          <Text style={s.code}>{code ?? '————'}</Text>
          <Text style={s.meta}>{code ? 'The trip starts, and live location begins, only after the driver enters it.' : 'The start code appears after the latest database update is applied.'}</Text>
        </View>
      ) : null}
      {paid && !started && role === 'driver' ? (
        <View style={s.form}>
          <Input label="Start code from the buyer" value={entry} onChangeText={setEntry} keyboardType="number-pad" maxLength={4} />
          {error ? <Banner text={error} /> : null}
          <Button label="Start trip" size="sm" loading={busy} disabled={entry.trim().length !== 4} onPress={begin} />
        </View>
      ) : null}
      {started && !ended && role === 'buyer' ? <Text style={s.meta}>{driver && seenAt ? `Driver location updated ${new Date(seenAt).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}.` : 'Waiting for the driver’s location.'}</Text> : null}
      {started && !ended && role === 'driver' ? <Text style={s.meta}>{sharing === 'off' ? 'Allow location so the buyer can follow the truck.' : 'Trip started. Your location is shared with the buyer.'}</Text> : null}
      {started && !ended && role === 'driver' ? (
        confirmEnd ? (
          <View style={s.form}>
            <Text style={s.meta}>End this trip? The buyer will see it as finished, and live location stops.</Text>
            {error ? <Banner text={error} /> : null}
            <Button label="End trip" size="sm" loading={busy} onPress={finish} />
            <Button label="Keep going" size="sm" variant="outline" disabled={busy} onPress={() => { setConfirmEnd(false); setError(null); }} />
          </View>
        ) : <Button label="End trip" size="sm" variant="outline" onPress={() => setConfirmEnd(true)} />
      ) : null}
      {ended ? <Text style={s.meta}>{role === 'driver' ? 'Trip ended.' : 'The driver ended this trip.'}</Text> : null}
      {!paid && role === 'driver' ? <Text style={s.meta}>The start code is available after the buyer pays.</Text> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 8, alignSelf: 'stretch' as const },
  form: { gap: 8, alignSelf: 'stretch' as const },
  codeBox: { gap: 4, padding: 12, borderRadius: 14, backgroundColor: c.surfaceSunken, alignSelf: 'stretch' as const },
  k: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  code: { fontFamily: fonts.heading, fontSize: 32, letterSpacing: 6, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
