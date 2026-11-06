import { elapsedLabel, hoursLabel } from '../duration';

describe('hoursLabel', () => {
  it('uses singular for one hour', () => {
    expect(hoursLabel(1)).toBe('1 hour');
  });

  it('uses plural otherwise', () => {
    expect(hoursLabel(4)).toBe('4 hours');
  });
});

describe('elapsedLabel', () => {
  it('counts whole minutes between start and end', () => {
    expect(elapsedLabel('2026-11-06T10:00:00.000Z', '2026-11-06T12:07:00.000Z')).toBe('2 h 7 min');
  });

  it('shows minutes only under an hour', () => {
    expect(elapsedLabel('2026-11-06T10:00:00.000Z', '2026-11-06T10:12:00.000Z')).toBe('12 min');
  });
});
