/**
 * The implication rule (design §8.2, D15, R3.2): how a retrieval at the
 * evidence stage `e` counts at the skill's current stage `c`. Both are indices
 * on the skill's ladder; for a task from another ladder, `e` is the index of
 * the task stage's equivalent (R3.8), so the rule is the same across ladders.
 *
 * | Rating       | e > c                     | e = c       | e < c                   |
 * | ------------ | ------------------------- | ----------- | ----------------------- |
 * | good or easy | success                   | success     | neutral (no review)     |
 * | hard         | review                    | review      | neutral (no review)     |
 * | again        | neutral (no review)       | lapse       | lapse                   |
 *
 * `review` is a hard rating that reaches the current stage: the memory is
 * reviewed with `hard` and the streak is unchanged. **(revised in M4)** The
 * effect is its own value, because a hard retrieval neither counts as a
 * success nor stops at "neutral" (design §8.1).
 */

import type { Rating, StageDecision } from '../types.js';

export type ImplicationEffect = StageDecision['effect'];

/** The effect of a retrieval rated `rating` at ladder index `evidence` for a skill at index `current`. */
export function implication(rating: Rating, current: number, evidence: number): ImplicationEffect {
  if (rating === 'again') return evidence > current ? 'neutral' : 'lapse';
  if (evidence < current) return 'neutral';
  return rating === 'hard' ? 'review' : 'success';
}
