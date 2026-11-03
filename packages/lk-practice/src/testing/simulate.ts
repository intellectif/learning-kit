/**
 * A deterministic simulated learner (R13.4, design 5.10; revised in M8). A
 * test tool for comparing policies and for property tests, not a claim about
 * real learners.
 */

import { hashCanonical } from '../determinism/fnv.js';
import type { Evidence, PracticeItem, PracticeTarget, SkillOutcome } from '../types.js';

const DAY = 86_400_000;
const MASK = 0xffffffffffffffffn;
const TWO_TO_53 = 2 ** 53;

/** One skill of a simulated learner. */
export interface SimulatedSkill {
  /** Logits: the learner succeeds half the time at a task of this difficulty, before forgetting. */
  readonly trueAbility: number;
  /** Days for recall to fall to 1/e after an attempt; finite and above 0. */
  readonly forgettingDays: number;
}

export interface SimulatedLearnerOptions {
  readonly seed: string;
  readonly skills: Readonly<Record<string, SimulatedSkill>>;
  /** Standard deviation of a per-attempt change in ability, in logits; default 0.1. */
  readonly noise?: number;
}

export interface SimulatedAttempt {
  readonly evidence: Evidence;
  readonly item: PracticeItem;
}

export interface SimulatedLearner {
  /**
   * The learner attempts a planned target at `at`: a task over its skills at
   * its stage and difficulty (the attached item's, when there is one), and
   * the evidence a host would record for it.
   */
  attempt(target: PracticeTarget, at: number): SimulatedAttempt;
}

/**
 * A simulated learner. For each skill of a target it succeeds with
 * probability `recall * 1 / (1 + exp(-(trueAbility + noise * z - difficulty)))`,
 * where `z` is a standard normal draw and `recall` is
 * `exp(-days since its last attempt at the skill / forgettingDays)`, or 1
 * before the first. Every draw comes from `fnv1a64` of the seed, the time
 * and the skill, so the same calls give the same outcomes, and one learner
 * meets the same chance under two policies that plan the same attempt (a
 * fair comparison; the target's id differs with the configuration). The
 * learner remembers when it last attempted each skill: one learner follows
 * one simulated timeline. The evidence is an `auto` grade with a point per
 * skill, per-skill outcomes when the target has more than one skill, the
 * target's context and id; the item weighs its skills equally, primary first.
 * Throws a `TypeError` for options of the wrong type and a `RangeError` for
 * values out of range, and on `attempt` for a skill it does not have or a
 * time that is not a safe integer.
 */
export function simulateLearner(options: SimulatedLearnerOptions): SimulatedLearner {
  if (typeof options?.seed !== 'string') {
    throw new TypeError('lk-practice: a simulated learner needs a string seed.');
  }
  const noise = options.noise ?? 0.1;
  if (!Number.isFinite(noise) || noise < 0) {
    throw new RangeError('lk-practice: noise is a finite number of at least 0.');
  }
  const skills = new Map<string, SimulatedSkill>();
  for (const [id, skill] of Object.entries(options.skills ?? {})) {
    if (!Number.isFinite(skill?.trueAbility)) {
      throw new RangeError(`lk-practice: skill "${id}" needs a finite trueAbility.`);
    }
    if (!(Number.isFinite(skill.forgettingDays) && skill.forgettingDays > 0)) {
      throw new RangeError(`lk-practice: skill "${id}" needs a finite forgettingDays above 0.`);
    }
    skills.set(id, { trueAbility: skill.trueAbility, forgettingDays: skill.forgettingDays });
  }
  const { seed } = options;
  const lastAttempt = new Map<string, number>();

  const draw = (at: number, skillId: string, part: string): number =>
    uniform(hashCanonical(['simulated-learner@1', seed, at, skillId, part]));

  return Object.freeze({
    attempt(target: PracticeTarget, at: number): SimulatedAttempt {
      if (!Number.isSafeInteger(at)) {
        throw new RangeError('lk-practice: an attempt time is a safe integer.');
      }
      const difficulty = target.item?.difficulty ?? target.targetDifficulty;
      const outcomes: SkillOutcome[] = target.skillIds.map((skillId) => {
        const skill = skills.get(skillId);
        if (skill === undefined) {
          throw new TypeError(`lk-practice: the simulated learner has no skill "${skillId}".`);
        }
        const last = lastAttempt.get(skillId);
        const recall =
          last === undefined ? 1 : Math.exp(-Math.max(0, at - last) / (skill.forgettingDays * DAY));
        const z =
          Math.sqrt(-2 * Math.log(1 - draw(at, skillId, 'z1'))) *
          Math.cos(2 * Math.PI * draw(at, skillId, 'z2'));
        const logit = skill.trueAbility + noise * z - difficulty;
        const chance = recall / (1 + Math.exp(-logit));
        return {
          skillId,
          score: draw(at, skillId, 'outcome') < chance ? 1 : 0,
          maxScore: 1,
        };
      });
      for (const skillId of target.skillIds) {
        lastAttempt.set(skillId, Math.max(at, lastAttempt.get(skillId) ?? at));
      }
      const id = `sim:${hashCanonical(['simulated-learner@1', seed, target.id, at])}`;
      const score = outcomes.reduce((sum, outcome) => sum + outcome.score, 0);
      const weight = 1 / target.skillIds.length;
      const item: PracticeItem = Object.freeze({
        id: `${id}:item`,
        skills: Object.freeze(target.skillIds.map((skillId) => Object.freeze({ skillId, weight }))),
        stage: target.stage,
        difficulty,
        origin: 'generated',
        status: 'proven',
      });
      const evidence: Evidence = Object.freeze({
        id,
        itemId: item.id,
        at,
        source: Object.freeze({
          kind: 'auto',
          score,
          maxScore: outcomes.length,
          passed: score === outcomes.length,
        }),
        context: target.constraints.context,
        targetId: target.id,
        ...(outcomes.length > 1
          ? { skillOutcomes: Object.freeze(outcomes.map((outcome) => Object.freeze(outcome))) }
          : {}),
      });
      return Object.freeze({ evidence, item });
    },
  });
}

/**
 * A uniform draw in [0, 1) from a 64-bit hex hash. FNV-1a's high bits barely
 * move when only the last characters of its input change, so the hash goes
 * through murmur3's 64-bit finaliser before its top 53 bits are read.
 */
function uniform(hex: string): number {
  let k = BigInt(`0x${hex}`);
  k ^= k >> 33n;
  k = (k * 0xff51afd7ed558ccdn) & MASK;
  k ^= k >> 33n;
  k = (k * 0xc4ceb9fe1a85ec53n) & MASK;
  k ^= k >> 33n;
  return Number(k >> 11n) / TWO_TO_53;
}
