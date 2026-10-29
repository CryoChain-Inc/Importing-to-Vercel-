import { pageWindow } from '../Pagination';

describe('pageWindow', () => {
  it('shows every page when few', () => expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]));
  it('elides the far end', () => expect(pageWindow(1, 10)).toEqual([1, 2, '…', 10]));
  it('elides both sides', () => expect(pageWindow(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]));
  it('fills a single skipped page instead of an ellipsis', () => expect(pageWindow(4, 9)).toEqual([1, 2, 3, 4, 5, '…', 9]));
  it('elides the start near the end', () => expect(pageWindow(10, 10)).toEqual([1, '…', 9, 10]));
});
