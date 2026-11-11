import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { pingLocation, refreshEtas } from '../../services/driver.route.service';

/**
 * Sends the truck's position while a driver has deliveries, also with the phone locked (Android).
 * The task must be defined when the bundle loads, so this file is imported from index.ts.
 */
export const TRIP_TASK = 'cryochain-trip-location';
// Google arrival times cost a request each; positions are free. Refresh times at most this often.
const ETA_EVERY_MS = 3 * 60 * 1000;
let lastEta = 0;

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRIP_TASK, async ({ data, error }) => {
    const last = data?.locations?.[data.locations.length - 1];
    if (error || !last) return;
    try {
      await pingLocation(last.coords.latitude, last.coords.longitude);
      if (Date.now() - lastEta > ETA_EVERY_MS) {
        lastEta = Date.now();
        await refreshEtas();
      }
    } catch {
      // No signal: the next position will try again.
    }
  });
}

export type TrackingResult = 'background' | 'foreground_only' | 'denied' | 'unsupported';

/** Starts background tracking for a trip. Asks for "while using", then "all the time". Safe to call repeatedly. */
export async function startTripTracking(): Promise<TrackingResult> {
  if (Platform.OS !== 'android') return 'unsupported';
  if (!(await TaskManager.isAvailableAsync())) return 'unsupported';
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.getBackgroundPermissionsAsync();
  const granted = bg.status === 'granted' || (bg.canAskAgain && (await Location.requestBackgroundPermissionsAsync()).status === 'granted');
  if (!granted) return 'foreground_only';
  if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK)) return 'background';
  await Location.startLocationUpdatesAsync(TRIP_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30000,
    distanceInterval: 100,
    foregroundService: {
      notificationTitle: 'CryoChain delivery in progress',
      notificationBody: 'Sharing your location for today’s deliveries.',
      notificationColor: '#2E7D4F',
    },
  });
  return 'background';
}

/** Stops background tracking once the last stop is done or the driver signs out. */
export async function stopTripTracking(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK)) await Location.stopLocationUpdatesAsync(TRIP_TASK);
  } catch {
    // Nothing was running.
  }
}
