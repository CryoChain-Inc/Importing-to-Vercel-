// Gradients from the design system. angle: CSS degrees (180 = top to bottom).
export interface GradientDef {
  colors: string[];
  stops?: number[];
  angle: number;
}

export type GradientKind = 'primary' | 'hero' | 'tint' | 'card';

export const lightGradients: Record<GradientKind, GradientDef> = {
  primary: { colors: ['#12884c', '#0b6b3a'], angle: 180 },
  hero: { colors: ['#c6eed7', '#72cda8'], angle: 135 },
  tint: { colors: ['#e4f5ea', '#f7fcf9'], angle: 160 },
  card: { colors: ['#12864b', '#0b6b3a', '#084d2b'], stops: [0, 0.55, 1], angle: 145 },
};

export const darkGradients: Record<GradientKind, GradientDef> = {
  primary: { colors: ['#4ade80', '#22c55e'], angle: 180 },
  hero: { colors: ['#123d2a', '#0b0c0c'], angle: 160 },
  tint: { colors: ['#123222', '#151716'], angle: 160 },
  card: { colors: ['#1b5e3f', '#0b2a1c', '#06150e'], stops: [0, 0.55, 1], angle: 145 },
};
