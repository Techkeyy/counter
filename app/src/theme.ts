export const colors = {
  // Consumer Social Dark Theme
  background: '#0E1117',
  surface: '#161B22',
  surfaceLight: '#21262D',
  card: '#161B22',
  cardBorder: '#30363D',
  
  // Accents & Actions
  primary: '#58A6FF',
  brandPurple: '#8957E5',
  accentGreen: '#3FB950',
  accentRed: '#F85149',
  warningOrange: '#D29922',
  
  // Human Contender Sides (Distinct, high-readability backing tints)
  sideA: '#3FB950',       // Back Side A (Green)
  sideB: '#58A6FF',       // Back Side B (Blue)
  sideABorder: '#238636',
  sideBBorder: '#1F6FEB',
  
  // Text Hierarchy
  textPrimary: '#F0F6FC',
  textSecondary: '#8B949E',
  textMuted: '#6E7681',
  
  // Status & Badges
  arenaBadge: '#F0883E',
  arenaBadgeBg: 'rgba(240, 136, 62, 0.12)',
  badgeNeutral: '#30363D',
};

export const typography = {
  fontFamily: 'System',
  h1: { fontSize: 22, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 18, fontWeight: '700' as const, color: colors.textPrimary },
  h3: { fontSize: 15, fontWeight: '600' as const, color: colors.textPrimary },
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
