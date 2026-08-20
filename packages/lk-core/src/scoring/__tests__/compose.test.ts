import { describe, expect, it } from 'vitest';
import { outcomeFromGrade } from '../../grading.js';
import type { ItemOutcome } from '../../types/activity.js';
import type { GradeRecord } from '../../types/grading.js';
import {
  type AssessmentScore,
  type AssessmentSectionInput,
  type CompositionPolicy,
  composeAssessmentScore,
  type ScoredItem,
} from '../compose.js';
import type { RoundingPolicy } from '../rounding.js';

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const HALF_UP_2: RoundingPolicy = { mode: 'half-up', dp: 2 };

/** A synchronously scored outcome. `maxScore` defaults to the SDK's 1. */
const scored = (score: number, maxScore = 1): ItemOutcome => ({
  status: 'scored',
  score,
  maxScore,
  passed: score / (maxScore || 1) >= 0.7,
  feedback: null,
  details: [],
});

/** An outcome carrying a grade that came back from an async grader. */
const graded = (score: number): ItemOutcome => {
  const record: GradeRecord = {
    score,
    maxScore: 1,
    passed: score >= 0.7,
    feedback: null,
    grader: { kind: 'human', id: 'marker-1' },
  };
  return outcomeFromGrade(record);
};

/** Awaiting an asynchronous grade — a grade IS coming. */
const deferred = (): ItemOutcome => ({
  status: 'deferred',
  reason: 'requires_async_grading',
  maxScore: 1,
});

/** No grade will ever exist for this item. */
const unscorable = (): ItemOutcome => ({
  status: 'unscorable',
  reason: 'Activity type "drag-and-drop" is not registered',
  maxScore: 1,
});

const item = (slotId: string, points: number, outcome: ItemOutcome): ScoredItem => ({
  slotId,
  points,
  outcome,
});

const section = (
  id: string,
  weight: number,
  items: ScoredItem[],
  over: Partial<AssessmentSectionInput> = {},
): AssessmentSectionInput => ({ id, weight, items, ...over });

const policy = (over: Partial<CompositionPolicy> = {}): CompositionPolicy => ({
  passThreshold: 0.7,
  rounding: HALF_UP_2,
  ...over,
});

/**
 * The breakdown a client renders from `sections[]`: the sum a UI would compute
 * from the per-section numbers it was handed.
 */
const breakdownTotal = (result: AssessmentScore): number =>
  result.sections.reduce((sum, entry) => sum + entry.score * entry.normalizedWeight, 0);

// ==========================================================================
// Weights
// ==========================================================================

describe('composeAssessmentScore — weight normalisation', () => {
  it('normalises weights by their sum, so 2/3 behaves exactly like 0.4/0.6', () => {
    // Section A scores 1.0, section B scores 0.5.
    // Weights 2 and 3 normalise to 0.4 and 0.6:
    //   total = 1.0 * 0.4 + 0.5 * 0.6 = 0.4 + 0.3 = 0.70
    const sections = (wA: number, wB: number): AssessmentSectionInput[] => [
      section('a', wA, [item('a1', 1, scored(1))]),
      section('b', wB, [item('b1', 1, scored(0.5))]),
    ];

    const raw = composeAssessmentScore(sections(2, 3), policy());
    const proportional = composeAssessmentScore(sections(0.4, 0.6), policy());

    expect(raw.score).toBe(0.7);
    expect(proportional.score).toBe(0.7);
    expect(raw.sections.map((s) => s.normalizedWeight)).toEqual([0.4, 0.6]);
    expect(proportional.sections.map((s) => s.normalizedWeight)).toEqual([0.4, 0.6]);
  });

  it('reports a zero normalized weight when every weight is zero', () => {
    const result = composeAssessmentScore(
      [section('a', 0, [item('a1', 1, scored(1))])],
      policy({ passThreshold: 0 }),
    );
    expect(result.sections[0]?.normalizedWeight).toBe(0);
    // Nothing carries weight, so nothing contributes to the total.
    expect(result.score).toBe(0);
  });

  it('carries an authored title through and omits the key entirely when absent', () => {
    const result = composeAssessmentScore(
      [
        section('a', 1, [item('a1', 1, scored(1))], { title: 'Reading' }),
        section('b', 1, [item('b1', 1, scored(1))]),
      ],
      policy(),
    );
    expect(result.sections[0]?.title).toBe('Reading');
    expect(Object.hasOwn(result.sections[1] ?? {}, 'title')).toBe(false);
  });
});

