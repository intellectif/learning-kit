import { isGradeInRange } from './scoring/grade-numbers.js';
import { computePassThreshold } from './scoring/pass-threshold.js';
import { gte, type RoundingPolicy, roundingPolicyOf } from './scoring/rounding.js';
import type { ActivityData, ItemOutcome } from './types/activity.js';
import type { CriterionScore, GradeRecord } from './types/grading.js';

export type {
  CriterionScore,
  GradeRecord,
  Grader,
  GraderKind,
  GraderUsage,
  GradingState,
  InlineCorrection,
} from './types/grading.js';

/** Options for {@link gradeFromRubric}. */
export interface GradeFromRubricOptions {
  /**
   * Scaled score [0,1] required to pass. Defaults to the activity's
   * `passThreshold`, or {@link DEFAULT_PASS_THRESHOLD} when absent.
   */
  passThreshold?: number;
  /** Narrative feedback for the learner, carried onto the record verbatim. */
  feedback?: string | null;
  /**
   * Compare the pass line the way the score is displayed — both sides rounded,
   * via `gte` — whichever threshold applies: `passThreshold` above, the
   * activity's own, or the 0.7 default. The returned `score` stays unrounded.
   * Opt-in, as on `score()` and `evaluate()`: switching it on moves pass/fail
   * for totals in the rounding band.
   *
   * Checked before any criterion is read: `null` reads as no policy, and a
   * policy that cannot be applied — an unknown `mode`, or a `dp` that is not a
   * whole number from 0 to 15 — throws a `RangeError`, even for a rubric that
   * turns out to be unscorable.
   */
  rounding?: RoundingPolicy;
}

/**
 * Computes the weighted total from per-criterion scores — the arithmetic that
 * must NOT be delegated to a language model.
 *
 * A grader is asked for judgement (how good is this criterion?), not for
 * mental arithmetic. Asking a model to also produce the weighted total makes
 * the final grade unverifiable and unreproducible: two runs can return
 * different totals for identical criterion scores. This function makes the
 * total a pure function of the judgements, so a grade can be recomputed and
 * audited years later.
 *
 * Weights are normalised by their sum, so they need not add to 1; each must be
 * zero or more, and their sum a positive, finite number, or the result is
 * `unscorable`. Criteria marked `notApplicable`, and those carrying no numeric
 * `score` (a purely banded judgement), are excluded from both numerator and
 * denominator, weight included. When nothing scoreable remains the result is
 * `unscorable`, never a zero.
 *
 * Scores need not be in [0,1]: set `maxScore` on a criterion to declare what
 * its score is out of, and each is normalised before weighting. A grader
 * working out of 100 says so and is done:
 *
 * ```ts
 * gradeFromRubric([
 *   { name: 'Task achievement', score: 82, maxScore: 100, weight: 2 },
 *   { name: 'Range',            score: 7,  maxScore: 9,   weight: 1 },
 * ]);
 * ```
 *
 * The returned `GradeRecord.score` is always scaled [0,1] against
 * `maxScore: 1`, like every other score in the SDK.
 */
