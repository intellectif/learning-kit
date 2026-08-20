import { hasGrade } from '../grading.js';
import type { ItemOutcome } from '../types/activity.js';
import { gte, type RoundingPolicy, roundGrade } from './rounding.js';

/**
 * Sectioned assessment scoring — weights, per-section thresholds, and an
 * explicit reason when an attempt fails.
 *
 * This exists because the formula is invariably implemented twice: once on the
 * server that records the grade, and again on the client that shows a learner
 * their grade breakdown. Two implementations of one formula is exactly the
 * duplication an SDK should remove, and they drift — usually in the scale
 * (0–1 vs 0–100) or in whether a section override is honoured.
 */

/** One item's contribution to a section. */
export interface ScoredItem {
  /**
   * Identity of the SLOT, not the activity. The same activity can legitimately
   * appear in two sections; keying on the activity id collapses them into one
   * and silently scores the second occurrence as zero.
   */
  slotId: string;
  /** The activity that filled this slot, for reporting. */
  activityId?: string;
  /** Maximum points this slot is worth. */
  points: number;
  /** What the learner achieved, or why there is no grade yet. */
  outcome: ItemOutcome;
}

/** A weighted section of an assessment. */
export interface AssessmentSectionInput {
  id: string;
  title?: string;
  /** Relative weight. Weights are normalised by their sum, so they need not total 1. */
  weight: number;
  /** Overrides the assessment-wide section threshold for this section only. */
  passThresholdOverride?: number;
  items: ScoredItem[];
}

/** Policy for {@link composeAssessmentScore}. */
export interface CompositionPolicy {
  /** Scaled [0,1] overall score required to pass. */
  passThreshold: number;
  /** Scaled [0,1] score each section must reach, when sections gate the pass. */
  sectionThreshold?: number;
  /**
   * How grades are rounded. Required, with no default: see `RoundingPolicy` —
   * grade rounding and band classification are different operations and the
   * SDK must not choose either for you.
   */
  rounding: RoundingPolicy;
}

/** Per-section result. */
export interface SectionScore {
  id: string;
  title?: string;
  /** The authored weight, verbatim. */
  weight: number;
  /**
   * The weight ACTUALLY used in the total, so a client can rebuild the grade
   * from `sections[]` and agree with the record:
   *
   * ```ts
   * roundGrade(
   *   sections.reduce((sum, s) => sum + s.score * s.normalizedWeight, 0),
   *   policy.rounding,
   * ) === result.score            // exact, by construction
   * ```
   *
   * Apply the same final rounding: the raw weighted sum of already-rounded
   * section scores is not itself a rounded value (0.85 and 1.00 at equal
   * weights sum to 0.925 against a recorded 0.93), so comparing it unrounded
   * is off by up to half a quantum.
   *
   * Sections with nothing graded carry `0` here, because they contribute
   * nothing; the remaining weights are renormalised among themselves.
   */
  normalizedWeight: number;
  earnedPoints: number;
  /** Points that are currently gradable — excludes items still awaiting a grade. */
  gradedMaxPoints: number;
  /** Every point in the section, whether graded yet or not. */
  maxPoints: number;
  /** Scaled [0,1] over the GRADED points, rounded once. */
  score: number;
  passed: boolean;
  /** Threshold this section was judged against, after any override. */
  appliedThreshold: number | null;
  /** Slots still awaiting a grade. */
  pendingSlotIds: string[];
  /** Slots that can never be graded, excluded from the denominator. */
  unscorableSlotIds: string[];
}

/** Why an attempt failed, or `null` when it passed. */
export type PassFailureReason =
  | 'overall_below_threshold'
  | 'section_below_threshold'
  | 'both'
  | null;

/** Result of composing an assessment. */
export interface AssessmentScore {
  sections: SectionScore[];
  /** Weighted total, scaled [0,1], rounded once. */
  score: number;
  /**
   * Whether the attempt passed — `null` while `status` is `provisional`,
   * because an attempt with work still ungraded has not passed OR failed yet.
   * Returning `false` there would let a UI keyed on `passed` show a fail for
   * an essay nobody has marked.
   */
  passed: boolean | null;
  /** `null` while provisional, for the same reason as {@link passed}. */
  passFailureReason: PassFailureReason;
  /**
   * `provisional` while any item is still awaiting a grade — the total is
   * computed over what HAS been graded, so it can still move. Do not record a
   * provisional score as final. Items that can NEVER be graded
   * (`unscorableSlotIds`) do not hold the result provisional.
   */
  status: 'final' | 'provisional';
  pendingSlotIds: string[];
  /** Slots that can never be graded. Excluded from the denominator. */
  unscorableSlotIds: string[];
}

/**
 * What one item contributes. THREE states, not two — collapsing the last two
 * into a single "no points" answer is what made an unscorable item block an
 * attempt from ever becoming final:
 *
 * - `graded` — real points, counted.
 * - `pending` — a grade is coming (deferred). Excluded from the denominator,
 *   and the assessment stays `provisional` until it arrives.
 * - `unscorable` — a grade is never coming (unregistered type, redacted data,
 *   incomplete key). Also excluded from the denominator, but it must NOT keep
 *   the result provisional forever: `evaluate()` returns this precisely so a
 *   mixed-version content bank does not crash an exam, and an attempt that
 *   contains one still has to be recordable.
 */
type ItemContribution =
  | { state: 'graded'; points: number }
  | { state: 'pending' }
  | { state: 'unscorable' };

