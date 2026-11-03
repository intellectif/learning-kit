/**
 * The pass line, and the authored feedback it selects.
 *
 * A module of its own so grade-producing code outside the scoring barrel can
 * import it without importing the barrel: `gradeReadAloud`, under
 * `scoring/speech/`, calls `gradeFromRubric`, so if `grading.ts` imported the
 * barrel the barrel would import itself through them. `scoring/index.ts`
 * re-exports the pass line and its default by name; the feedback selector
 * beside them stays internal.
 */
import type { ActivityData, ActivityFeedback } from '../types/activity.js';
import { gte, type RoundingPolicy, roundingPolicyOf } from './rounding.js';

/** Default minimum scaled score required to pass when `passThreshold` is absent. */
export const DEFAULT_PASS_THRESHOLD = 0.7;

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
 *
 * The policy is checked at the call, as `score()`'s `rounding` option is:
 * `null` reads as no policy, and one that cannot be applied — an unknown
 * `mode`, or a `dp` that is not a whole number from 0 to 15 — throws a
 * `RangeError` instead of quietly failing the comparison.
 */
export function computePassThreshold(
  activityData: ActivityData,
  score: number,
  rounding?: RoundingPolicy,
): boolean {
  const policy = roundingPolicyOf(rounding);
  const threshold = activityData.passThreshold ?? DEFAULT_PASS_THRESHOLD;
  return policy === undefined ? score >= threshold : gte(score, threshold, policy);
}

/**
 * Selects the authored overall feedback for a result: `feedback.correct` when
 * the learner passed, `feedback.incorrect` otherwise; `null` when no matching
 * message was authored. Mirrors the selection the lk-react components applied
 * (keyed on `passed`, per the `ActivityFeedback` contract).
 */
export function selectFeedback(activityData: ActivityData, passed: boolean): string | null {
  const feedback = (activityData as { feedback?: ActivityFeedback }).feedback;
  if (feedback === undefined) {
    return null;
  }
  return (passed ? feedback.correct : feedback.incorrect) ?? null;
}
