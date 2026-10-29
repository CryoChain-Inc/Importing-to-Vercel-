import { gradeOrderError } from '../gradeOrder';

describe('gradeOrderError', () => {
  it('accepts A > B > C', () => expect(gradeOrderError({ A: 10, B: 8, C: 5 })).toBeNull());
  it('skips unset grades', () => expect(gradeOrderError({ A: 10, B: null, C: 5 })).toBeNull());
  it('rejects equal prices', () => expect(gradeOrderError({ A: 8, B: 8, C: null })).toMatch(/Grade A must cost more than Grade B/));
  it('rejects B above A', () => expect(gradeOrderError({ A: 6, B: 9, C: 3 })).toMatch(/Grade A/));
  it('rejects C above B', () => expect(gradeOrderError({ A: 10, B: 4, C: 5 })).toMatch(/Grade B must cost more than Grade C/));
});
