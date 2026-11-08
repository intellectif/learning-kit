import { DEFAULT_CHROME_LOCALE } from '../what-happens/copy.js';

export interface CineScrambleChrome {
  checkLabel: string;
  vocabButtonLabel: string;
}

export const CINE_SCRAMBLE_CHROME = {
  en: {
    checkLabel: 'Check',
    vocabButtonLabel: 'Vocabulary',
  },
  es: {
    checkLabel: 'Comprobar',
    vocabButtonLabel: 'Vocabulario',
  },
} as const satisfies Record<'en' | 'es', CineScrambleChrome>;

export function cineScrambleChrome(locale: string = DEFAULT_CHROME_LOCALE): CineScrambleChrome {
  return locale === 'es' ? CINE_SCRAMBLE_CHROME.es : CINE_SCRAMBLE_CHROME.en;
}

export { DEFAULT_CHROME_LOCALE };
