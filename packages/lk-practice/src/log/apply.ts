/**
 * `applyEntry` (design §8.1): the only state transition. `record`, `act`,
 * `replay` and `replayFrom` all apply entries through it, so replay equals
 * record by construction. It trusts its input: every entry passed the shape
 * and rule checks of `validate.ts` against the same graph and configuration.
 */

import { logHashStep } from '../determinism/keys.js';
import { contextWeight, heldReason } from '../evidence/index.js';
import { equivalentStage } from '../graph/index.js';
import {
  abilityAt,
  desiredRetentionFor,
  isMastered,
  masteryFailures,
  meetsStandard,
  priorAbility,
  updateAbility,
} from '../mastery/index.js';
import { EMPTY_STREAK } from '../stage/index.js';
import type {
  Evidence,
  HostAction,
  MappedEvidence,
  Rating,
  ReviewLogEntry,
  SkillEffect,
  SkillNode,
  SkillState,
  SkillStatesView,
  StageId,
  StageMemory,
  TaskSnapshot,
} from '../types.js';
import type { Engine, GraphIndex } from './context.js';
import {
  applyProbe,
  closeHypothesis,
  diagnosisUnderWay,
  openHypothesis,
  trackDiscovery,
} from './discovery.js';
import { compareKeys, type Draft, defaultSkillState } from './draft.js';

export interface ApplyContext {
  readonly engine: Engine;
  readonly graph: GraphIndex;
}

/**
 * How an evidence entry meets a confirmation (design §8.7). `confirmation`
 * on a held entry is the first confirmation after it with no discard
 * between (look-ahead); `confirmed` on a confirmation entry says whether its
 * held entry was applied with it.
 */
export interface EntryLink {
  readonly confirmation?: Evidence;
  readonly confirmed?: boolean;
}

/**
 * Applies one entry to the draft: the log header, usage, ids, then the
 * entry's effects. Returns true when a held entry was applied with
 * `link.confirmation`, which it is only while it still maps as held.
 */
export function applyEntry(
  draft: Draft,
  entry: ReviewLogEntry,
  context: ApplyContext,
  link: EntryLink = {},
): boolean {
  const { config } = context.engine;
  draft.length = Math.max(draft.length, entry.seq + 1);
  draft.lastAt = draft.lastAt === null ? entry.at : Math.max(draft.lastAt, entry.at);
  if (entry.kind === 'host') {
    draft.remember(entry.id, config.recentIdWindow);
    applyHost(draft, entry.at, entry.action, context);
    return false;
  }
  const { evidence } = entry;
  if (evidence.confirms !== undefined) {
    draft.remember(evidence.id, config.recentIdWindow);
    if (link.confirmed === true) {
      draft.emit({
        type: 'evidence.confirmed',
        at: entry.at,
        evidenceId: evidence.id,
        heldId: evidence.confirms,
      });
    }
    return false;
  }
  const task = entry.task as TaskSnapshot;
  draft.use(evidence.itemId, entry.at, draft.lastAt, config.itemUsageRetentionMs);
  draft.remember(evidence.id, config.recentIdWindow);
  const mapped = map(evidence, task, draft, context);
  if (mapped.held && link.confirmation !== undefined) {
    applyEvidence(draft, confirmed(evidence, link.confirmation), task, entry.seq, context);
    return true;
  }
  applyMapped(draft, evidence, task, entry.seq, mapped, context);
  return false;
}

/** Folds an entry into the rolling log hash, in `seq` order. */
export function hashEntry(draft: Draft, entry: ReviewLogEntry): void {
  draft.hash = logHashStep(draft.hash, entry);
}

/**
 * Applies a held entry's evidence with its confirmation's source and
 * outcomes, at the held entry's own `at`: what replay does at the held
 * entry's position. Removes the held record.
 */
export function applyConfirmed(
  draft: Draft,
  heldId: string,
  confirmation: Evidence,
  context: ApplyContext,
): void {
  const index = draft.held.findIndex((held) => held.evidenceId === heldId);
  const held = draft.held[index];
  if (held === undefined) return;
  draft.held.splice(index, 1);
  applyEvidence(draft, confirmed(held.evidence, confirmation), held.task, held.seq, context);
}

