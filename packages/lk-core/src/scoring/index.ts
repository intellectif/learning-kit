import { DeferredScoringError, RedactedScoringError, UnknownActivityTypeError } from '../errors.js';
import { isRedacted } from '../is-redacted.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import type {
  ActivityData,
  ActivityType,
  ItemOutcome,
  LearnerResponse,
  ScoringResult,
} from '../types/activity.js';
import { computePassThreshold, selectFeedback } from './pass-threshold.js';
import { type RoundingPolicy, roundingPolicyOf } from './rounding.js';

// Every type a public signature on this subpath names — argument, return value,
// and the shapes inside them an adapter fills in. A consumer that imports
// `gradeReadAloud` from `./scoring` imports it from here alone, and a function
// whose arguments and result cannot be named is one that has to be called from
// `any` — which is how the evidence stops being checked. Type-only: the bundle
// is unchanged.
export type {
  ItemOutcome,
  ReadAloudData,
  ReadAloudLearnerResponse,
  RecordingRef,
} from '../types/activity.js';
export type { GradeRecord } from '../types/grading.js';
export type {
  GradeReadAloudOptions,
  ReadAloudWordAlignment,
  ReadAloudWordState,
  SpeechAssessment,
  SpeechMeasurement,
  SpeechPhoneme,
  SpeechPhonemeCandidate,
  SpeechPlausibilityPolicy,
  SpeechSyllable,
  SpeechUnscorable,
  SpeechUnscorableCode,
  SpeechWord,
  SpeechWordError,
  WavInspection,
  WavInspectionPolicy,
} from '../types/speech.js';
export type {
  AssessmentScore,
  AssessmentSectionInput,
  CompositionPolicy,
  PassFailureReason,
  ScoredItem,
  SectionScore,
} from './compose.js';
export { composeAssessmentScore } from './compose.js';
export type {
  DictationAlignment,
  DictationCharOp,
  DictationReference,
  DictationWordAlignment,
} from './dictation/index.js';
export {
  alignDictation,
  DICTATION_MAX_ACCEPTED_TRANSCRIPTS,
  DICTATION_MAX_EQUIVALENCE_LENGTH,
  DICTATION_MAX_EQUIVALENCES,
  DICTATION_MAX_TEXT_LENGTH,
  DICTATION_MAX_TRANSCRIPT_LENGTH,
  dictationReferenceWords,
  diffDictationChars,
} from './dictation/index.js';
export { computePassThreshold, DEFAULT_PASS_THRESHOLD } from './pass-threshold.js';
export type { Band, RoundingMode, RoundingPolicy } from './rounding.js';
export { classifyBand, gte, roundGrade } from './rounding.js';
export {
  alignReadAloud,
  gradeReadAloud,
  inspectWav,
  READ_ALOUD_MAX_DIMENSION_WEIGHT,
  READ_ALOUD_MAX_REFERENCE_LENGTH,
  READ_ALOUD_MAX_SECONDS,
  READ_ALOUD_MAX_TAKES,
  SPEECH_ASSESSMENT_MAX_WORDS,
  validateSpeechAssessment,
} from './speech/index.js';
export type { TextMatchPolicy, TextMatchResult } from './text-match.js';
export { levenshteinDistance, matchText } from './text-match.js';
export { outcomeFromUnscorable } from './unscorable.js';

/**
 * Options for {@link score} and {@link evaluate}. Additive: with none, both
 * behave exactly as they always have.
 */
export interface ScoringOptions {
  /**
   * Compare the pass line the way the score is displayed — both sides rounded,
   * via {@link computePassThreshold} — so an item shown as "70%" is not
   * recorded as a fail at 69.995. `passed` AND the authored feedback selected by
   * it follow the rounded comparison. Opt-in, for the reason
   * {@link computePassThreshold} gives: switching it on moves item-level
   * pass/fail for scores in the rounding band.
   *
   * Checked at the call: `null` reads as no policy, and a policy that cannot be
   * applied — an unknown `mode`, or a `dp` that is not a whole number from 0 to
   * 15 — throws a `RangeError` instead of quietly failing every comparison.
   */
  rounding?: RoundingPolicy;
}

