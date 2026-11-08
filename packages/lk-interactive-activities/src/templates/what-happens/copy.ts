import { DEFAULT_CHROME_LOCALE, primaryLanguage } from '../../player/locale.js';

export { DEFAULT_CHROME_LOCALE };

export interface WhatHappensChrome {
  playFallback: string;
  replayToFreeze: string;
  mediaError: string;
  backButton: string;
  boardHint: string;
  watchHint: string;
  completedLabel: string;
  clipCount: string;

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
    playFallback: 'Play',
    replayToFreeze: 'Replay to freeze',
    mediaError: 'This clip could not be played.',
    backButton: 'All clips',
    boardHint: 'Choose a clip. When it pauses, say what you think happens next.',
    watchHint: 'Watch closely. The clip will pause.',
    completedLabel: 'Done',
    clipCount: 'Clip {n} of {total}',

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
    playFallback: 'Reproducir',
    replayToFreeze: 'Repetir hasta la pausa',
    mediaError: 'No se pudo reproducir este clip.',
    backButton: 'Todos los clips',
    boardHint: 'Elige un clip. Cuando se detenga, di qué crees que pasa después.',
    watchHint: 'Mira con atención. El clip se detendrá.',
    completedLabel: 'Hecho',
    clipCount: 'Clip {n} de {total}',

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

/**
 * The built-in chrome for a BCP 47 tag: Spanish for any `es` tag (`es`,
 * `es-CO`, `es-419`), English otherwise.
 */
export function whatHappensChrome(locale: string = DEFAULT_CHROME_LOCALE): WhatHappensChrome {
  return primaryLanguage(locale) === 'es' ? WHAT_HAPPENS_CHROME.es : WHAT_HAPPENS_CHROME.en;
}
