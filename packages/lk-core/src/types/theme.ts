/**
 * All CSS custom property tokens consumed by learning-kit components.
 * Every key maps to a `--lk-*` CSS variable name; every value is a CSS value string.
 * Pass a `Partial<ThemeTokens>` to `ThemeProvider` to override individual tokens.
 */
export interface ThemeTokens {
  // ── Colours ─────────────────────────────────────────────────────────────
  '--lk-color-primary': string;
  '--lk-color-primary-hover': string;
  '--lk-color-surface': string;
  '--lk-color-surface-raised': string;
  '--lk-color-border': string;
  '--lk-color-text': string;
  '--lk-color-text-muted': string;
  '--lk-color-success': string;
  '--lk-color-error': string;
  '--lk-color-warning': string;
  '--lk-color-focus-ring': string;

  // ── Spacing ──────────────────────────────────────────────────────────────
  '--lk-spacing-xs': string;
  '--lk-spacing-sm': string;
  '--lk-spacing-md': string;
  '--lk-spacing-lg': string;
  '--lk-spacing-xl': string;

  // ── Typography ───────────────────────────────────────────────────────────
  '--lk-font-family-base': string;
  '--lk-font-size-sm': string;
  '--lk-font-size-base': string;
  '--lk-font-size-lg': string;
  '--lk-font-weight-normal': string;
  '--lk-font-weight-bold': string;
  '--lk-line-height-base': string;

  // ── Shape ────────────────────────────────────────────────────────────────
  '--lk-radius-sm': string;
  '--lk-radius-base': string;
  '--lk-radius-lg': string;

  // ── Motion ───────────────────────────────────────────────────────────────
  '--lk-transition-fast': string;
  '--lk-transition-base': string;
}
