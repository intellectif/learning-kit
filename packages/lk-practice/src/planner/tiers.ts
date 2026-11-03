/**
 * The planner's candidates (design §8.6 steps 1 and 2, R6.2, R6.5, R6.11):
 * one list per tier, each in its own order, with the reason each candidate
 * would carry. Retrievability is computed only where a tier needs it: for
 * overdue and due memories, for hard prerequisites of a recent lapse, and in
 * the mastery predicate of a soft prerequisite at the top of its ladder.
 */

import type { Engine, GraphIndex } from '../log/context.js';
import { compareKeys } from '../log/draft.js';
import {
  desiredRetentionFor,
  expectedSuccessAtReference,
  isMastered,
  meetsStandard,
} from '../mastery/index.js';
import type {
  HypothesisState,
  PlanReasonDetail,
  PracticeState,
  PracticeTarget,
  SkillNode,
  SkillState,
  StageId,
  StageMemory,
} from '../types.js';
import { tieKey } from './keys.js';
import type { PlanInput } from './request.js';

/** A target the planner may add, before budget and matching. */
export interface Candidate {
  readonly kind: PracticeTarget['kind'];
  readonly skillId: string;
  readonly stage: StageId;
  readonly detail: PlanReasonDetail;
  /** For a `new` candidate with pretesting on: the stage of its pretest, if any. */
  readonly pretestStage?: StageId;
}

export interface Tiers {
  /**
   * Hypotheses to probe (R14.6, R14.9; revised in M12): open ones by the time
   * they were opened, then confirmed ones due a re-probe by their verdict's.
   */
  readonly probes: readonly HypothesisState[];
  /** Confirmed prerequisites to practise before their re-probe (R14.9; revised in M12). */
  readonly discovered: readonly Candidate[];
  /**
   * Blocked skills that wait for a confirmed prerequisite to be ready, planned
   * in no tier but still counted as deferred (R14.9; revised in M12).
   */
  readonly waiting: ReadonlySet<string>;
  readonly overdue: readonly Candidate[];
  readonly remediation: readonly Candidate[];
  readonly due: readonly Candidate[];
  readonly stageUp: readonly Candidate[];
  /** Empty when the review backlog blocks new skills. */
  readonly fresh: readonly Candidate[];
  /** Overdue plus due exceeds `maxReviewBacklog` (R6.8). */
  readonly backlogBlocked: boolean;
  /** Every ready new skill, planned or not, for `deferred.newReady`. */
  readonly newReady: number;
}

interface Scored {
  readonly candidate: Candidate;
  readonly key: number;
  readonly tie: string;
}

function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function sorted(list: Scored[]): Candidate[] {
  return list
    .sort((a, b) => a.key - b.key || compareKeys(a.tie, b.tie))
    .map((entry) => entry.candidate);
}

