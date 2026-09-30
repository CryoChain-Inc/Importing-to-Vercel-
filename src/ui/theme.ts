export const colors = {
  ink: '#1A2330',
  slate: '#2E3A46',
  paper: '#FBFAF6',
  mist: '#E8F4FB',
  steel: '#BAC2CC',
  steelInk: '#5B6672',
  blue: '#1F78B4',
  blueInk: '#16608F',
  green: '#2E7D32',
  greenTint: '#E6F2E7',
  amber: '#8A5A00',
  amberTint: '#FFF1D6',
  red: '#B3261E',
  redTint: '#FCE8E6',
  line: '#E6E3DB',
  lineSoft: '#F1F0EB',
  canvas: '#EEECE6',
  neutral: '#F1F0EB',
};

const VARS: Record<string, string> = {
  '--ink': colors.ink,
  '--slate': colors.slate,
  '--paper': colors.paper,
  '--mist': colors.mist,
  '--steel': colors.steel,
  '--steel-ink': colors.steelInk,
  '--blue': colors.blue,
  '--blue-ink': colors.blueInk,
  '--green': colors.green,
  '--green-tint': colors.greenTint,
  '--amber': colors.amber,
  '--amber-tint': colors.amberTint,
  '--red': colors.red,
  '--red-tint': colors.redTint,
  '--line': colors.line,
  '--line-soft': colors.lineSoft,
  '--canvas': colors.canvas,
  '--neutral-tint': colors.neutral,
};

export function cssVar(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => VARS[name] ?? name);
}

export function fontFamily(weight?: string | number, hero = false) {
  if (hero) return 'Fraunces_400Regular';
  const w = String(weight ?? '400');
  if (w === '700' || w === 'bold') return 'Inter_700Bold';
  if (w === '600') return 'Inter_600SemiBold';
  if (w === '500') return 'Inter_500Medium';
  return 'Inter_400Regular';
}
