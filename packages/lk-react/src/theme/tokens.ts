import type { ThemeTokens } from '@intellectif/lk-core';

/**
 * Canonical default theme token values. `defaults.css` mirrors these exactly.
 * Palette is a neutral monochrome (ElevenLabs-like) so the SDK is brand-neutral
 * out of the box; consumers rebrand via `ThemeProvider`. All colour pairs are
 * verified to meet WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for UI / focus ring
 * (see theme/__tests__/contrast.test.ts).
 */
export const defaultTheme: ThemeTokens = {
  // ── Colours (light) — neutral monochrome; semantic success/error/warning
  //    retained for status legibility ────────────────────────────────────────
  '--lk-color-primary': '#18181b',
  '--lk-color-primary-hover': '#27272a',
  '--lk-color-surface': '#ffffff',
  '--lk-color-surface-raised': '#fafafa',
  '--lk-color-border': '#e4e4e7',
  '--lk-color-text': '#18181b',
  '--lk-color-text-muted': '#52525b',
  '--lk-color-success': '#15803d',
  '--lk-color-error': '#b91c1c',
  '--lk-color-warning': '#b45309',
  '--lk-color-focus-ring': '#18181b',

  // ── Spacing ──────────────────────────────────────────────────────────────
  '--lk-spacing-xs': '4px',
  '--lk-spacing-sm': '8px',
  '--lk-spacing-md': '16px',
  '--lk-spacing-lg': '24px',
  '--lk-spacing-xl': '32px',

  // ── Typography ───────────────────────────────────────────────────────────
  '--lk-font-family-base':
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  '--lk-font-size-sm': '0.875rem',
  '--lk-font-size-base': '1rem',
  '--lk-font-size-lg': '1.125rem',
  '--lk-font-weight-normal': '400',
  '--lk-font-weight-bold': '700',
  '--lk-line-height-base': '1.5',

  // ── Shape ────────────────────────────────────────────────────────────────
  '--lk-radius-sm': '0.25rem',
  '--lk-radius-base': '0.5rem',
  '--lk-radius-lg': '0.75rem',

  // ── Motion ───────────────────────────────────────────────────────────────
  '--lk-transition-fast': '150ms ease',
  '--lk-transition-base': '250ms ease',
};
