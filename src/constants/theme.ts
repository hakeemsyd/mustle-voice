export const colors = {
  bg: '#080808',
  surface: '#111111',
  surfaceDeep: '#1A1A1A',
  accent: '#C8F135',
  accentOn: '#000000',
  accentDim: 'rgba(200,241,53,0.08)',
  accentBorder: 'rgba(200,241,53,0.2)',
  accentBorderStrong: 'rgba(200,241,53,0.35)',
  text: '#FFFFFF',
  muted: '#888888',
  border: 'rgba(255,255,255,0.08)',
  borderSubtle: 'rgba(255,255,255,0.05)',
  chartProtein: '#C8F135',
  chartCarbs: '#60a5fa',
  chartFat: '#fb923c',
  chartCalories: '#a78bfa',
  danger: '#ff4444',
} as const;

export const orbColors = {
  listening: '#5BB8F5',
  processing: '#A78BFA',
  speaking: colors.accent,
} as const;

export const sessionColors = {
  active: '#F2C744',
  activeOn: '#0A0A0A',
  rest: '#F2503D',
  restOn: '#0A0A0A',
} as const;

export const lightCard = {
  bg: '#FFFFFF',
  border: 'rgba(10,10,10,0.08)',
  text: '#0A0A0A',
  muted: 'rgba(10,10,10,0.55)',
  pillBg: 'rgba(200,241,53,0.35)',
  pillText: '#4a5c00',
  dividerBg: 'rgba(10,10,10,0.08)',
  surface: 'rgba(10,10,10,0.03)',
  // The one card hairline that's genuinely 0.06, not 0.08 — PreviousWorkoutCard's outer .stats
  // container border specifically, per the reference CSS.
  statsBorder: 'rgba(10,10,10,0.06)',
  // Icon color for a card's header badge sitting on the lime accent fill — a near-black
  // (#0A0A0A), distinct from accentOn (#000000) which is the real token for the coach avatar's
  // own MMark glyph on lime.
  iconOn: '#0A0A0A',
} as const;

export const radius = {
  sm: 6, md: 8, lg: 10, xl: 14, '2xl': 18, '3xl': 22, '4xl': 26,
} as const;

export const fonts = {
  display: 'BebasNeue_400Regular',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
  bodyExtraBold: 'DMSans_800ExtraBold',
  bodyLight: 'DMSans_300Light',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const type = {
  hero: 56,
  screenTitle: 34,
  sectionLabel: 11,
  body: 16,
  caption: 12,
  button: 14,
} as const;

export const ACCENT = colors.accent;
