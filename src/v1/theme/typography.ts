export const fonts = {
  heading: 'Fraunces_400Regular',
  sansRegular: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
} as const;

export const textStyles = {
  h1: {
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 38,
  },
  h2: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    lineHeight: 30,
  },
  h3: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
} as const;
