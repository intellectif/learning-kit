/**
 * Target order (design §8.6 step 6, R6.4 a and b). The planner keeps tier
 * order, then: (a) the targets of one `interleaveGroup` past their first
 * stage go next to each other, so the learner must tell them apart; (c) new
 * declarative skills' first targets form one block, at the first one's
 * place; (b) a new target next to a new target of the same group moves the
 * next unrelated target between them, from inside the block when it is in
 * one and from outside it otherwise, so the block stays whole.
 * A unit is a target with the pretest that precedes it, which never splits.
 */

import type { PracticeTarget, SkillNode, StageId } from '../types.js';

export interface Unit {
  /** The pretest first, if any, then the target. */
  readonly targets: readonly PracticeTarget[];
  readonly kind: PracticeTarget['kind'];
  readonly group: string | undefined;
  /** Not `new`, and the stage is not the first of the ladder. */
  readonly pastFirstStage: boolean;
  /** A `new` target of a declarative skill. */
  readonly declarativeNew: boolean;
}

/** The unit of `target` (and its pretest) for `node`. */
export function unitOf(
  node: SkillNode,
  ladder: readonly StageId[],
  target: PracticeTarget,
  pretest: PracticeTarget | undefined,
): Unit {
  return {
    targets: pretest === undefined ? [target] : [pretest, target],
    kind: target.kind,
    group: node.interleaveGroup,
    pastFirstStage: target.kind !== 'new' && ladder.indexOf(target.stage) > 0,
    declarativeNew: target.kind === 'new' && node.knowledge === 'declarative',
  };
}

/** Pulls every later unit that `belongs` with the first one to right after it. */
function gather(units: readonly Unit[], key: (unit: Unit) => string | undefined): Unit[] {
  const placed = new Set<Unit>();
  const out: Unit[] = [];
  units.forEach((unit, at) => {
    if (placed.has(unit)) return;
    placed.add(unit);
    out.push(unit);
    const own = key(unit);
    if (own === undefined) return;
    for (const later of units.slice(at + 1)) {
      if (!placed.has(later) && key(later) === own) {
        placed.add(later);
        out.push(later);
      }
    }
  });
  return out;
}

function sameNewGroup(a: Unit, b: Unit): boolean {
  return a.kind === 'new' && b.kind === 'new' && a.group !== undefined && a.group === b.group;
}

/** The final order of the selected units, flattened to targets. */
export function orderUnits(units: readonly Unit[]): PracticeTarget[] {
  const interleaved = gather(units, (unit) => (unit.pastFirstStage ? unit.group : undefined));
  const blocked = gather(interleaved, (unit) => (unit.declarativeNew ? 'declarative' : undefined));
  const out = [...blocked];
  for (let i = 1; i < out.length; i += 1) {
    const before = out[i - 1] as Unit;
    const here = out[i] as Unit;
    if (!sameNewGroup(before, here)) continue;
    const j = out.findIndex(
      (unit, at) =>
        at > i && !sameNewGroup(before, unit) && unit.declarativeNew === here.declarativeNew,
    );
    if (j < 0) continue;
    const [moved] = out.splice(j, 1);
    out.splice(i, 0, moved as Unit);
  }
  return out.flatMap((unit) => unit.targets);
}
