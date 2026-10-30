import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, type IconName } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { TabShell } from '../../../components/layout';
import { useNav, useRefreshAccount } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import { fetchDeliveries, type DeliveryBook, type DeliveryOrder } from '../../../services/driver.deliveries.service';
import { pingLocation } from '../../../services/driver.route.service';
import { fetchDriverTrips, type TruckBooking } from '../../../services/truck.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { Empty } from '../../ops/components/OpsBits';
import { DeliveryList, DeliveryOrderPage, DropoffPage, PickupPage } from '../components/DeliveryPages';
import { TruckDetail, TruckList, TruckMessages } from '../components/TruckPages';
import { useDriverLocation } from '../useDriverLocation';

const PING_MS = 30000;
type Tab = 'home' | 'truck' | 'delivery';
const TABS: Tab[] = ['home', 'truck', 'delivery'];

const TITLES: Record<Tab, [string, string]> = {
  home: ['Home', 'Your current cold-truck booking and product delivery.'],
  truck: ['Cold truck', 'The booking you are on, and trips you have finished.'],
  delivery: ['Product delivery', 'The order you are delivering, and ones you have finished.'],
};

const heading = (tab: Tab, view: string): [string, string] => {
  if (view === 'trip') return ['Past trip', 'Route and what happened on this booking.'];
  if (view === 'messages') return ['Messages', 'Talk to the buyer about this trip.'];
  if (view === 'order') return ['Past delivery', 'Farmers, buyer and what was recorded.'];
  if (view === 'pickup') return ['Pickup', 'Who you collect from, and the reading you take there.'];
  if (view === 'dropoff') return ['Drop-off', 'Where the produce goes, and the temperature on arrival.'];
  return TITLES[tab];
};

export function DriverHome({ account }: { account: Account }) {
  const { reset } = useNav();
  const refreshAccount = useRefreshAccount();
  const s = useThemedStyles(styles);
  const { tab, params, go } = useDriverLocation(TABS);
  const active = (TABS.includes(tab as Tab) ? tab : 'home') as Tab;
  const [book, setBook] = useState<DeliveryBook | null>(null);
  const [trips, setTrips] = useState<TruckBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [deliveryResult, tripRows] = await Promise.all([
      fetchDeliveries().then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e })),
      fetchDriverTrips(),
    ]);
    setTrips(tripRows);
    if (deliveryResult.ok) {
      setBook(deliveryResult.v);
      setError(null);
    } else {
      setError(deliveryResult.e instanceof Error ? deliveryResult.e.message : 'Could not load your deliveries.');
    }
  }, []);

  useEffect(() => { refreshAccount(); }, [refreshAccount]);
  useEffect(() => { load(); }, [load]);

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
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await pingLocation(pos.coords.latitude, pos.coords.longitude);
        if (!live) return;
        setLocationError(null);
        await load();
      } catch {
        if (live) setLocationError('Could not share your location. Check that location is on.');
      }
    };
    ping();
    const timer = setInterval(ping, PING_MS);
    return () => { live = false; clearInterval(timer); };
  }, [load]);

  const orders = book?.orders ?? [];
  const allTrips = trips ?? [];
  const openTrips = allTrips.filter((t) => !t.completedAt);
  const openOrders = orders.filter((o) => o.ongoing);
  const currentTrip = openTrips[0] ?? null;
  const currentOrder = openOrders[0] ?? null;
  const select = (next: Tab) => go(next);
  const bar: { key: Tab; label: string; icon: IconName; alert?: boolean }[] = [
    { key: 'home', label: 'Home', icon: 'grid' },
    { key: 'truck', label: 'Cold truck', icon: 'truck', alert: !!currentTrip },
    { key: 'delivery', label: 'Delivery', icon: 'package', alert: !!currentOrder },
  ];
  const [title, sub] = heading(active, params.view ?? '');
  const trip = allTrips.find((t) => t.id === params.id) ?? null;
  const order = orders.find((o) => o.id === (params.order || params.id)) ?? null;
  const pickup = order?.pickups.find((p) => p.stopId === params.id);
  const range = { min: book?.tempMin ?? null, max: book?.tempMax ?? null };
  const backTruck = () => go('truck');
  const backDelivery = () => go('delivery');
  const backOrder = () => (order && !order.ongoing ? go('delivery', { view: 'order', id: order.id }) : backDelivery());

  return (
    <TabShell tabs={bar} tab={active} onSelect={select}>
      <View style={s.header}>
        <Text style={s.title}>{active === 'home' ? `Hello, ${(account.name || 'driver').split(' ')[0]}` : title}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
      {locationError && !params.view ? <Banner text={locationError} /> : null}
      {error ? (
        <>
          <Banner text={error} />
          {book ? null : <Button label="Try again" variant="outline" onPress={load} />}
        </>
      ) : null}
      {trips == null && book == null && !error ? <Text style={s.sub}>Loading your work…</Text> : null}

      {active === 'home' && (trips != null || book != null) ? (
        <Home
          trip={currentTrip}
          order={currentOrder}
          onTruck={() => go('truck')}
          onDelivery={() => go('delivery')}
          onSignOut={() => authService.signOut().finally(() => reset({ name: 'landing' }))}
        />
      ) : null}

      {active === 'truck' ? (
        trips == null ? null
          : params.view === 'messages' && trip ? <TruckMessages trip={trip} onBack={trip.completedAt ? () => go('truck', { view: 'trip', id: trip.id }) : backTruck} />
            : params.view === 'trip' && trip ? <TruckDetail trip={trip} onBack={backTruck} onMessages={() => go('truck', { view: 'messages', id: trip.id })} />
              : params.view ? <Missing label="That trip is not assigned to you." onBack={backTruck} />
                : <TruckHome trip={currentTrip} also={openTrips.slice(1)} past={allTrips.filter((t) => t.completedAt)} onMessages={(id) => go('truck', { view: 'messages', id })} onOpen={(id) => go('truck', { view: 'trip', id })} />
      ) : null}

      {active === 'delivery' ? (
        book == null ? null
          : params.view === 'pickup' && order && pickup ? <PickupPage order={order} pickup={pickup} range={range} onBack={backOrder} onChange={load} />
            : params.view === 'dropoff' && order?.dropoff ? <DropoffPage order={order} dropoff={order.dropoff} range={range} onBack={backOrder} onChange={load} />
              : params.view === 'order' && order ? (
                <DeliveryOrderPage
                  order={order}
                  onBack={backDelivery}
                  onPickup={(stopId) => go('delivery', { view: 'pickup', id: stopId, order: order.id })}
                  onDropoff={() => go('delivery', { view: 'dropoff', id: order.id })}
                />
              )
                : params.view ? <Missing label="That delivery is not on your route." onBack={backDelivery} />
                  : (
                    <DeliveryHome
                      order={currentOrder}
                      also={openOrders.slice(1)}
                      past={orders.filter((o) => !o.ongoing)}
                      onPickup={(stopId) => currentOrder && go('delivery', { view: 'pickup', id: stopId, order: currentOrder.id })}
                      onDropoff={() => currentOrder && go('delivery', { view: 'dropoff', id: currentOrder.id })}
                      onOpen={(id) => go('delivery', { view: 'order', id })}
                    />
                  )
      ) : null}
    </TabShell>
  );
}