// ==========================================================================
// normalizedWeight is the LIVE weight, and the invariant that rests on it
// ==========================================================================

describe('composeAssessmentScore — normalizedWeight is the live weight', () => {
  it('gives a section with nothing graded a live weight of 0 and renormalises the rest', () => {
    const result = composeAssessmentScore(
      [section('a', 2, [item('a1', 1, scored(1))]), section('b', 3, [item('b1', 1, deferred())])],
      policy(),
    );

    // `weight` still reports what the author wrote, verbatim.
    expect(result.sections.map((s) => s.weight)).toEqual([2, 3]);
    // `normalizedWeight` reports the weight ACTUALLY used. Section B has
    // nothing graded, so it carries none of it and A carries all of it — NOT
    // the 0.4 / 0.6 that weight / sum(all weights) would report, which would
    // have made the breakdown add up to 0.4 against a recorded 1.0.
    expect(result.sections.map((s) => s.normalizedWeight)).toEqual([1, 0]);
    expect(result.score).toBe(1);
  });

  it('reports 0 for a section whose only items can never be graded', () => {
    const result = composeAssessmentScore(
      [
        section('a', 1, [item('a1', 1, scored(0.8))]),
        section('b', 1, [item('b1', 1, unscorable())]),
      ],
      policy(),
    );
    expect(result.sections[1]?.normalizedWeight).toBe(0);
    expect(result.sections[0]?.normalizedWeight).toBe(1);
    expect(result.score).toBe(0.8);
  });

  describe('sum(score * normalizedWeight) === score', () => {
    const SHAPES: ReadonlyArray<{
      name: string;
      sections: AssessmentSectionInput[];
      policy?: Partial<CompositionPolicy>;
    }> = [
      {
        name: 'an empty section beside a graded one',
        sections: [section('empty', 1, []), section('a', 1, [item('a1', 1, scored(1))])],
      },
      {
        name: 'a graded section beside a fully deferred one',
        sections: [
          section('a', 1, [item('a1', 4, scored(0.8))]),
          section('b', 1, [item('b1', 4, deferred()), item('b2', 4, deferred())]),
        ],
      },
      {
        name: 'two graded sections weighted 2 and 3',
        sections: [
          section('a', 2, [item('a1', 1, scored(1))]),
          section('b', 3, [item('b1', 1, scored(0.5))]),
        ],
      },
      {
        name: 'three sections of equal weight where one is empty',
        sections: [
          section('a', 1, [item('a1', 1, scored(1))]),
          section('b', 1, [item('b1', 1, scored(0.5))]),
          section('c', 1, []),
        ],
      },
      {
        name: 'an assessment where nothing can ever be graded',
        sections: [
          section('a', 1, [item('a1', 1, unscorable())]),
          section('b', 2, [item('b1', 1, unscorable())]),
        ],
      },
      {
        name: 'a single section carrying every point',
        sections: [section('a', 1, [item('a1', 3, scored(1)), item('a2', 1, scored(0))])],
      },
      {
        name: 'sections mixing pending AND unscorable slots',
        sections: [
          section('a', 2, [item('a1', 1, scored(1)), item('a2', 1, deferred())]),
          section('b', 3, [item('b1', 1, scored(0.5)), item('b2', 1, unscorable())]),
        ],
      },
      {
        name: 'sections whose weights are all zero',
        sections: [
          section('a', 0, [item('a1', 1, scored(1))]),
          section('b', 0, [item('b1', 1, scored(0.5))]),
        ],
        policy: { passThreshold: 0 },
      },
      {
        name: 'every section still awaiting a grade',
        sections: [
          section('a', 1, [item('a1', 2, deferred())]),
          section('b', 2, [item('b1', 3, deferred())]),
        ],
      },
      {
        name: 'an empty sections array',
        sections: [],
      },
      {
        name: 'a section scored against a maxScore that is not 1',
        sections: [
          section('a', 1, [item('a1', 4, scored(8.5, 10))]),
          section('b', 1, [item('b1', 2, scored(0.85))]),
        ],
      },
    ];

    for (const shape of SHAPES) {
      it(`holds for ${shape.name}`, () => {
        // This is the contract that lets a client render the breakdown from
        // `sections[]` and agree with the recorded grade. It only holds
        // because `normalizedWeight` is the LIVE weight; under weight / sum(all)
        // the two numbers diverge the moment anything is ungraded.
        const result = composeAssessmentScore(shape.sections, policy(shape.policy ?? {}));
        expect(Math.abs(breakdownTotal(result) - result.score)).toBeLessThan(1e-12);
      });
    }

    it('is exact only up to the final rounding of the total', () => {
      // The honest boundary of the invariant, pinned so nobody reads it as
      // unconditional. Each section score is rounded and the TOTAL is rounded,
      // but the weighted sum of rounded section scores is not itself a rounded
      // value — so when it lands between two quanta the breakdown a client
      // computes and the grade the SDK records differ by up to half a quantum.
      // 0.85 and 1.00 at equal weight sum to 0.925, recorded as 0.93.
      const result = composeAssessmentScore(
        [
          section('a', 1, [item('a1', 4, scored(8.5, 10))]),
          section('b', 1, [item('b1', 2, scored(1))]),
        ],
        policy(),
      );

      expect(result.sections.map((s) => s.score)).toEqual([0.85, 1]);
      expect(breakdownTotal(result)).toBeCloseTo(0.925, 12);
      expect(result.score).toBe(0.93);
      // Bounded by half a quantum at the policy's dp — never more than that.
      expect(Math.abs(breakdownTotal(result) - result.score)).toBeLessThanOrEqual(0.005 + 1e-12);
    });
  });
});