/** The held evidence as its confirmation grades it. */
function confirmed(held: Evidence, confirmation: Evidence): Evidence {
  const { skillOutcomes: _omit, ...rest } = held;
  return {
    ...rest,
    source: confirmation.source,
    ...(confirmation.skillOutcomes === undefined
      ? {}
      : { skillOutcomes: confirmation.skillOutcomes }),
  };
}

function map(
  evidence: Evidence,
  task: TaskSnapshot,
  draft: Draft,
  context: ApplyContext,
): MappedEvidence {
  const { engine } = context;
  const skills: SkillStatesView = engine.builtinMapper ? {} : statesView(draft, context);
  return engine.mapper.map(evidence, task, skills, engine.config);
}

/** The current stage of every skill with state, for a custom mapper. */
function statesView(draft: Draft, context: ApplyContext): SkillStatesView {
  const entries: [string, { stage: StageId }][] = [];
  for (const skillId of context.graph.nodes.keys()) {
    const state = draft.skill(skillId);
    if (state !== undefined) entries.push([skillId, { stage: state.stage }]);
  }
  return Object.fromEntries(entries);
}

function applyEvidence(
  draft: Draft,
  evidence: Evidence,
  task: TaskSnapshot,
  seq: number,
  context: ApplyContext,
): void {
  applyMapped(draft, evidence, task, seq, map(evidence, task, draft, context), context);
}

function applyMapped(
  draft: Draft,
  evidence: Evidence,
  task: TaskSnapshot,
  seq: number,
  mapped: MappedEvidence,
  context: ApplyContext,
): void {
  const { at } = evidence;
  if (mapped.held) {
    const reason = heldReason(evidence) ?? 'deferred';
    draft.held.push(
      Object.freeze({
        evidenceId: evidence.id,
        itemId: evidence.itemId,
        at,
        seq,
        reason,
        evidence,
        task,
      }),
    );
    draft.emit({ type: 'evidence.held', at, evidenceId: evidence.id, reason });
    return;
  }
  // A probe answer changes only its hypothesis (R14.6), and a re-probe that
  // makes a prerequisite ready gives the blocked skill a fresh start (R14.9;
  // revised in M12).
  if (evidence.probe !== undefined) {
    const blocked = applyProbe(draft, evidence, context.engine.config.discovery);
    if (blocked !== null) freshStart(draft, blocked, at, context);
    return;
  }
  const touched = new Set<string>();
  for (const effect of mapped.perSkill)
    applyEffect(draft, evidence, task, effect, touched, context);
  settle(draft, touched, at, context);
  trackDiscovery(draft, evidence, mapped);
}

/**
 * A fresh start for a skill whose missing prerequisite is now ready (R14.9;
 * revised in M12): each stage's stored ability below the mastery model's own
 * start there (`init`, derived up the ladder) takes that start, evidence count
 * included, so the failures the missing prerequisite explains stop weighing
 * on the standard; an ability at or above the start is kept, so a fresh start
 * never lowers one. Those failures explain the stage memories' lapses too:
 * their lapse and review counts and their streaks start again, so the leech
 * rule, demotion and the diagnosis trigger judge answers given with the
 * prerequisite in place, and a leech suspension is lifted (a host's stays).
 * The memories themselves, and so the schedule, are kept.
 */
function freshStart(draft: Draft, skillId: string, at: number, context: ApplyContext): void {
  const { graph } = context;
  const { mastery } = context.engine;
  const node = graph.nodes.get(skillId);
  const skill = draft.skill(skillId);
  if (node === undefined || skill === undefined) return;
  const abilityContext = graph.mastery(skillId);
  const ability: Record<StageId, unknown> = {};
  let lowered = false;
  for (const stage of abilityContext.ladder) {
    if (!Object.hasOwn(skill.ability, stage)) continue;
    const stored = skill.ability[stage];
    const start = abilityAt({}, node, stage, abilityContext);
    const below =
      mastery.estimate(mastery.deserialize(stored)).value < mastery.estimate(start).value;
    ability[stage] = below ? mastery.serialize(start) : stored;
    lowered ||= below;
  }
  const counted = Object.values(skill.memories).some((memory) => memory.reviews > 0);
  const leech = skill.suspended === 'leech';
  if (!lowered && !counted && !leech) return;
  const memories = Object.fromEntries(
    Object.entries(skill.memories).map(([stage, memory]) => [
      stage,
      Object.freeze({ ...memory, reviews: 0, lapses: 0, streak: EMPTY_STREAK }),
    ]),
  );
  draft.setSkill(skillId, {
    ...skill,
    ability: lowered ? Object.freeze(ability) : skill.ability,
    memories: Object.freeze(memories),
    ...(leech ? { suspended: null } : {}),
  });
  if (leech) draft.emit({ type: 'skill.unsuspended', at, skillId });
  settle(draft, new Set([skillId]), at, context);
}

