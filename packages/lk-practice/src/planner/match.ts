/**
 * Pool item matching (R6.7, design §8.6 step 4). An item matches a target
 * when it is proven with an accepted proof (as `record` requires), valid
 * against the graph (R2.2), at the target's stage, covers every target skill,
 * lies within `difficultyTolerance` of `targetDifficulty`, is not excluded,
 * was not used within `itemCooldownMs` and not already attached in this
 * plan, and, when the target needs per-skill outcomes, binds every target
 * skill in its `criteria`. An item that fails any check is not matched; the
 * plan still succeeds. Among matches: the smallest gap, the fewest uses, the
 * oldest use, then the seeded key.
 */

import { validateItems } from '../graph/index.js';
import type { Engine, GraphIndex } from '../log/context.js';
import { compareKeys } from '../log/draft.js';
import type { PracticeItem, PracticeState, StageId } from '../types.js';
import { tieKey } from './keys.js';
import type { PlanInput } from './request.js';

/** What a target asks of an item. */
export interface MatchQuery {
  readonly skillIds: readonly string[];
  readonly stage: StageId;
  readonly targetDifficulty: number;
  readonly needsSkillOutcomes: boolean;
}

export interface Matcher {
  /** The best match, or undefined. */
  match(query: MatchQuery): PracticeItem | undefined;
  /** Marks an item as attached, so no later target of the plan takes it. */
  take(itemId: string): void;
}

/** Whether `lastUsedAt` falls within the cooldown before `now`. */
export function usedWithin(lastUsedAt: number, now: number, cooldownMs: number): boolean {
  return lastUsedAt > now - cooldownMs;
}

/** A matcher over `input.pool`; the graph check of each item runs at most once per call. */
export function createMatcher(
  engine: Engine,
  state: PracticeState,
  index: GraphIndex,
  input: PlanInput,
): Matcher {
  const { config } = engine;
  const taken = new Set<string>();
  const valid = new Map<PracticeItem, boolean>();
  const isValid = (item: PracticeItem): boolean => {
    let found = valid.get(item);
    if (found === undefined) {
      found = validateItems([item], index.graph, config).ok;
      valid.set(item, found);
    }
    return found;
  };
  const usage = (id: string) => (Object.hasOwn(state.items, id) ? state.items[id] : undefined);

  const candidate = (item: PracticeItem, query: MatchQuery): boolean => {
    if (typeof item !== 'object' || item === null || item.stage !== query.stage) return false;
    if (taken.has(item.id) || input.excludeItems.has(item.id) || !isValid(item)) return false;
    if (item.status !== 'proven') return false;
    if (item.proof !== undefined && !config.acceptProofs.includes(item.proof.kind)) return false;
    if (!query.skillIds.every((id) => item.skills.some((skill) => skill.skillId === id))) {
      return false;
    }
    if (!(gapOf(item, query) <= config.planner.difficultyTolerance)) return false;
    const used = usage(item.id);
    if (used !== undefined && usedWithin(used.lastUsedAt, input.now, config.itemCooldownMs)) {
      return false;
    }
    const criteria = item.criteria ?? [];
    return (
      !query.needsSkillOutcomes ||
      query.skillIds.every((id) => criteria.some((criterion) => criterion.skillId === id))
    );
  };

  return {
    match(query) {
      let best: PracticeItem | undefined;
      let bestKey: readonly [number, number, number, string] | undefined;
      for (const item of input.pool) {
        if (!candidate(item, query)) continue;
        const used = usage(item.id);
        const key = [
          gapOf(item, query),
          used?.uses ?? 0,
          used?.lastUsedAt ?? Number.NEGATIVE_INFINITY,
          tieKey(input.seed, item.id),
        ] as const;
        if (bestKey === undefined || compareMatch(key, bestKey) < 0) {
          best = item;
          bestKey = key;
        }
      }
      return best;
    },
    take(itemId) {
      taken.add(itemId);
    },
  };
}

function gapOf(item: PracticeItem, query: MatchQuery): number {
  return Math.abs((item.difficulty ?? 0) - query.targetDifficulty);
}

function compareMatch(
  a: readonly [number, number, number, string],
  b: readonly [number, number, number, string],
): number {
  return a[0] - b[0] || a[1] - b[1] || compareUse(a[2], b[2]) || compareKeys(a[3], b[3]);
}

/** Oldest use first; never used counts as the oldest. */
function compareUse(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}
