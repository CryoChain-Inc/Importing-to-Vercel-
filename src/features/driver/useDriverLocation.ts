import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type Params = Record<string, string>;
interface DriverLocation { tab: string; params: Params }

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

const ALIAS: Record<string, string> = {
  dashboard: 'home',
  'trucks-live': 'truck',
  'trucks-past': 'truck',
  'deliveries-live': 'delivery',
  'deliveries-past': 'delivery',
};

const read = (tabs: string[]): DriverLocation => {
  if (!isWeb) return { tab: tabs[0], params: {} };
  const raw = window.location.pathname.split('/')[2];
  const tab = ALIAS[raw] ?? raw;
  return { tab: tabs.includes(tab) ? tab : tabs[0], params: Object.fromEntries(new URLSearchParams(window.location.search)) };
};

const url = ({ tab, params }: DriverLocation) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `/driver/${tab}${qs ? `?${qs}` : ''}`;
};

/** Current driver section and its query, mirrored into the URL as /driver/<tab> on web. Native keeps it in memory. */
export function useDriverLocation(tabs: string[]) {
  const [loc, setLoc] = useState(() => read(tabs));

  useEffect(() => {
    if (!isWeb) return;
    window.history.replaceState(window.history.state, '', url(loc));
    const onPop = () => setLoc(read(tabs));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once; later changes go through go()
  }, []);

  const go = useCallback((tab: string, params: Params = {}, replace = false) => {
    const next = { tab, params };
    setLoc(next);
    if (isWeb) window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', url(next));
  }, []);

  return { ...loc, go };
}
