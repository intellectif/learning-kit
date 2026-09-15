/**
 * The public dictation primitives: what a review screen, an analytics job or a
 * consumer's own renderer reads so that it never re-implements the arithmetic
 * the grade is made of. `editDistance`, the normaliser and the tokeniser stay
 * internal; the alignment carries the normalised strings.
 */
export type { DictationAlignment, DictationReference, DictationWordAlignment } from './align.js';
export { alignDictation, dictationReferenceWords } from './align.js';
export type { DictationCharOp } from './chars.js';
export { diffDictationChars } from './chars.js';
export {
  DICTATION_MAX_ACCEPTED_TRANSCRIPTS,
  DICTATION_MAX_EQUIVALENCE_LENGTH,
  DICTATION_MAX_EQUIVALENCES,
  DICTATION_MAX_TEXT_LENGTH,
  DICTATION_MAX_TRANSCRIPT_LENGTH,
} from './normalize.js';