function Missing({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Banner text={label} />
      <Button label="Back" variant="outline" onPress={onBack} />
    </View>
  );
}

function Home({
  trip, order, onTruck, onDelivery, onSignOut,
}: {
  trip: TruckBooking | null;
  order: DeliveryOrder | null;
  onTruck: () => void;
  onDelivery: () => void;
  onSignOut: () => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.list}>
      {trip ? (
        <Card style={s.item}>
          <Text style={s.name}>Cold truck · {trip.code}</Text>
          <Text style={s.meta}>{trip.buyerName || 'Buyer'} · {trip.pickupLabel}</Text>
          <Button size="sm" label="Open booking" onPress={onTruck} />
        </Card>
      ) : <Empty icon="truck" title="No cold-truck booking" hint="When a buyer is assigned to you, that one trip opens under Cold truck." />}
      {order ? (
        <Card style={s.item}>
          <Text style={s.name}>Product delivery · {order.code}</Text>
          <Text style={s.meta}>{order.buyerName} · {order.pickups.length} farmer{order.pickups.length === 1 ? '' : 's'}</Text>
          <Button size="sm" label="Open delivery" onPress={onDelivery} />
        </Card>
      ) : <Empty icon="package" title="No product delivery" hint="A paid order near you is added under Delivery once your location is on." />}
      <Button label="Sign out" icon="logOut" variant="ghost" size="sm" onPress={onSignOut} />
    </View>
  );
}

function TruckHome({
  trip, also, past, onMessages, onOpen,
}: {
  trip: TruckBooking | null;
  also: TruckBooking[];
  past: TruckBooking[];
  onMessages: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.list}>
      <Text style={s.section}>Current booking</Text>
      {trip ? <TruckDetail trip={trip} onMessages={() => onMessages(trip.id)} /> : (
        <Empty icon="truck" title="No trip right now" hint="You have one cold-truck booking at a time. It shows here when a buyer is assigned to you." />
      )}
      {also.length > 0 ? <TruckList trips={also} past={false} onOpen={onOpen} /> : null}
      <Text style={s.section}>Past bookings</Text>
      {past.length === 0 ? <Text style={s.meta}>Finished bookings will be listed here.</Text> : <TruckList trips={past} past onOpen={onOpen} />}
    </View>
  );
}

function DeliveryHome({
  order, also, past, onPickup, onDropoff, onOpen,
}: {
  order: DeliveryOrder | null;
  also: DeliveryOrder[];
  past: DeliveryOrder[];
  onPickup: (stopId: string) => void;
  onDropoff: () => void;
  onOpen: (id: string) => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.list}>
      <Text style={s.section}>Current delivery</Text>
      {order ? <DeliveryOrderPage order={order} onPickup={onPickup} onDropoff={onDropoff} /> : (
        <Empty icon="package" title="No delivery right now" hint="You deliver one order at a time. Farmers to collect from, and the buyer, show here." />
      )}
      {also.length > 0 ? <DeliveryList orders={also} past={false} onOpen={onOpen} /> : null}
      <Text style={s.section}>Past deliveries</Text>
      {past.length === 0 ? <Text style={s.meta}>Finished deliveries will be listed here.</Text> : <DeliveryList orders={past} past onOpen={onOpen} />}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  header: { gap: 2 },
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: c.ink },
  sub: { fontFamily: fonts.sansRegular, fontSize: 14, color: c.inkMuted },
  list: { gap: 14 },
  section: { fontFamily: fonts.sansBold, fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' as const, color: c.inkMuted },
  item: { gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
