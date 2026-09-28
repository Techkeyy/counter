export const colors = {
  background: '#0B0C10',
  surface: '#15171E',
  surfaceLight: '#1F222D',
  card: '#181A22',
  cardBorder: '#272A38',
  
  // Neon Accents
  solanaPurple: '#9945FF',
  solanaGreen: '#14F195',
  duelCrimson: '#FF3B30',
  duelBlue: '#007AFF',
  warningYellow: '#FFD60A',
  
  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#9EA3B0',
  textMuted: '#636878',
  
  // Odds
  sideA: '#14F195',
  sideB: '#9945FF',
  
  // Badges
  arenaBadge: '#FFD60A',
  badgeBg: 'rgba(255, 214, 10, 0.12)',
};

export const typography = {
  fontFamily: 'System',
  h1: { fontSize: 24, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.textPrimary },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  bodyMuted: { fontSize: 13, color: colors.textSecondary },
  caption: { fontSize: 11, color: colors.textMuted },
  mono: { fontFamily: 'monospace', fontSize: 12 },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
