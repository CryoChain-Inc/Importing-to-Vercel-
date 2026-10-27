import { useCallback, useEffect, useState } from 'react';
import { codeSentAt } from '../../../utils/codeTimer';

/**
 * Seconds left of `seconds` since the code for `identifier` was sent. Derived from the send time rather than counted
 * down in state, so it survives remounts and stays right after the tab or app was in the background.
 * restart() re-reads it after a resend (the service has already recorded the new send time).
 */
export function useCountdown(identifier: string, seconds: number) {
  const [now, setNow] = useState(Date.now);
  const left = Math.max(0, Math.ceil((codeSentAt(identifier) + seconds * 1000 - now) / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const restart = useCallback(() => setNow(Date.now()), []);
  return [left, restart] as const;
}
