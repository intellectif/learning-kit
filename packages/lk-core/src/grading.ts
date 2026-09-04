import { computePassThreshold } from './scoring/index.js';
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
 * Weights are normalised by their sum, so they need not add to 1. Criteria
 * marked `notApplicable`, and those carrying no numeric `score` (a purely
 * banded judgement), are excluded from both numerator and denominator. When
 * nothing scoreable remains the result is `unscorable`, never a zero.
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

  const weighted = scoreable.reduce(
    (sum, criterion) => sum + ratioOf(criterion) * (criterion.weight ?? 1),
    0,
  );
  const rawScore = weighted / totalWeight;
  if (!Number.isFinite(rawScore)) {
    return {
      unscorable: true,
      reason: 'The weighted total is not a finite number, so no grade can be produced.',
    };
  }
  // Clamp the float-noise band only; anything genuinely out of range was
  // already rejected above.
  const score = Math.min(1, Math.max(0, rawScore));

  const passed =
    options.passThreshold !== undefined
      ? score >= options.passThreshold
      : activityData !== undefined
        ? computePassThreshold(activityData, score)
        : score >= 0.7;

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
 */
export function outcomeFromGrade(grade: GradeRecord): ItemOutcome {
  return {
    status: 'graded',
    grade,
    score: grade.score,
    maxScore: grade.maxScore,
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
