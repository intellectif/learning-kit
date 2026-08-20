import { describe, expect, it } from 'vitest';
import type { ActivityData } from '../../types/activity.js';
import { computePassThreshold } from '../index.js';
import {
  type Band,
  classifyBand,
  gte,
  type RoundingMode,
  type RoundingPolicy,
  roundGrade,
} from '../rounding.js';

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const HALF_UP_2: RoundingPolicy = { mode: 'half-up', dp: 2 };

const MODES: readonly RoundingMode[] = ['half-up', 'half-even', 'floor', 'ceil'];

const DPS: readonly number[] = [0, 1, 2, 3];

// ==========================================================================
// roundGrade — half-up
// ==========================================================================

describe('roundGrade — half-up', () => {
  it('rounds to dp 2 and to dp 0', () => {
    expect(roundGrade(0.694, { mode: 'half-up', dp: 2 })).toBe(0.69);
    expect(roundGrade(0.696, { mode: 'half-up', dp: 2 })).toBe(0.7);
    expect(roundGrade(0.5, { mode: 'half-up', dp: 0 })).toBe(1);
    expect(roundGrade(2.4, { mode: 'half-up', dp: 0 })).toBe(2);
  });

  it('rounds negatives AWAY from zero, not toward +Infinity', () => {
    // Math.round(-12.5) is -12 (toward +Infinity); half-up must give -13.
    expect(roundGrade(-0.125, { mode: 'half-up', dp: 2 })).toBe(-0.13);
    expect(roundGrade(-0.5, { mode: 'half-up', dp: 0 })).toBe(-1);
    expect(roundGrade(-2.5, { mode: 'half-up', dp: 0 })).toBe(-3);
    expect(roundGrade(-0.694, { mode: 'half-up', dp: 2 })).toBe(-0.69);
  });

  it('defeats binary float noise that would otherwise round a grade DOWN a step', () => {
    // 1.005 * 100 === 100.49999999999999, so naive Math.round gives 1.00.
    expect(1.005 * 100).toBe(100.49999999999999);
    expect(Math.round(1.005 * 100) / 100).toBe(1);
    expect(roundGrade(1.005, { mode: 'half-up', dp: 2 })).toBe(1.01);

    // 8.575 * 100 === 857.4999999999999 — naive rounding gives 8.57.
    expect(Math.round(8.575 * 100) / 100).toBe(8.57);
    expect(roundGrade(8.575, { mode: 'half-up', dp: 2 })).toBe(8.58);

    // 1.015 * 100 === 101.49999999999999 — naive rounding gives 1.01.
    expect(Math.round(1.015 * 100) / 100).toBe(1.01);
    expect(roundGrade(1.015, { mode: 'half-up', dp: 2 })).toBe(1.02);
  });
});

// ==========================================================================
// roundGrade — floor and ceil
// ==========================================================================

describe('roundGrade — floor and ceil', () => {
  it('floors toward -Infinity for positives and negatives', () => {
    expect(roundGrade(1.239, { mode: 'floor', dp: 2 })).toBe(1.23);
    expect(roundGrade(2.7, { mode: 'floor', dp: 0 })).toBe(2);
    expect(roundGrade(-1.234, { mode: 'floor', dp: 2 })).toBe(-1.24);
    expect(roundGrade(-2.1, { mode: 'floor', dp: 0 })).toBe(-3);
  });

  it('ceils toward +Infinity for positives and negatives', () => {
    expect(roundGrade(1.231, { mode: 'ceil', dp: 2 })).toBe(1.24);
    expect(roundGrade(2.1, { mode: 'ceil', dp: 0 })).toBe(3);
    expect(roundGrade(-1.234, { mode: 'ceil', dp: 2 })).toBe(-1.23);
    expect(roundGrade(-2.9, { mode: 'ceil', dp: 0 })).toBe(-2);
  });

  it('normalises negative zero to positive zero', () => {
    // Math.ceil(-0.500000001) is -0, which JSON-serialises as 0 but is not
    // Object.is-equal to it — enough to surprise a strict-equality gradebook
    // comparison or a snapshot. Every return path normalises it.
    expect(Object.is(roundGrade(-0.5, { mode: 'ceil', dp: 0 }), 0)).toBe(true);
    expect(Object.is(roundGrade(-0.004, { mode: 'half-up', dp: 2 }), 0)).toBe(true);
    expect(Object.is(roundGrade(-0, { mode: 'floor', dp: 2 }), 0)).toBe(true);
  });
});

// ==========================================================================
// roundGrade — the float-noise nudge, and the direction it points
// ==========================================================================

