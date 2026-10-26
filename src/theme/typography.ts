import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

// Plus Jakarta Sans per docs/Agri-Market-UI-Design-System.pdf.
export const fontFiles = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
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