export function gradeFromRubric(
  criteria: readonly CriterionScore[],
  activityData?: ActivityData,
  options: GradeFromRubricOptions = {},
): GradeRecord | { unscorable: true; reason: string } {
  // A malformed rounding policy is the caller's configuration, not this
  // rubric's, so it throws before any criterion is read, as in `score()` and
  // `evaluate()`. Read null-safely: an options object passed as `null` has
  // always reached the unscorable returns below, and still does.
  const rounding = roundingPolicyOf(options?.rounding);

  // A corrupt score is an ERROR, not an exclusion. Exclusions (`notApplicable`,
  // and band-only criteria with no numeric score) are deliberate authoring
  // decisions; a NaN or Infinity is a broken grader. Silently dropping it
  // would regrade the learner on fewer criteria — with different effective
  // weights — and nobody would know.
  const corrupt = criteria.find(
    (criterion) =>
      criterion.notApplicable !== true &&
      criterion.score !== undefined &&
      !Number.isFinite(criterion.score),
  );
  if (corrupt !== undefined) {
    return {
      unscorable: true,
      reason: `Criterion "${corrupt.name}" has a non-finite score (${String(corrupt.score)}). A grade cannot be computed from it.`,
    };
  }

  // A `maxScore` that is absent means 1 (the scaled convention). One that is
  // present must be a positive finite number: dividing by 0, a negative, or a
  // NaN would produce a grade nobody can defend.
  const badMax = criteria.find(
    (criterion) =>
      criterion.notApplicable !== true &&
      criterion.maxScore !== undefined &&
      !(Number.isFinite(criterion.maxScore) && criterion.maxScore > 0),
  );
  if (badMax !== undefined) {
    return {
      unscorable: true,
      reason: `Criterion "${badMax.name}" declares maxScore ${String(badMax.maxScore)}; it must be a positive, finite number.`,
    };
  }

  const scoreable = criteria.filter(
    (criterion) => criterion.notApplicable !== true && typeof criterion.score === 'number',
  );

  /** The criterion's score as a ratio in [0,1]. `maxScore` defaults to 1. */
  const ratioOf = (criterion: CriterionScore): number =>
    (criterion.score as number) / (criterion.maxScore ?? 1);

  // A grader that returns raw points (4 out of 5) without declaring
  // `maxScore: 5` would otherwise yield `{ score: 4, maxScore: 1 }` and pass
  // every threshold. Reject rather than clamp: silently rescaling someone's
  // grader is worse than telling them it is out of contract. A hair outside
  // the range is float noise and is clamped further down.
  const EPSILON = 1e-9;
  const outOfRange = scoreable.find(
    (criterion) => ratioOf(criterion) < -EPSILON || ratioOf(criterion) > 1 + EPSILON,
  );
  if (outOfRange !== undefined) {
    return {
      unscorable: true,
      reason:
        `Criterion "${outOfRange.name}" has score ${outOfRange.score} out of ${outOfRange.maxScore ?? 1}, ` +
        'which is outside the [0,1] range once scaled. Set `maxScore` on the criterion to declare what the ' +
        'score is out of (e.g. `maxScore: 100` for a 0–100 grader).',
    };
  }

  if (scoreable.length === 0) {
    return {
      unscorable: true,
      reason: 'No criterion carried a numeric score, so no weighted total can be computed.',
    };
  }

  const totalWeight = scoreable.reduce((sum, criterion) => sum + (criterion.weight ?? 1), 0);
  if (!(totalWeight > 0)) {
    return {
      unscorable: true,
      reason:
        'Criterion weights do not sum to a positive number, so the weighted total is undefined.',
    };
  }

  // A positive SUM is not enough. A negative weight beside larger positive ones
  // leaves the sum positive and carries the total outside [0,1] — [0 ×2, 1 ×−1]
  // totals −1, [1 ×2, 0 ×−1] totals 2 — where the float-noise clamp below then
  // turned them into a real 0 and a perfect 1. Checked after the sum, so a
  // rubric already refused for its sum keeps the reason it has always had;
  // only criteria that enter the arithmetic are read, as for score and maxScore.
  const negativeWeight = scoreable.find((criterion) => (criterion.weight ?? 1) < 0);
  if (negativeWeight !== undefined) {
    return {
      unscorable: true,
      reason: `Criterion "${negativeWeight.name}" has weight ${String(negativeWeight.weight)}; a weight must be zero or more.`,
    };
  }

  const weighted = scoreable.reduce(
    (sum, criterion) => sum + ratioOf(criterion) * (criterion.weight ?? 1),
    0,
  );
  const rawScore = weighted / totalWeight;
  // Finite weights can still SUM past the largest double, to Infinity, and
  // every criterion then divides into 0 — [1 ×1e308, 0 ×1e308] graded 0 — so an
  // infinite sum leaves the total as undefined as an infinite one does.
  if (!Number.isFinite(totalWeight) || !Number.isFinite(rawScore)) {
    return {
      unscorable: true,
      reason: 'The weighted total is not a finite number, so no grade can be produced.',
    };
  }
  // Clamp the float-noise band only; anything genuinely out of range was
  // already rejected above — each ratio within noise of [0,1], and every
  // weight zero or more, so the weighted mean cannot leave that band.
  const score = Math.min(1, Math.max(0, rawScore));

  // Every threshold is compared the same way: the exact raw `>=` it has always
  // been, or both sides rounded when the caller passed a policy. Only the
  // comparison is rounded, never the score this returns.
  const reaches = (threshold: number): boolean =>
    rounding === undefined ? score >= threshold : gte(score, threshold, rounding);
  const passed =
    options.passThreshold !== undefined
      ? reaches(options.passThreshold)
      : activityData !== undefined
        ? computePassThreshold(activityData, score, rounding)
        : reaches(0.7);

  return {
    score,
    maxScore: 1,
    passed,
    feedback: options.feedback ?? null,
    criteria: [...criteria],
  };
}

/**
 * Lifts a {@link GradeRecord} into the `graded` arm of {@link ItemOutcome}, so
 * a grade that arrived asynchronously renders through the same path as a
 * synchronously scored item. The score/passed/feedback fields are mirrored
 * onto the outcome for uniform reads; `grade` carries the full record.
 *
 * A record whose numbers cannot be a grade is refused, as `evaluate` refuses a
 * non-finite score and {@link gradeFromRubric} one outside [0,1]. `maxScore`
 * must be a positive, finite number and `score` a finite number from 0 to it (a
 * hair above, one part in a billion, is float noise and passes as it is).
 * Anything else — NaN, 85 "out of 1", a score out of 0 — comes back as
 * `{ status: 'deferred', reason: 'grade_rejected', maxScore: 1, rejectedGrade }`
 * with the record kept verbatim. Not `graded`, or its `passed` would be read as
 * a verdict; not `unscorable`, which `composeAssessmentScore` drops from the
 * denominator while letting the attempt go final — so a failing grade on the
 * wrong scale would vanish and the rest would be recorded as a pass. Deferred
 * is what it is: the slot is still owed a real grade, so a composed attempt
 * stays `provisional` and names the slot in `rejectedSlotIds`.
 */
export function outcomeFromGrade(grade: GradeRecord): ItemOutcome {
  // Read once: a getter that answered the check one value and the mirror
  // another would put back exactly what the check refused.
  const { score, maxScore } = grade;
  if (!isGradeInRange(score, maxScore)) {
    return { status: 'deferred', reason: 'grade_rejected', maxScore: 1, rejectedGrade: grade };
  }
  return {
    status: 'graded',
    grade,
    score,
    maxScore,
    passed: grade.passed,
    feedback: grade.feedback,
  };
}

/**
 * True when an outcome carries a real grade — either the SDK scored it
 * synchronously or a grader returned one. Use this instead of testing
 * `status === 'scored'`, which silently misses asynchronously graded work.
 */
export function hasGrade(
  outcome: ItemOutcome,
): outcome is Extract<ItemOutcome, { status: 'scored' | 'graded' }> {
  return outcome.status === 'scored' || outcome.status === 'graded';
}
