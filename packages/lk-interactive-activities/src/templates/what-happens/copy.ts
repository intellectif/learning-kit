export const DEFAULT_CHROME_LOCALE = 'en';

export interface WhatHappensChrome {
  predictTitle: string;
  revealButton: string;
  tellTitle: string;
  supportsLabel: string;
  showAnswer: string;
  answerLabel: string;
  nextButton: string;
  listenButton: string;
}

export const WHAT_HAPPENS_CHROME = {
  en: {
    predictTitle: 'What happens next?',
    revealButton: 'Reveal',
    tellTitle: 'Tell the story',
    supportsLabel: 'To help you',
    showAnswer: 'Show answer',
    answerLabel: 'Sample answer',
    nextButton: 'Next',
    listenButton: 'Listen',
  },
  es: {
    predictTitle: '¿Qué pasa después?',
    revealButton: 'Revelar',
    tellTitle: 'Cuenta la historia',
    supportsLabel: 'Para ayudarte',
    showAnswer: 'Mostrar respuesta',
    answerLabel: 'Respuesta de ejemplo',
    nextButton: 'Siguiente',
    listenButton: 'Escuchar',
  },
} as const satisfies Record<'en' | 'es', WhatHappensChrome>;

export type ChromeLocale = keyof typeof WHAT_HAPPENS_CHROME;

export function whatHappensChrome(locale: string = DEFAULT_CHROME_LOCALE): WhatHappensChrome {
  return locale === 'es' ? WHAT_HAPPENS_CHROME.es : WHAT_HAPPENS_CHROME.en;
}
