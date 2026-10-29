export const PAGE_SIZE = 6;

export interface Paged<T> { rows: T[]; total: number }

/** Inclusive row range for a 1-based page, as `.range()` wants it. */
export const pageRange = (page: number): [number, number] => [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1];

/** `ilike` pattern for a search box; drops characters that would break a PostgREST `or()` filter. */
export const likeTerm = (q: string) => `%${q.replace(/[%,()*\\]/g, ' ').trim()}%`;
