/**
 * The mastery predicate (design §8.3 and §8.5, R3.5) and the skill status
 * derived from it. Both are pure: the time is an argument and nothing is
 * stored, so status is recomputed, never sticky.
 */

import type {
  MemoryModel,
  ResolvedPracticeConfig,
  SkillNode,
  SkillState,
  SkillStatus,
  StageId,
} from '../types.js';
import { type AbilityContext, abilityAt, type StoredAbility } from './ability.js';

/** A condition of R3.5, as named in `skill.mastery-lost`. */
export type MasteryCondition = 'stage' | 'successes' | 'ability' | 'retrievability';

/** What the predicate needs besides the skill and its state. */
export interface MasteryContext extends AbilityContext {
  readonly memoryModel: MemoryModel;
  readonly config: ResolvedPracticeConfig;
}

/**
 * The skill's desired retention at `stage` (R4.6): the skill's own value, else
 * the stage's, else the configuration's. **(revised in M4)** The most specific
 * value wins; R4.6 allows both overrides without ordering them.
 */
export function desiredRetentionFor(
  skill: SkillNode,
  stage: StageId,
  config: ResolvedPracticeConfig,
): number {
  return skill.desiredRetention ?? config.stageRetention[stage] ?? config.desiredRetention;
}

/**
 * The expected success at the top stage against the skill's
 * `referenceDifficulty` (default 0), with the top stage's ability derived when
 * absent: what R3.5 (c) compares with `minExpectedSuccess`.
 */
export function expectedSuccessAtReference(
  stored: StoredAbility,
  skill: SkillNode,
  context: AbilityContext,
): number {
  const top = context.ladder[context.ladder.length - 1] as StageId;
  return context.model.expectedSuccess(
    abilityAt(stored, skill, top, context),
    skill.referenceDifficulty ?? 0,
  );
}

/**
 * The conditions of R3.5 that fail at `t`, in the order (a) to (d); empty when
 * the skill is mastered. Every condition is checked, so a lost mastery reports
 * all the reasons at once.
 *
 * (a) `stage` is the top of the ladder; (b) at least `topSuccesses` counted
 * top-stage successes and the last top-stage retrieval was not a lapse;
 * (c) the expected success at the top stage against `referenceDifficulty`
 * (default 0) is at least `minExpectedSuccess`, with the top ability derived
 * when absent; (d) the top-stage memory's retrievability at `t` is at least
 * the desired retention minus `retentionMargin` (no top-stage memory fails).
 */
export function masteryFailures(
  state: SkillState,
  skill: SkillNode,
  t: number,
  context: MasteryContext,
): MasteryCondition[] {
  const { config, ladder, memoryModel } = context;
  const top = ladder[ladder.length - 1] as StageId;
  const failed: MasteryCondition[] = [];
  if (state.stage !== top) failed.push('stage');
  if (state.top.successes < config.mastery.topSuccesses || state.top.lastWasLapse) {
    failed.push('successes');
  }
  if (
    expectedSuccessAtReference(state.ability, skill, context) < config.mastery.minExpectedSuccess
  ) {
    failed.push('ability');
  }
  const memory = Object.hasOwn(state.memories, top) ? state.memories[top] : undefined;
  const floor = desiredRetentionFor(skill, top, config) - config.mastery.retentionMargin;
  if (
    memory === undefined ||
    memoryModel.retrievability(memoryModel.deserialize(memory.memory), t) < floor
  ) {
    failed.push('retrievability');
  }
  return failed;
}

/** R3.5: whether the skill is mastered at `t`. */
export function isMastered(
  state: SkillState,
  skill: SkillNode,
  t: number,
  context: MasteryContext,
): boolean {
  return masteryFailures(state, skill, t, context).length === 0;
}

/** What `skillStatus` needs besides the state. */
export interface StatusInput {
  /** The live predicate at the status time. */
  readonly mastered: boolean;
  /** The top stage of the skill's ladder. */
  readonly top: StageId;
  /** Whether the skill has at least one hard prerequisite in the graph. */
  readonly hasHardPrerequisites: boolean;
}

/**
 * The status of one skill (design §8.3), first match wins: suspended,
 * credited (credited and not started), mastered, reviewing (at the top
 * stage), learning (started), ready (unlocked, or no hard prerequisites),
 * locked. A skill with no state yet is ready or locked.
 */
export function skillStatus(state: SkillState | undefined, input: StatusInput): SkillStatus {
  if (state !== undefined) {
    if (state.suspended !== null) return 'suspended';
    if (state.credited && state.startedAt === null) return 'credited';
    if (input.mastered) return 'mastered';
    if (state.stage === input.top) return 'reviewing';
    if (state.startedAt !== null) return 'learning';
    if (state.unlockedAt !== null) return 'ready';
  }
  return input.hasHardPrerequisites ? 'locked' : 'ready';
}