/** Builds every tier for `state` at `input.now`. */
export function buildTiers(
  engine: Engine,
  state: PracticeState,
  index: GraphIndex,
  input: PlanInput,
): Tiers {
  const { config, memory: memoryModel } = engine;
  const { now, dueBy, seed } = input;
  const tie = (id: string): string => tieKey(seed, id);
  const skillOf = (id: string): SkillState | undefined => own(state.skills, id);
  const retrievability = (memory: StageMemory): number =>
    memoryModel.retrievability(memoryModel.deserialize(memory.memory), now);

  /** A skill the planner may target: in the graph with a ladder, not excluded, not suspended. */
  const active = (id: string): boolean => {
    if (input.excludeSkills.has(id)) return false;
    const ladder = index.ladder(id);
    if (ladder === null || ladder.length === 0) return false;
    const skill = skillOf(id);
    return skill === undefined || (skill.suspended === null && ladder.includes(skill.stage));
  };
  /**
   * A review is a mastery check (8.6; revised in M9) when the skill is at its
   * top stage and its last review there was not a failure, its ability does
   * not meet the standard (R3.5 (c); with the margin, revised in M11), its
   * expected success at the reference is below `targetSuccess` (so the
   * reference is above the usual target), and its retrievability `r` is at
   * least the mastery floor (R3.5 (d)). **(revised in M11)** "Not a failure"
   * covers a failed check as well as a lapse (both set `lastLapseAt` to the
   * review's time), so after one the next review is at the learner's level:
   * a learner below the standard alternates, and does not spend most of the
   * practice on tasks pitched below even odds.
   */
  const masteryCheck = (
    skill: SkillState,
    node: SkillNode,
    ladder: readonly StageId[],
    memory: StageMemory,
    r: number,
  ): boolean =>
    skill.stage === ladder[ladder.length - 1] &&
    skill.lastLapseAt !== memory.lastReviewAt &&
    r >= desiredRetentionFor(node, skill.stage, config) - config.mastery.retentionMargin &&
    !meetsStandard(skill.ability, node, index.mastery(node.id)) &&
    expectedSuccessAtReference(skill.ability, node, index.mastery(node.id)) <
      config.planner.targetSuccess;
  /** The current-stage memory of a started, active skill, once retrieved. */
  const currentMemory = (skill: SkillState): StageMemory | undefined => {
    const memory = own(skill.memories, skill.stage);
    return memory !== undefined && memory.due !== null && memory.lastReviewAt !== null
      ? memory
      : undefined;
  };

  const overdue: Scored[] = [];
  const due: Scored[] = [];
  const stageUp: Scored[] = [];
  const ready: string[] = [];
  for (const node of index.graph.skills) {
    const id = node.id;
    if (!active(id)) continue;
    const skill = skillOf(id);
    const ladder = index.ladder(id) as readonly StageId[];
    if (skill === undefined || skill.startedAt === null) {
      // Ready: not credited, and unlocked or without hard prerequisites (R6.3).
      // Not `skillStatus`, which reports an unlocked, unstarted skill with a
      // one-stage ladder as `reviewing`.
      const unlocked =
        (skill !== undefined && skill.unlockedAt !== null) || !index.hardPrerequisites.has(id);
      if (skill?.credited !== true && unlocked) ready.push(id);
      continue;
    }
    const memory = currentMemory(skill);
    if (memory === undefined) {
      const at = ladder.indexOf(skill.stage);
      stageUp.push({
        candidate: {
          kind: 'stage-up',
          skillId: id,
          stage: skill.stage,
          detail: { code: 'stage-up', fromStage: at > 0 ? (ladder[at - 1] as StageId) : null },
        },
        key: 0,
        tie: tie(id),
      });
      continue;
    }
    const dueAt = memory.due as number;
    if (dueAt > dueBy) continue;
    const r = retrievability(memory);
    const code = dueAt <= now ? 'overdue' : 'due';
    (code === 'overdue' ? overdue : due).push({
      candidate: {
        kind: 'review',
        skillId: id,
        stage: skill.stage,
        detail: {
          code,
          due: dueAt,
          retrievability: r,
          masteryCheck: masteryCheck(skill, node, ladder, memory, r),
        },
      },
      key: code === 'overdue' ? r : dueAt,
      tie: tie(id),
    });
  }

  // Remediation (R6.5): the most recent lapse names each prerequisite.
  const lapsed = index.graph.skills
    .map((node) => node.id)
    .filter((id) => {
      const skill = skillOf(id);
      return (
        skill !== undefined &&
        skill.lastLapseAt !== null &&
        skill.lastLapseAt >= now - config.planner.remediationWindowMs
      );
    })
    .map((id) => ({ id, at: (skillOf(id) as SkillState).lastLapseAt as number, tie: tie(id) }))
    .sort((a, b) => b.at - a.at || compareKeys(a.tie, b.tie));
  const remediation = new Map<string, Scored>();
  for (const lapse of lapsed) {
    for (const prerequisite of index.hardPrerequisites.get(lapse.id) ?? []) {
      if (remediation.has(prerequisite) || !active(prerequisite)) continue;
      const skill = skillOf(prerequisite);
      const memory = skill === undefined ? undefined : currentMemory(skill);
      if (memory === undefined) continue;
      const node = index.nodes.get(prerequisite) as SkillNode;
      const stage = (skill as SkillState).stage;
      const floor = desiredRetentionFor(node, stage, config) - config.mastery.retentionMargin;
      const r = retrievability(memory);
      if (!(r < floor)) continue;
      remediation.set(prerequisite, {
        candidate: {
          kind: 'remediation',
          skillId: prerequisite,
          stage,
          detail: {
            code: 'remediation',
            lapsedSkillId: lapse.id,
            lapseAt: lapse.at,
            retrievability: r,
          },
        },
        key: r,
        tie: tie(prerequisite),
      });
    }
  }

  const backlogBlocked = overdue.length + due.length > input.maxReviewBacklog;
  const { probes, discovered, waiting } = discoveryTiers(state, index, active);
  return {
    probes,
    discovered,
    waiting,
    overdue: sorted(overdue),
    remediation: sorted([...remediation.values()]),
    due: sorted(due),
    stageUp: sorted(stageUp),
    fresh: backlogBlocked ? [] : newCandidates(engine, state, index, input, ready),
    backlogBlocked,
    newReady: ready.length,
  };
}

/**
 * The discovery tiers (R14.6, R14.9; revised in M12). Every hypothesis not
 * closed: open ones are probed, by the time they were opened, then id. A
 * confirmed one whose prerequisite is not ready, whose soft edge is in the
 * graph (admitted) and whose prerequisite is active is, by the time of its
 * verdict, then id: re-probed once practised since its last probe, practised
 * otherwise, at the prerequisite's current stage (its first before it has
 * started); its blocked skill waits meanwhile, since the probes already
 * explain its failures.
 */
