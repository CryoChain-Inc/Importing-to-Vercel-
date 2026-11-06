/** True when every word typed appears in the name or any alias (case-insensitive). An empty query matches everything. */
export function matchesSearch(query: string, name: string, aliases = ''): boolean {
  const hay = `${name} ${aliases}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
