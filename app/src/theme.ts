export const colors = {
  // Midnight ink / warm ivory / coral / cobalt.
  // The palette is intentionally editorial: color has a job, not a side.
  background: '#11131B',
  surface: '#191B25',
  surfaceLight: '#242634',
  surfaceHighlight: '#303347',
  card: '#1C1E29',
  cardBorder: '#303241',
  divider: '#2A2C39',

  brandPrimary: '#FF725E',
  brandPrimaryPressed: '#E85C4B',
  brandSecondary: '#7C8CFF',
  cobalt: '#7C8CFF',
  warmIvory: '#FFF7EA',

  success: '#9BE28F',
  error: '#FF7B7B',
  danger: '#FF7B7B',
  duelCrimson: '#FF7B7B',
  warning: '#FFC857',
  warningYellow: '#FFC857',
  info: '#8FA7FF',
  duelBlue: '#9BE28F',

  // Compatibility aliases used by mechanism-era components.
  solanaGreen: '#FF725E',
  solanaPurple: '#7C8CFF',
  sideA: '#FF725E',
  sideB: '#7C8CFF',
  arenaBadge: '#FFC857',
  badgeBg: 'rgba(255, 200, 87, 0.12)',
  badgeBorder: 'rgba(255, 200, 87, 0.3)',

  textPrimary: '#FFF7EA',
  textSecondary: '#B8BAC8',
  textMuted: '#777B8E',
  overlay: 'rgba(8, 9, 14, 0.82)',
};

export const typography = {
  fontFamily: 'sans-serif',
  displayFamily: 'sans-serif-condensed',
  display: { fontFamily: 'sans-serif-condensed', fontSize: 34, fontWeight: '800' as const, color: colors.textPrimary, letterSpacing: -0.8 },
  h1: { fontFamily: 'sans-serif-condensed', fontSize: 27, fontWeight: '800' as const, color: colors.textPrimary, letterSpacing: -0.4 },
  h2: { fontSize: 21, fontWeight: '800' as const, color: colors.textPrimary, letterSpacing: -0.2 },
  h3: { fontSize: 17, fontWeight: '700' as const, color: colors.textPrimary },
  subtitle: { fontSize: 15, fontWeight: '500' as const, color: colors.textSecondary, lineHeight: 21 },
  body: { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '700' as const, color: colors.textPrimary, lineHeight: 21 },
  bodyMuted: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  caption: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  captionBold: { fontSize: 12, fontWeight: '800' as const, color: colors.textMuted, letterSpacing: 0.4 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: colors.textSecondary },
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
  lg: 18,
  xl: 24,
  full: 9999,
};
