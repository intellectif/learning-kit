/**
 * Reads a `PlanRequest` (design §5.3). A malformed request is a programming
 * error, so it throws, as `status` does: `RangeError` for a number outside its
 * domain, `TypeError` for a value of the wrong type. Request limits override
 * `config.planner.limits` one by one.
 */

import type { PlanRequest, PracticeItem, ResolvedPracticeConfig } from '../types.js';

/** A request with its defaults applied. */
export interface PlanInput {
  readonly now: number;
  readonly dueBy: number;
  readonly seed: string;
  readonly maxTargets: number;
  readonly maxSeconds: number;
  readonly maxNewSkills: number;
  readonly maxReviewBacklog: number;
  readonly maxRemediation: number;
  readonly maxSkillsPerTarget: number;
  readonly focusSkills: readonly string[];
  readonly excludeSkills: ReadonlySet<string>;
  readonly excludeItems: ReadonlySet<string>;
  readonly pool: readonly PracticeItem[];
}

const LIMITS = [
  'maxNewSkills',
  'maxReviewBacklog',
  'maxRemediation',
  'maxSkillsPerTarget',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown, name: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new TypeError(`lk-practice: ${name} is an array of strings.`);
  }
  return value as readonly string[];
}

function count(value: unknown, name: string, fallback: number, least: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < least) {
    throw new RangeError(`lk-practice: ${name} is an integer of at least ${least}.`);
  }
  return value as number;
}

/** Applies the defaults to `request`, or throws. */
export function readRequest(request: PlanRequest, config: ResolvedPracticeConfig): PlanInput {
  if (!isObject(request)) throw new TypeError('lk-practice: the plan request is an object.');
  const { now, dueBy = now, seed, budget, limits = {}, pool = [] } = request;
  if (!Number.isSafeInteger(now)) {
    throw new RangeError('lk-practice: now is integer epoch milliseconds.');
  }
  if (!Number.isSafeInteger(dueBy) || dueBy < now) {
    throw new RangeError('lk-practice: dueBy is integer epoch milliseconds, not before now.');
  }
  if (typeof seed !== 'string') throw new TypeError('lk-practice: seed is a string.');
  if (!isObject(budget)) throw new TypeError('lk-practice: budget is an object.');
  if (!isObject(limits)) throw new TypeError('lk-practice: limits is an object.');
  if (!Array.isArray(pool)) throw new TypeError('lk-practice: pool is an array of items.');
  const maxSeconds = budget.maxSeconds ?? Number.POSITIVE_INFINITY;
  if (typeof maxSeconds !== 'number' || Number.isNaN(maxSeconds) || maxSeconds < 0) {
    throw new RangeError('lk-practice: budget.maxSeconds is a number of at least 0.');
  }
  const resolved = Object.fromEntries(
    LIMITS.map((name) => [
      name,
      count(
        limits[name],
        `limits.${name}`,
        config.planner.limits[name],
        name === 'maxSkillsPerTarget' ? 1 : 0,
      ),
    ]),
  ) as Record<(typeof LIMITS)[number], number>;
  return {
    now,
    dueBy,
    seed,
    maxTargets: count(budget.maxTargets, 'budget.maxTargets', Number.MAX_SAFE_INTEGER, 0),
    maxSeconds,
    ...resolved,
    focusSkills: strings(request.focusSkills, 'focusSkills'),
    excludeSkills: new Set(strings(request.excludeSkills, 'excludeSkills')),
    excludeItems: new Set(strings(request.excludeItems, 'excludeItems')),
    pool,
  };
}
