import { DeferredScoringError, RedactedScoringError, UnknownActivityTypeError } from '../errors.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import type {
  ActivityData,
  ActivityFeedback,
  ActivityType,
  ItemOutcome,
  LearnerResponse,
  ScoringResult,
} from '../types/activity.js';
import { gte, type RoundingPolicy } from './rounding.js';

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
export type { Band, RoundingMode, RoundingPolicy } from './rounding.js';
export { classifyBand, gte, roundGrade } from './rounding.js';
export type { TextMatchPolicy, TextMatchResult } from './text-match.js';
export { levenshteinDistance, matchText } from './text-match.js';

/** Default minimum scaled score required to pass when `passThreshold` is absent. */
export const DEFAULT_PASS_THRESHOLD = 0.7;

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

const ROUNDING_MODES: readonly unknown[] = ['half-up', 'half-even', 'floor', 'ceil'];
/** The most decimal places a policy may round to: a scaled grade stays an integer a double holds exactly. */
const MAX_ROUNDING_DP = 15;

/**
 * The rounding policy of `options`, or `undefined` for none. A malformed one
 * would reach {@link gte} as `10 ** undefined` and turn a perfect score into a
 * fail with no error, so it throws here instead.
 */
function roundingOf(options: ScoringOptions | undefined): RoundingPolicy | undefined {
  const rounding: unknown = options?.rounding;
  if (rounding === undefined || rounding === null) {
    return undefined;
  }
  const { mode, dp } = rounding as { mode?: unknown; dp?: unknown };
  if (
    !ROUNDING_MODES.includes(mode) ||
    typeof dp !== 'number' ||
    !Number.isInteger(dp) ||
    dp < 0 ||
    dp > MAX_ROUNDING_DP
  ) {
    // Described field by field, never serialised: a policy holding a BigInt or
    // a reference to itself would make the message throw a TypeError first.
    const describe = (value: unknown): string =>
      typeof value === 'string'
        ? JSON.stringify(value)
        : typeof value === 'number' || value === undefined
          ? String(value)
          : typeof value === 'object'
            ? 'an object'
            : `a ${typeof value}`;
    throw new RangeError(
      `Invalid rounding policy (mode ${describe(mode)}, dp ${describe(dp)}): expected { mode: 'half-up' | 'half-even' | 'floor' | 'ceil', dp: a whole number from 0 to ${MAX_ROUNDING_DP} }.`,
    );
  }
  // The values just checked, not the object they came from: an accessor could
  // answer differently when the comparison reads it again.
  return { mode, dp } as RoundingPolicy;
}

/**
 * Returns `true` iff `score` meets or exceeds the activity's `passThreshold`,
 * defaulting to {@link DEFAULT_PASS_THRESHOLD} (0.7) when the field is absent.
 *
 * Pass a {@link RoundingPolicy} to compare the way an assessment total is
 * compared — both sides rounded, via {@link gte} — so an item shown as "70%"
 * cannot be recorded as a fail at 69.6. It is **opt-in** rather than the
 * default because switching it on changes item-level pass/fail for scores in
 * the rounding band, and this SDK does not alter historical grades without an
 * explicit decision. Absent, the comparison is the exact raw `>=` it has
 * always been.
 */
export function computePassThreshold(
  activityData: ActivityData,
  score: number,
  rounding?: RoundingPolicy,
): boolean {
  const threshold = activityData.passThreshold ?? DEFAULT_PASS_THRESHOLD;
  return rounding === undefined ? score >= threshold : gte(score, threshold, rounding);
}

/**
 * True when `data` is a `redact()` projection rather than full activity data.
 * Scoring a redacted item is always a bug: the answer key is gone by design,
 * so any "score" computed from it is meaningless (it used to come out `NaN`).
 */
function isRedacted(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { redacted?: unknown }).redacted === true
  );
}

/**
 * Selects the authored overall feedback for a result: `feedback.correct` when
 * the learner passed, `feedback.incorrect` otherwise; `null` when no matching
 * message was authored. Mirrors the selection the lk-react components applied
 * (keyed on `passed`, per the `ActivityFeedback` contract).
 */
function selectFeedback(activityData: ActivityData, passed: boolean): string | null {
  const feedback = (activityData as { feedback?: ActivityFeedback }).feedback;
  if (feedback === undefined) {
    return null;
  }
  return (passed ? feedback.correct : feedback.incorrect) ?? null;
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
  const rounding = roundingOf(options);
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
  const rounding = roundingOf(options);
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
