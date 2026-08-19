import { computePassThreshold } from './scoring/index.js';
import type { ActivityData, ItemOutcome } from './types/activity.js';
import type { CriterionScore, GradeRecord } from './types/grading.js';

export type {
  CriterionScore,
  Grader,
  GraderKind,
  GraderUsage,
  GradeRecord,
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
  const scoreable = criteria.filter(
    (criterion) => criterion.notApplicable !== true && typeof criterion.score === 'number',
  );

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
      reason: 'Criterion weights sum to zero, so the weighted total is undefined.',
    };
  }

  const weighted = scoreable.reduce(
    (sum, criterion) => sum + (criterion.score as number) * (criterion.weight ?? 1),
    0,
  );
  const score = weighted / totalWeight;

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