// ==========================================================================
// Per-item points
// ==========================================================================

describe('composeAssessmentScore — per-item points', () => {
  it('weights a 3-point item three times as heavily as a 1-point item', () => {
    // 3 earned of 4 gradable points = 0.75, NOT the 0.5 equal weighting gives.
    const result = composeAssessmentScore(
      [section('a', 1, [item('big', 3, scored(1)), item('small', 1, scored(0))])],
      policy(),
    );
    expect(result.sections[0]?.earnedPoints).toBe(3);
    expect(result.sections[0]?.gradedMaxPoints).toBe(4);
    expect(result.sections[0]?.score).toBe(0.75);
  });

  it('normalises an outcome whose maxScore is not 1 against the item points', () => {
    // 8.5 / 10 of a 4-point slot = 3.4 earned of 4 = 0.85.
    const result = composeAssessmentScore(
      [section('a', 1, [item('essay', 4, scored(8.5, 10))])],
      policy(),
    );
    expect(result.sections[0]?.earnedPoints).toBeCloseTo(3.4, 10);
    expect(result.sections[0]?.score).toBe(0.85);
  });

  it('treats a non-positive maxScore as 1 instead of dividing by zero', () => {
    const result = composeAssessmentScore(
      [section('a', 1, [item('odd', 2, scored(0.5, 0))])],
      policy(),
    );
    expect(result.sections[0]?.earnedPoints).toBe(1);
    expect(result.sections[0]?.score).toBe(0.5);
    expect(Number.isFinite(result.score)).toBe(true);
  });
});

// ==========================================================================
// Outcome kinds — the three states an item can be in
// ==========================================================================