function applyEffect(
  draft: Draft,
  evidence: Evidence,
  task: TaskSnapshot,
  effect: SkillEffect,
  touched: Set<string>,
  context: ApplyContext,
): void {
  const { engine, graph } = context;
  const { config } = engine;
  const { at } = evidence;
  const { skillId } = effect;
  const node = graph.nodes.get(skillId);
  const ladder = graph.ladder(skillId);
  if (node === undefined || ladder === null || effect.reason === 'held') return;
  if (effect.reason === 'not-assessed') {
    draft.emit({ type: 'skill.not-assessed', at, evidenceId: evidence.id, skillId });
    touched.add(skillId);
    return;
  }
  const evidenceStage = equivalentStage(task.stage, ladder, graph.demand);
  if (evidenceStage === null) return;
  touched.add(skillId);
  let skill: SkillState = draft.skill(skillId) ?? defaultSkillState(ladder[0] as StageId);
  if (skill.startedAt === null) {
    skill = { ...skill, startedAt: at };
    draft.emit({ type: 'skill.started', at, skillId, stage: skill.stage });
  }

  // Read before this evidence updates the ability (8.2; revised in M9).
  const topStage = ladder[ladder.length - 1] as StageId;
  const checkTask =
    skill.stage === topStage &&
    evidenceStage === topStage &&
    isMasteryCheck(skill, node, topStage, task.difficulty, at, context);
  const failedCheck = effect.rating === 'again' && checkTask;

  // Ability (D27): the skill's equivalent of the task's stage.
  if (effect.reason !== 'exposure') {
    const weight = effect.weight * contextWeight(evidence.context, config);
    if (weight > 0) {
      skill = {
        ...skill,
        ability: updateAbility(
          skill.ability,
          node,
          evidenceStage,
          {
            correct: effect.correct,
            weight,
            difficulty: task.difficulty,
            stage: evidenceStage,
            context: evidence.context ?? 'practice',
          },
          graph.mastery(skillId),
        ),
      };
    }
  }
  skill = { ...skill, evidenceCount: skill.evidenceCount + 1 };

  // Memory and the stage policy (8.2), on the current stage's memory. A
  // failed mastery check is reviewed as `hard`: no lapse, demotion or leech.
  const rating: Rating | null = failedCheck ? 'hard' : effect.rating;
  const current = skill.stage;
  const previous = memoryAt(skill, current);
  if (
    effect.memory === 'review' &&
    rating !== null &&
    skill.suspended === null &&
    !sameSitting(previous, rating, at, config.reviewGapMs)
  ) {
    const decision = engine.policy.decide({
      ladder,
      current,
      evidenceStage,
      rating,
      at,
      streak: previous?.streak ?? EMPTY_STREAK,
    });
    if (decision.effect !== 'neutral') {
      const { memory } = engine;
      const review = memory.review(
        previous === undefined ? memory.init() : memory.deserialize(previous.memory),
        rating,
        at,
        { desiredRetention: desiredRetentionFor(node, current, config) },
      );
      let due = decision.dueCap === null ? review.due : Math.min(review.due, decision.dueCap);
      const lapse = rating === 'again';
      if (current === topStage) {
        const top = { ...skill.top };
        if (decision.effect === 'lapse') {
          top.lastWasLapse = true;
        } else {
          top.lastWasLapse = false;
          if (
            decision.effect === 'success' &&
            (top.successes === 0 || at - (top.lastSuccessAt as number) >= config.mastery.topGapMs)
          ) {
            top.successes += 1;
            top.lastSuccessAt = at;
            if (top.firstSuccessAt === null) top.firstSuccessAt = at;
          }
        }
        if (top.successes > 0 && top.successes < config.mastery.topSuccesses) {
          due = Math.min(due, (top.lastSuccessAt as number) + config.mastery.topGapMs);
        }
        // A success while the ability is still short of R3.5 (c) brings the
        // next mastery check within `topGapMs` (8.6; revised in M9): a passed
        // check always, a success at the learner's own level only after at
        // most one failed check in a row (revised in M11), so a standard
        // still out of reach is checked at the memory's own pace.
        if (
          decision.effect === 'success' &&
          (checkTask || (top.failedChecks ?? 0) <= 1) &&
          !meetsStandard(skill.ability, node, graph.mastery(skillId))
        ) {
          due = Math.min(due, at + config.mastery.topGapMs);
        }
        // Failed checks back off (revised in M11): the next review comes
        // within `topGapMs`, doubled for each failed check before it, so one
        // unlucky answer costs days and a standard out of reach costs few
        // checks. A passed check starts the count again.
        if (failedCheck) {
          const failed = (top.failedChecks ?? 0) + 1;
          top.failedChecks = failed;
          due = Math.min(due, at + config.mastery.topGapMs * 2 ** Math.min(failed - 1, 20));
        } else if (checkTask && decision.effect === 'success') {
          top.failedChecks = 0;
        }
        skill = { ...skill, top };
      }
      const reviewed: StageMemory = {
        model: `${memory.id}@${memory.version}`,
        memory: memory.serialize(review.memory),
        due,
        modelDue: review.due,
        lastReviewAt: at,
        reviews: (previous?.reviews ?? 0) + 1,
        lapses: (previous?.lapses ?? 0) + (lapse ? 1 : 0),
        streak: decision.streak,
        superseded: decision.move === 'promote' ? true : (previous?.superseded ?? false),
      };
      skill = withMemory(skill, current, reviewed);
      draft.emit({
        type: 'review.recorded',
        at,
        evidenceId: evidence.id,
        skillId,
        stage: current,
        rating,
        due,
      });
      // A failed mastery check is a failure that remediation and generation see (R6.5).
      if (lapse || failedCheck) skill = { ...skill, lastLapseAt: at };

      const index = ladder.indexOf(current);
      if (decision.move === 'promote' && index < ladder.length - 1) {
        const to = ladder[index + 1] as StageId;
        skill = { ...skill, stage: to };
        draft.emit({ type: 'stage.promoted', at, skillId, from: current, to });
      } else if (decision.move === 'demote' && index > 0) {
        const to = ladder[index - 1] as StageId;
        const lower = memoryAt(skill, to);
        skill = { ...skill, stage: to };
        if (lower?.superseded === true)
          skill = withMemory(skill, to, { ...lower, superseded: false });
        draft.emit({ type: 'stage.demoted', at, skillId, from: current, to });
      }

      // A leech (revised in M11): on a lapse only, so a success never
      // suspends; at the threshold and every half threshold after it; and
      // only while the stage fails at least twice as often as the planner
      // aims for (`1 - targetSuccess`), since practice at the target fails by
      // design and a count alone grows with practice.
      const every = Math.max(1, Math.floor(config.leechThreshold / 2));
      const planned = 1 - config.planner.targetSuccess;
      if (
        lapse &&
        reviewed.lapses >= config.leechThreshold &&
        (reviewed.lapses - config.leechThreshold) % every === 0 &&
        reviewed.lapses >= 2 * planned * reviewed.reviews
      ) {
        skill = { ...skill, suspended: 'leech' };
        draft.emit({ type: 'skill.leech', at, skillId, stage: current, lapses: reviewed.lapses });
        draft.emit({ type: 'skill.suspended', at, skillId, reason: 'leech' });
      }
      // Lapses in a row at a stage suggest a diagnosis, the last word on the
      // answer (R14.2; revised in M12).
      const inRow = (previous?.streak.lapses ?? 0) + 1;
      if (
        decision.effect === 'lapse' &&
        inRow === config.discovery.diagnoseAfter &&
        !diagnosisUnderWay(draft, skillId, config.discovery)
      ) {
        draft.emit({
          type: 'skill.diagnosis-suggested',
          at,
          evidenceId: evidence.id,
          skillId,
          stage: current,
          lapses: inRow,
        });
      }
    }
  }
  if (effect.rating === 'again' && evidence.learnerConfidence === 'sure') {
    draft.emit({ type: 'evidence.confident-error', at, evidenceId: evidence.id, skillId });
  }
  draft.setSkill(skillId, skill);
}

