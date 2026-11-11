export const NOTE_MAX = 280;
const ABS_MIN = -100;
const ABS_MAX = 100;

export interface ReadingInput {
  kind: 'pickup' | 'dropoff';
  kg: string;
  temp: string;
  note: string;
  min: number | null;
  max: number | null;
  /** Quantity reserved on this pickup line; the driver cannot record more. */
  reservedKg?: number;
}

export interface Reading {
  kg: number | null;
  temp: number;
  note: string | null;
}

/** Checks a stop reading before it is saved. The database applies the same rules again. */
export function parseReading(input: ReadingInput): { ok: true; value: Reading } | { ok: false; error: string } {
  const note = input.note.trim();
  if (note.length > NOTE_MAX) return { ok: false, error: `Notes can be at most ${NOTE_MAX} characters.` };
  const temp = Number(input.temp);
  if (!input.temp.trim() || !Number.isFinite(temp)) return { ok: false, error: 'Enter the temperature.' };
  const lo = input.min ?? ABS_MIN;
  const hi = input.max ?? ABS_MAX;
  if (temp < lo || temp > hi || temp < ABS_MIN || temp > ABS_MAX) {
    return { ok: false, error: `Temperature must be between ${lo} and ${hi} °C.` };
  }
  if (input.kind === 'dropoff') return { ok: true, value: { kg: null, temp, note: note || null } };
  const kg = Number(input.kg);
  // Zero is allowed: the farm had nothing to collect.
  if (!input.kg.trim() || !Number.isFinite(kg) || kg < 0 || kg > 100000) return { ok: false, error: 'Enter the quantity you collected. Enter 0 if there was nothing.' };
  if (input.reservedKg != null && kg > input.reservedKg) return { ok: false, error: `Only ${input.reservedKg} is reserved here. Enter that or less.` };
  return { ok: true, value: { kg: Math.round(kg * 100) / 100, temp, note: note || null } };
}