function earned(item: ScoredItem): ItemContribution {
  const { outcome } = item;
  if (hasGrade(outcome)) {
    const max = outcome.maxScore > 0 ? outcome.maxScore : 1;
    return { state: 'graded', points: (outcome.score / max) * item.points };
  }
  if (outcome.status === 'deferred') {
    return { state: 'pending' };
  }
  return { state: 'unscorable' };
}

/**
 * Composes per-item outcomes into a sectioned assessment score.
 *
 * Weights are normalised by their sum. Each section's score is computed over
 * the points that are actually gradable and rounded ONCE, before any threshold
 * comparison, so the number a learner is shown is the number that decides the
 * outcome. Items still awaiting a grade are excluded from the denominator
 * rather than counted as zero, and the result is reported as `provisional`
 * until every item has a grade.
 */
export function composeAssessmentScore(
  sections: readonly AssessmentSectionInput[],
  policy: CompositionPolicy,
): AssessmentScore {
  const pendingAll: string[] = [];
  const unscorableAll: string[] = [];

  // Pass 1 — score each section over the points that are actually gradable.
  const partials = sections.map((section) => {
    let earnedPoints = 0;
    let gradedMaxPoints = 0;
    let maxPoints = 0;
    const pendingSlotIds: string[] = [];
    const unscorableSlotIds: string[] = [];

    for (const item of section.items) {
      maxPoints += item.points;
      const contribution = earned(item);
      if (contribution.state === 'pending') {
        pendingSlotIds.push(item.slotId);
        pendingAll.push(item.slotId);
        continue;
      }
      if (contribution.state === 'unscorable') {
        unscorableSlotIds.push(item.slotId);
        unscorableAll.push(item.slotId);
        continue;
      }
      earnedPoints += contribution.points;
      gradedMaxPoints += item.points;
    }

    const raw = gradedMaxPoints > 0 ? earnedPoints / gradedMaxPoints : 0;
    const appliedThreshold = section.passThresholdOverride ?? policy.sectionThreshold ?? null;

    return {
      section,
      earnedPoints,
      gradedMaxPoints,
      maxPoints,
      score: roundGrade(raw, policy.rounding),
      appliedThreshold,
      pendingSlotIds,
      unscorableSlotIds,
    };
  });

  // Pass 2 — the LIVE weights. Only sections with something graded contribute,
  // and their weights are renormalised among themselves. A section whose items
  // are all still ungraded must not contribute a zero: that is the "live
  // denominator" bug, where a midterm reads 50% only because the essay has not
  // been marked and a learner sees a fail for work nobody has looked at.
  // These are the weights reported on each section, so that
  // `sum(score * normalizedWeight) === result.score` holds and a client
  // rendering the breakdown cannot disagree with the recorded grade.
  const contributingWeight = partials.reduce(
    (sum, partial) => sum + (partial.gradedMaxPoints > 0 ? partial.section.weight : 0),
    0,
  );

  const scored: SectionScore[] = partials.map((partial) => ({
    id: partial.section.id,
    ...(partial.section.title !== undefined ? { title: partial.section.title } : {}),
    weight: partial.section.weight,
    normalizedWeight:
      partial.gradedMaxPoints > 0 && contributingWeight > 0
        ? partial.section.weight / contributingWeight
        : 0,
    earnedPoints: partial.earnedPoints,
    gradedMaxPoints: partial.gradedMaxPoints,
    maxPoints: partial.maxPoints,
    score: partial.score,
    // A section with nothing graded yet cannot be said to have failed.
    passed:
      partial.appliedThreshold === null || partial.gradedMaxPoints === 0
        ? true
        : gte(partial.score, partial.appliedThreshold, policy.rounding),
    appliedThreshold: partial.appliedThreshold,
    pendingSlotIds: partial.pendingSlotIds,
    unscorableSlotIds: partial.unscorableSlotIds,
  }));

  const weightedRaw = scored.reduce(
    (sum, section) => sum + section.score * section.normalizedWeight,
    0,
  );
  const score = roundGrade(weightedRaw, policy.rounding);

  // Only work that is still COMING keeps the result provisional. Work that can
  // never be graded is excluded from the denominator but must not block the
  // attempt from being recorded.
  const status: 'final' | 'provisional' = pendingAll.length > 0 ? 'provisional' : 'final';

  if (status === 'provisional') {
    // Not passed and not failed: undetermined. Saying `false` here would let a
    // UI keyed on `passed` show a fail for unmarked work.
    return {
      sections: scored,
      score,
      passed: null,
      passFailureReason: null,
      status,
      pendingSlotIds: pendingAll,
      unscorableSlotIds: unscorableAll,
    };
  }

  // Nothing was gradable at all — every item unscorable, or an assessment with
  // no items. There is no evidence either way, so there is no verdict: a hard
  // `false` here records a fail at 0% for a learner whose work was never
  // gradable, which is the same fabricated-failure this module exists to
  // avoid, just reached through the other door.
  if (scored.every((section) => section.gradedMaxPoints === 0)) {
    return {
      sections: scored,
      score,
      passed: null,
      passFailureReason: null,
      status,
      pendingSlotIds: pendingAll,
      unscorableSlotIds: unscorableAll,
    };
  }

  const overallOk = gte(score, policy.passThreshold, policy.rounding);
  const sectionsOk = scored.every((section) => section.passed);
  const passed = overallOk && sectionsOk;

  const passFailureReason: PassFailureReason = passed
    ? null
    : !overallOk && !sectionsOk
      ? 'both'
      : overallOk
        ? 'section_below_threshold'
        : 'overall_below_threshold';

  return {
    sections: scored,
    score,
    passed,
    passFailureReason,
    status,
    pendingSlotIds: pendingAll,
    unscorableSlotIds: unscorableAll,
  };
}
