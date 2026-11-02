/**
 * Which skills an attempt updates (design §8.1, R7.4): the per-skill outcome,
 * not-assessed, or the overall outcome with the item weight and the memory
 * weight floor; and the check that every outcome names a task skill or one of
 * its components.
 */

import type {
  Evidence,
  Issue,
  ItemSkill,
  SkillGraph,
  SkillOutcome,
  TaskSnapshot,
} from '../types.js';

/** How one skill of an attempt is updated, before the source is rated. */
export type SkillSelection =
  | { readonly skillId: string; readonly kind: 'outcome'; readonly outcome: SkillOutcome }
  | { readonly skillId: string; readonly kind: 'not-assessed' }
  | {
      readonly skillId: string;
      readonly kind: 'overall';
      /** The skill's item weight. */
      readonly itemWeight: number;
      /** Whether the item weight reaches `memoryWeightFloor`. */
      readonly memory: boolean;
    };

/**
 * R7.4, for an attempt with a graded or self source. For each task skill in
 * the task's order: its outcome if one came (the first, when the same skill is
 * named twice); else not assessed when the task's `criteria` name the skill
 * (a coalesced target always has criteria for every skill, R6.7); else the
 * overall outcome. Then every outcome for a skill that is not a task skill, in
 * the evidence's order: a component, updated the same way. `useOutcomes` false
 * ignores `skillOutcomes` (they apply to graded sources only).
 *
 * **(revised in M4)** This trusts that every outcome names a task skill or a
 * component of one; `skillOutcomeIssues` is the check, which `record` runs
 * before anything is logged.
 */
export function selectSkills(
  evidence: Evidence,
  task: TaskSnapshot,
  memoryWeightFloor: number,
  useOutcomes: boolean,
): SkillSelection[] {
  const outcomes = new Map<string, SkillOutcome>();
  if (useOutcomes) {
    for (const outcome of evidence.skillOutcomes ?? []) {
      if (!outcomes.has(outcome.skillId)) outcomes.set(outcome.skillId, outcome);
    }
  }
  const criteria = new Set((task.criteria ?? []).map((criterion) => criterion.skillId));
  const selections: SkillSelection[] = task.skills.map((entry: ItemSkill): SkillSelection => {
    const outcome = outcomes.get(entry.skillId);
    if (outcome !== undefined) return { skillId: entry.skillId, kind: 'outcome', outcome };
    if (criteria.has(entry.skillId)) return { skillId: entry.skillId, kind: 'not-assessed' };
    return {
      skillId: entry.skillId,
      kind: 'overall',
      itemWeight: entry.weight,
      memory: entry.weight >= memoryWeightFloor,
    };
  });
  const listed = new Set(task.skills.map((entry) => entry.skillId));
  for (const [skillId, outcome] of outcomes) {
    if (!listed.has(skillId)) selections.push({ skillId, kind: 'outcome', outcome });
  }
  return selections;
}

/**
 * `SKILL_NOT_IN_TASK` for each outcome naming a skill that is neither a task
 * skill nor one it encompasses, transitively, nor a skill the task's criteria
 * name (R7.4). Any issue rejects the whole evidence, with nothing logged.
 */
export function skillOutcomeIssues(
  evidence: Evidence,
  task: TaskSnapshot,
  graph: SkillGraph,
): Issue[] {
  const components = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'encompasses') continue;
    const list = components.get(edge.from);
    if (list === undefined) components.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }
  const allowed = new Set<string>((task.criteria ?? []).map((criterion) => criterion.skillId));
  const stack = task.skills.map((entry) => entry.skillId);
  for (const id of stack) allowed.add(id);
  while (stack.length > 0) {
    for (const next of components.get(stack.pop() as string) ?? []) {
      if (!allowed.has(next)) {
        allowed.add(next);
        stack.push(next);
      }
    }
  }
  const issues: Issue[] = [];
  (evidence.skillOutcomes ?? []).forEach((outcome, i) => {
    if (allowed.has(outcome.skillId)) return;
    issues.push({
      code: 'SKILL_NOT_IN_TASK',
      path: ['skillOutcomes', i, 'skillId'],
      message: `Skill "${outcome.skillId}" is neither a skill of item "${task.itemId}" nor one of their components.`,
    });
  });
  return issues;
}