describe('composeAssessmentScore — outcome kinds', () => {
  it('counts scored and graded, and excludes deferred and unscorable from the denominator', () => {
    // Gradable: scored 1.0 (1 pt) + graded 0.6 (1 pt) = 1.6 of 2 = 0.80.
    // The deferred and unscorable slots are NOT zeros in the denominator.
    const result = composeAssessmentScore(
      [
        section('a', 1, [
          item('s', 1, scored(1)),
          item('g', 1, graded(0.6)),
          item('d', 1, deferred()),
          item('u', 1, unscorable()),
        ]),
      ],
      policy(),
    );

    const first = result.sections[0];
    expect(first?.earnedPoints).toBeCloseTo(1.6, 10);
    expect(first?.gradedMaxPoints).toBe(2);
    expect(first?.score).toBe(0.8);
    // Counted as zeros the score would have been 1.6 / 4 = 0.40.
    expect(first?.score).not.toBe(0.4);
    // The two exclusions are reported SEPARATELY: one is work still coming,
    // the other is work that will never arrive.
    expect(first?.pendingSlotIds).toEqual(['d']);
    expect(first?.unscorableSlotIds).toEqual(['u']);
    expect(result.pendingSlotIds).toEqual(['d']);
    expect(result.unscorableSlotIds).toEqual(['u']);
    // A grade IS still coming for 'd', so the attempt is not final.
    expect(result.status).toBe('provisional');
  });

  it('does NOT hold the result provisional for an item that can never be graded', () => {
    // Regression: `unscorable` used to be folded into `pendingSlotIds` and so
    // pinned the attempt at `provisional` forever. `evaluate()` returns that
    // status precisely so a mixed-version content bank does not crash an exam
    // — an attempt containing one still has to be recordable.
    const result = composeAssessmentScore(
      [section('a', 1, [item('s', 1, scored(1)), item('u', 1, unscorable())])],
      policy(),
    );

    expect(result.status).toBe('final');
    expect(result.unscorableSlotIds).toEqual(['u']);
    expect(result.pendingSlotIds).toEqual([]);
    expect(result.sections[0]?.unscorableSlotIds).toEqual(['u']);
    expect(result.sections[0]?.pendingSlotIds).toEqual([]);
    // Excluded from the denominator, not counted as a zero: 1 of 1, not 1 of 2.
    expect(result.sections[0]?.gradedMaxPoints).toBe(1);
    expect(result.sections[0]?.maxPoints).toBe(2);
    expect(result.score).toBe(1);
    // Being final, it carries a real verdict rather than `null`.
    expect(result.passed).toBe(true);
    expect(result.passFailureReason).toBeNull();
  });

  it('distinguishes maxPoints (all points) from gradedMaxPoints (gradable points)', () => {
    const result = composeAssessmentScore(
      [section('a', 1, [item('mcq', 2, scored(1)), item('essay', 3, deferred())])],
      policy(),
    );
    expect(result.sections[0]?.maxPoints).toBe(5);
    expect(result.sections[0]?.gradedMaxPoints).toBe(2);
    expect(result.sections[0]?.maxPoints).not.toBe(result.sections[0]?.gradedMaxPoints);
  });

  it('lists pending and unscorable slots across sections in section-then-item order', () => {
    const result = composeAssessmentScore(
      [
        section('a', 1, [item('a1', 1, deferred()), item('a2', 1, scored(1))]),
        section('b', 1, [item('b1', 1, unscorable())]),
        section('c', 1, [item('c1', 1, deferred()), item('c2', 1, unscorable())]),
      ],
      policy(),
    );
    expect(result.pendingSlotIds).toEqual(['a1', 'c1']);
    expect(result.unscorableSlotIds).toEqual(['b1', 'c2']);
    expect(result.sections[0]?.pendingSlotIds).toEqual(['a1']);
    expect(result.sections[0]?.unscorableSlotIds).toEqual([]);
    expect(result.sections[1]?.pendingSlotIds).toEqual([]);
    expect(result.sections[1]?.unscorableSlotIds).toEqual(['b1']);
    expect(result.sections[2]?.pendingSlotIds).toEqual(['c1']);
    expect(result.sections[2]?.unscorableSlotIds).toEqual(['c2']);
  });
});

