/**
 * `plan` (design §8.6, R6): the ordered targets for the next session, within
 * budget. Pure: it reads the state, the graph and the request, keeps nothing
 * between calls (R1.1, R6.9) and changes nothing.
 */

import { deepFreeze } from '../determinism/index.js';
import { PracticeConfigError } from '../errors.js';
import { equivalentStage } from '../graph/index.js';
import type { Engine } from '../log/context.js';
import { indexGraph } from '../log/context.js';
import { compareKeys } from '../log/draft.js';
import { mismatchIssues } from '../log/validate.js';
import { abilityAt } from '../mastery/index.js';
import type {
  PlanReasonDetail,
  PlanRequest,
  PracticeState,
  PracticeTarget,
  SessionPlan,
  SkillGraph,
  SkillNode,
  StageId,
} from '../types.js';
import { targetId } from './keys.js';
import { createMatcher, usedWithin } from './match.js';
import { orderUnits, type Unit, unitOf } from './order.js';
import { readRequest } from './request.js';
import { buildTiers, type Candidate } from './tiers.js';

/** The `algorithm` of every plan; its version moves with `planner@1` in the keys. */
export const PLANNER_ALGORITHM = Object.freeze({ id: 'planner', version: 1 } as const);

/** The time of a stage without a configured `stageSeconds` entry (design §8.6). */
export const OTHER_STAGE_SECONDS = 120;

/**
 * The session plan for `state` at `request.now`. Throws `PracticeConfigError`
 * when the state was built with another configuration or graph version,
 * `RangeError` or `TypeError` for a malformed request.
 */
