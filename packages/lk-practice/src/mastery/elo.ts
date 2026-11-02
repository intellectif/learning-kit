/**
 * The default mastery model (design §8.5, R5.2): Elo with a decaying step.
 *
 * `p = 1 / (1 + exp(-(theta - d)))`, `theta' = theta + K(n) * w * (correct - p)`,
 * `K(n) = alpha / (1 + beta * n)`, where `n` counts the applied observations
 * with `w > 0` plus the pseudo-count of the last `prior`. The ability is the
 * plain, frozen `{ theta, n }`, which is also its serialized form.
 */

import type {
  EloOptions,
  JsonValue,
  MasteryEstimate,
  MasteryModel,
  MasteryObservation,
  SkillNode,
} from '../types.js';

/** One stage's ability on the Elo scale, in logits. */
export interface EloAbility {
  readonly theta: number;
  /** Applied observations with a positive weight, plus the prior pseudo-count. */
  readonly n: number;
}

/** The resolved options; `MasteryModel.params` and the configuration hash see exactly this. */
export interface EloParams {
  readonly alpha: number;
  readonly beta: number;
}

/** The defaults (R5.2); the configuration's default reference names the same values. */
export const ELO_DEFAULT_PARAMS: EloParams = Object.freeze({ alpha: 1, beta: 0.05 });

const OPTION_KEYS = new Set(['alpha', 'beta']);
const ABILITY_KEYS = ['theta', 'n'];

/**
 * The default mastery model. Throws `TypeError` for an unknown option or a
 * value that is not a number, and `RangeError` for an `alpha` that is not
 * finite and positive or a `beta` that is not finite and at least 0. Its
 * ability is an `EloAbility`, typed `unknown` in the public API like any other
 * model's.
 */
export function eloMasteryModel(options?: EloOptions): MasteryModel {
  return createEloModel(options === undefined ? {} : options) as MasteryModel;
}

/** `eloMasteryModel` with its ability type; internal, for the package and its tests. */
export function createEloModel(options: EloOptions): MasteryModel<EloAbility> {
  const params = resolveParams(options);
  const step = (n: number): number => params.alpha / (1 + params.beta * n);

  return Object.freeze({
    id: 'elo',
    version: 1,
    params: params as unknown as JsonValue,
    init(skill: SkillNode): EloAbility {
      return ability(skill.masteryPrior ?? 0, 0);
    },
    update(state: EloAbility, observation: MasteryObservation): EloAbility {
      const { correct, weight, difficulty } = observation;
      if (!unit(correct)) throw new RangeError('lk-practice: correct must be in [0, 1].');
      if (!unit(weight)) throw new RangeError('lk-practice: weight must be in [0, 1].');
      if (!Number.isFinite(difficulty)) {
        throw new RangeError('lk-practice: difficulty must be a finite number.');
      }
      if (weight === 0) return state;
      const p = sigmoid(state.theta - difficulty);
      return ability(state.theta + step(state.n) * weight * (correct - p), state.n + 1);
    },
    prior(_state: EloAbility, theta: number, pseudoCount: number): EloAbility {
      if (!Number.isFinite(theta)) throw new RangeError('lk-practice: theta must be finite.');
      if (!(Number.isFinite(pseudoCount) && pseudoCount >= 0)) {
        throw new RangeError('lk-practice: pseudoCount must be a finite number of at least 0.');
      }
      return ability(theta, pseudoCount);
    },
    derive(from: EloAbility, shift: number): EloAbility {
      if (!Number.isFinite(shift)) throw new RangeError('lk-practice: shift must be finite.');
      return ability(from.theta - shift, 0);
    },
    expectedSuccess(state: EloAbility, difficulty: number): number {
      if (!Number.isFinite(difficulty)) {
        throw new RangeError('lk-practice: difficulty must be a finite number.');
      }
      return sigmoid(state.theta - difficulty);
    },
    estimate(state: EloAbility): MasteryEstimate {
      return Object.freeze({
        model: 'elo@1',
        value: state.theta,
        uncertainty: step(state.n),
        evidenceCount: state.n,
      });
    },
    serialize: (state: EloAbility): unknown => ({ theta: state.theta, n: state.n }),
    deserialize: readAbility,
  });
}

/** The logistic function. */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function ability(theta: number, n: number): EloAbility {
  return Object.freeze({ theta, n });
}

function unit(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

function resolveParams(options: EloOptions): EloParams {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('lk-practice: Elo options must be an object.');
  }
  for (const key of Object.keys(options)) {
    if (!OPTION_KEYS.has(key)) throw new TypeError(`lk-practice: unknown Elo option ${key}.`);
  }
  const alpha = options.alpha ?? ELO_DEFAULT_PARAMS.alpha;
  const beta = options.beta ?? ELO_DEFAULT_PARAMS.beta;
  if (typeof alpha !== 'number' || typeof beta !== 'number') {
    throw new TypeError('lk-practice: Elo options alpha and beta must be numbers.');
  }
  if (!(Number.isFinite(alpha) && alpha > 0)) {
    throw new RangeError('lk-practice: Elo option alpha must be finite and above 0.');
  }
  if (!(Number.isFinite(beta) && beta >= 0)) {
    throw new RangeError('lk-practice: Elo option beta must be finite and at least 0.');
  }
  return Object.freeze({ alpha, beta });
}

function readAbility(raw: unknown): EloAbility {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new TypeError('lk-practice: an Elo ability must be an object.');
  }
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== ABILITY_KEYS.length ||
    !ABILITY_KEYS.every((key) => Object.hasOwn(record, key))
  ) {
    throw new TypeError('lk-practice: an Elo ability has exactly the fields theta, n.');
  }
  const { theta, n } = record;
  if (
    typeof theta !== 'number' ||
    !Number.isFinite(theta) ||
    typeof n !== 'number' ||
    !Number.isFinite(n) ||
    n < 0
  ) {
    throw new TypeError('lk-practice: an Elo ability field has the wrong type or range.');
  }
  return ability(theta, n);
}