describe('roundGrade — the float-noise nudge opposes the mode', () => {
  it('never moves a value that is ALREADY exact at dp — ceil', () => {
    // Regression: the nudge used to point uniformly away from zero, so `ceil`
    // added epsilon before `Math.ceil` and jumped a whole quantum on a value
    // that needed no rounding at all. A grade of 0.7 was recorded as 0.71 and
    // a true zero as 0.01.
    expect(roundGrade(0.7, { mode: 'ceil', dp: 2 })).toBe(0.7);
    expect(roundGrade(1.23, { mode: 'ceil', dp: 2 })).toBe(1.23);
    expect(roundGrade(0, { mode: 'ceil', dp: 2 })).toBe(0);
    expect(roundGrade(70, { mode: 'ceil', dp: 0 })).toBe(70);
    expect(roundGrade(1, { mode: 'ceil', dp: 2 })).toBe(1);
  });

  it('never moves a value that is ALREADY exact at dp — floor', () => {
    // The mirror image: `floor` used to subtract epsilon on negatives and drop
    // a whole quantum, so -1.23 was recorded as -1.24.
    expect(roundGrade(-1.23, { mode: 'floor', dp: 2 })).toBe(-1.23);
    expect(roundGrade(-2, { mode: 'floor', dp: 0 })).toBe(-2);
    expect(roundGrade(0.7, { mode: 'floor', dp: 2 })).toBe(0.7);
    expect(roundGrade(0, { mode: 'floor', dp: 2 })).toBe(0);
    expect(roundGrade(70, { mode: 'floor', dp: 0 })).toBe(70);
  });

  it('still absorbs representation error, which is the whole point of the nudge', () => {
    // 0.29 * 100 is 28.999999999999996 — a bare Math.floor drops it to 0.28.
    expect(0.29 * 100).toBe(28.999999999999996);
    expect(Math.floor(0.29 * 100) / 100).toBe(0.28);
    expect(roundGrade(0.29, { mode: 'floor', dp: 2 })).toBe(0.29);

    // A value genuinely above the quantum must still climb under `ceil`.
    expect(roundGrade(0.701, { mode: 'ceil', dp: 2 })).toBe(0.71);
    // And the half modes keep their sign-aware nudge.
    expect(roundGrade(1.005, { mode: 'half-up', dp: 2 })).toBe(1.01);
  });

  it('does not let a repeated ceil climb a step on every call', () => {
    const policy: RoundingPolicy = { mode: 'ceil', dp: 2 };
    let grade = 0.7;
    let zero = 0;
    for (let pass = 0; pass < 5; pass += 1) {
      grade = roundGrade(grade, policy);
      zero = roundGrade(zero, policy);
    }
    // Under the old away-from-zero nudge this walked 0.7 -> 0.71 -> 0.72 ...
    expect(grade).toBe(0.7);
    expect(zero).toBe(0);
  });
});

// ==========================================================================
// roundGrade — idempotence (the regression guard for the whole bug class)
// ==========================================================================

describe('roundGrade — idempotence', () => {
  /** Zero, exact values, negatives, .5 ties, and known float-noise cases. */
  const VALUES: readonly number[] = [
    0, -0, 1, -1, 0.5, -0.5, 0.7, 1.23, -1.23, -2, 70, 0.29, 0.701, 1.005, 0.125, 0.375, 0.625,
    0.875, -0.125, 2.5, 3.5, -2.5, 0.694, 0.696, -0.694, 8.575, 1.015, 2.7, -2.1, 2.1, -2.9, 0.999,
    0.3333333333333333, 0.6666666666666666,
  ];

  it('holds for every mode at every dp — rounding a rounded value never moves it', () => {
    // A composed score is rounded ONCE and then compared through `gte`, which
    // rounds again. If rounding is not idempotent that second pass silently
    // moves the grade, which is exactly how `ceil` used to walk a learner up a
    // step per comparison. Enumerated rather than spot-checked because the bug
    // was invisible on the handful of values the suite happened to sample.
    const once: string[] = [];
    const twice: string[] = [];
    for (const mode of MODES) {
      for (const dp of DPS) {
        for (const value of VALUES) {
          const label = `${mode} dp${dp} ${value} ->`;
          const first = roundGrade(value, { mode, dp });
          once.push(`${label} ${first}`);
          twice.push(`${label} ${roundGrade(first, { mode, dp })}`);
        }
      }
    }
    expect(twice).toEqual(once);
  });

  it('is stable under repeated application, not merely on the second pass', () => {
    for (const mode of MODES) {
      const policy: RoundingPolicy = { mode, dp: 2 };
      let value = roundGrade(0.6666666666666666, policy);
      const settled = value;
      for (let pass = 0; pass < 10; pass += 1) {
        value = roundGrade(value, policy);
      }
      expect(value).toBe(settled);
    }
  });
});

