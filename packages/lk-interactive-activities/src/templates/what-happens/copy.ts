import { DEFAULT_CHROME_LOCALE, primaryLanguage } from '../../contract/locale.js';

export { DEFAULT_CHROME_LOCALE };

export interface WhatHappensChrome {
  playFallback: string;
  replayToFreeze: string;
  mediaError: string;
  listenError: string;
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
  hideAnswer: string;
  answerHidden: string;
  answerLabel: string;
  nextButton: string;
  listenButton: string;
}

export const WHAT_HAPPENS_CHROME = {
  en: {
    playFallback: 'Play',
    replayToFreeze: 'Watch again',
    mediaError: 'This clip could not be played.',
    listenError: 'The answer could not be read aloud on this device.',
    backButton: 'All clips',
    boardHint: 'Choose a clip. When it pauses, answer the question.',
    watchHint: 'Watch closely. The clip will pause.',
    completedLabel: 'Done',
    clipCount: 'Clip {n} of {total}',

    predictTitle: 'What happens next?',
    revealButton: 'Reveal',
    tellTitle: 'Tell the story',
    supportsLabel: 'To help you',
    showAnswer: 'Show answer',
    hideAnswer: 'Hide answer',
    answerHidden: 'Answer hidden. Your turn again.',
    answerLabel: 'Sample answer',
    nextButton: 'Next',
    listenButton: 'Listen',
  },
  es: {
    playFallback: 'Reproducir',
    replayToFreeze: 'Ver otra vez',
    mediaError: 'No se pudo reproducir este clip.',
    listenError: 'No se pudo leer la respuesta en voz alta en este dispositivo.',
    backButton: 'Todos los clips',
    boardHint: 'Elige un clip. Cuando se detenga, responde la pregunta.',
    watchHint: 'Mira con atención. El clip se detendrá.',
    completedLabel: 'Completado',
    clipCount: 'Clip {n} de {total}',

    predictTitle: '¿Qué crees que va a pasar?',
    revealButton: 'Revelar',
    tellTitle: 'Cuenta la historia',
    supportsLabel: 'Para ayudarte',
    showAnswer: 'Mostrar respuesta',
    hideAnswer: 'Ocultar respuesta',
    answerHidden: 'Respuesta oculta. Te toca de nuevo.',
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
