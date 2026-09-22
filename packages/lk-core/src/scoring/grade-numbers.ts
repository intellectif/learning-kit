/**
 * How far past its own maximum a score may sit and still be a grade. A grader
 * that sums weighted parts lands on `1.0000000000000002` for a perfect answer
 * as readily as on `1`; that is float noise, not a grader out of contract.
 * Relative, so it means the same out of 100 as out of 1, and the same bound
 * lk-react applies before it shows a grade — the two packages agree on what a
 * grade is.
 */
const OVERSHOOT = 1e-9;

/**
 * Whether `score` out of `maxScore` can be a grade: `maxScore` a positive,
 * finite number, and `score` a finite number from 0 to it. Anything else — NaN,
 * Infinity, a negative, 85 "out of 1", any score out of 0, a numeric string —
 * is a grader out of contract, and dividing by it puts a number on the record
 * that nobody can defend.
 *
 * A score up to `maxScore * OVERSHOOT` above its maximum passes as it is. It
 * is not clamped: an accepted grade composes exactly as it always has.
 */
export function isGradeInRange(score: number, maxScore: number): boolean {
  return (
    Number.isFinite(maxScore) &&
    maxScore > 0 &&
    Number.isFinite(score) &&
    score >= 0 &&
    score - maxScore <= maxScore * OVERSHOOT
  );
}
