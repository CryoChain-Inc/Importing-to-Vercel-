import type { PressableStateCallbackType } from 'react-native';

export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
// Design system: field/touch target is 48px.
export const TOUCH = 48;
// Visible keyboard focus on web; React Native ignores the outline props.
export const focusRing = (color: string) => ({ outlineStyle: 'solid', outlineWidth: 2, outlineOffset: 2, outlineColor: color }) as object;

// react-native-web passes hover/focus; the native typings omit them.
export type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
