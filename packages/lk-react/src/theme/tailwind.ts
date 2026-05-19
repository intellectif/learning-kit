import type { ThemeTokens } from '@intellectif/lk-core';
import { defaultTheme } from './tokens.js';

/**
 * Shape consumed by a Tailwind config's `theme.extend`. Every entry is a
 * `var(--lk-token, <fallback>)` reference: the var keeps utilities live
 * (ThemeProvider / dark-mode override at runtime); the fallback makes them
 * work with zero setup (no provider, no `defaults.css` import).
 */
export interface TailwindThemeExtension {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  fontFamily: Record<string, string>;
  fontSize: Record<string, string>;
}

/**
 * Token-prefix → Tailwind bucket. `--lk-font-weight-*`, `--lk-line-height-*`
 * and `--lk-transition-*` are intentionally absent: the first two have no
 * matching `theme.extend` group here, and the transition tokens hold a
 * `<duration> <easing>` shorthand that would emit invalid
 * `transition-duration: 150ms ease` if mapped to Tailwind's `transitionDuration`.
 */
const BUCKETS = [
  ['--lk-color-', 'colors'],
  ['--lk-spacing-', 'spacing'],
  ['--lk-radius-', 'borderRadius'],
  ['--lk-font-family-', 'fontFamily'],
  ['--lk-font-size-', 'fontSize'],
] as const;

/**
 * Converts SDK theme tokens into a Tailwind `theme.extend` object so Tailwind
 * projects consume the same `--lk-*` tokens as the components — one shared
 * source of truth rather than a parallel, conflicting palette.
 */
export function createTailwindTheme(theme: Partial<ThemeTokens>): TailwindThemeExtension {
  const merged: Record<string, string> = { ...defaultTheme, ...theme };
  const extension: TailwindThemeExtension = {
    colors: {},
    spacing: {},
    borderRadius: {},
    fontFamily: {},
    fontSize: {},
  };

  for (const [tokenName, fallback] of Object.entries(merged)) {
    for (const [prefix, bucket] of BUCKETS) {
      if (tokenName.startsWith(prefix)) {
        extension[bucket][`lk-${tokenName.slice(prefix.length)}`] =
          `var(${tokenName}, ${fallback})`;
        break;
      }
    }
  }

  return extension;
}
