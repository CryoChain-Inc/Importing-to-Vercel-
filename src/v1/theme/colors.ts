export const colors = {
  // Brand & Core
  brand: '#054E39', // Forest green - official primary brand color
  brandLight: '#F3FAF8', // Very light green for backgrounds/accents
  accent: '#175CD3', // Blue - primary action color
  accentLight: '#EFF8FF', // Light blue for backgrounds

  // Neutrals
  ink: '#0E121B', // Deepest black/grey for primary text
  inkMuted: '#4F575E', // Medium grey for secondary text
  steel: '#9AA1A9', // Light grey for borders/dividers
  steelLight: '#E4E7EB', // Very light grey for card borders
  surface: '#FFFFFF', // White for cards/modals
  background: '#F7F8F9', // Off-white for screen backgrounds

  // Status Colors
  success: '#0E8345', // Green status
  successBg: '#E7F7ED', // Light green background
  warning: '#B26200', // Orange status
  warningBg: '#FFF4E5', // Light orange background
  danger: '#D92D20', // Red status
  dangerBg: '#FEE4E2', // Light red background
  info: '#175CD3', // Blue status (matches accent)
  infoBg: '#EFF8FF', // Light blue background

  // Cold Chain Specific
  coldOptimal: '#0284C7', // Cyan for optimal temperature
  coldWarning: '#F59E0B', // Amber for temperature warnings
  coldCritical: '#EF4444', // Red for critical temperature
} as const;

export type ColorToken = keyof typeof colors;