// ==========================================================================
// roundGrade — half-even (banker's)
// ==========================================================================

describe('roundGrade — half-even (banker’s)', () => {
  it('sends an exact tie DOWN to the even neighbour', () => {
    // 0.625 * 100 === 62.5 exactly; 62 is even, so the tie floors.
    expect(roundGrade(0.625, { mode: 'half-even', dp: 2 })).toBe(0.62);
    expect(roundGrade(0.5, { mode: 'half-even', dp: 0 })).toBe(0);
  });

  it('sends an exact tie UP to the even neighbour', () => {
    // 0.375 * 100 === 37.5 exactly; 37 is odd, so the tie climbs to 38.
    expect(roundGrade(0.375, { mode: 'half-even', dp: 2 })).toBe(0.38);
  });

  it('picks the even neighbour in both directions for negatives', () => {
    expect(roundGrade(-0.375, { mode: 'half-even', dp: 2 })).toBe(-0.38);
    expect(roundGrade(-0.625, { mode: 'half-even', dp: 2 })).toBe(-0.62);
  });

  it('rounds non-tie values normally, in both directions', () => {
    expect(roundGrade(0.624, { mode: 'half-even', dp: 2 })).toBe(0.62);
    expect(roundGrade(0.626, { mode: 'half-even', dp: 2 })).toBe(0.63);
    expect(roundGrade(2.4, { mode: 'half-even', dp: 0 })).toBe(2);
    expect(roundGrade(2.6, { mode: 'half-even', dp: 0 })).toBe(3);
    expect(roundGrade(-2.4, { mode: 'half-even', dp: 0 })).toBe(-2);
  });

  it('detects EVERY exact tie, not only the float-lucky ones', () => {
    // Regression: the tie test used to run on the epsilon-NUDGED value and
    // compare against that same epsilon, so whether an exact .5 was seen as a
    // tie was decided by float noise — 0.625 was detected, 0.125 was not.
    // half-even silently degraded to half-up for the misses, and only ever in
    // the direction that rounds a learner UP, which is the opposite of why
    // this mode gets chosen. The tie is now detected on the raw value with a
    // tolerance decoupled from the nudge.
    expect(roundGrade(0.125, { mode: 'half-even', dp: 2 })).toBe(0.12);
    expect(roundGrade(0.375, { mode: 'half-even', dp: 2 })).toBe(0.38);
    expect(roundGrade(0.625, { mode: 'half-even', dp: 2 })).toBe(0.62);
    expect(roundGrade(0.875, { mode: 'half-even', dp: 2 })).toBe(0.88);
    expect(roundGrade(2.5, { mode: 'half-even', dp: 0 })).toBe(2);
    expect(roundGrade(3.5, { mode: 'half-even', dp: 0 })).toBe(4);
    expect(roundGrade(-2.5, { mode: 'half-even', dp: 0 })).toBe(-2);
    expect(roundGrade(-0.125, { mode: 'half-even', dp: 2 })).toBe(-0.12);
  });

  it('leaves a value already exact at dp alone', () => {
    expect(roundGrade(0.7, { mode: 'half-even', dp: 2 })).toBe(0.7);
    expect(roundGrade(-1.23, { mode: 'half-even', dp: 2 })).toBe(-1.23);
    expect(roundGrade(0, { mode: 'half-even', dp: 2 })).toBe(0);
  });
});

// ==========================================================================
// roundGrade — zero and non-finite results
// ==========================================================================

describe('roundGrade — zero results on every mode', () => {
  it('returns a plain positive zero from each rounding mode', () => {
    // Exercises the -0 normalisation on every return path, and pins that a
    // grade of zero is always a plain 0 whichever mode produced it.
    for (const mode of MODES) {
      const result = roundGrade(mode === 'ceil' ? -0.4 : 0.4, { mode, dp: 0 });
      expect(Object.is(result, 0)).toBe(true);
    }
    // half-even reaches zero down its TIE branch too, which is a separate
    // return path from the non-tie one exercised above.
    expect(Object.is(roundGrade(0.5, { mode: 'half-even', dp: 0 }), 0)).toBe(true);
  });
});

