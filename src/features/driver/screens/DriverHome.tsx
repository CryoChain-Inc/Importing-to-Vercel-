import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, type IconName } from '../../../components/common';
import { Banner, Dialog } from '../../../components/feedback';
import { TabShell, useIsWide } from '../../../components/layout';
import { useNav, useRefreshAccount } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import { fetchDeliveries, type DeliveryBook } from '../../../services/driver.deliveries.service';
import { fetchDriverProfile, type DriverProfile } from '../../../services/driver.profile.service';
import { pingLocation, refreshEtas } from '../../../services/driver.route.service';
import { fetchDriverTrips, type TruckBooking } from '../../../services/truck.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { useLiveReload } from '../../../services/liveReload';
import type { Account } from '../../../types/auth';
import { Empty } from '../../ops/components/OpsBits';
import { AccountPage } from '../components/AccountPage';
import { RouteMap } from '../components/RouteMap';
import {
  NextStop,
  StopDone,
  StopList,
  StopPage,
  StopRow,
  RouteHeader,
  type FinishedStop,
} from '../components/StopPages';
import { NextCard, SectionLabel } from '../components/bits';
import { truckStatus, TruckDetail, TruckList, TruckMessages } from '../components/TruckPages';
import { useDrivePath, useDriverPosition } from '../drivePath';
import { buildStops, stopAfter } from '../stops';
import { useDriverLocation } from '../useDriverLocation';
import { startTripTracking, stopTripTracking, type TrackingResult } from '../backgroundLocation';

const PING_MS = 30000;
const BG_CONSENT_KEY = 'cryochain.bgLocationConsent';
const LIVE_TABLES = ['delivery_stops', 'truck_bookings'] as const;
type Tab = 'home' | 'stops' | 'truck' | 'account';
const TABS: Tab[] = ['home', 'stops', 'truck', 'account'];

const TITLES: Record<Tab, string> = {
  home: 'Home',
  stops: 'Stops',
  truck: 'Cold truck',
  account: 'Account',
};

const heading = (tab: Tab, view: string): string => {
  if (view === 'trip') return 'Trip';
  if (view === 'messages') return 'Chat';
  if (view === 'stop') return 'Stop';
  if (view === 'done') return 'Stop complete';
  return TITLES[tab];
};

