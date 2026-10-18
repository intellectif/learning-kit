import type { WrittenResponseRubricLevel } from './types/activity.js';

/**
 * A rubric criterion's levels as the grading functions read them.
 *
 * Internal. `validateActivity` does not check `levels` in 1.x — a host's own
 * field of that name passes through it and stays valid — so each reader of
 * levels asks here instead: the grading functions, the item critic and
 * redaction all agree on what a usable set of levels is.
 */

/** The fewest levels a criterion graded on levels has: a scale needs two ends. */
export const RUBRIC_LEVELS_MIN = 2;

/** The most: a CEFR scale has six, a band scale nine, and a decision model's rubric ten. */
export const RUBRIC_LEVELS_MAX = 10;

/** Why a criterion's levels cannot be used. `index` is the level the reason is about. */
export type RubricLevelsProblem =
  | 'not-a-list'
  | 'too-few'
  | 'too-many'
  | 'not-a-level'
  | 'no-label'
  | 'bad-description'
  | 'duplicate-label';

/** A label as labels are compared: composed, trimmed, its spacing collapsed, lower-cased. */
export function levelKey(label: string): string {
  return label.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

/**
 * The levels in `value`, or the first reason they cannot be used. `null` or
 * absent means the criterion has no levels, which is not a problem: it is
 * judged on a score.
 *
 * Each element and each field is read once, so a getter cannot pass the check
 * with one value and hand the grader another. The levels come back as written.
 */
export function readRubricLevels(
  value: unknown,
):
  | { ok: true; levels: WrittenResponseRubricLevel[] | null }
  | { ok: false; problem: RubricLevelsProblem; index?: number } {
  if (value === undefined || value === null) {
    return { ok: true, levels: null };
  }
  if (!Array.isArray(value)) {
    return { ok: false, problem: 'not-a-list' };
  }
  const count = value.length;
  if (count < RUBRIC_LEVELS_MIN) {
    return { ok: false, problem: 'too-few' };
  }
  if (count > RUBRIC_LEVELS_MAX) {
    return { ok: false, problem: 'too-many' };
  }
  const levels: WrittenResponseRubricLevel[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const entry: unknown = value[index];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { ok: false, problem: 'not-a-level', index };
    }
    const record = entry as Record<string, unknown>;
    const label = record.label;
    const description = record.description;
    if (typeof label !== 'string' || label.trim() === '') {
      return { ok: false, problem: 'no-label', index };
    }
    if (description !== undefined && typeof description !== 'string') {
      return { ok: false, problem: 'bad-description', index };
    }
    const key = levelKey(label);
    if (seen.has(key)) {
      return { ok: false, problem: 'duplicate-label', index };
    }
    seen.add(key);
    levels.push({ label, ...(description !== undefined ? { description } : {}) });
  }
  return { ok: true, levels };
}

/**
 * How far level probabilities may sum from 1 and still be a distribution:
 * rounding in a grader's output, not a different judgement.
 */
export const LEVEL_PROBABILITY_TOLERANCE = 1e-6;

/**
 * `values` as a distribution over `count` levels whose likeliest is level
 * `chosen`, a tie for likeliest included: each a finite number from 0 to 1,
 * together 1 within {@link LEVEL_PROBABILITY_TOLERANCE}. `null` when they are
 * not one.
 *
 * The AI check refuses a reply whose probabilities are not a distribution, and
 * calibration and routing read a grade's the same way, so probabilities the
 * check let through are never ignored downstream. Each element is read once,
 * a hole as `undefined`, into the copy returned.
 */
export function levelDistribution(
  values: readonly unknown[],
  count: number,
  chosen: number,
): number[] | null {
  const read = Array.from(values);
  if (
    read.length !== count ||
    !read.every((p): p is number => typeof p === 'number' && p >= 0 && p <= 1)
  ) {
    return null;
  }
  const sum = read.reduce((total, p) => total + p, 0);
  return Math.abs(sum - 1) <= LEVEL_PROBABILITY_TOLERANCE && read[chosen] === Math.max(...read)
    ? read
    : null;
}
