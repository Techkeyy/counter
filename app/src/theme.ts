export const colors = {
  // Primary surfaces: graphite / near-black
  background: '#0E1015',
  surface: '#161922',
  surfaceLight: '#202430',
  surfaceHighlight: '#2A3040',
  card: '#181B24',
  cardBorder: '#262B3A',
  // Hairline timeline separators (full-bleed, low contrast, no cards).
  divider: '#2A3040',

  // Brand: one strong electric accent
  brandPrimary: '#14F195',
  solanaGreen: '#14F195',
  solanaPurple: '#9945FF',
  brandSecondary: '#9945FF',

  // Semantic: restrained, single-purpose
  success: '#2ED573',
  error: '#FF4757',
  danger: '#FF4757',
  duelCrimson: '#FF4757',
  warning: '#FFA502',
  warningYellow: '#FFA502',
  info: '#70A1FF',
  duelBlue: '#2ED573',

  // Soft off-white text counterpart
  textPrimary: '#F5F3EC',
  textSecondary: '#A4B0BE',
  textMuted: '#747D8C',

  // Odds & Sides
  sideA: '#14F195',
  sideB: '#9945FF',

  // Badges & Accents
  arenaBadge: '#FFA502',
  badgeBg: 'rgba(255, 165, 2, 0.12)',
  badgeBorder: 'rgba(255, 165, 2, 0.3)',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.8)',
};

export const typography = {
  fontFamily: 'System',
  h1: { fontSize: 24, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.textPrimary },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.textPrimary },
  subtitle: { fontSize: 15, fontWeight: '500' as const, color: colors.textSecondary },
  body: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  bodyBold: { fontSize: 14, fontWeight: '600' as const, color: colors.textPrimary, lineHeight: 20 },
  bodyMuted: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 12, color: colors.textMuted },
  captionBold: { fontSize: 12, fontWeight: '600' as const, color: colors.textMuted },
  mono: { fontFamily: 'monospace', fontSize: 12 },
};

// Minimum interactive target (Android accessibility floor).
export const touchMin = 48;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const borderRadius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};
