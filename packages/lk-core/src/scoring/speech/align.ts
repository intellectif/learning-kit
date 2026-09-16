/**
 * Marking a read-aloud take word by word: the item's own reference words,
 * paired with the words an assessor heard.
 *
 * The assessor's word list is never taken as the item's. Providers disagree
 * about what a word is, and a provider can be changed; `w<n>` is the position
 * of a REFERENCE word, exactly as `dictationReferenceWords` numbers it, so a
 * mark stored today still names the same word tomorrow. The pairing is the
 * dictation aligner's, run over the dictation normaliser's tokens, so a
 * read-aloud mark and a dictation mark are made the same way.
 */
import type { ReadAloudData, ValidationError } from '../../types/activity.js';
import type { ReadAloudWordAlignment, SpeechAssessment, SpeechWord } from '../../types/speech.js';
import { alignSequences, dictationReferenceWords, STEP } from '../dictation/align.js';
import { normalizeDictationText } from '../dictation/normalize.js';
import { describeValidationError, validateSpeechAssessment } from './assessment.js';
import { type HeardToken, heardTokens } from './tokens.js';

/** A reference word as `dictationReferenceWords` numbers it. */
interface ReferenceWord {
  itemId: string;
  word: string;
}

/**
 * The word's accuracy when it has one. Absent means the assessor did not
 * measure the word, which is never the same as measuring it at 0.
 */
function accuracyOf(word: SpeechWord): { accuracy?: number } {
  return word.accuracy !== undefined ? { accuracy: word.accuracy } : {};
}

/**
 * Pairs the words of `assessment` with the words of `data.referenceText`, in
 * reading order: what was read as written, what was mispronounced, what was
 * left out, and what was said that the text does not contain.
 *
 * Reference words are the dictation tokeniser's, so `itemId` is the `w<n>`
 * `dictationReferenceWords` gives, and both `reference` and `heard` are
 * normalised — lowercased, with punctuation and spacing folded away. One
 * assessor word can normalise to no token at all (a dash), or to several (a
 * compatibility form), and two can merge into one (`rock&roll`); tokens are
 * what is aligned, and each remembers the word it came from.
 *
 * A word the assessor tagged `insertion` is never aligned — the reference has
 * nothing for it — so it is placed by the position of its own word, after the
 * last token that came from an earlier word.
 *
 * Whether a paired word counts as read correctly follows `assessment.miscue`:
 * an assessor that judges miscues is trusted, and one that does not
 * (`miscue: 'none'`) has its recognised word compared with the reference word.
 *
 * `heard` is `''` for an omitted word, and also for an inserted word whose text
 * normalises to nothing. Branch on `state`, never on the empty string.
 *
 * The heard tokens are bounded: they are taken in reading order until what the
 * assessment's words spell would pass `DICTATION_MAX_TEXT_LENGTH` code points —
 * the cap the dictation aligner reads a learner's text under — and always on a
 * whole token, because half a token pairs with the wrong word. Every word is
 * charged, an inserted one included, so that total is the whole of the text
 * this function can answer with. Words past the budget contribute no token, so
 * each reference word left with nothing read for it is `omitted`.
 * `validateSpeechAssessment` refuses an assessment whose words spell more than
 * that, measured by the same walk and against the same number, so a validated
 * assessment never reaches the budget: it is a backstop, kept because this
 * function is public and can be handed evidence this build did not check.
 *
 * **`data` is not validated.** Only the assessment is. A `referenceText` longer
 * than `READ_ALOUD_MAX_REFERENCE_LENGTH` code points is cut by the tokeniser
 * with no signal, and one that is absent or is not a string yields no reference
 * word at all, so every heard token comes back `inserted` rather than refused.
 * Validate the item with `validateActivity('read-aloud', data)` first.
 * `gradeReadAloud` is safe without that because it runs the schema itself.
 *
 * Pure and deterministic: no locale, no `Intl`, no clock.
 *
 * @throws TypeError when `assessment` is not a well-formed
 * {@link SpeechAssessment}; check it with `validateSpeechAssessment` first.
 */
