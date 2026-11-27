/** One colour story for the web canvas, the native circles, the legend and the PDF: sky blue (few) through green and yellow to crimson (many). */
export const HEAT_STOPS: [number, string][] = [
  [0, '#38bdf8'],
  [0.25, '#34d399'],
  [0.5, '#fde047'],
  [0.75, '#fb923c'],
  [1, '#e11d48'],
];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Colour at t (0..1) along the ramp, as [r, g, b]. */
export function rampRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [b, bc] = HEAT_STOPS[i];
    if (x <= b) {
      const [a, ac] = HEAT_STOPS[i - 1];
      const k = (x - a) / (b - a || 1);
      const [r1, g1, b1] = hex(ac);
      const [r2, g2, b2] = hex(bc);
      return [r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k].map(Math.round) as [
        number,
        number,
        number,
      ];
    }
  }
  return hex(HEAT_STOPS[HEAT_STOPS.length - 1][1]) as [number, number, number];
}

export const rampRgba = (t: number, a: number) => `rgba(${rampRgb(t).join(',')},${a})`;

/** CSS gradient for legends and the PDF. */
export const RAMP_CSS = `linear-gradient(90deg, ${HEAT_STOPS.map(([at, c]) => `${c} ${Math.round(at * 100)}%`).join(', ')})`;
