'use client';

import { createContext, useContext, useMemo } from 'react';
import type { LkStrings, LkStringsOverride } from './strings.js';
import { DEFAULT_STRINGS, mergeStrings } from './strings.js';

export type { LkStrings, LkStringsOverride } from './strings.js';
export { DEFAULT_STRINGS, mergeStrings } from './strings.js';

/** Writing direction of the surrounding UI. `auto` defers to the locale. */
export type LkDirection = 'ltr' | 'rtl' | 'auto';

interface LkIntlValue {
  strings: LkStrings;
  locale: string | undefined;
  direction: 'ltr' | 'rtl';
}

const LkIntlContext = createContext<LkIntlValue | null>(null);

/**
 * Locales written right-to-left, by language subtag.
 *
 * A short list rather than a dependency: these are the RTL scripts in living
 * use, and the set has not changed in decades. `Intl.Locale.textInfo` would be
 * better but is not available everywhere this package runs, and an explicit
 * `direction` prop overrides this in either direction anyway.
 */
const RTL_LANGUAGES = new Set(['ar', 'arc', 'dv', 'fa', 'he', 'ku', 'ps', 'sd', 'ug', 'ur', 'yi']);

/** Resolves a BCP 47 tag to a writing direction. */
export function directionForLocale(locale: string | undefined): 'ltr' | 'rtl' {
  if (locale === undefined) {
    return 'ltr';
  }
  const language = locale.split('-')[0]?.toLowerCase() ?? '';
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}

export interface LkIntlProviderProps {
  /**
   * Replaces the SDK's own chrome text. Anything omitted keeps its English
   * default, so a partial translation degrades to mixed rather than to blank.
   *
   * A nested provider REPLACES the one above it rather than layering onto it —
   * as a nested `ThemeProvider` restarts from `defaultTheme`. To layer, use a
   * component's own `strings` prop, or compose with `mergeStrings`.
   */
  strings?: LkStringsOverride;
  /**
   * BCP 47 tag for the SDK's chrome — NOT for the authored content, which
   * carries its own `locale`. Sets `lang` on the wrapper so a screen reader
   * reads "Question 3 of 10" in the interface language rather than in the
   * language of the passage beside it (WCAG 3.1.2).
   */
  locale?: string;
  /**
   * Writing direction. Defaults to `auto`, which derives it from `locale`.
   * Set it explicitly when the surrounding application already manages `dir`
   * and you do not want a second element declaring one.
   */
  direction?: LkDirection;
  children: React.ReactNode;
}

/**
 * Supplies the SDK's chrome text and writing direction to everything beneath.
 *
 * Mirrors `ThemeProvider`: a provider for the whole tree, and a per-component
 * prop for the exceptions. The component prop wins, so a single activity can
 * be relabelled without a second provider.
 *
 * ```tsx
 * <LkIntlProvider locale="es" strings={{
 *   submit: 'Enviar',
 *   checkAnswers: 'Comprobar respuestas',
 *   questionProgress: (i, total) => `Pregunta ${i} de ${total}`,
 *   wordCount: (n) => `${n} ${n === 1 ? 'palabra' : 'palabras'}`,
 *   media: { noPlaysRemaining: 'No quedan reproducciones' },
 * }}>
 *   <ActivitySequence … />
 * </LkIntlProvider>
 * ```
 *
 * The SDK ships **English only**. Bundling Spanish, Portuguese or Arabic would
 * mean shipping translations nobody in this repo can review, and a wrong
 * "No plays remaining" on a listening exam is worse than an English one that a
 * teacher can see is untranslated. The mechanism is the deliverable; the words
 * belong to whoever speaks the language.
 */
export function LkIntlProvider({
  strings,
  locale,
  direction = 'auto',
  children,
}: LkIntlProviderProps): React.JSX.Element {
  const value = useMemo<LkIntlValue>(
    () => ({
      strings: mergeStrings(DEFAULT_STRINGS, strings),
      locale,
      direction: direction === 'auto' ? directionForLocale(locale) : direction,
    }),
    [strings, locale, direction],
  );

  // Declare `dir` only when something actually told us the direction. With no
  // locale and no explicit `direction`, writing dir="ltr" would flip an RTL
  // host's own subtree back to left-to-right — the context value stays
  // concrete for `useLkDirection`; it is only the DOM declaration we withhold.
  const declared = direction === 'auto' && locale === undefined ? undefined : value.direction;

  return (
    <LkIntlContext.Provider value={value}>
      <div className="lk-intl" lang={locale} dir={declared}>
        {children}
      </div>
    </LkIntlContext.Provider>
  );
}

/**
 * The strings in force, with an optional per-component override layered on top.
 *
 * Usable without a provider: every component calls this, and one rendered
 * standalone still needs its labels. Falling back to the English defaults is
 * what keeps `<MultipleChoice>` working with no setup at all.
 */
export function useLkStrings(override?: LkStringsOverride): LkStrings {
  const context = useContext(LkIntlContext);
  const base = context?.strings ?? DEFAULT_STRINGS;
  return useMemo(() => mergeStrings(base, override), [base, override]);
}

/** The direction in force. `ltr` with no provider. */
export function useLkDirection(): 'ltr' | 'rtl' {
  return useContext(LkIntlContext)?.direction ?? 'ltr';
}
