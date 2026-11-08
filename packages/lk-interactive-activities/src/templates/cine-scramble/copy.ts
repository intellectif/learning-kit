import { DEFAULT_CHROME_LOCALE, primaryLanguage } from '../../contract/locale.js';

export interface CineScrambleChrome {
  startLabel: string;
  closeLabel: string;
  playFallback: string;
  mediaError: string;
  pauseLabel: string;
  resumeLabel: string;
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
  clipHelp: string;
  selectedLabel: string;
  selectFirstLabel: string;
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
    playFallback: 'Play clips',
    mediaError: 'This clip could not be played.',
    pauseLabel: 'Pause clips',
    resumeLabel: 'Play clips',
    sceneLabel: 'Scene',
    scenesLabel: 'All scenes',
    clipLabel: 'Clip',
    slotLabel: 'Slot',
    emptySlotLabel: 'Drop a clip here',
    poolLabel: 'Clips to place',
    removeLabel: 'Take out of the slot',
    correctLabel: 'Right place',
    incorrectLabel: 'Not here',
    completeLabel: 'Story complete',
    storyLabel: 'The story',
    replayLabel: 'Start over',
    nextSceneLabel: 'Next scene',
    doneLabel: 'Done',
    keyboardHelp:
      'Drag each clip to the slot whose caption describes it, or select a clip and then a slot. With the keyboard: on a clip, press its slot’s number; Delete or Backspace takes it out; C checks.',
    clipHelp: 'Press a slot number to place it.',
    selectedLabel: '{clip} selected. Choose a slot.',
    selectFirstLabel: 'Select a clip first, then a slot.',
    placedLabel: '{clip} placed in slot {slot}.',
    returnedLabel: '{clip} taken out of its slot.',
    fillAllLabel: 'Place every clip before checking.',
    resultSummary: '{correct} of {total} in the right place. Move the others and check again.',

    checkLabel: 'Check',
    vocabButtonLabel: 'Vocabulary',
  },
  es: {
    startLabel: 'Comenzar',
    closeLabel: 'Cerrar',
    playFallback: 'Reproducir clips',
    mediaError: 'No se pudo reproducir este clip.',
    pauseLabel: 'Pausar clips',
    resumeLabel: 'Reproducir clips',
    sceneLabel: 'Escena',
    scenesLabel: 'Todas las escenas',
    clipLabel: 'Clip',
    slotLabel: 'Posición',
    emptySlotLabel: 'Suelta un clip aquí',
    poolLabel: 'Clips por colocar',
    removeLabel: 'Quitar de la posición',
    correctLabel: 'En su lugar',
    incorrectLabel: 'No va aquí',
    completeLabel: 'Historia completa',
    storyLabel: 'La historia',
    replayLabel: 'Volver a empezar',
    nextSceneLabel: 'Siguiente escena',
    doneLabel: 'Completado',
    keyboardHelp:
      'Arrastra cada clip a la posición cuyo texto lo describe, o selecciona un clip y luego una posición. Con el teclado: con un clip enfocado, pulsa el número de su posición; Supr o Retroceso lo quita; C comprueba.',
    clipHelp: 'Pulsa el número de una posición para colocarlo.',
    selectedLabel: '{clip} seleccionado. Elige una posición.',
    selectFirstLabel: 'Primero selecciona un clip y luego una posición.',
    placedLabel: '{clip} colocado en la posición {slot}.',
    returnedLabel: '{clip} vuelve a los clips por colocar.',
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