// ==========================================================================
// The provisional total and the provisional verdict
// ==========================================================================

describe('composeAssessmentScore — the provisional total', () => {
  it('reports the graded section’s own score, not a total deflated by the ungraded one', () => {
    // Section A (weight 1) is fully graded at 0.80. Section B (weight 1) is
    // entirely awaiting a grade. The honest score-so-far is 0.80 — treating
    // B as a zero would report 0.40 for work nobody has looked at.
    const result = composeAssessmentScore(
      [
        section('a', 1, [item('a1', 4, scored(0.8))]),
        section('b', 1, [item('b1', 4, deferred()), item('b2', 4, deferred())]),
      ],
      policy({ passThreshold: 0.7 }),
    );

    expect(result.score).toBe(0.8);
    expect(result.score).not.toBe(0.4);
    expect(result.status).toBe('provisional');
    expect(result.pendingSlotIds).toEqual(['b1', 'b2']);
    expect(result.sections[1]?.score).toBe(0);
    expect(result.sections[1]?.gradedMaxPoints).toBe(0);
  });

  it('is final with an empty pending list once every item carries a grade', () => {
    const result = composeAssessmentScore(
      [section('a', 1, [item('a1', 1, scored(1))]), section('b', 1, [item('b1', 1, graded(0.8))])],
      policy(),
    );
    expect(result.status).toBe('final');
    expect(result.pendingSlotIds).toEqual([]);
    expect(result.unscorableSlotIds).toEqual([]);
    expect(result.score).toBe(0.9);
  });

  it('does not throw when NOTHING has been graded, and scores 0 provisionally', () => {
    const run = () =>
      composeAssessmentScore(
        [
          section('a', 1, [item('a1', 2, deferred())]),
          section('b', 2, [item('b1', 3, deferred())]),
        ],
        policy(),
      );

    expect(run).not.toThrow();
    const result = run();
    expect(result.score).toBe(0);
    expect(result.status).toBe('provisional');
    expect(result.pendingSlotIds).toEqual(['a1', 'b1']);
  });
});

describe('composeAssessmentScore — the provisional verdict', () => {
  it('reports passed and passFailureReason as null, never a verdict, while provisional', () => {
    // An attempt with unmarked work has neither passed nor failed. Returning
    // `false` here let a UI keyed on `passed` show a fail for an essay nobody
    // has looked at; returning `true` recorded a pass that later work could
    // still overturn. `null` is the only honest answer.
    const aboveThreshold = composeAssessmentScore(
      [section('a', 1, [item('a1', 4, scored(0.8))]), section('b', 1, [item('b1', 4, deferred())])],
      policy({ passThreshold: 0.7 }),
    );
    expect(aboveThreshold.status).toBe('provisional');
    expect(aboveThreshold.score).toBe(0.8);
    expect(aboveThreshold.passed).toBeNull();
    expect(aboveThreshold.passFailureReason).toBeNull();

    const belowThreshold = composeAssessmentScore(
      [section('a', 1, [item('a1', 4, scored(0.2))]), section('b', 1, [item('b1', 4, deferred())])],
      policy({ passThreshold: 0.7, sectionThreshold: 0.7 }),
    );
    expect(belowThreshold.status).toBe('provisional');
    expect(belowThreshold.passed).toBeNull();
    expect(belowThreshold.passFailureReason).toBeNull();
    // The per-SECTION verdict is still reported — only the overall one is held.
    expect(belowThreshold.sections[0]?.passed).toBe(false);
  });

  it('resolves to a real verdict once the outstanding grade arrives', () => {
    const sections = (b: ItemOutcome): AssessmentSectionInput[] => [
      section('a', 1, [item('a1', 4, scored(0.8))]),
      section('b', 1, [item('b1', 4, b)]),
    ];

    const before = composeAssessmentScore(sections(deferred()), policy({ passThreshold: 0.7 }));
    const after = composeAssessmentScore(sections(graded(0.9)), policy({ passThreshold: 0.7 }));

    expect(before.passed).toBeNull();
    expect(after.status).toBe('final');
    expect(after.passed).toBe(true);
    expect(after.passFailureReason).toBeNull();
    expect(after.score).toBe(0.85);
  });
});