export function planSession(
  engine: Engine,
  state: PracticeState,
  graph: SkillGraph,
  request: PlanRequest,
): SessionPlan {
  const { config, mastery: model } = engine;
  const input = readRequest(request, config);
  const mismatch = mismatchIssues(state, graph.version, engine);
  if (mismatch.length > 0) throw new PracticeConfigError(mismatch);
  const index = indexGraph(graph, engine);
  const tiers = buildTiers(engine, state, index, input);
  const matcher = createMatcher(engine, state, index, input);
  const p = config.planner.targetSuccess;
  const logit = Math.log(p / (1 - p));

  const reviews = [...tiers.overdue, ...tiers.due];
  const reviewStage = new Map(reviews.map((candidate) => [candidate.skillId, candidate.stage]));
  const components = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'encompasses') continue;
    const list = components.get(edge.from);
    if (list === undefined) components.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }
  const avoidItemIds = Object.keys(state.items)
    .filter((id) =>
      usedWithin(
        (state.items[id] as { lastUsedAt: number }).lastUsedAt,
        input.now,
        config.itemCooldownMs,
      ),
    )
    .sort(compareKeys);
  const avoided = new Set(avoidItemIds);
  const avoidContentHashes = [
    ...new Set(
      input.pool
        .filter(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            avoided.has(item.id) &&
            typeof item.contentHash === 'string',
        )
        .map((item) => item.contentHash as string),
    ),
  ].sort(compareKeys);

  const used = new Set<string>();

  /** The due components of `skillId` that join a target at `stage`, in tier order (R6.4c). */
  const coalesce = (skillId: string, stage: StageId): string[] => {
    if (!config.planner.coalesce) return [];
    const reach = new Set<string>([skillId]);
    const stack = [...(components.get(skillId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (reach.has(id)) continue;
      reach.add(id);
      stack.push(...(components.get(id) ?? []));
    }
    reach.delete(skillId);
    // Most skills encompass nothing; their targets skip the scan (R12.4; revised in M8).
    if (reach.size === 0) return [];
    return reviews
      .filter((candidate) => {
        const id = candidate.skillId;
        if (!reach.has(id) || used.has(id)) return false;
        const ladder = index.ladder(id) as readonly StageId[];
        return equivalentStage(stage, ladder, index.demand) === reviewStage.get(id);
      })
      .map((candidate) => candidate.skillId)
      .slice(0, input.maxSkillsPerTarget - 1);
  };

  /** The target for `candidate` at `stage`; nothing is marked used yet. */
  const build = (
    candidate: Candidate,
    kind: PracticeTarget['kind'],
    stage: StageId,
    detail: PlanReasonDetail,
  ): { target: PracticeTarget; itemId: string | undefined } => {
    const { skillId } = candidate;
    const node = index.nodes.get(skillId) as SkillNode;
    const skill = Object.hasOwn(state.skills, skillId) ? state.skills[skillId] : undefined;
    const ability = abilityAt(skill?.ability ?? {}, node, stage, index.mastery(skillId));
    // A mastery check aims at the standard R3.5 (c) measures (8.6; revised in M9).
    const masteryCheck =
      (detail.code === 'overdue' || detail.code === 'due') && detail.masteryCheck;
    const targetDifficulty = masteryCheck
      ? (node.referenceDifficulty ?? 0)
      : model.estimate(ability).value - logit;
    const coalesced = kind === 'pretest' ? [] : coalesce(skillId, stage);
    const skillIds = [skillId, ...coalesced];
    const needsSkillOutcomes = coalesced.length > 0;
    const item = matcher.match({ skillIds, stage, targetDifficulty, needsSkillOutcomes });
    const stageSeconds = config.planner.stageSeconds;
    const expectedSeconds =
      item?.expectedSeconds ??
      (Object.hasOwn(stageSeconds, stage) ? (stageSeconds[stage] as number) : OTHER_STAGE_SECONDS);
    const forms =
      node.forms !== undefined && Object.hasOwn(node.forms, stage) ? node.forms[stage] : undefined;
    const target: PracticeTarget = {
      id: targetId(state.learnerId, state.log.hash, kind, skillIds, stage),
      kind,
      skillIds,
      stage,
      targetDifficulty,
      difficultyTolerance: config.planner.difficultyTolerance,
      expectedSeconds,
      constraints: {
        ...(forms === undefined ? {} : { forms: [...forms] }),
        needsSkillOutcomes,
        avoidItemIds,
        avoidContentHashes,
        context: kind === 'pretest' ? 'pretest' : 'practice',
      },
      ...(item === undefined
        ? {}
        : {
            item: {
              itemId: item.id,
              difficulty: item.difficulty ?? 0,
              expectedSuccess: model.expectedSuccess(ability, item.difficulty ?? 0),
            },
          }),
      reason: {
        ...detail,
        expectedSuccess: model.expectedSuccess(ability, targetDifficulty),
        coalesced,
        newSkillsDeferred: tiers.backlogBlocked,
      },
    };
    return { target, itemId: item?.id };
  };

  const units: Unit[] = [];
  let targets = 0;
  let seconds = 0;
  let remediations = 0;
  let news = 0;
  /** Adds the built targets as one unit when they fit the budget. */
  const fits = (built: readonly PracticeTarget[]): boolean =>
    targets + built.length <= input.maxTargets &&
    seconds + built.reduce((sum, target) => sum + target.expectedSeconds, 0) <= input.maxSeconds;
  const add = (
    candidate: Candidate,
    built: readonly { target: PracticeTarget; itemId: string | undefined }[],
  ): void => {
    for (const { target, itemId } of built) {
      targets += 1;
      seconds += target.expectedSeconds;
      if (itemId !== undefined) matcher.take(itemId);
      for (const id of target.skillIds) used.add(id);
    }
    const node = index.nodes.get(candidate.skillId) as SkillNode;
    const main = built[built.length - 1] as { target: PracticeTarget };
    units.push(
      unitOf(
        node,
        index.ladder(candidate.skillId) as readonly StageId[],
        main.target,
        built.length > 1 ? (built[0] as { target: PracticeTarget }).target : undefined,
      ),
    );
  };

  const tryCandidate = (candidate: Candidate): boolean => {
    // A full plan fits no more targets, and building one has no effect, so
    // the rest are not built (R12.4; revised in M8). `deferred` counts them
    // from the tiers either way.
    if (targets >= input.maxTargets) return false;
    const main = build(candidate, candidate.kind, candidate.stage, candidate.detail);
    if (candidate.pretestStage !== undefined) {
      const pretest = build(candidate, 'pretest', candidate.pretestStage, {
        code: 'pretest',
        forSkillId: candidate.skillId,
      });
      if (fits([pretest.target, main.target])) {
        add(candidate, [pretest, main]);
        return true;
      }
    }
    if (!fits([main.target])) return false;
    add(candidate, [main]);
    return true;
  };

  for (const candidate of tiers.overdue) if (!used.has(candidate.skillId)) tryCandidate(candidate);
  for (const candidate of tiers.remediation) {
    if (remediations >= input.maxRemediation) break;
    if (!used.has(candidate.skillId) && tryCandidate(candidate)) remediations += 1;
  }
  for (const candidate of tiers.due) if (!used.has(candidate.skillId)) tryCandidate(candidate);
  // A stage-up or new skill has no current memory, so no earlier target used it.
  for (const candidate of tiers.stageUp) tryCandidate(candidate);
  for (const candidate of tiers.fresh) {
    if (news >= input.maxNewSkills) break;
    if (tryCandidate(candidate)) news += 1;
  }

  return deepFreeze({
    targets: orderUnits(units),
    deferred: {
      reviewsDue: reviews.filter((candidate) => !used.has(candidate.skillId)).length,
      newReady: tiers.newReady - news,
    },
    budgetUsed: { targets, seconds },
    algorithm: { ...PLANNER_ALGORITHM },
  });
}