/**
 * Whether a task at the top stage `stage` is a mastery check (8.2; revised in
 * M9): the last top-stage retrieval was not a lapse, the stage's ability is
 * short of R3.5 (c), the task is harder than the learner's `targetSuccess`
 * difficulty there by more than the tolerance, and the stage's memory still
 * predicts recall at the mastery floor (R3.5 (d)) at `at`. A failure then says
 * the standard is not met yet, not that the skill was forgotten.
 */
function isMasteryCheck(
  skill: SkillState,
  node: SkillNode,
  stage: StageId,
  difficulty: number,
  at: number,
  context: ApplyContext,
): boolean {
  const { config, mastery, memory: memoryModel } = context.engine;
  const memory = memoryAt(skill, stage);
  if (memory === undefined || skill.top.lastWasLapse) return false;
  const abilityContext = context.graph.mastery(node.id);
  if (meetsStandard(skill.ability, node, abilityContext)) return false;
  const p = config.planner.targetSuccess;
  const training =
    mastery.estimate(abilityAt(skill.ability, node, stage, abilityContext)).value -
    Math.log(p / (1 - p));
  if (difficulty <= training + config.planner.difficultyTolerance) return false;
  const floor = desiredRetentionFor(node, stage, config) - config.mastery.retentionMargin;
  return memoryModel.retrievability(memoryModel.deserialize(memory.memory), at) >= floor;
}

