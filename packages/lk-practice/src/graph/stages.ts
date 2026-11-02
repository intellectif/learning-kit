/**
 * Ladders, stage demand and stage equivalence (R3.1, R3.8, D28).
 */

import type { Issue, ResolvedPracticeConfig, SkillNode, StageId } from '../types.js';

/** The default demand of each default stage (R3.8). */
export const DEFAULT_STAGE_DEMAND: Readonly<Record<StageId, number>> = {
  recognise: 1,
  recall: 2,
  produce: 3,
  apply: 4,
  example: 1,
  complete: 2,
  write: 3,
  transfer: 4,
};

/** A ladder and where it was declared, for issue paths. */
export interface LadderSource {
  readonly ladder: readonly StageId[];
  readonly path: readonly (string | number)[];
}

export interface StageDemandResolution {
  /** The demand of every stage in the given ladders: declared, else the fallback. */
  readonly demand: ReadonlyMap<StageId, number>;
  /** `STAGE_DEMAND_ORDER` and `STAGE_DEMAND_AMBIGUOUS`. */
  readonly issues: readonly Issue[];
  /** `STAGE_DEMAND_DEFAULTED`, once per undeclared stage. */
  readonly warnings: readonly Issue[];
}

/** The ladder a skill uses: its own `stages`, else the configured ladder of its knowledge type. */
export function ladderOf(
  skill: Pick<SkillNode, 'knowledge' | 'stages'>,
  config: ResolvedPracticeConfig,
): readonly StageId[] | null {
  if (skill.stages !== undefined) return skill.stages;
  if (skill.knowledge === 'mixed') return null;
  return config.ladders[skill.knowledge];
}

/** The fallback demand of index `i` in a ladder of `n` stages: `1 + 3 * i / (n - 1)`, 4 when `n` is 1. */
export function fallbackDemand(index: number, length: number): number {
  return length === 1 ? 4 : 1 + (3 * index) / (length - 1);
}

/**
 * Resolves the demand of every stage in `ladders` and checks R3.8: demand
 * strictly increases along every ladder, and an undeclared stage has the same
 * fallback in every ladder it appears in. A ladder holding an ambiguous
 * stage is not order-checked.
 */
export function resolveStageDemand(
  ladders: readonly LadderSource[],
  declared: Readonly<Record<StageId, number>>,
): StageDemandResolution {
  const demand = new Map<StageId, number>();
  const firstSeen = new Map<StageId, readonly (string | number)[]>();
  const ambiguous = new Set<StageId>();
  const issues: Issue[] = [];
  const warnings: Issue[] = [];

  for (const { ladder, path } of ladders) {
    ladder.forEach((stage, index) => {
      if (Object.hasOwn(declared, stage)) {
        demand.set(stage, declared[stage] as number);
        return;
      }
      const fallback = fallbackDemand(index, ladder.length);
      const known = demand.get(stage);
      if (known === undefined) {
        demand.set(stage, fallback);
        firstSeen.set(stage, [...path, index]);
        warnings.push({
          code: 'STAGE_DEMAND_DEFAULTED',
          path: [...path, index],
          message: `Stage "${stage}" has no declared demand and uses its ladder position (${fallback}).`,
        });
      } else if (known !== fallback && !ambiguous.has(stage)) {
        ambiguous.add(stage);
        issues.push({
          code: 'STAGE_DEMAND_AMBIGUOUS',
          path: [...path, index],
          message: `Stage "${stage}" has no declared demand and its fallback differs between ladders (${known} at ${(firstSeen.get(stage) ?? []).join('.')}, ${fallback} here); declare it in stageDemand.`,
        });
      }
    });
  }

  // A ladder with an ambiguous stage has no single order to check; the
  // ambiguity is the issue to fix first.
  for (const { ladder, path } of ladders) {
    if (ladder.some((stage) => ambiguous.has(stage))) continue;
    for (let i = 1; i < ladder.length; i += 1) {
      const before = demand.get(ladder[i - 1] as StageId) as number;
      const here = demand.get(ladder[i] as StageId) as number;
      if (!(here > before)) {
        issues.push({
          code: 'STAGE_DEMAND_ORDER',
          path: [...path, i],
          message: `Demand must strictly increase along a ladder: "${ladder[i - 1]}" has ${before}, "${ladder[i]}" has ${here}.`,
        });
        break;
      }
    }
  }

  return { demand, issues, warnings };
}

/**
 * The equivalent stage of `stage` in `ladder` (R3.8): `stage` itself when the
 * ladder has it, else the ladder's stage with the greatest demand at or below
 * the demand of `stage`, else null (every stage of the ladder is more demanding,
 * or `stage` has no known demand).
 */
export function equivalentStage(
  stage: StageId,
  ladder: readonly StageId[],
  demand: ReadonlyMap<StageId, number>,
): StageId | null {
  if (ladder.includes(stage)) return stage;
  const target = demand.get(stage);
  if (target === undefined) return null;
  let best: StageId | null = null;
  let bestDemand = Number.NEGATIVE_INFINITY;
  for (const candidate of ladder) {
    const value = demand.get(candidate);
    if (value !== undefined && value <= target && value > bestDemand) {
      best = candidate;
      bestDemand = value;
    }
  }
  return best;
}
