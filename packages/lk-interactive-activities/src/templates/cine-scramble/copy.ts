import { DEFAULT_CHROME_LOCALE, primaryLanguage } from '../../player/locale.js';

export interface CineScrambleChrome {
  startLabel: string;
  closeLabel: string;
  playFallback: string;
  mediaError: string;
  sceneLabel: string;
  scenesLabel: string;
  clipLabel: string;
  slotLabel: string;
  emptySlotLabel: string;
  poolLabel: string;
  removeLabel: string;
  correctLabel: string;
  incorrectLabel: string;
  completeLabel: string;
  storyLabel: string;
  replayLabel: string;
  nextSceneLabel: string;
  doneLabel: string;
  keyboardHelp: string;
  selectedLabel: string;
  placedLabel: string;
  returnedLabel: string;
  fillAllLabel: string;
  resultSummary: string;

  checkLabel: string;
  vocabButtonLabel: string;
}

export const CINE_SCRAMBLE_CHROME = {
  en: {
    startLabel: 'Start',
    closeLabel: 'Close',
    playFallback: 'Play',
    mediaError: 'This clip could not be played.',
    sceneLabel: 'Scene',
    scenesLabel: 'All scenes',
    clipLabel: 'Clip',
    slotLabel: 'Slot',
    emptySlotLabel: 'Drop a clip here',
    poolLabel: 'Clips to place',
    removeLabel: 'Return to pool',
    correctLabel: 'Right place',
    incorrectLabel: 'Not here',
    completeLabel: 'Story complete',
    storyLabel: 'The story',
    replayLabel: 'Play again',
    nextSceneLabel: 'Next scene',
    doneLabel: 'Done',
    keyboardHelp:
      'Drag each clip onto the slot whose caption it shows, or select a clip and then a slot. With the keyboard, press a slot number on a clip, Delete to return it, and C to check.',
    selectedLabel: '{clip} selected. Choose a slot.',
    placedLabel: '{clip} placed in slot {slot}.',
    returnedLabel: '{clip} returned to the pool.',
    fillAllLabel: 'Place every clip before checking.',
    resultSummary: '{correct} of {total} in the right place. Move the others and check again.',

    checkLabel: 'Check',
    vocabButtonLabel: 'Vocabulary',
  },
  es: {
    startLabel: 'Comenzar',
    closeLabel: 'Cerrar',
    playFallback: 'Reproducir',
    mediaError: 'No se pudo reproducir este clip.',
    sceneLabel: 'Escena',
    scenesLabel: 'Todas las escenas',
    clipLabel: 'Clip',
    slotLabel: 'Posición',
    emptySlotLabel: 'Suelta un clip aquí',
    poolLabel: 'Clips por colocar',
    removeLabel: 'Devolver a los clips',
    correctLabel: 'En su lugar',
    incorrectLabel: 'No va aquí',
    completeLabel: 'Historia completa',
    storyLabel: 'La historia',
    replayLabel: 'Jugar de nuevo',
    nextSceneLabel: 'Siguiente escena',
    doneLabel: 'Hecho',
    keyboardHelp:
      'Arrastra cada clip a la posición cuyo texto muestra, o selecciona un clip y luego una posición. Con el teclado, pulsa el número de la posición sobre un clip, Supr para devolverlo y C para comprobar.',
    selectedLabel: '{clip} seleccionado. Elige una posición.',
    placedLabel: '{clip} colocado en la posición {slot}.',
    returnedLabel: '{clip} devuelto a los clips.',
    fillAllLabel: 'Coloca todos los clips antes de comprobar.',
    resultSummary: '{correct} de {total} en su lugar. Mueve los demás y vuelve a comprobar.',

    checkLabel: 'Comprobar',
    vocabButtonLabel: 'Vocabulario',
  },
} as const satisfies Record<'en' | 'es', CineScrambleChrome>;

/**
 * The built-in chrome for a BCP 47 tag: Spanish for any `es` tag (`es`,
 * `es-CO`, `es-419`), English otherwise.
 */
export function cineScrambleChrome(locale: string = DEFAULT_CHROME_LOCALE): CineScrambleChrome {
  return primaryLanguage(locale) === 'es' ? CINE_SCRAMBLE_CHROME.es : CINE_SCRAMBLE_CHROME.en;
}

export { DEFAULT_CHROME_LOCALE };