describe('roundGrade — non-finite input', () => {
  it('returns NaN and both infinities unchanged rather than fabricating a number', () => {
    expect(roundGrade(Number.NaN, { mode: 'half-up', dp: 2 })).toBeNaN();
    expect(roundGrade(Number.POSITIVE_INFINITY, { mode: 'half-up', dp: 2 })).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(roundGrade(Number.NEGATIVE_INFINITY, { mode: 'floor', dp: 0 })).toBe(
      Number.NEGATIVE_INFINITY,
    );
  });
});

// ==========================================================================
// gte
// ==========================================================================

describe('gte', () => {
  it('rounds BOTH sides, so a value the learner is shown as 0.7 reaches 0.7', () => {
    expect(gte(0.696, 0.7, HALF_UP_2)).toBe(true);
  });

  it('is false for a value that is genuinely below the threshold once rounded', () => {
    expect(gte(0.694, 0.7, HALF_UP_2)).toBe(false);
  });

  it('is true for equal values', () => {
    expect(gte(0.7, 0.7, HALF_UP_2)).toBe(true);
  });

  it('rounds the THRESHOLD too, not just the value', () => {
    // Threshold 0.696 rounds to 0.70; a raw 0.7 still reaches it.
    expect(gte(0.7, 0.696, HALF_UP_2)).toBe(true);
  });

  it('does not move a value that is already exact under a ceil policy', () => {
    // With the old nudge, `ceil` pushed the value to 0.71 and the threshold to
    // 0.71 as well — the comparison happened to survive, but the number the
    // learner was shown did not. Both sides now stay put.
    const policy: RoundingPolicy = { mode: 'ceil', dp: 2 };
    expect(gte(0.7, 0.7, policy)).toBe(true);
    expect(gte(0.69, 0.7, policy)).toBe(false);
    expect(roundGrade(0.7, policy)).toBe(0.7);
  });
});

// ==========================================================================
// classifyBand
// ==========================================================================

describe('classifyBand', () => {
  const BANDS: Band[] = [
    { name: 'A2', min: 0.4 },
    { name: 'B1', min: 0.6 },
  ];

  it('picks the HIGHEST band whose minimum is reached', () => {
    expect(classifyBand(0.85, BANDS)).toEqual({ name: 'B1', min: 0.6 });
  });

  it('floors rather than rounding up to a boundary', () => {
    // 0.59 would be "0.6" to a learner shown one decimal place, but placing
    // someone above their real level is the more harmful error.
    expect(classifyBand(0.59, BANDS)).toEqual({ name: 'A2', min: 0.4 });
  });

  it('selects the band a value sits exactly on', () => {
    expect(classifyBand(0.6, BANDS)).toEqual({ name: 'B1', min: 0.6 });
    expect(classifyBand(0.4, BANDS)).toEqual({ name: 'A2', min: 0.4 });
  });

  it('returns null when no band minimum is reached', () => {
    expect(classifyBand(0.39, BANDS)).toBeNull();
  });

  it('returns null for an empty band list', () => {
    expect(classifyBand(0.9, [])).toBeNull();
  });

  it('does not depend on band order', () => {
    const unordered: Band[] = [
      { name: 'B1', min: 0.6 },
      { name: 'A1', min: 0.2 },
      { name: 'A2', min: 0.4 },
    ];
    expect(classifyBand(0.7, unordered)).toEqual({ name: 'B1', min: 0.6 });
    expect(classifyBand(0.45, unordered)).toEqual({ name: 'A2', min: 0.4 });
    expect(classifyBand(0.2, unordered)).toEqual({ name: 'A1', min: 0.2 });
  });
});

describe('computePassThreshold — opt-in rounded comparison', () => {
  const activity = {
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'x',
    title: 't',
    question: 'q',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [],
    passThreshold: 0.7,
  } as unknown as ActivityData;

  it('defaults to the exact raw comparison, unchanged', () => {
    // 0.696 displays as 70% but is below 0.7 raw. Historical behaviour is
    // preserved unless a policy is passed, because switching this on changes
    // item-level pass/fail for scores inside the rounding band.
    expect(computePassThreshold(activity, 0.696)).toBe(false);
    expect(computePassThreshold(activity, 0.7)).toBe(true);
  });

  it('compares both sides rounded when a policy is supplied', () => {
    expect(computePassThreshold(activity, 0.696, { mode: 'half-up', dp: 2 })).toBe(true);
  });

  it('still fails a score genuinely below the threshold', () => {
    expect(computePassThreshold(activity, 0.68, { mode: 'half-up', dp: 2 })).toBe(false);
  });
});
