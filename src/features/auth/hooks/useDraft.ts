import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Form state mirrored to local storage so unsent work survives a session expiry or restart.
 * Only plain form fields belong here: never codes or verification state.
 */
export function useDraft<T extends object>(key: string, initial: T) {
  const storageKey = `cryochain.v1.draft.${key}`;
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => raw && setValue({ ...initial, ...JSON.parse(raw) }))
      .catch(() => undefined)
      .finally(() => {
        loaded.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const update = useCallback(
    (patch: Partial<T>) =>
      setValue((v) => {
        const next = { ...v, ...patch };
        if (loaded.current) AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
        return next;
      }),
    [storageKey],
  );

  const clear = useCallback(() => AsyncStorage.removeItem(storageKey).catch(() => undefined), [storageKey]);
  return { value, update, clear };
}
