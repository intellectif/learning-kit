import {
  DICTATION_MAX_TEXT_LENGTH,
  DICTATION_MAX_TRANSCRIPT_LENGTH,
} from '../dictation/normalize.js';

/**
 * The longest reference text a read-aloud item accepts, in code points, before
 * and after normalisation. It is the dictation transcript cap on purpose: the
 * reference is tokenised as a dictation transcript is, and the dictation
 * normaliser cuts a transcript at that many code points without saying so, so
 * a longer text would be graded against words it had silently lost.
 */
export const READ_ALOUD_MAX_REFERENCE_LENGTH = DICTATION_MAX_TRANSCRIPT_LENGTH;

/** The longest take a read-aloud item may allow, in seconds: the most `recording.maxSeconds` may be. */
export const READ_ALOUD_MAX_SECONDS = 300;

/** The most takes a read-aloud item may allow: the most `recording.maxTakes` may be. */
export const READ_ALOUD_MAX_TAKES = 20;

/**
 * The largest weight a read-aloud dimension may carry. Weights are relative, so
 * no rubric needs more, and the cap keeps a mistyped weight from overflowing
 * the weighted total into a grade that cannot be computed.
 */
export const READ_ALOUD_MAX_DIMENSION_WEIGHT = 1000;

/**
 * The most words a speech assessment may carry. It bounds one side of the
 * alignment, and one side alone bounds nothing: the aligner pairs TOKENS, and
 * one word normalises to as many as its text holds. What bounds the quadratic
 * work is this cap, the 200-unit cap on a single word's text, and the two rules
 * `validateSpeechAssessment` states over the total of them — what the words are
 * written with, and what they spell once normalised.
 */
export const SPEECH_ASSESSMENT_MAX_WORDS = 1000;

/**
 * The most text the words of a speech assessment may carry between them: in
 * UTF-16 units as they are written, and in code points once they are normalised
 * into the tokens a mark is made from. One number for both, because they bound
 * the same work — a character that stands for eighteen under normalisation
 * would otherwise pass the first rule and overrun the second. Both count every
 * word, including one tagged `insertion`, which gives no token to pair but is
 * normalised and carried into the alignment all the same.
 *
 * It is the dictation attempt cap, because the words are the attempt: they are
 * normalised and aligned exactly as a learner's typed text is, and the aligner
 * reads no more of one than this. The aligner keeps the same number as its own
 * budget, a backstop for a public call whose evidence this build did not check.
 *
 * Internal on purpose. It is a bound on evidence an adapter writes, not a
 * number a caller composes anything from, so it is not exported from the
 * package: `validateSpeechAssessment` reports what it refuses and why.
 *
 * Four times the 2000-code-point reference cap, so no honest assessment of a
 * read-aloud item comes near it.
 */
export const SPEECH_ASSESSMENT_MAX_TEXT_LENGTH = DICTATION_MAX_TEXT_LENGTH;
