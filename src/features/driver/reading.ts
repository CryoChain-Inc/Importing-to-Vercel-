export const NOTE_MAX = 280;
const ABS_MIN = -100;
const ABS_MAX = 100;

export interface ReadingInput {
  kind: 'pickup' | 'dropoff';
  kg: string;
  grade: string;
  temp: string;
  note: string;
  min: number | null;
  max: number | null;
}

export interface Reading {
  kg: number | null;
  grade: string | null;
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
  if (input.kind === 'dropoff') return { ok: true, value: { kg: null, grade: null, temp, note: note || null } };
  const kg = Number(input.kg);
  if (!input.kg.trim() || !Number.isFinite(kg) || kg <= 0 || kg > 100000) return { ok: false, error: 'Enter the kilos you collected.' };
  if (!['A', 'B', 'C'].includes(input.grade)) return { ok: false, error: 'Choose the grade you collected.' };
  return { ok: true, value: { kg: Math.round(kg * 100) / 100, grade: input.grade, temp, note: note || null } };
}