// ==========================================================================
// Thresholds
// ==========================================================================

describe('composeAssessmentScore — section thresholds', () => {
  it('applies sectionThreshold to every section and reports it as appliedThreshold', () => {
    const result = composeAssessmentScore(
      [
        section('a', 1, [item('a1', 1, scored(0.8))]),
        section('b', 1, [item('b1', 1, scored(0.4))]),
      ],
      policy({ passThreshold: 0.5, sectionThreshold: 0.5 }),
    );
    expect(result.sections.map((s) => s.appliedThreshold)).toEqual([0.5, 0.5]);
    expect(result.sections.map((s) => s.passed)).toEqual([true, false]);
  });

  it('lets passThresholdOverride override the section threshold for that section only', () => {
    const result = composeAssessmentScore(
      [
        section('a', 1, [item('a1', 1, scored(0.8))], { passThresholdOverride: 0.9 }),
        section('b', 1, [item('b1', 1, scored(0.8))]),
      ],
      policy({ passThreshold: 0.5, sectionThreshold: 0.5 }),
    );
    expect(result.sections.map((s) => s.appliedThreshold)).toEqual([0.9, 0.5]);
    // Same 0.80 score, different verdicts — the override is honoured.
    expect(result.sections.map((s) => s.passed)).toEqual([false, true]);
  });

  it('reports a null appliedThreshold when neither is set, and then always passes', () => {
    const result = composeAssessmentScore(
      [section('a', 1, [item('a1', 1, scored(0))])],
      policy({ passThreshold: 0 }),
    );
    expect(result.sections[0]?.appliedThreshold).toBeNull();
    expect(result.sections[0]?.score).toBe(0);
    expect(result.sections[0]?.passed).toBe(true);
  });

  it('does NOT fail a section that has nothing graded yet', () => {
    const result = composeAssessmentScore(
      [section('a', 1, [item('a1', 1, scored(1))]), section('b', 1, [item('b1', 1, unscorable())])],
      policy({ passThreshold: 0.5, sectionThreshold: 0.9 }),
    );
    const ungraded = result.sections[1];
    expect(ungraded?.gradedMaxPoints).toBe(0);
    expect(ungraded?.score).toBe(0);
    expect(ungraded?.appliedThreshold).toBe(0.9);
    // A 0 that only means "never gradable" must not be judged against 0.9.
    expect(ungraded?.passed).toBe(true);
    expect(result.status).toBe('final');
    expect(result.passed).toBe(true);
  });

  it('compares the section score against its threshold AFTER rounding', () => {
    // 0.696 rounds to 0.70 and therefore reaches a 0.70 section threshold.
    const result = composeAssessmentScore(
      [section('a', 1, [item('a1', 1, scored(0.696))])],
      policy({ passThreshold: 0.7, sectionThreshold: 0.7 }),
    );
    expect(result.sections[0]?.score).toBe(0.7);
    expect(result.sections[0]?.passed).toBe(true);
    expect(result.passed).toBe(true);
  });
});

// ==========================================================================
// Pass / failure reasons — every value, on a FINAL result
// ==========================================================================

