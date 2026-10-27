import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type Params = Record<string, string>;
/** What a server-paged panel needs from the URL: its query, a setter, and a counter that bumps after data changes. */
export interface PageProps { params: Params; setParams: (p: Params, replace?: boolean) => void; rev: number }
export interface OpsLocation { tab: string; params: Params }

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

const read = (tabs: string[]): OpsLocation => {
  if (!isWeb) return { tab: tabs[0], params: {} };
  const tab = window.location.pathname.split('/')[2];
  return { tab: tabs.includes(tab) ? tab : tabs[0], params: Object.fromEntries(new URLSearchParams(window.location.search)) };
};

const url = ({ tab, params }: OpsLocation) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return `/ops/${tab}${qs ? `?${qs}` : ''}`;
};

/**
 * Current ops section and its query (page, search, filter), mirrored into the URL as /ops/<tab>?page=2 on web
 * so the address bar, Back/Forward and reloads follow the screen. Native keeps it in memory.
 */
export function useOpsLocation(tabs: string[]) {
  const [loc, setLoc] = useState(() => read(tabs));

  useEffect(() => {
    if (!isWeb) return;
    window.history.replaceState(window.history.state, '', url(loc));
    const onPop = () => setLoc(read(tabs));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once; later changes go through go()
  }, []);

  /** Move to a section/query. `replace` rewrites the current history entry (typing in search) instead of adding one. */
  const go = useCallback((tab: string, params: Params = {}, replace = false) => {
    const next = { tab, params };
    setLoc(next);
    if (isWeb) window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', url(next));
  }, []);

  return { ...loc, go };
}
