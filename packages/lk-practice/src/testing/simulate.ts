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
  /** Days for recall to fall to 1/e after an attempt, at first; finite and above 0. */
  readonly forgettingDays: number;
  /**
   * How much a success lengthens the forgetting time, scaled by how much had
   * been forgotten (the spacing effect; revised in M11): a success at recall
   * `R` multiplies it by `1 + consolidation * (1 - R)`, so a success moments
   * after the last attempt adds almost nothing and a spaced one adds most. A
   * failure halves what earlier successes added. Default 0: the forgetting
   * time stays `forgettingDays`, as before M11.
   */
  readonly consolidation?: number;
  /**
   * Logits the true ability gains with each attempt, from the feedback
   * (revised in M12); a diagnostic one (a probe) teaches nothing. Default 0:
   * it never changes.
   */
  readonly learning?: number;
  /**
   * Hidden prerequisites (R14.11; revised in M12): other skills of this
   * learner, typically absent from the graph, whose chance at a typical task
   * of their own (difficulty 0, without noise), recall included, multiplies
   * the chance on this one. A forgotten or never-learned prerequisite caps it.
   */
  readonly requires?: readonly string[];
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
 * `exp(-days since its last attempt at the skill / forgetting days)`, or 1
 * before the first; the forgetting days start at `forgettingDays` and grow
 * with spaced successes by `consolidation` (revised in M11). Every draw comes from `fnv1a64` of the seed, the time
 * and the skill, so the same calls give the same outcomes, and one learner
 * meets the same chance under two policies that plan the same attempt (a
 * fair comparison; the target's id differs with the configuration). The
 * learner remembers when it last attempted each skill and its forgetting
 * days: one learner follows one simulated timeline. (revised in M12) With
 * `requires`, the chance is also multiplied by each hidden prerequisite's
 * chance at a typical task; with `learning`, each attempt but a diagnostic
 * one raises the true ability. The evidence is an `auto` grade with a point per skill, per-skill
 * outcomes when the target has more than one skill, the target's context and
 * id, and for a probe target its hypothesis (`probe`) and no outcomes; the
 * item weighs its skills equally, primary first.
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
  const skills = new Map<
    string,
    Required<Omit<SimulatedSkill, 'requires'>> & { requires: string[] }
  >();
  for (const [id, skill] of Object.entries(options.skills ?? {})) {
    if (!Number.isFinite(skill?.trueAbility)) {
      throw new RangeError(`lk-practice: skill "${id}" needs a finite trueAbility.`);
    }
    if (!(Number.isFinite(skill.forgettingDays) && skill.forgettingDays > 0)) {
      throw new RangeError(`lk-practice: skill "${id}" needs a finite forgettingDays above 0.`);
    }
    const consolidation = skill.consolidation ?? 0;
    if (!(Number.isFinite(consolidation) && consolidation >= 0)) {
      throw new RangeError(
        `lk-practice: skill "${id}" needs a finite consolidation of at least 0.`,
      );
    }
    const learning = skill.learning ?? 0;
    if (!Number.isFinite(learning)) {
      throw new RangeError(`lk-practice: skill "${id}" needs a finite learning rate.`);
    }
    skills.set(id, {
      trueAbility: skill.trueAbility,
      forgettingDays: skill.forgettingDays,
      consolidation,
      learning,
      requires: [...(skill.requires ?? [])],
    });
  }
  for (const [id, skill] of skills) {
    for (const required of skill.requires) {
      if (required === id || !skills.has(required)) {
        throw new RangeError(
          `lk-practice: skill "${id}" requires "${required}", another of its skills.`,
        );
      }
    }
  }
  const { seed } = options;
  /** Per skill: the last attempt and the forgetting days since. */
  const memory = new Map<string, { last: number; days: number }>();
  /** Per skill: the true ability, once it has learned (revised in M12). */
  const ability = new Map<string, number>();
  const abilityOf = (skillId: string): number =>
    ability.get(skillId) ?? (skills.get(skillId) as { trueAbility: number }).trueAbility;
  const recallOf = (skillId: string, at: number): number => {
    const held = memory.get(skillId);
    if (held === undefined) return 1;
    return Math.exp(-Math.max(0, at - held.last) / (held.days * DAY));
  };

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
        const held = memory.get(skillId);
        const days = held?.days ?? skill.forgettingDays;
        const recall = recallOf(skillId, at);
        const z =
          Math.sqrt(-2 * Math.log(1 - draw(at, skillId, 'z1'))) *
          Math.cos(2 * Math.PI * draw(at, skillId, 'z2'));
        const logit = abilityOf(skillId) + noise * z - difficulty;
        const cap = skill.requires.reduce(
          (product, required) =>
            product * recallOf(required, at) * (1 / (1 + Math.exp(-abilityOf(required)))),
          1,
        );
        const chance = (cap * recall) / (1 + Math.exp(-logit));
        const score = draw(at, skillId, 'outcome') < chance ? 1 : 0;
        if (skill.learning !== 0 && target.constraints.context !== 'diagnostic') {
          ability.set(skillId, abilityOf(skillId) + skill.learning);
        }
        const next =
          score === 1
            ? days * (1 + skill.consolidation * (1 - recall))
            : skill.forgettingDays + (days - skill.forgettingDays) / 2;
        memory.set(skillId, { last: Math.max(at, held?.last ?? at), days: next });
        return { skillId, score, maxScore: 1 };
      });
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
        ...(target.reason.code === 'probe' ? { probe: target.reason.hypothesisId } : {}),
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
