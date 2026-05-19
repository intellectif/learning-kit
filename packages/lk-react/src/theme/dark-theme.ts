import type { ThemeTokens } from '@intellectif/lk-core';

/**
 * Dark-mode colour overrides, merged over {@link defaultTheme} by
 * `ThemeProvider`. Colours only — spacing/typography/shape/motion are
 * theme-invariant. All pairs verified WCAG 2.2 AA against the dark surface.
 */
export const darkTheme: Partial<ThemeTokens> = {
  '--lk-color-primary': '#fafafa',
  '--lk-color-primary-hover': '#e4e4e7',
  '--lk-color-surface': '#09090b',
  '--lk-color-surface-raised': '#18181b',
  '--lk-color-border': '#27272a',
  '--lk-color-text': '#fafafa',
  '--lk-color-text-muted': '#a1a1aa',
  '--lk-color-success': '#4ade80',
  '--lk-color-error': '#f87171',
  '--lk-color-warning': '#fbbf24',
  '--lk-color-focus-ring': '#fafafa',
};
