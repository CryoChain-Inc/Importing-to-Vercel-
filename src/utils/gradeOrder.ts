export const GRADES = ['A', 'B', 'C'] as const;
export type Grade = (typeof GRADES)[number];

/** Grade A must cost more than B, and B more than C. Unset grades (null) are skipped. Returns the message to show, or null when fine. */
export function gradeOrderError(prices: Record<Grade, number | null>): string | null {
  const set = GRADES.filter((g) => prices[g] != null);
  for (let i = 1; i < set.length; i++) {
    const hi = set[i - 1];
    const lo = set[i];
    if (!(prices[hi]! > prices[lo]!)) return `Grade ${hi} must cost more than Grade ${lo}.`;
  }
  return null;
}
