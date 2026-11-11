import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

// Several rows usually change together (an order, its allocations, its stops); wait so they cause one reload.
const SETTLE_MS = 800;
// Safety net for changes Realtime cannot show this user (rows hidden by RLS) and for events missed while offline.
const POLL_MS = 60000;

/**
 * Calls `onChange` shortly after any of `tables` changes for the signed-in user, when the app returns to the
 * foreground, and once a minute while it is open. Returns a function that stops watching.
 */
export function watchChanges(tables: readonly string[], onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const soon = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(onChange, SETTLE_MS);
  };
  const channel = supabase.channel(`live-${tables.join('-')}-${Date.now()}`);
  for (const table of tables) channel.on('postgres_changes', { event: '*', schema: 'public', table }, soon);
  channel.subscribe();
  const app = AppState.addEventListener('change', (state) => { if (state === 'active') soon(); });
  const poll = setInterval(() => { if (AppState.currentState === 'active') onChange(); }, POLL_MS);
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(poll);
    app.remove();
    supabase.removeChannel(channel);
  };
}

/** Keeps a screen current: reloads on changes to `tables`, and gives the shell what it needs for pull to refresh. */
export function useLiveReload(load: () => Promise<unknown>, tables: readonly string[]) {
  const [refreshing, setRefreshing] = useState(false);
  const key = tables.join(',');
  useEffect(() => watchChanges(key.split(','), () => { load().catch(() => undefined); }), [load, key]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch {
      // The screen's own load reports its errors.
    } finally {
      setRefreshing(false);
    }
  }, [load]);
  return { refreshing, onRefresh };
}

export type Refresh = ReturnType<typeof useLiveReload>;
