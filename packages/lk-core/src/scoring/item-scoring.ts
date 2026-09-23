import type {
  ItemScoringCount,
  ItemScoringPolicy,
  ItemScoringPolicyIssue,
  ItemTriesScore,
  ItemTry,
  ItemTryScore,
  ResolvedItemScoringPolicy,
} from '../types/item-scoring.js';
import { isGradeInRange } from './grade-numbers.js';

/**
 * The policy that changes nothing: one try, nothing costs anything, the first
 * try counts. What an absent policy resolves to, and exactly how questions were
 * scored before policies existed.
 */
export const DEFAULT_ITEM_SCORING_POLICY: ResolvedItemScoringPolicy = Object.freeze({
  hintPenalty: 0,
  retries: 0,
  retryPenalty: 0,
  counts: 'first',
}) as ResolvedItemScoringPolicy;

/** The most tries after the first a policy can give. */
export const ITEM_SCORING_MAX_RETRIES = 10;

const SETTINGS = ['hintPenalty', 'retries', 'retryPenalty', 'counts'] as const;
const COUNTS: readonly ItemScoringCount[] = ['first', 'best', 'last'];

const isUnset = (value: unknown): boolean => value === undefined || value === null;

/** A cost: a finite number from 0 to 1. */
const isFraction = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/**
 * Checks a policy before it is stored or used: every setting absent, `null`,
 * or a value it can take — costs from 0 to 1, `retries` a whole number from 0
 * to {@link ITEM_SCORING_MAX_RETRIES}, `counts` one of `first`, `best` or
 * `last` — and no setting it does not know.
 *
 * It also refuses a `retryPenalty` above 0 while the first try counts: that
 * cost can never be charged, and a school that set it believes retries cost
 * something. Choose `counts: 'best'` or `'last'`.
 */
export function validateItemScoringPolicy(
  policy: unknown,
):
  | { success: true; data: ItemScoringPolicy }
  | { success: false; issues: ItemScoringPolicyIssue[] } {
  if (isUnset(policy)) {
    return { success: true, data: {} };
  }
  if (typeof policy !== 'object' || Array.isArray(policy)) {
    return {
      success: false,
      issues: [{ path: '', message: 'An item scoring policy is an object of settings.' }],
    };
  }
  const given = policy as Record<string, unknown>;
  const issues: ItemScoringPolicyIssue[] = [];
  for (const key of Object.keys(given)) {
    if (!(SETTINGS as readonly string[]).includes(key)) {
      issues.push({
        path: key,
        message: `"${key}" is not an item scoring setting. The settings are hintPenalty, retries, retryPenalty and counts.`,
      });
    }
  }
  for (const key of ['hintPenalty', 'retryPenalty'] as const) {
    const value = given[key];
    if (!isUnset(value) && !isFraction(value)) {
      issues.push({
        path: key,
        message: `"${key}" must be a number from 0 to 1: the fraction of a question's marks it costs.`,
      });
    }
  }
  const retries = given.retries;
  if (
    !isUnset(retries) &&
    !(
      typeof retries === 'number' &&
      Number.isInteger(retries) &&
      retries >= 0 &&
      retries <= ITEM_SCORING_MAX_RETRIES
    )
  ) {
    issues.push({
      path: 'retries',
      message: `"retries" must be a whole number from 0 to ${ITEM_SCORING_MAX_RETRIES}.`,
    });
  }
  const counts = given.counts;
  if (!isUnset(counts) && !(COUNTS as readonly unknown[]).includes(counts)) {
    issues.push({ path: 'counts', message: '"counts" must be "first", "best" or "last".' });
  }
  if (
    isFraction(given.retryPenalty) &&
    given.retryPenalty > 0 &&
    (isUnset(counts) || counts === 'first')
  ) {
    issues.push({
      path: 'retryPenalty',
      message:
        '"retryPenalty" is never charged while the first try counts. Set "counts" to "best" or "last", or leave "retryPenalty" out.',
    });
  }
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: given as ItemScoringPolicy };
}

/**
 * A policy with every setting spelled out.
 *
 * **It throws rather than guess.** A delivery policy reads a setting it cannot
 * read as a restriction, because that is the safe way round; a setting here
 * moves a grade, and there is no safe way round — a cost misread as 0 raises
 * grades, misread as 1 lowers them. So a policy {@link validateItemScoringPolicy}
 * refuses is refused here too, with a `RangeError` naming what is wrong, as an
 * unreadable `rounding` is.
 */