/**
 * Scores a learner response against activity data and returns a full
 * {@link ScoringResult}.
 *
 * Pure and deterministic with no side effects. It does **not** re-validate
 * `activityData` — schema validation is the component boundary's
 * responsibility; this is a low-level scoring primitive that trusts its typed
 * inputs. Dispatch is registry-backed: consumer-registered types with `sync`
 * scoring work here too. An unregistered type throws
 * {@link UnknownActivityTypeError}; a type whose grading is deferred (e.g.
 * `written-response`) throws {@link DeferredScoringError} — use
 * {@link evaluate}, which can express "not graded yet".
 */
export function score(
  activityType: ActivityType,
  activityData: ActivityData,
  learnerResponse: LearnerResponse,
  options?: ScoringOptions,
): ScoringResult {
  const rounding = roundingPolicyOf(options?.rounding);
  const descriptor = getActivityTypeDescriptor(activityType);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(String(activityType));
  }
  if (descriptor.scoring.kind === 'deferred') {
    throw new DeferredScoringError(descriptor.type);
  }
  if (isRedacted(activityData)) {
    throw new RedactedScoringError(descriptor.type);
  }

  const result = descriptor.scoring.score(activityData, learnerResponse);
  if (!Number.isFinite(result.score)) {
    throw new RedactedScoringError(descriptor.type);
  }
  const passed = computePassThreshold(activityData, result.score, rounding);
  return { ...result, passed, feedback: result.feedback ?? selectFeedback(activityData, passed) };
}

/**
 * Evaluates a learner response against an activity and returns an
 * {@link ItemOutcome} — the resilient, forward-compatible alternative to
 * {@link score}:
 *
 * - Synchronously graded types return `{ status: 'scored', ... }` with the
 *   same numbers `score()` produces.
 * - Asynchronously graded types (e.g. `written-response`) return
 *   `{ status: 'deferred', reason, partial }` instead of a fake zero — "not
 *   graded yet" is expressible in the type system, never conflated with
 *   "wrong".
 * - An unregistered `data.type` returns `{ status: 'unscorable' }` rather
 *   than throwing, so a mixed-version content bank cannot crash an exam run.
 *
 * The activity type is read from `data.type` — there is no separate type
 * parameter to disagree with the payload.
 */
export function evaluate(
  data: ActivityData,
  response: LearnerResponse,
  options?: ScoringOptions,
): ItemOutcome {
  // A malformed option is the caller's configuration, not the content bank's:
  // it throws before any item is read, rather than grading every item wrong.
  const rounding = roundingPolicyOf(options?.rounding);
  const type = (data as { type?: unknown }).type;
  const descriptor = typeof type === 'string' ? getActivityTypeDescriptor(type) : undefined;

  if (descriptor === undefined) {
    return {
      status: 'unscorable',
      reason: `Activity type "${String(type)}" is not registered`,
      maxScore: 1,
    };
  }

  if (descriptor.scoring.kind === 'deferred') {
    const partial = descriptor.scoring.partial?.(data, response);
    return {
      status: 'deferred',
      reason: descriptor.scoring.reason,
      maxScore: 1,
      ...(partial !== undefined ? { partial } : {}),
    };
  }

  if (isRedacted(data)) {
    return {
      status: 'unscorable',
      reason:
        'Activity data is redacted (no answer key), so it cannot be scored on the client. Score against the full data server-side.',
      maxScore: 1,
    };
  }

  const result = descriptor.scoring.score(data, response);
  if (!Number.isFinite(result.score)) {
    // Defence in depth: incomplete data (a missing answer key, an empty
    // options array) used to divide by zero and surface as a real score of
    // NaN, which JSON-serializes to null in a grade column.
    return {
      status: 'unscorable',
      reason: `Scoring "${descriptor.type}" produced a non-finite score; the activity data is incomplete.`,
      maxScore: result.maxScore,
    };
  }
  const passed = computePassThreshold(data, result.score, rounding);
  return {
    status: 'scored',
    score: result.score,
    maxScore: result.maxScore,
    passed,
    feedback: result.feedback ?? selectFeedback(data, passed),
    details: result.details,
  };
}