/**
 * One sitting is one review (revised in M11): a success, `hard` included,
 * within `gapMs` of a stage memory's last review and before it is due leaves
 * the memory and the stage policy alone; the ability has already taken it.
 * A lapse always counts, and a due memory (a relearning step) always reviews.
 */
function sameSitting(
  previous: StageMemory | undefined,
  rating: Rating,
  at: number,
  gapMs: number,
): boolean {
  if (rating === 'again' || previous === undefined) return false;
  const { due, lastReviewAt } = previous;
  return due !== null && lastReviewAt !== null && at < due && at - lastReviewAt < gapMs;
}

function memoryAt(skill: SkillState, stage: StageId): StageMemory | undefined {
  return Object.hasOwn(skill.memories, stage) ? skill.memories[stage] : undefined;
}

function withMemory(skill: SkillState, stage: StageId, memory: StageMemory): SkillState {
  return {
    ...skill,
    memories: Object.freeze(
      Object.fromEntries(
        [...Object.entries(skill.memories).filter(([key]) => key !== stage), [stage, memory]].sort(
          ([a], [b]) => compareKeys(a as string, b as string),
        ),
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// Host entries
// ---------------------------------------------------------------------------

function applyHost(draft: Draft, at: number, action: HostAction, context: ApplyContext): void {
  if (action.kind === 'discard-held') {
    const index = draft.held.findIndex((held) => held.evidenceId === action.evidenceId);
    if (index >= 0) {
      draft.held.splice(index, 1);
      draft.emit({ type: 'evidence.discarded', at, heldId: action.evidenceId });
    }
    return;
  }
  if (action.kind === 'open-hypothesis') {
    openHypothesis(draft, at, action.hypothesis);
    return;
  }
  if (action.kind === 'close-hypothesis') {
    closeHypothesis(draft, at, action.hypothesisId);
    return;
  }
  const { graph } = context;
  const { skillId } = action;
  const node = graph.nodes.get(skillId);
  const ladder = graph.ladder(skillId);
  if (node === undefined || ladder === null) return;
  const existing = draft.skill(skillId);
  const skill = existing ?? defaultSkillState(ladder[0] as StageId);
  switch (action.kind) {
    case 'prior': {
      const stage = action.stage ?? skill.stage;
      draft.setSkill(skillId, {
        ...skill,
        ability: priorAbility(
          skill.ability,
          node,
          stage,
          action.theta,
          action.pseudoCount,
          graph.mastery(skillId),
        ),
      });
      draft.emit({
        type: 'skill.prior-set',
        at,
        skillId,
        stage,
        theta: action.theta,
        pseudoCount: action.pseudoCount,
      });
      break;
    }
    case 'place': {
      const starts = !action.credited && skill.startedAt === null;
      draft.setSkill(skillId, {
        ...skill,
        stage: action.stage,
        credited: action.credited,
        ...(starts ? { startedAt: at } : {}),
      });
      draft.emit({
        type: 'skill.placed',
        at,
        skillId,
        stage: action.stage,
        credited: action.credited,
      });
      if (starts) draft.emit({ type: 'skill.started', at, skillId, stage: action.stage });
      break;
    }
    case 'suspend':
      draft.setSkill(skillId, { ...skill, suspended: 'host' });
      draft.emit({ type: 'skill.suspended', at, skillId, reason: 'host' });
      break;
    case 'unsuspend':
      if (existing !== undefined && existing.suspended !== null) {
        draft.setSkill(skillId, { ...existing, suspended: null });
      }
      draft.emit({ type: 'skill.unsuspended', at, skillId });
      break;
    case 'reset-skill':
      if (existing !== undefined) {
        draft.setSkill(skillId, {
          ...defaultSkillState(ladder[0] as StageId),
          unlockedAt: existing.unlockedAt,
          mastered: existing.mastered,
        });
      }
      break;
  }
  settle(draft, new Set([skillId]), at, context);
  if (action.kind === 'reset-skill') {
    const reset = draft.skill(skillId);
    // A reset skill that kept neither an unlock nor a flag is the default state: no record.
    if (reset !== undefined && reset.unlockedAt === null && !reset.mastered) {
      draft.deleteSkill(skillId);
    }
  }
}

// ---------------------------------------------------------------------------
// Steps 6 and 7: mastery events and unlocks
// ---------------------------------------------------------------------------

function settle(
  draft: Draft,
  touched: ReadonlySet<string>,
  at: number,
  context: ApplyContext,
): void {
  const { graph } = context;
  const ordered = [...touched].sort(
    (a, b) => (graph.order.get(a) as number) - (graph.order.get(b) as number),
  );
  for (const skillId of ordered) {
    const skill = draft.skill(skillId);
    if (skill === undefined) continue;
    const failed = masteryFailures(
      skill,
      graph.nodes.get(skillId) as SkillNode,
      at,
      graph.mastery(skillId),
    );
    if (failed.length === 0 && !skill.mastered) {
      draft.setSkill(skillId, { ...skill, mastered: true });
      draft.emit({ type: 'skill.mastered', at, skillId });
    } else if (failed.length > 0 && skill.mastered) {
      draft.setSkill(skillId, { ...skill, mastered: false });
      draft.emit({ type: 'skill.mastery-lost', at, skillId, failed: Object.freeze(failed) });
    }
  }

  const candidates = new Set<string>();
  for (const skillId of ordered) {
    for (const dependent of graph.hardDependents.get(skillId) ?? []) candidates.add(dependent);
  }
  const dependents = [...candidates].sort(
    (a, b) => (graph.order.get(a) as number) - (graph.order.get(b) as number),
  );
  for (const skillId of dependents) {
    const current = draft.skill(skillId);
    if (current !== undefined && current.unlockedAt !== null) continue;
    // A hard dependent has hard prerequisites by construction of the index.
    const ready = (graph.hardPrerequisites.get(skillId) as readonly string[]).every(
      (prerequisite) => {
        const state = draft.skill(prerequisite);
        if (state === undefined) return false;
        return (
          state.credited ||
          isMastered(
            state,
            graph.nodes.get(prerequisite) as SkillNode,
            at,
            graph.mastery(prerequisite),
          )
        );
      },
    );
    if (!ready) continue;
    const ladder = graph.ladder(skillId) as readonly StageId[];
    draft.setSkill(skillId, {
      ...(current ?? defaultSkillState(ladder[0] as StageId)),
      unlockedAt: at,
    });
    draft.emit({ type: 'skill.unlocked', at, skillId });
  }
}
