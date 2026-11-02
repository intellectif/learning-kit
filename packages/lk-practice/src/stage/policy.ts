/**
 * The default stage policy (design §8.2, R3.2): promotion after `promoteAfter`
 * spaced successes, demotion after `demoteAfter` consecutive lapses, and the
 * due cap that keeps a long model interval from postponing a promotion.
 *
 * A success counts toward the streak when it is the streak's first or comes at
 * least `promoteGapMs` after the previous counted success; a success inside the
 * gap leaves the streak as it was. A lapse ends the run of successes. While
 * the streak has between 1 and `promoteAfter - 1` counted successes, the stage
 * memory's due time is capped at the last counted success plus the gap.
 */

import type {
  Rating,
  StageDecision,
  StageDecisionInput,
  StagePolicy,
  StagePolicyOptions,
  StageStreak,
} from '../types.js';
import { implication } from './implication.js';

const RATINGS = new Set<Rating>(['again', 'hard', 'good', 'easy']);

/** The empty streak a stage starts with, and returns to on a move. */
export const EMPTY_STREAK: StageStreak = Object.freeze({
  successes: 0,
  firstSuccessAt: null,
  lastSuccessAt: null,
  lapses: 0,
});

/**
 * The built-in policy with resolved options (`ResolvedPracticeConfig.stagePolicyOptions`,
 * already validated by `resolveConfig`). Its id, version and params equal the
 * configuration's default stage policy reference.
 */
export function createStagePolicy(options: Required<StagePolicyOptions>): StagePolicy {
  const { promoteAfter, promoteGapMs, demoteAfter } = options;
  return Object.freeze({
    id: 'stage-default',
    version: 1,
    params: Object.freeze({ promoteAfter, promoteGapMs, demoteAfter }),
    decide(input: StageDecisionInput): StageDecision {
      const { ladder, rating, at } = input;
      const current = ladder.indexOf(input.current);
      const evidence = ladder.indexOf(input.evidenceStage);
      if (current < 0 || evidence < 0) {
        throw new RangeError('lk-practice: the current and evidence stages must be on the ladder.');
      }
      if (!RATINGS.has(rating))
        throw new RangeError(`lk-practice: unknown rating ${String(rating)}.`);
      if (!Number.isSafeInteger(at))
        throw new RangeError('lk-practice: at must be integer epoch ms.');
      const effect = implication(rating, current, evidence);
      let streak = input.streak;
      if (effect === 'success') {
        const counts =
          streak.successes === 0 || at - (streak.lastSuccessAt as number) >= promoteGapMs;
        if (counts) {
          streak = {
            successes: streak.successes + 1,
            firstSuccessAt: streak.successes === 0 ? at : streak.firstSuccessAt,
            lastSuccessAt: at,
            lapses: 0,
          };
        } else if (streak.lapses !== 0) {
          streak = { ...streak, lapses: 0 };
        }
      } else if (effect === 'lapse') {
        streak = {
          successes: 0,
          firstSuccessAt: null,
          lastSuccessAt: null,
          lapses: streak.lapses + 1,
        };
      }
      let move: StageDecision['move'] = 'stay';
      if (effect === 'success' && streak.successes >= promoteAfter && current < ladder.length - 1) {
        move = 'promote';
      } else if (effect === 'lapse' && streak.lapses >= demoteAfter && current > 0) {
        move = 'demote';
      }
      if (move !== 'stay') streak = EMPTY_STREAK;
      const dueCap =
        streak.successes > 0 && streak.successes < promoteAfter
          ? (streak.lastSuccessAt as number) + promoteGapMs
          : null;
      return Object.freeze({ effect, move, streak: Object.freeze({ ...streak }), dueCap });
    },
  });
}
