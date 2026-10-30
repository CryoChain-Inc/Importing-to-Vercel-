import { parseReading } from './reading';

const base = { kind: 'pickup' as const, kg: '12', grade: 'A', temp: '4', note: '', min: 0, max: 8 };

describe('parseReading', () => {
  it('accepts a pickup inside the configured range', () => {
    const result = parseReading(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ kg: 12, grade: 'A', temp: 4, note: null });
  });

  it('rounds kilos to two decimals and keeps a note', () => {
    const result = parseReading({ ...base, kg: '1.239', note: '  firm fruit  ' });
    expect(result.ok && result.value.kg).toBe(1.24);
    expect(result.ok && result.value.note).toBe('firm fruit');
  });

  it('rejects a pickup without a grade or kilos', () => {
    expect(parseReading({ ...base, grade: '' }).ok).toBe(false);
    expect(parseReading({ ...base, kg: '0' }).ok).toBe(false);
  });

  it('rejects a temperature outside the safe range', () => {
    const result = parseReading({ ...base, temp: '12' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/between 0 and 8/);
  });

  it('stores only temperature on a drop-off', () => {
    const result = parseReading({ ...base, kind: 'dropoff', kg: '', grade: '' });
    expect(result.ok && result.value).toEqual({ kg: null, grade: null, temp: 4, note: null });
  });
});
