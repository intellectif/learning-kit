import type { CineScrambleData } from './types.js';

/** Whether the vocabulary button is offered: switched on (the default) and not empty. */
export function isVocabEnabled(activity: CineScrambleData): boolean {
  return activity.vocabEnabled !== false && (activity.vocab?.length ?? 0) > 0;
}
