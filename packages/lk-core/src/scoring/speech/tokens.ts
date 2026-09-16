/**
 * What an assessor's words spell once they are normalised: the tokens a
 * read-aloud mark is made from.
 *
 * A module of its own because two callers must agree about them to the
 * character. The aligner pairs these tokens with the item's words, and
 * `validateSpeechAssessment` refuses an assessment whose words spell more text
 * than the aligner reads — and a rule that measured that total its own way
 * would accept a reading the aligner then cut short, leaving the words the
 * learner actually said out of the marking entirely.
 *
 * So one walk answers both: the tokens a mark is made from, and what the whole
 * assessment spells — every word of it, insertions included, since the aligner
 * carries those into its answer too.
 */
import type { SpeechWord } from '../../types/speech.js';
import { codePointLength, normalizeDictationText } from '../dictation/normalize.js';
import { SPEECH_ASSESSMENT_MAX_TEXT_LENGTH } from './limits.js';

/** One normalised heard token, and the assessment word it was normalised from. */
export interface HeardToken {
  text: string;
  wordIndex: number;
}

/** The tokens an assessment's words give, and the text its words spell between them. */
export interface HeardTokens {
  /** The tokens a mark can be made from, in reading order, as far as the budget reaches. */
  tokens: HeardToken[];
  /**
   * What every word spells once it is normalised, in code points — the ones
   * past the budget too, and the insertions that give no token, so a rule that
   * refuses an assessment for its total can name the whole of it.
   */
  length: number;
}

/**
 * The normalised tokens of the words that can be marked, each remembering the
 * word it came from, up to what {@link SPEECH_ASSESSMENT_MAX_TEXT_LENGTH} code
 * points of text hold.
 *
 * A word the assessor tagged `insertion` gives no token — the reference has
 * nothing for it to pair with, so it is placed by its own position afterwards —
 * but its text IS charged to the length, because the aligner normalises it
 * anyway and emits it as an entry of its own. Charging it is what makes the
 * length the whole of what an assessment spells, so the bound the validator
 * states over it is the bound that holds. A word that normalises to nothing
 * spells nothing and is charged nothing.
 *
 * The length counts what the words spell as one text, so the space that joins a
 * token to the last one counts with it: the aligner's matrix is one byte per
 * token per reference word, and it is that text, not the words it was written
 * as, that decides how big it grows. Collecting stops at the first token that
 * would pass the budget, never inside one, because half a token pairs with the
 * wrong reference word and marks a reading nobody gave.
 */
export function heardTokens(words: readonly SpeechWord[]): HeardTokens {
  const tokens: HeardToken[] = [];
  let length = 0;
  for (const [wordIndex, word] of words.entries()) {
    const normalized = normalizeDictationText(word.text);
    if (normalized === '') {
      continue;
    }
    const inserted = word.error === 'insertion';
    // Normalised text is single-spaced and trimmed, so a plain split gives its
    // tokens and none of them is empty — which is why a length of 0 means
    // nothing has been counted yet, and only that token is charged no space.
    for (const text of normalized.split(' ')) {
      length += codePointLength(text) + (length === 0 ? 0 : 1);
      if (!inserted && length <= SPEECH_ASSESSMENT_MAX_TEXT_LENGTH) {
        tokens.push({ text, wordIndex });
      }
    }
  }
  return { tokens, length };
}
