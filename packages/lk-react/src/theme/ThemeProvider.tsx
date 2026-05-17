'use client';

import type { ThemeTokens } from '@intellectif/lk-core';
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { darkTheme } from './dark-theme.js';
import { defaultTheme } from './tokens.js';

export { darkTheme } from './dark-theme.js';
export { defaultTheme } from './tokens.js';

const ThemeContext = createContext<ThemeTokens>(defaultTheme);

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Subscribe to OS dark-mode changes; no-op when there is no `window`. */
function subscribePrefersDark(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Current OS dark-mode preference; `false` when there is no `window`. */
function getPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(DARK_QUERY).matches;
}

export interface ThemeProviderProps {
  /** Partial token overrides. When provided, dark auto-detection is disabled. */
  theme?: Partial<ThemeTokens>;
  children: ReactNode;
}

/**
 * Provides theme tokens to descendant activity components as scoped inline CSS
 * custom properties on a wrapper `<div>`, and via {@link useTheme}.
 *
 * Resolution: an explicit `theme` prop merges over {@link defaultTheme} (and
 * suppresses dark auto-detect, per Req 13.5). With no `theme` prop, the OS
 * `prefers-color-scheme: dark` preference auto-applies {@link darkTheme}.
 * SSR-safe: the server snapshot is always light, so hydration never mismatches.
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  const prefersDark = useSyncExternalStore(subscribePrefersDark, getPrefersDark, () => false);

  const activeTheme = useMemo<ThemeTokens>(() => {
    if (theme !== undefined) {
      return { ...defaultTheme, ...theme };
    }
    return prefersDark ? { ...defaultTheme, ...darkTheme } : defaultTheme;
  }, [theme, prefersDark]);

  return (
    <ThemeContext.Provider value={activeTheme}>
      <div style={activeTheme as CSSProperties}>{children}</div>
    </ThemeContext.Provider>
  );
}

/** Returns the currently active theme tokens (defaults when no provider). */
export function useTheme(): ThemeTokens {
  return useContext(ThemeContext);
}