export function alignReadAloud(
  data: Pick<ReadAloudData, 'referenceText'>,
  assessment: SpeechAssessment,
): ReadAloudWordAlignment[] {
  const checked = validateSpeechAssessment(assessment);
  if (!checked.success) {
    throw new TypeError(
      'alignReadAloud was given something that is not a speech assessment ' +
        `(${describeValidationError(checked.errors[0] as ValidationError)}). ` +
        'Check it with validateSpeechAssessment before aligning it.',
    );
  }
  // The checked copy, never the argument: a getter that answers the validator
  // one word and the aligner another would mark a reading nobody gave.
  return alignValidated(data, checked.data);
}

/**
 * {@link alignReadAloud} for a caller that has already validated the
 * assessment, and holds the value the validator handed back.
 *
 * Internal: it is how `gradeReadAloud` aligns what it just checked, rather than
 * paying for the same parse twice — the cost of which is the whole assessment,
 * words, syllables and phonemes, on every grade.
 */
export function alignValidated(
  data: Pick<ReadAloudData, 'referenceText'>,
  assessment: SpeechAssessment,
): ReadAloudWordAlignment[] {
  // Index 0 is the transcript's own words: a read-aloud item has one text, and
  // no accepted alternatives, so there is never another candidate list.
  const reference = dictationReferenceWords({
    transcript: data.referenceText,
  })[0] as readonly ReferenceWord[];

  const heard = heardTokens(assessment.words).tokens;

  const entries: ReadAloudWordAlignment[] = [];
  for (const { step, referenceIndex, attemptIndex } of alignSequences(
    reference.map((word) => word.word),
    heard.map((token) => token.text),
  )) {
    if (step === STEP.extra) {
      const token = heard[attemptIndex] as HeardToken;
      entries.push({
        reference: '',
        heard: token.text,
        state: 'inserted',
        ...accuracyOf(assessment.words[token.wordIndex] as SpeechWord),
        wordIndex: token.wordIndex,
      });
      continue;
    }
    const referenceWord = reference[referenceIndex] as ReferenceWord;
    if (step === STEP.missing) {
      entries.push({
        itemId: referenceWord.itemId,
        reference: referenceWord.word,
        heard: '',
        state: 'omitted',
      });
      continue;
    }
    const token = heard[attemptIndex] as HeardToken;
    const word = assessment.words[token.wordIndex] as SpeechWord;
    const state = pairedState(word, assessment.miscue, referenceWord.word, token.text);
    entries.push({
      itemId: referenceWord.itemId,
      reference: referenceWord.word,
      // An omitted word was not read: whatever text the assessor carried for it
      // describes the reference, not the learner.
      heard: state === 'omitted' ? '' : token.text,
      state,
      ...accuracyOf(word),
      wordIndex: token.wordIndex,
    });
  }

  placeInsertions(assessment, entries);
  return entries;
}

/** How a reference word paired with a heard token is marked. */
function pairedState(
  word: SpeechWord,
  miscue: SpeechAssessment['miscue'],
  reference: string,
  heard: string,
): ReadAloudWordAlignment['state'] {
  if (word.error === 'omission') {
    return 'omitted';
  }
  if (word.error === 'mispronunciation') {
    return 'mispronounced';
  }
  // An assessor that does not judge miscues reports every word it recognised as
  // `none`, so a recognised word that is not the reference word is the SDK's
  // own finding, not the assessor's silence.
  if (miscue === 'none' && heard !== reference) {
    return 'mispronounced';
  }
  return 'correct';
}

/**
 * Splices in one entry per `insertion` word. An inserted word has no reference
 * word to align with, so it is placed by its own position among the assessor's
 * words: immediately after the last entry that came from an earlier word, or
 * first when nothing came before it. Several in a row keep the order the
 * assessor reported them in, because each is placed after the one before it.
 */
function placeInsertions(assessment: SpeechAssessment, entries: ReadAloudWordAlignment[]): void {
  assessment.words.forEach((word, wordIndex) => {
    if (word.error !== 'insertion') {
      return;
    }
    let at = 0;
    entries.forEach((entry, index) => {
      if (entry.wordIndex !== undefined && entry.wordIndex < wordIndex) {
        at = index + 1;
      }
    });
    entries.splice(at, 0, {
      reference: '',
      // Every insertion is accounted for, including one whose text normalises
      // to nothing: a reader of `wordIndex` must find each word it looks for.
      heard: normalizeDictationText(word.text),
      state: 'inserted',
      ...accuracyOf(word),
      wordIndex,
    });
  });
}
