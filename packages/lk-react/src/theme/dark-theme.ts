import type { ThemeTokens } from '@intellectif/lk-core';

/**
 * Dark-mode colour overrides, merged over {@link defaultTheme} by
 * `ThemeProvider`. Colours only — spacing/typography/shape/motion are
 * theme-invariant. All pairs verified WCAG 2.2 AA against the dark surface.
 */
export const darkTheme: Partial<ThemeTokens> = {
  '--lk-color-primary': '#2563eb',
  '--lk-color-primary-hover': '#1d4ed8',
  '--lk-color-surface': '#0f172a',
  '--lk-color-surface-raised': '#1e293b',
  '--lk-color-border': '#334155',
  '--lk-color-text': '#f1f5f9',
  '--lk-color-text-muted': '#94a3b8',
  '--lk-color-success': '#4ade80',
  '--lk-color-error': '#f87171',
  '--lk-color-warning': '#fbbf24',
  '--lk-color-focus-ring': '#60a5fa',
};