export function resolveItemScoringPolicy(policy: unknown): ResolvedItemScoringPolicy {
  if (isUnset(policy)) {
    return DEFAULT_ITEM_SCORING_POLICY;
  }
  const checked = validateItemScoringPolicy(policy);
  if (!checked.success) {
    throw new RangeError(
      `learning-kit: this item scoring policy cannot be applied — ${checked.issues
        .map((issue) => `${issue.path || 'policy'}: ${issue.message}`)
        .join(' ')}`,
    );
  }
  const given = checked.data;
  return {
    hintPenalty: given.hintPenalty ?? 0,
    retries: given.retries ?? 0,
    retryPenalty: given.retryPenalty ?? 0,
    counts: given.counts ?? 'first',
  };
}

/** A hint count as the policy reads it: anything but a whole number of 0 or more is none. */
export function hintsRevealedOf(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/**
 * Removes the floating-point residue a cost leaves: `0.7 - 0.2` is
 * `0.49999999999999994`, which would fail a 0.5 pass line the learner met.
 * Twelve decimal places is far below anything a grade is shown or rounded to,
 * and far above the residue.
 */
function snap(value: number): number {
  return Math.round(value * 1e12) / 1e12;
}

/**
 * A question's score under a policy, from its tries in the order they were
 * made.
 *
 * - **What a try costs** is a fraction of the question's marks, subtracted
 *   from what its answer scored: `hintPenalty` for every hint shown before it
 *   (its `hintsRevealed`, which counts from the start of the question), and
 *   `retryPenalty` for every try before it. A try never scores below 0.
 * - **Which try counts** is the policy's `counts`: the first, the best after
 *   costs (the earliest, where two are equal), or the last.
 * - **Only the tries the policy allows are read**: the first `1 + retries`. A
 *   record with more cannot have come from a learner under this policy.
 *
 * Nothing that cost nothing is changed: with no cost to charge, a try's score
 * is exactly what its answer scored.
 *
 * @throws RangeError for a policy {@link resolveItemScoringPolicy} refuses, for
 *         an empty list of tries, and for a try whose `score` and `maxScore`
 *         cannot be a grade — the rule `outcomeFromGrade` applies: `maxScore`
 *         positive and finite, `score` finite from 0 to it.
 */
export function scoreTries(
  tries: readonly ItemTry[],
  policy?: ItemScoringPolicy | ResolvedItemScoringPolicy | null,
): ItemTriesScore {
  const rules = resolveItemScoringPolicy(policy);
  if (tries.length === 0) {
    throw new RangeError('scoreTries: there is no try to score.');
  }
  const allowed = tries.slice(0, 1 + rules.retries);
  const scored: ItemTryScore[] = allowed.map((one, index) => {
    const { score, maxScore } = one;
    if (
      typeof score !== 'number' ||
      typeof maxScore !== 'number' ||
      !isGradeInRange(score, maxScore)
    ) {
      throw new RangeError(
        `scoreTries: try ${index + 1} has no score to cost — score ${String(score)} of ${String(maxScore)}.`,
      );
    }
    const hintsRevealed = hintsRevealedOf(one.hintsRevealed);
    const penalty = snap(rules.hintPenalty * hintsRevealed + rules.retryPenalty * index);
    // Costed as a fraction of the marks, where the residue is removed, and
    // scaled back: every built-in scorer's `maxScore` is 1, so for them the
    // scaling is exact.
    const costed = penalty > 0 ? Math.max(0, snap(score / maxScore - penalty)) * maxScore : score;
    return { score, scored: costed, maxScore, hintsRevealed, penalty };
  });
  const ratio = (one: ItemTryScore): number => one.scored / one.maxScore;
  let counted = 0;
  if (rules.counts === 'last') {
    counted = scored.length - 1;
  } else if (rules.counts === 'best') {
    scored.forEach((one, index) => {
      if (ratio(one) > ratio(scored[counted] as ItemTryScore)) {
        counted = index;
      }
    });
  }
  const chosen = scored[counted] as ItemTryScore;
  return { score: chosen.scored, maxScore: chosen.maxScore, counted, tries: scored };
}
