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

export type { TextMatchPolicy, TextMatchResult } from './text-match.js';
export { levenshteinDistance, matchText } from './text-match.js';

/** Default minimum scaled score required to pass when `passThreshold` is absent. */
export const DEFAULT_PASS_THRESHOLD = 0.7;

/**
 * Returns `true` iff `score` meets or exceeds the activity's `passThreshold`,
 * defaulting to {@link DEFAULT_PASS_THRESHOLD} (0.7) when the field is absent.
 */
export function computePassThreshold(activityData: ActivityData, score: number): boolean {
  return score >= (activityData.passThreshold ?? DEFAULT_PASS_THRESHOLD);
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
): ScoringResult {
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
  const passed = computePassThreshold(activityData, result.score);
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
export function evaluate(data: ActivityData, response: LearnerResponse): ItemOutcome {
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
  const passed = computePassThreshold(data, result.score);
  return {
    status: 'scored',
    score: result.score,
    maxScore: result.maxScore,
    passed,
    feedback: result.feedback ?? selectFeedback(data, passed),
    details: result.details,
  };
}
