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

  const scoreable = criteria.filter(
    (criterion) => criterion.notApplicable !== true && typeof criterion.score === 'number',
  );

  // `score` is documented as scaled [0,1]. A grader that returns raw points
  // (4 out of 5) would otherwise yield `{ score: 4, maxScore: 1 }` and pass
  // every threshold. Reject rather than clamp: silently rescaling someone's
  // grader is worse than telling them it is out of contract. A hair outside
  // the range is float noise and is clamped.
  const EPSILON = 1e-9;
  const outOfRange = scoreable.find(
    (criterion) =>
      (criterion.score as number) < -EPSILON || (criterion.score as number) > 1 + EPSILON,
  );
  if (outOfRange !== undefined) {
    return {
      unscorable: true,
      reason: `Criterion "${outOfRange.name}" has score ${outOfRange.score}, outside the scaled [0,1] range. Normalise grader output before building a GradeRecord.`,
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
    (sum, criterion) => sum + (criterion.score as number) * (criterion.weight ?? 1),
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