export function DriverHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const refreshAccount = useRefreshAccount();
  const s = useThemedStyles(styles);
  const wide = useIsWide();
  const { tab, params, go } = useDriverLocation(TABS);
  const active = (TABS.includes(tab as Tab) ? tab : 'home') as Tab;
  const [book, setBook] = useState<DeliveryBook | null>(null);
  const [trips, setTrips] = useState<TruckBooking[] | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [finished, setFinished] = useState<FinishedStop | null>(null);
  const position = useDriverPosition();

  const load = useCallback(async () => {
    const [deliveryResult, tripRows] = await Promise.all([
      fetchDeliveries().then(
        (v) => ({ ok: true as const, v }),
        (e: unknown) => ({ ok: false as const, e }),
      ),
      fetchDriverTrips(),
    ]);
    setTrips(tripRows);
    if (deliveryResult.ok) {
      setBook(deliveryResult.v);
      setError(null);
    } else {
      setError(
        deliveryResult.e instanceof Error
          ? deliveryResult.e.message
          : 'Could not load your deliveries.',
      );
    }
  }, []);

  const loadProfile = useCallback(async () => {
    setProfile(await fetchDriverProfile().catch(() => null));
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);
  useEffect(() => {
    load();
    loadProfile();
  }, [load, loadProfile]);
  const live = useLiveReload(load, LIVE_TABLES);

  useEffect(() => {
    let live = true;
    const ping = async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!live) return;
        if (perm.status !== 'granted') {
          setLocationError('Allow location so new orders near you can be assigned to you.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await pingLocation(pos.coords.latitude, pos.coords.longitude);
        // Google's drive times replace the rough estimates; the reload below picks them up.
        await refreshEtas();
        if (!live) return;
        setLocationError(null);
        await load();
      } catch {
        if (live) setLocationError('Could not share your location. Check that location is on.');
      }
    };
    ping();
    const timer = setInterval(ping, PING_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [load]);

  // Background GPS runs only while there is a delivery on the road.
  const [tracking, setTracking] = useState<TrackingResult | null>(null);
  const onTrip = (book?.orders ?? []).some((o) => o.ongoing);
  // Play policy: show a prominent disclosure and get a yes before asking for background location.
  const [consent, setConsent] = useState<boolean | null>(null);
  const [declined, setDeclined] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(BG_CONSENT_KEY).then((v) => setConsent(v === '1'));
  }, []);
  useEffect(() => {
    if (book == null || consent == null) return;
    let live = true;
    if (onTrip && consent)
      startTripTracking().then(
        (r) => {
          if (live) setTracking(r);
        },
        () => {
          if (live) setTracking('foreground_only');
        },
      );
    else
      stopTripTracking().then(() => {
        if (live) setTracking(null);
      });
    return () => {
      live = false;
    };
  }, [onTrip, book, consent]);

  const orders = book?.orders ?? [];
  const { todo, done } = useMemo(() => buildStops(orders), [book]); // eslint-disable-line react-hooks/exhaustive-deps -- orders derives from book
  const liveDone = done.filter((x) => x.key.endsWith(':live'));
  // Stops that show up after the route was first loaded are orders added later in the day.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (book == null) return;
    const keys = [...todo, ...liveDone].map((x) => x.key);
    if (seen.current == null) seen.current = new Set(keys);
    else {
      const added = keys.filter((k) => !seen.current!.has(k));
      if (added.length) setFresh((f) => new Set([...f, ...added]));
    }
  }, [book]); // eslint-disable-line react-hooks/exhaustive-deps -- keys derive from book
  const road = useDrivePath(
    position,
    todo.filter((x) => Number.isFinite(x.lat) && !(x.lat === 0 && x.lng === 0)),
  );
  const allTrips = trips ?? [];
  const openTrips = allTrips.filter((t) => !t.completedAt);
  const currentTrip = openTrips[0] ?? null;
  const bar: { key: Tab; label: string; icon: IconName; alert?: boolean }[] = [
    { key: 'home', label: 'Home', icon: 'grid' },
    { key: 'stops', label: 'Stops', icon: 'package', alert: todo.length > 0 },
    { key: 'truck', label: 'Cold truck', icon: 'truck', alert: !!currentTrip },
    { key: 'account', label: 'Account', icon: 'user' },
  ];
  const title = heading(active, params.view ?? '');
  const trip = allTrips.find((t) => t.id === params.id) ?? null;
  const stop = [...todo, ...done].find((x) => x.key === params.id) ?? null;
  const range = { min: book?.tempMin ?? null, max: book?.tempMax ?? null };
  const backTruck = () => go('truck');
  const backStops = () => go('stops');
  const openStop = (key: string, from = '') => go('stops', { view: 'stop', id: key, from });
  const first = (account.name || 'driver').split(' ')[0];
  const sub =
    active === 'home'
      ? todo.length > 0
        ? `${todo.length} stop${todo.length === 1 ? '' : 's'} left on your route.`
        : "You're all clear for now."
      : '';

  return (
    <TabShell tabs={bar} tab={active} onSelect={(t) => go(t)} refresh={live}>
      {onTrip && consent === false && !declined ? (
        <Dialog
          title="Share your location during trips"
          onClose={() => setDeclined(true)}
          footer={
            <>
              <Button
                label="Allow"
                onPress={() => {
                  AsyncStorage.setItem(BG_CONSENT_KEY, '1');
                  setConsent(true);
                }}
              />
              <Button label="Not now" variant="ghost" onPress={() => setDeclined(true)} />
            </>
          }
        >
          <Text style={s.sub}>
            CryoChain collects your precise location, including in the background when the app is
            closed or your screen is off, from when you start a delivery trip until your last stop
            is complete. It is shared with CryoChain operations and with buyers whose order is on
            its way, so they can follow the truck and see arrival times. It is not collected outside
            a trip. On the next screen, choose “Allow all the time”.
          </Text>
        </Dialog>
      ) : null}
      <View style={s.header}>
        <Text style={s.title}>{active === 'home' ? `Hello, ${first}` : title}</Text>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
      </View>
      {locationError && !params.view ? <Banner text={locationError} /> : null}
      {(tracking === 'foreground_only' || (onTrip && consent === false)) && !params.view ? (
        <Banner
          tone="info"
          text="Allow location “all the time” in your phone settings so buyers can follow the truck while your screen is off. Until then, keep CryoChain open while you drive."
        />
      ) : null}
      {error ? (
        <>
          <Banner text={error} />
          {book ? null : <Button label="Try again" variant="outline" onPress={load} />}
        </>
      ) : null}
      {trips == null && book == null && !error ? (
        <Text style={s.sub}>Loading your work…</Text>
      ) : null}

      {active === 'home' && (trips != null || book != null) ? (
        <View style={s.list}>
          <RouteMap
            position={position}
            todo={todo}
            visited={liveDone}
            path={road}
            height={wide ? 360 : 280}
          />
          {todo.length + liveDone.length > 0 ? (
            <RouteHeader
              todo={todo}
              doneLive={liveDone}
              fresh={todo.filter((x) => fresh.has(x.key)).length}
            />
          ) : null}
          {todo[0] ? (
            <NextStop
              stop={todo[0]}
              index={liveDone.length + 1}
              total={liveDone.length + todo.length}
              path={road}
              onArrived={() => openStop(todo[0].key, 'home')}
            />
          ) : (
            <Empty
              icon="package"
              title="No stops right now"
              hint="Keep location on. Paid orders near you are assigned here as they come in."
            />
          )}
          {todo.length > 1 ? (
            <>
              <SectionLabel text="After this" />
              {todo.slice(1, 4).map((x, i) => (
                <StopRow
                  key={x.key}
                  n={liveDone.length + i + 2}
                  stop={x}
                  fresh={fresh.has(x.key)}
                  last={i === Math.min(todo.length, 4) - 2}
                  onPress={() => openStop(x.key)}
                />
              ))}
              {todo.length > 4 ? (
                <Button
                  variant="ghost"
                  label={`See all ${todo.length} stops`}
                  onPress={backStops}
                />
              ) : null}
            </>
          ) : null}
          {currentTrip ? (
            <NextCard
              eyebrow={`Cold truck · ${currentTrip.code}`}
              title={`${currentTrip.pickupLabel} → ${currentTrip.dropoffLabel}`}
              lines={[
                `${truckStatus(currentTrip).label} · Buyer ${currentTrip.buyerName || 'Buyer'}`,
              ]}
              label={currentTrip.startedAt ? 'Continue trip' : 'Open trip'}
              onPress={() => go('truck')}
            />
          ) : null}
        </View>
      ) : null}

      {active === 'stops' ? (
        book == null ? null : params.view === 'done' && finished ? (
          <StopDone
            done={finished}
            onNext={(key) => {
              const target = [...todo, ...done].find((x) => x.key === key);
              if (target) openStop(key);
              else go('home');
            }}
            onHome={() => go('home')}
          />
        ) : params.view === 'stop' && stop ? (
          <StopPage
            key={stop.key}
            stop={stop}
            next={stopAfter(todo, stop.key)}
            range={range}
            backLabel={params.from === 'home' ? 'Home' : 'Stops'}
            onBack={params.from === 'home' ? () => go('home') : backStops}
            onChange={load}
            onFinished={(f) => {
              setFinished(f);
              go('stops', { view: 'done' });
            }}
          />
        ) : params.view ? (
          <View style={s.list}>
            <Banner text="That stop is not on your route." />
            <Button label="Back to stops" variant="outline" onPress={backStops} />
          </View>
        ) : (
          <StopList todo={todo} done={done} doneLive={liveDone} fresh={fresh} onOpen={openStop} />
        )
      ) : null}

      {active === 'truck' ? (
        trips == null ? null : params.view === 'messages' && trip ? (
          <TruckMessages
            trip={trip}
            onBack={trip.completedAt ? () => go('truck', { view: 'trip', id: trip.id }) : backTruck}
          />
        ) : params.view === 'trip' && trip ? (
          <TruckDetail
            trip={trip}
            onBack={backTruck}
            onMessages={() => go('truck', { view: 'messages', id: trip.id })}
          />
        ) : params.view ? (
          <View style={s.list}>
            <Banner text="That trip is not assigned to you." />
            <Button label="Back" variant="outline" onPress={backTruck} />
          </View>
        ) : (
          <View style={s.list}>
            {currentTrip ? (
              <TruckDetail
                trip={currentTrip}
                onMessages={() => go('truck', { view: 'messages', id: currentTrip.id })}
              />
            ) : (
              <Empty
                icon="truck"
                title="No trip right now"
                hint="Your next cold-truck booking shows here once operations allots it to you."
              />
            )}
            {openTrips.length > 1 ? (
              <>
                <SectionLabel text="Up next · not started" />
                <TruckList
                  trips={openTrips.slice(1)}
                  past={false}
                  onOpen={(id) => go('truck', { view: 'trip', id })}
                />
              </>
            ) : null}
            {allTrips.some((t) => t.completedAt) ? (
              <>
                <SectionLabel text="Past trips" />
                <TruckList
                  trips={allTrips.filter((t) => t.completedAt)}
                  past
                  onOpen={(id) => go('truck', { view: 'trip', id })}
                />
              </>
            ) : null}
          </View>
        )
      ) : null}

      {active === 'account' ? (
        <AccountPage
          account={account}
          profile={profile}
          stats={{ stopsLeft: todo.length, completed: done.length }}
          onChanged={loadProfile}
          onSignOut={() =>
            stopTripTracking().finally(() =>
              authService.signOut().finally(() => reset({ name: 'landing' })),
            )
          }
        />
      ) : null}
    </TabShell>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  header: { gap: 2 },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: c.ink,
  },
  sub: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted },
  list: { gap: 14 },
});
