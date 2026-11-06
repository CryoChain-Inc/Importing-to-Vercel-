// Deep imports: the package barrel would register all 28 font files in the bundle.
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { FontDisplay } from 'expo-font';


// Plus Jakarta Sans per docs/Agri-Market-UI-Design-System.pdf.
// font-display: swap on web, so text paints in the fallback face instead of waiting on ~475 KB of fonts.
const swap = (uri: number) => ({ uri, display: FontDisplay.SWAP });
export const fontFiles = {
  PlusJakartaSans_400Regular: swap(PlusJakartaSans_400Regular),
  PlusJakartaSans_500Medium: swap(PlusJakartaSans_500Medium),
  PlusJakartaSans_600SemiBold: swap(PlusJakartaSans_600SemiBold),
  PlusJakartaSans_700Bold: swap(PlusJakartaSans_700Bold),
  PlusJakartaSans_800ExtraBold: swap(PlusJakartaSans_800ExtraBold),
};

export const fonts = {
  heading: 'PlusJakartaSans_800ExtraBold',
  sansRegular: 'PlusJakartaSans_400Regular',
  sansMedium: 'PlusJakartaSans_500Medium',
  sansSemiBold: 'PlusJakartaSans_600SemiBold',
  sansBold: 'PlusJakartaSans_700Bold',
} as const;

export const textStyles = {
  displayXl: { fontFamily: fonts.heading, fontSize: 48, lineHeight: 54, letterSpacing: -1 },
  displayLg: { fontFamily: fonts.sansBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.sansBold, fontSize: 24, lineHeight: 30 },
  h2: { fontFamily: fonts.sansSemiBold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.sansSemiBold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  price: { fontFamily: fonts.sansBold, fontSize: 24, lineHeight: 28, fontVariant: ['tabular-nums' as const] },
} as const;
