import { useCallback, useEffect, useState } from 'react';

/** Seconds remaining; restart() begins a fresh run. */
export function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);
  const [run, setRun] = useState(0);

  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds, run]);

  const restart = useCallback(() => setRun((r) => r + 1), []);
  return [left, restart] as const;
}
