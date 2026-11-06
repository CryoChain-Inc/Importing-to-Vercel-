export function hoursLabel(n: number): string {
  return n === 1 ? '1 hour' : `${n} hours`;
}

/** Elapsed trip time from start until end (or now while the trip is running). */
export function elapsedLabel(startedAt: string, endedAt?: string | null, now = Date.now()): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '0 min';
  const mins = Math.floor((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