function discoveryTiers(
  state: PracticeState,
  index: GraphIndex,
  active: (id: string) => boolean,
): { probes: HypothesisState[]; discovered: Candidate[]; waiting: ReadonlySet<string> } {
  const all = Object.values(state.hypotheses ?? {}).filter((h) => h.closedAt === null);
  const byTime = (at: (h: HypothesisState) => number) => (a: HypothesisState, b: HypothesisState) =>
    at(a) - at(b) || compareKeys(a.id, b.id);
  const confirmed = all
    .filter(
      (h) =>
        h.verdict === 'confirmed' &&
        h.readyAt === null &&
        active(h.skillId) &&
        index.graph.edges.some(
          (edge) =>
            edge.kind === 'prerequisite' && edge.from === h.skillId && edge.to === h.forSkillId,
        ),
    )
    .sort(byTime((h) => h.decidedAt as number));
  const probes = [
    ...all.filter((h) => h.verdict === 'open').sort(byTime((h) => h.openedAt)),
    ...confirmed.filter((h) => h.practisedAt !== null),
  ];
  const discovered = confirmed
    .filter((h) => h.practisedAt === null)
    .map((h): Candidate => {
      const skill = Object.hasOwn(state.skills, h.skillId) ? state.skills[h.skillId] : undefined;
      const ladder = index.ladder(h.skillId) as readonly StageId[];
      return {
        kind: 'remediation',
        skillId: h.skillId,
        stage: skill?.stage ?? (ladder[0] as StageId),
        detail: { code: 'discovered', hypothesisId: h.id, forSkillId: h.forSkillId },
      };
    });
  return { probes, discovered, waiting: new Set(confirmed.map((h) => h.forSkillId)) };
}

/**
 * The new tier (R6.2): the focus set in topological order (focus skills and
 * their hard prerequisites, transitively, that are ready), then ready skills
 * whose soft prerequisites are all mastered or credited, then the rest; seeded
 * ties within each group. With pretesting on, each carries its pretest stage.
 */
function newCandidates(
  engine: Engine,
  state: PracticeState,
  index: GraphIndex,
  input: PlanInput,
  ready: readonly string[],
): Candidate[] {
  const { config } = engine;
  const tie = (id: string): string => tieKey(input.seed, id);
  const byTie = (a: string, b: string): number => compareKeys(tie(a), tie(b));
  const readySet = new Set(ready);

  // The focus closure over hard prerequisites.
  const closure = new Set<string>();
  const stack = input.focusSkills.filter((id) => index.nodes.has(id));
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (closure.has(id)) continue;
    closure.add(id);
    stack.push(...(index.hardPrerequisites.get(id) ?? []));
  }
  // Kahn's order over the focus closure: prerequisites first, seeded ties.
  const focus: string[] = [];
  const pending = new Map<string, number>();
  for (const id of closure) {
    pending.set(id, (index.hardPrerequisites.get(id) ?? []).filter((p) => closure.has(p)).length);
  }
  let frontier = [...closure].filter((id) => pending.get(id) === 0);
  while (frontier.length > 0) {
    frontier.sort(byTie);
    const id = frontier.shift() as string;
    focus.push(id);
    for (const dependent of index.hardDependents.get(id) ?? []) {
      if (!closure.has(dependent)) continue;
      const left = (pending.get(dependent) as number) - 1;
      pending.set(dependent, left);
      if (left === 0) frontier = [...frontier, dependent];
    }
  }

  const softPrerequisites = new Map<string, string[]>();
  for (const edge of index.graph.edges) {
    if (edge.kind !== 'prerequisite' || edge.strength !== 'soft') continue;
    const list = softPrerequisites.get(edge.to);
    if (list === undefined) softPrerequisites.set(edge.to, [edge.from]);
    else list.push(edge.from);
  }
  const masteredCache = new Map<string, boolean>();
  const masteredOrCredited = (id: string): boolean => {
    let found = masteredCache.get(id);
    if (found === undefined) {
      const skill = own(state.skills, id);
      const ladder = index.ladder(id) ?? [];
      // A skill at the top of a non-empty ladder is in the graph.
      found =
        skill !== undefined &&
        (skill.credited ||
          (skill.stage === ladder[ladder.length - 1] &&
            isMastered(skill, index.nodes.get(id) as SkillNode, input.now, index.mastery(id))));
      masteredCache.set(id, found);
    }
    return found;
  };
  const softMastered = (id: string): boolean =>
    (softPrerequisites.get(id) ?? []).every(masteredOrCredited);

  const focused = focus.filter((id) => readySet.has(id));
  const rest = ready.filter((id) => !closure.has(id)).sort(byTie);
  const order = [
    ...focused,
    ...rest.filter((id) => softMastered(id)),
    ...rest.filter((id) => !softMastered(id)),
  ];
  return order.map((id) => {
    const ladder = index.ladder(id) as readonly StageId[];
    const at = Math.min(config.planner.pretestStageIndex, ladder.length - 1);
    return {
      kind: 'new',
      skillId: id,
      stage: ladder[0] as StageId,
      detail: { code: 'new', focus: closure.has(id), softPrerequisitesMastered: softMastered(id) },
      ...(config.planner.pretestNewSkills && at > 0 ? { pretestStage: ladder[at] as StageId } : {}),
    };
  });
}