describe('composeAssessmentScore — passFailureReason', () => {
  it('is null when the attempt passes', () => {
    const result = composeAssessmentScore(
      [section('a', 1, [item('a1', 1, scored(1))])],
      policy({ passThreshold: 0.5, sectionThreshold: 0.5 }),
    );
    expect(result.status).toBe('final');
    expect(result.passed).toBe(true);
    expect(result.passFailureReason).toBeNull();
  });

  it('is "overall_below_threshold" when the total misses but every section passes', () => {
    // No sectionThreshold, so no section can fail.
    const result = composeAssessmentScore(
      [section('a', 1, [item('a1', 1, scored(0.5))])],
      policy({ passThreshold: 0.9 }),
    );
    expect(result.score).toBe(0.5);
    expect(result.sections.every((s) => s.passed)).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.passFailureReason).toBe('overall_below_threshold');
  });

  it('is "section_below_threshold" when the total passes but a section does not', () => {
    // total = 1.0 * 0.5 + 0.4 * 0.5 = 0.70, which clears passThreshold 0.6,
    // but section B's 0.40 misses the 0.5 section threshold.
    const result = composeAssessmentScore(
      [section('a', 1, [item('a1', 1, scored(1))]), section('b', 1, [item('b1', 1, scored(0.4))])],
      policy({ passThreshold: 0.6, sectionThreshold: 0.5 }),
    );
    expect(result.score).toBe(0.7);
    expect(result.passed).toBe(false);
    expect(result.passFailureReason).toBe('section_below_threshold');
  });

  it('is "both" when the total misses AND a section misses', () => {
    const result = composeAssessmentScore(
      [section('a', 1, [item('a1', 1, scored(1))]), section('b', 1, [item('b1', 1, scored(0.4))])],
      policy({ passThreshold: 0.9, sectionThreshold: 0.9 }),
    );
    expect(result.score).toBe(0.7);
    expect(result.passed).toBe(false);
    expect(result.passFailureReason).toBe('both');
  });
});

// ==========================================================================
// Degenerate inputs
// ==========================================================================

describe('composeAssessmentScore — degenerate inputs', () => {
  it('handles an empty sections array without throwing', () => {
    const result = composeAssessmentScore([], policy({ passThreshold: 0.5 }));
    expect(result.sections).toEqual([]);
    expect(result.score).toBe(0);
    expect(result.status).toBe('final');
    expect(result.pendingSlotIds).toEqual([]);
    expect(result.unscorableSlotIds).toEqual([]);
    // No gradable work means NO VERDICT, not a fail at 0%. Returning false
    // here would record a fail for a learner whose work was never gradable.
    expect(result.passed).toBeNull();
    expect(result.passFailureReason).toBeNull();
  });

  it('reaches no verdict on an empty assessment, whatever the threshold', () => {
    // Even a threshold of 0 does not manufacture a pass out of no evidence.
    expect(composeAssessmentScore([], policy({ passThreshold: 0 })).passed).toBeNull();
    expect(composeAssessmentScore([], policy({ passThreshold: 0.7 })).passed).toBeNull();
  });

  it('reaches no verdict when every item is unscorable', () => {
    const result = composeAssessmentScore(
      [section('s', 1, [item('u1', 1, unscorable()), item('u2', 1, unscorable())])],
      policy({ passThreshold: 0.7 }),
    );
    // 'final' — nothing is coming — but there is no basis for pass or fail.
    expect(result.status).toBe('final');
    expect(result.unscorableSlotIds).toEqual(['u1', 'u2']);
    expect(result.passed).toBeNull();
    expect(result.passFailureReason).toBeNull();
  });

  it('handles a section with zero items — no points, nothing pending, still final', () => {
    const result = composeAssessmentScore(
      [section('empty', 1, []), section('a', 1, [item('a1', 1, scored(1))])],
      policy({ passThreshold: 0.5 }),
    );
    const empty = result.sections[0];
    expect(empty?.maxPoints).toBe(0);
    expect(empty?.gradedMaxPoints).toBe(0);
    expect(empty?.earnedPoints).toBe(0);
    expect(empty?.score).toBe(0);
    expect(empty?.pendingSlotIds).toEqual([]);
    expect(empty?.unscorableSlotIds).toEqual([]);
    expect(empty?.normalizedWeight).toBe(0);
    // An empty section has nothing pending, so the result is final, and it
    // does not drag the total down: only section 'a' contributes.
    expect(result.status).toBe('final');
    expect(result.score).toBe(1);
  });
});
