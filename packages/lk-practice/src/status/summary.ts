/**
 * `status` and `reconcile` (design §5.7, §8.3): read the state against a
 * graph at an instant. Nothing is stored and no event is emitted; status is
 * the live predicate, and `masteryLapsed` marks a skill whose `mastered` flag
 * is set while the predicate now fails.
 */

import { PracticeConfigError } from '../errors.js';
import type { Engine } from '../log/context.js';
import { indexGraph } from '../log/context.js';
import { compareKeys } from '../log/draft.js';
import { mismatchIssues } from '../log/validate.js';
import { abilityAt, isMastered, skillStatus } from '../mastery/index.js';
import type {
  LearnerSummary,
  PracticeState,
  ReconcileReport,
  SkillGraph,
  SkillStatus,
  SkillSummary,
  StageId,
} from '../types.js';

const STATUSES: readonly SkillStatus[] = [
  'locked',
  'ready',
  'learning',
  'reviewing',
  'mastered',
  'credited',
  'suspended',
];

/**
 * The status of every graph skill at `now`, in graph order. Throws
 * `PracticeConfigError` when the state was built with another configuration
 * or graph version, and `RangeError` when `now` is not an integer.
 */
export function learnerStatus(
  engine: Engine,
  state: PracticeState,
  graph: SkillGraph,
  now: number,
): LearnerSummary {
  if (!Number.isSafeInteger(now)) {
    throw new RangeError('lk-practice: now is integer epoch milliseconds.');
  }
  const mismatch = mismatchIssues(state, graph.version, engine);
  if (mismatch.length > 0) throw new PracticeConfigError(mismatch);
  const index = indexGraph(graph, engine);
  const { memory: memoryModel, mastery: model } = engine;
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
    SkillStatus,
    number
  >;
  let dueNow = 0;
  const skills: SkillSummary[] = [];
  for (const node of graph.skills) {
    const ladder = index.ladder(node.id) ?? [];
    const top = ladder[ladder.length - 1] as StageId;
    const hasHardPrerequisites = index.hardPrerequisites.has(node.id);
    const skill = Object.hasOwn(state.skills, node.id) ? state.skills[node.id] : undefined;
    if (skill === undefined || ladder.length === 0 || !ladder.includes(skill.stage)) {
      const status = skillStatus(skill, { mastered: false, top, hasHardPrerequisites });
      counts[status] += 1;
      skills.push(
        Object.freeze({
          skillId: node.id,
          status,
          stage: skill?.stage ?? null,
          due: null,
          retrievability: null,
          ability: null,
          expectedSuccessAtReference: null,
          masteryLapsed: false,
          lapses: 0,
          unlockedAt: skill?.unlockedAt ?? null,
        }),
      );
      continue;
    }
    const context = index.mastery(node.id);
    const mastered = isMastered(skill, node, now, context);
    const status = skillStatus(skill, { mastered, top, hasHardPrerequisites });
    counts[status] += 1;
    const memory = Object.hasOwn(skill.memories, skill.stage)
      ? skill.memories[skill.stage]
      : undefined;
    const due = memory?.due ?? null;
    if (due !== null && due <= now && skill.suspended === null) dueNow += 1;
    const retrievability =
      memory === undefined || memory.lastReviewAt === null
        ? null
        : memoryModel.retrievability(memoryModel.deserialize(memory.memory), now);
    skills.push(
      Object.freeze({
        skillId: node.id,
        status,
        stage: skill.stage,
        due,
        retrievability,
        ability: Object.freeze(
          model.estimate(abilityAt(skill.ability, node, skill.stage, context)),
        ),
        expectedSuccessAtReference: model.expectedSuccess(
          abilityAt(skill.ability, node, top, context),
          node.referenceDifficulty ?? 0,
        ),
        masteryLapsed: skill.mastered && !mastered,
        lapses: memory?.lapses ?? 0,
        unlockedAt: skill.unlockedAt,
      }),
    );
  }
  return Object.freeze({
    at: now,
    counts: Object.freeze(counts),
    dueNow,
    skills: Object.freeze(skills),
    held: Object.freeze(
      state.held.map((held) =>
        Object.freeze({
          evidenceId: held.evidenceId,
          itemId: held.itemId,
          at: held.at,
          ageMs: Math.max(0, now - held.at),
        }),
      ),
    ),
  });
}

/** How the state's skills compare with `graph` (R2.3). Reports; changes nothing. */
export function reconcileState(
  engine: Engine,
  state: PracticeState,
  graph: SkillGraph,
): ReconcileReport {
  const index = indexGraph(graph, engine);
  const stateIds = Object.keys(state.skills);
  const orphanedSkills = stateIds.filter((id) => !index.nodes.has(id)).sort(compareKeys);
  const newSkills = graph.skills
    .map((node) => node.id)
    .filter((id) => !Object.hasOwn(state.skills, id));
  const missingStages: { skillId: string; stage: StageId }[] = [];
  for (const skillId of [...stateIds].sort(compareKeys)) {
    if (!index.nodes.has(skillId)) continue;
    const ladder = index.ladder(skillId) ?? [];
    const memories = (state.skills[skillId] as PracticeState['skills'][string]).memories;
    for (const stage of Object.keys(memories).sort(compareKeys)) {
      if (!ladder.includes(stage)) missingStages.push(Object.freeze({ skillId, stage }));
    }
  }
  return Object.freeze({
    stateGraphVersion: state.graphVersion,
    graphVersion: graph.version,
    orphanedSkills: Object.freeze(orphanedSkills),
    newSkills: Object.freeze(newSkills),
    missingStages: Object.freeze(missingStages),
  });
}
