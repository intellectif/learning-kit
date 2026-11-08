import { DEFAULT_CHROME_LOCALE } from '../what-happens/copy.js';

export interface CineScrambleChrome {
  startLabel: string;
  closeLabel: string;
  playFallback: string;
  mediaError: string;
  sceneLabel: string;
  clipLabel: string;
  slotLabel: string;
  poolLabel: string;
  removeLabel: string;
  correctLabel: string;
  incorrectLabel: string;
  completeLabel: string;
  keyboardHelp: string;

  checkLabel: string;
  vocabButtonLabel: string;
}

export const CINE_SCRAMBLE_CHROME = {
  en: {
    startLabel: 'Start',
    closeLabel: 'Close',
    playFallback: 'Play',
    mediaError: 'Media unavailable',
    sceneLabel: 'Scene',
    clipLabel: 'Clip',
    slotLabel: 'Slot',
    poolLabel: 'Clip pool',
    removeLabel: 'Return to pool',
    correctLabel: 'Correct',
    incorrectLabel: 'Try again',
    completeLabel: 'Story complete',
    keyboardHelp:
      'Focus a clip and press 1–6 to place it. Delete on a slot returns it to the pool. Press C to check.',

    checkLabel: 'Check',
    vocabButtonLabel: 'Vocabulary',
  },
  es: {
    startLabel: 'Comenzar',
    closeLabel: 'Cerrar',
    playFallback: 'Reproducir',
    mediaError: 'Medio no disponible',
    sceneLabel: 'Escena',
    clipLabel: 'Clip',
    slotLabel: 'Posición',
    poolLabel: 'Clips disponibles',
    removeLabel: 'Devolver a los clips disponibles',
    correctLabel: 'Correcto',
    incorrectLabel: 'Inténtalo de nuevo',
    completeLabel: 'Historia completa',
    keyboardHelp:
      'Enfoca un clip y pulsa 1–6 para colocarlo. Supr en una posición lo devuelve. Pulsa C para comprobar.',

    checkLabel: 'Comprobar',
    vocabButtonLabel: 'Vocabulario',
  },
} as const satisfies Record<'en' | 'es', CineScrambleChrome>;

export function cineScrambleChrome(locale: string = DEFAULT_CHROME_LOCALE): CineScrambleChrome {
  return locale === 'es' ? CINE_SCRAMBLE_CHROME.es : CINE_SCRAMBLE_CHROME.en;
}

export { DEFAULT_CHROME_LOCALE };
