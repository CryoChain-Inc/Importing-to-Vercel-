import { matchesSearch } from '../search';

describe('matchesSearch', () => {
  it('matches the name', () => expect(matchesSearch('man', 'Mango')).toBe(true));
  it('matches an alias', () => expect(matchesSearch('kpanla', 'Fresh Tomato', 'tomato, kpanla (Ga)')).toBe(true));
  it('requires every word', () => expect(matchesSearch('red tomato', 'Tomato', 'red')).toBe(true));
  it('rejects a non-match', () => expect(matchesSearch('zobo', 'Mango', 'mangue')).toBe(false));
  it('matches everything when empty', () => expect(matchesSearch('  ', 'Mango')).toBe(true));
});
