// Design token definitions.
// These are the source of truth for color names and their values.
// Actual CSS custom properties are set in globals.css.
// PLACEHOLDER PALETTE (Lavender Dusk) — user to confirm before Phase 1 finalizes.
// Keeping the values mirrored here lets engine/UI code reference token values
// programmatically (for example, in chart series colors) without parsing CSS.

export const lightTokens = {
  bg:           '#F9F7FF',
  surface:      '#FFFFFF',
  surfaceAlt:   '#F0EDF8',
  text:         '#2D2B4E',
  textMuted:    '#6B6A88',
  primary:      '#7C6FAD',
  primaryHover: '#6B5F9E',
  secondary:    '#68A691',
  border:       '#E2DFF2',
  warning:      '#E8A838',
  danger:       '#E07070',
} as const;

export const darkTokens = {
  bg:           '#1A1828',
  surface:      '#232140',
  surfaceAlt:   '#2D2A50',
  text:         '#EBEBF5',
  textMuted:    '#9CA3AF',
  primary:      '#9D8FCC',
  primaryHover: '#AFA0D8',
  secondary:    '#7FBFA8',
  border:       '#3B3860',
  warning:      '#F0B848',
  danger:       '#F08080',
} as const;

export type ThemeTokens = typeof lightTokens;
