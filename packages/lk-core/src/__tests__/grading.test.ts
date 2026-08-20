import { describe, expect, it } from 'vitest';
import {
  type GradeFromRubricOptions,
  gradeFromRubric,
  hasGrade,
  outcomeFromGrade,
} from '../grading.js';
import { evaluate } from '../scoring/index.js';
import type {
  ItemOutcome,
  WrittenResponseData,
  WrittenResponseLearnerResponse,
} from '../types/activity.js';
import type { CriterionScore, GradeRecord } from '../types/grading.js';

// ---------------------------------------------------------------------------
// Fixtures & narrowing helpers
// ---------------------------------------------------------------------------

type RubricResult = ReturnType<typeof gradeFromRubric>;
type Unscorable = Extract<RubricResult, { unscorable: true }>;

/** Asserts the `GradeRecord` arm and returns it narrowed. */
function expectRecord(result: RubricResult): GradeRecord {
  if ('unscorable' in result) {
    throw new Error(`expected a GradeRecord, got unscorable: ${result.reason}`);
  }
  return result;
}

/** Asserts the `unscorable` arm and returns it narrowed. */
function expectUnscorable(result: RubricResult): Unscorable {
  if (!('unscorable' in result)) {
    throw new Error(`expected unscorable, got a score of ${result.score}`);
  }
  return result;
}

/** Convenience: score `criteria` and return the record, failing on `unscorable`. */
function grade(
  criteria: readonly CriterionScore[],
  activityData?: WrittenResponseData,
  options?: GradeFromRubricOptions,
): GradeRecord {
  return expectRecord(gradeFromRubric(criteria, activityData, options));
}

const NO_NUMERIC_SCORE =
  'No criterion carried a numeric score, so no weighted total can be computed.';
const ZERO_WEIGHT =
  'Criterion weights do not sum to a positive number, so the weighted total is undefined.';

const wr = (over: Partial<WrittenResponseData> = {}): WrittenResponseData => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'w1',
  title: 'Holiday essay',
  prompt: 'Describe your last holiday.',
  minWords: 5,
  maxWords: 100,
  ...over,
});

const wrResponse = (text: string, wordCount = 0): WrittenResponseLearnerResponse => ({
  type: 'written-response',
  text,
  wordCount,
});

const scoredOutcome = (): ItemOutcome => ({
  status: 'scored',
  score: 0.8,
  maxScore: 1,
  passed: true,
  feedback: null,
  details: [],
});

const deferredOutcome = (): ItemOutcome => ({
  status: 'deferred',
  reason: 'requires_async_grading',
  maxScore: 1,
});

const unscorableOutcome = (): ItemOutcome => ({
  status: 'unscorable',
  reason: 'Activity type "mystery" is not registered',
  maxScore: 1,
});

// ---------------------------------------------------------------------------
// gradeFromRubric() — weighted arithmetic
// ---------------------------------------------------------------------------

describe('gradeFromRubric() weighted arithmetic', () => {
  it('averages equal-weight criteria', () => {
    // (0.5·1 + 0.75·1 + 0.25·1) / 3 = 1.5 / 3 = 0.5
    const record = grade([
      { name: 'Task', score: 0.5, weight: 1 },
      { name: 'Grammar', score: 0.75, weight: 1 },
      { name: 'Range', score: 0.25, weight: 1 },
    ]);

    expect(record.score).toBe(0.5);
    expect(record.maxScore).toBe(1);
  });

  it('applies unequal weights (2 / 1.5 / 1.5) exactly', () => {
    // numerator   = 1·2 + 0.5·1.5 + 0.25·1.5 = 2 + 0.75 + 0.375 = 3.125
    // denominator = 2 + 1.5 + 1.5 = 5
    // total       = 3.125 / 5 = 0.625
    const record = grade([
      { name: 'Task achievement', score: 1, weight: 2 },
      { name: 'Coherence', score: 0.5, weight: 1.5 },
      { name: 'Lexical resource', score: 0.25, weight: 1.5 },
    ]);

    expect(record.score).toBe(0.625);
    // The unweighted mean would be (1 + 0.5 + 0.25) / 3 ≈ 0.5833 — weights matter.
    expect(record.score).not.toBeCloseTo((1 + 0.5 + 0.25) / 3, 10);
  });

  it('normalises by the weight sum, so weights need not add to 1', () => {
    // numerator   = 1·2 + 0.5·3 + 0.25·5 = 2 + 1.5 + 1.25 = 4.75
    // denominator = 10  ->  0.475
    const record = grade([
      { name: 'A', score: 1, weight: 2 },
      { name: 'B', score: 0.5, weight: 3 },
      { name: 'C', score: 0.25, weight: 5 },
    ]);

    expect(record.score).toBe(0.475);
    // Without normalisation the "total" would be the raw numerator, 4.75.
    expect(record.score).toBeLessThanOrEqual(1);
  });

  it('is invariant under a proportional rescale of every weight', () => {
    const halved = grade([
      { name: 'A', score: 1, weight: 1 },
      { name: 'B', score: 0.5, weight: 1.5 },
      { name: 'C', score: 0.25, weight: 2.5 },
    ]);
    const doubled = grade([
      { name: 'A', score: 1, weight: 2 },
      { name: 'B', score: 0.5, weight: 3 },
      { name: 'C', score: 0.25, weight: 5 },
    ]);

    expect(halved.score).toBe(doubled.score);
    expect(halved.score).toBe(0.475);
  });

  it('returns a single criterion’s own score regardless of its weight', () => {
    expect(grade([{ name: 'Only', score: 0.42 }]).score).toBe(0.42);
    expect(grade([{ name: 'Only', score: 0.5, weight: 7 }]).score).toBe(0.5);
    expect(grade([{ name: 'Only', score: 0.5, weight: 0.001 }]).score).toBe(0.5);
  });

  it('defaults an omitted weight to 1', () => {
    // (0.5·1 + 1·3) / (1 + 3) = 3.5 / 4 = 0.875
    const record = grade([
      { name: 'Unweighted', score: 0.5 },
      { name: 'Weighted', score: 1, weight: 3 },
    ]);

    expect(record.score).toBe(0.875);
    // Treating the omitted weight as 0 would give 1; as 3 would give 0.75.
    expect(record.score).not.toBe(1);
    expect(record.score).not.toBe(0.75);
  });

  it('reduces to the plain mean when no criterion declares a weight', () => {
    const record = grade([
      { name: 'A', score: 0.25 },
      { name: 'B', score: 0.75 },
    ]);

    expect(record.score).toBe(0.5);
  });

  it('treats a score of 0 as a real judgement, not a missing one', () => {
    // (0·1 + 1·1) / 2 = 0.5 — the zero is in BOTH numerator and denominator.
    const record = grade([
      { name: 'Zeroed', score: 0, weight: 1 },
      { name: 'Perfect', score: 1, weight: 1 },
    ]);

    expect(record.score).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// gradeFromRubric() — exclusions
// ---------------------------------------------------------------------------

describe('gradeFromRubric() exclusions', () => {
  it('excludes notApplicable criteria from BOTH numerator and denominator', () => {
    // Including the N/A criterion would give (1·1 + 1·1 + 0·2) / 4 = 0.5.
    // Excluding it from both gives (1·1 + 1·1) / 2 = 1.
    const criteria: CriterionScore[] = [
      { name: 'Task', score: 1, weight: 1 },
      { name: 'Grammar', score: 1, weight: 1 },
      { name: 'Interaction', score: 0, weight: 2, notApplicable: true },
    ];
    const record = grade(criteria);

    expect(record.score).toBe(1);
    expect(record.score).not.toBe(0.5);
    expect(record.passed).toBe(true);
  });

  it('excludes a notApplicable criterion that would otherwise raise the total', () => {
    // Excluding works in both directions: the N/A criterion here scores 1.
    // Including it would give (0.5·1 + 1·1) / 2 = 0.75; excluded it is 0.5.
    const record = grade([
      { name: 'Task', score: 0.5, weight: 1 },
      { name: 'Interaction', score: 1, weight: 1, notApplicable: true },
    ]);

    expect(record.score).toBe(0.5);
  });

  it('includes a criterion that sets notApplicable: false explicitly', () => {
    const record = grade([
      { name: 'A', score: 1, weight: 1 },
      { name: 'B', score: 0, weight: 1, notApplicable: false },
    ]);

    expect(record.score).toBe(0.5);
  });

  it('excludes band-only criteria (no numeric score) from both sides', () => {
    // The band-only criterion carries weight 3. Counting it in the denominator
    // only would give 1/4 = 0.25; counting `undefined` in the numerator would
    // give NaN. Neither happens.
    const record = grade([
      { name: 'Accuracy', score: 1, weight: 1 },
      { name: 'CEFR level', band: 'B1', weight: 3 },
    ]);

    expect(record.score).toBe(1);
    expect(Number.isNaN(record.score)).toBe(false);
  });

  it('includes a criterion that carries both a numeric score and a band', () => {
    const record = grade([{ name: 'Fluency', score: 0.5, band: 'B1', weight: 1 }]);

    expect(record.score).toBe(0.5);
  });

  it('excludes criteria that are notApplicable even when they carry a band', () => {
    const record = grade([
      { name: 'A', score: 0.25, weight: 1 },
      { name: 'B', score: 1, band: 'C1', weight: 9, notApplicable: true },
    ]);

    expect(record.score).toBe(0.25);
  });

  it('drops a zero-weight criterion’s influence without making the rubric unscorable', () => {
    // A weight of 0 stays in the denominator sum (contributing 0) and in the
    // numerator (contributing 0), so it simply has no influence.
    const record = grade([
      { name: 'Counted', score: 0.5, weight: 2 },
      { name: 'Ignored', score: 1, weight: 0 },
    ]);

    expect(record.score).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// gradeFromRubric() — unscorable paths
// ---------------------------------------------------------------------------

describe('gradeFromRubric() unscorable paths', () => {
  it('returns unscorable for an empty criteria array', () => {
    const result = expectUnscorable(gradeFromRubric([]));

    expect(result.unscorable).toBe(true);
    expect(result.reason).toBe(NO_NUMERIC_SCORE);
  });

  it('returns unscorable when every criterion is notApplicable', () => {
    const result = expectUnscorable(
      gradeFromRubric([
        { name: 'A', score: 1, weight: 1, notApplicable: true },
        { name: 'B', score: 0, weight: 1, notApplicable: true },
      ]),
    );

    expect(result.reason).toBe(NO_NUMERIC_SCORE);
  });

  it('returns unscorable when every criterion is band-only', () => {
    const result = expectUnscorable(
      gradeFromRubric([
        { name: 'A', band: 'B1', weight: 1, comment: 'Solid.' },
        { name: 'B', band: 'A2', weight: 2 },
      ]),
    );

    expect(result.reason).toBe(NO_NUMERIC_SCORE);
  });

  it('returns unscorable for a mixture of notApplicable and band-only criteria', () => {
    const result = expectUnscorable(
      gradeFromRubric([
        { name: 'A', score: 1, notApplicable: true },
        { name: 'B', band: 'C1' },
      ]),
    );

    expect(result.reason).toBe(NO_NUMERIC_SCORE);
  });

  it('returns unscorable when the applicable weights sum to zero', () => {
    const result = expectUnscorable(
      gradeFromRubric([
        { name: 'A', score: 1, weight: 0 },
        { name: 'B', score: 0.5, weight: 0 },
      ]),
    );

    expect(result.reason).toBe(ZERO_WEIGHT);
  });

  it('returns unscorable when weights cancel out to zero', () => {
    const result = expectUnscorable(
      gradeFromRubric([
        { name: 'A', score: 1, weight: 1 },
        { name: 'B', score: 0, weight: -1 },
      ]),
    );

    expect(result.reason).toBe(ZERO_WEIGHT);
  });

  it('returns unscorable (zero-weight reason) when the weight sum is negative', () => {
    // The guard is `!(totalWeight > 0)`, so a negative sum — which would flip
    // the sign of the total — is rejected too, under the same message.
    const result = expectUnscorable(
      gradeFromRubric([
        { name: 'A', score: 1, weight: -1 },
        { name: 'B', score: 0.5, weight: -2 },
      ]),
    );

    expect(result.reason).toBe(ZERO_WEIGHT);
  });

  it('returns unscorable when a weight is NaN', () => {
    const result = expectUnscorable(
      gradeFromRubric([
        { name: 'A', score: 1, weight: 1 },
        { name: 'B', score: 0.5, weight: Number.NaN },
      ]),
    );

    expect(result.reason).toBe(ZERO_WEIGHT);
  });

  it('ignores zero-weight criteria only when SOME applicable weight remains', () => {
    // Guards against the zero-weight check being applied per-criterion.
    const record = grade([
      { name: 'A', score: 1, weight: 0 },
      { name: 'B', score: 0.25, weight: 4 },
    ]);

    expect(record.score).toBe(0.25);
  });

  it('NEVER reports a score of 0 on an unscorable path', () => {
    const inputs: readonly CriterionScore[][] = [
      [],
      [{ name: 'A', score: 1, notApplicable: true }],
      [{ name: 'A', band: 'B1' }],
      [{ name: 'A', score: 0, weight: 0 }],
      [{ name: 'A', score: 0, weight: -1 }],
    ];

    for (const criteria of inputs) {
      const result = gradeFromRubric(criteria);
      expect('unscorable' in result).toBe(true);
      expect('score' in result).toBe(false);
      expect('passed' in result).toBe(false);
      expect(Object.keys(result).sort()).toEqual(['reason', 'unscorable']);
    }
  });

  it('discriminates cleanly between the two arms', () => {
    const bad = gradeFromRubric([]);
    const good = gradeFromRubric([{ name: 'A', score: 1 }]);

    expect('unscorable' in bad).toBe(true);
    expect('unscorable' in good).toBe(false);
    expect(expectUnscorable(bad).unscorable).toBe(true);
    expect(expectRecord(good).score).toBe(1);
  });

  it('is unaffected by options when the rubric is unscorable', () => {
    const result = gradeFromRubric([], wr({ passThreshold: 0 }), {
      passThreshold: 0,
      feedback: 'Nice work.',
    });

    expect('unscorable' in result).toBe(true);
    expect('feedback' in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// gradeFromRubric() — pass threshold derivation
// ---------------------------------------------------------------------------

describe('gradeFromRubric() pass threshold', () => {
  /** A rubric whose weighted total is exactly `score`. */
  const at = (score: number): CriterionScore[] => [{ name: 'Only', score, weight: 1 }];

  it('uses options.passThreshold when given', () => {
    expect(grade(at(0.5), undefined, { passThreshold: 0.4 }).passed).toBe(true);
    expect(grade(at(0.5), undefined, { passThreshold: 0.6 }).passed).toBe(false);
  });

  it('passes exactly AT the options threshold (>=, not >)', () => {
    expect(grade(at(0.5), undefined, { passThreshold: 0.5 }).passed).toBe(true);
    expect(grade(at(0.5), undefined, { passThreshold: 0.5000001 }).passed).toBe(false);
  });

  it('honours an options threshold of 0 rather than treating it as absent', () => {
    // A falsy-check (`options.passThreshold ||`) would fall through to 0.7 here
    // and fail a submission the caller declared unfailable.
    expect(grade(at(0), undefined, { passThreshold: 0 }).passed).toBe(true);
    expect(grade(at(0), wr({ passThreshold: 0.9 }), { passThreshold: 0 }).passed).toBe(true);
  });

  it('honours an options threshold of 1', () => {
    expect(grade(at(1), undefined, { passThreshold: 1 }).passed).toBe(true);
    expect(grade(at(0.99), undefined, { passThreshold: 1 }).passed).toBe(false);
  });

  it('lets options.passThreshold win over the activity threshold', () => {
    const activity = wr({ passThreshold: 0.9 });

    // Without the option the activity's 0.9 applies and 0.5 fails …
    expect(grade(at(0.5), activity).passed).toBe(false);
    // … with it, the caller's 0.4 applies and 0.5 passes.
    expect(grade(at(0.5), activity, { passThreshold: 0.4 }).passed).toBe(true);
  });

  it('falls back to the activity’s passThreshold', () => {
    expect(grade(at(0.5), wr({ passThreshold: 0.5 })).passed).toBe(true);
    expect(grade(at(0.5), wr({ passThreshold: 0.75 })).passed).toBe(false);
    expect(grade(at(0.25), wr({ passThreshold: 0.25 })).passed).toBe(true);
  });

  it('passes exactly AT the activity threshold', () => {
    expect(grade(at(0.625), wr({ passThreshold: 0.625 })).passed).toBe(true);
    expect(grade(at(0.625), wr({ passThreshold: 0.6250001 })).passed).toBe(false);
  });

  it('falls back to the 0.7 default when the activity has no passThreshold', () => {
    const activity = wr();

    expect(grade(at(0.7), activity).passed).toBe(true);
    expect(grade(at(0.75), activity).passed).toBe(true);
    expect(grade(at(0.5), activity).passed).toBe(false);
  });

  it('falls back to the 0.7 default when no activity is supplied at all', () => {
    expect(grade(at(0.7)).passed).toBe(true);
    expect(grade(at(0.5)).passed).toBe(false);
    expect(grade(at(1)).passed).toBe(true);
    expect(grade(at(0)).passed).toBe(false);
  });

  it('applies the threshold to the weighted total, not to individual criteria', () => {
    // Every criterion is below 0.7 individually, but weighting lifts the total
    // to 0.75 — and it is the total that decides.
    const record = grade([
      { name: 'A', score: 0.5, weight: 1 },
      { name: 'B', score: 0.5, weight: 1 },
      { name: 'C', score: 1, weight: 2 },
    ]);

    expect(record.score).toBe(0.75);
    expect(record.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// gradeFromRubric() — returned record shape
// ---------------------------------------------------------------------------

describe('gradeFromRubric() record shape', () => {
  const mixed: CriterionScore[] = [
    { name: 'Task', score: 1, weight: 2, comment: 'Fully addressed.' },
    { name: 'CEFR', band: 'B2', weight: 1 },
    { name: 'Interaction', score: 0, weight: 5, notApplicable: true },
  ];

  it('echoes EVERY criterion, including excluded ones, in input order', () => {
    const record = grade(mixed);

    expect(record.criteria).toHaveLength(3);
    expect(record.criteria?.map((criterion) => criterion.name)).toEqual([
      'Task',
      'CEFR',
      'Interaction',
    ]);
    expect(record.criteria?.[1]?.band).toBe('B2');
    expect(record.criteria?.[2]?.notApplicable).toBe(true);
    // The score itself came only from the one scoreable criterion.
    expect(record.score).toBe(1);
  });

  it('copies the criteria array rather than aliasing the caller’s', () => {
    const input: CriterionScore[] = [{ name: 'A', score: 0.5 }];
    const record = grade(input);

    expect(record.criteria).not.toBe(input);
    expect(record.criteria).toEqual(input);
    // Elements are shared by reference — it is a shallow copy.
    expect(record.criteria?.[0]).toBe(input[0]);

    input.push({ name: 'B', score: 1 });
    expect(record.criteria).toHaveLength(1);
  });

  it('carries feedback from options verbatim', () => {
    expect(grade(mixed, undefined, { feedback: 'Well argued.' }).feedback).toBe('Well argued.');
  });

  it('defaults feedback to null when absent', () => {
    expect(grade(mixed).feedback).toBeNull();
    expect(grade(mixed, undefined, {}).feedback).toBeNull();
    expect(grade(mixed, wr()).feedback).toBeNull();
  });

  it('keeps an explicitly null feedback as null', () => {
    expect(grade(mixed, undefined, { feedback: null }).feedback).toBeNull();
  });

  it('preserves an empty-string feedback (?? is nullish, not falsy)', () => {
    expect(grade(mixed, undefined, { feedback: '' }).feedback).toBe('');
  });

  it('never invents grader-authored fields it was not given', () => {
    const record = grade(mixed, undefined, { feedback: 'x' });

    expect(Object.keys(record).sort()).toEqual([
      'criteria',
      'feedback',
      'maxScore',
      'passed',
      'score',
    ]);
    expect(record.corrections).toBeUndefined();
    expect(record.grader).toBeUndefined();
    expect(record.confidence).toBeUndefined();
    expect(record.requiresHumanReview).toBeUndefined();
    expect(record.gradedAt).toBeUndefined();
  });

  it('always reports maxScore 1, because the total is scaled', () => {
    expect(grade([{ name: 'A', score: 0.13 }]).maxScore).toBe(1);
    expect(grade([{ name: 'A', score: 1, weight: 99 }]).maxScore).toBe(1);
  });

  it('does not read the activity’s feedback block (that is evaluate’s job)', () => {
    const record = grade(
      [{ name: 'A', score: 1 }],
      wr({ feedback: { correct: 'Authored pass copy.', incorrect: 'Authored fail copy.' } }),
    );

    expect(record.passed).toBe(true);
    expect(record.feedback).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// gradeFromRubric() — documented robustness gaps (see report)
// ---------------------------------------------------------------------------

describe('gradeFromRubric() out-of-contract criterion scores', () => {
  // These inputs must never become a grade. A GradeRecord carrying NaN, an
  // Infinity, or a raw point value would put a meaningless number in front of
  // a student — and NaN JSON-serialises to null straight into a grade column.
  const unscorableOf = (criteria: CriterionScore[]) => {
    const result = gradeFromRubric(criteria);
    expect('unscorable' in result).toBe(true);
    return result as { unscorable: true; reason: string };
  };

  it('rejects a criterion score above the scaled [0,1] range, naming the criterion', () => {
    // A grader reporting raw points (4 out of 5) is out of contract: it would
    // otherwise yield { score: 4, maxScore: 1 } and pass every threshold.
    const result = unscorableOf([{ name: 'Task achievement', score: 4, weight: 1 }]);
    expect(result.reason).toContain('Task achievement');
    expect(result.reason).toContain('outside the scaled [0,1] range');
  });

  it('rejects a negative criterion score', () => {
    const result = unscorableOf([{ name: 'A', score: -1, weight: 1 }]);
    expect(result.reason).toContain('outside the scaled [0,1] range');
  });

  it('rejects a NaN criterion score instead of producing a NaN grade', () => {
    const result = unscorableOf([
      { name: 'A', score: Number.NaN, weight: 1 },
      { name: 'B', score: 1, weight: 1 },
    ]);
    expect(result.reason).toBeTruthy();
  });

  it('rejects an infinite criterion score', () => {
    unscorableOf([{ name: 'A', score: Number.POSITIVE_INFINITY, weight: 1 }]);
    unscorableOf([{ name: 'A', score: Number.NEGATIVE_INFINITY, weight: 1 }]);
  });

  it('never returns a numeric score for any out-of-contract input', () => {
    const bad: CriterionScore[][] = [
      [{ name: 'A', score: Number.NaN, weight: 1 }],
      [{ name: 'A', score: Number.POSITIVE_INFINITY, weight: 1 }],
      [{ name: 'A', score: 4, weight: 1 }],
      [{ name: 'A', score: -1, weight: 1 }],
    ];
    for (const criteria of bad) {
      const result = gradeFromRubric(criteria);
      expect('score' in result).toBe(false);
      expect('passed' in result).toBe(false);
    }
  });

  it('clamps float noise just outside the range rather than rejecting it', () => {
    const record = grade([{ name: 'A', score: 1 + 1e-12, weight: 1 }]);
    expect(record.score).toBe(1);
    const low = grade([{ name: 'A', score: -1e-12, weight: 1 }]);
    expect(low.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// outcomeFromGrade()
// ---------------------------------------------------------------------------

describe('outcomeFromGrade()', () => {
  const rich = (): GradeRecord => ({
    score: 0.82,
    maxScore: 1,
    passed: true,
    feedback: 'Clear structure; watch article use.',
    criteria: [{ name: 'Task', score: 1, weight: 2, comment: 'Fully addressed.' }],
    corrections: [
      {
        original: 'I go to beach',
        corrected: 'I went to the beach',
        explanation: 'Past tense plus definite article.',
        range: { start: 0, end: 13 },
        category: 'tense',
      },
    ],
    evidence: ['Uses three tenses correctly.'],
    rationale: 'Weighted rubric total.',
    confidence: 'medium',
    requiresHumanReview: true,
    grader: { kind: 'ai', model: 'grader-v3', promptHash: 'sha256:abc' },
    usage: { promptTokens: 1200, completionTokens: 340, costUsd: 0.0042 },
    gradedAt: '2026-08-19T10:00:00.000Z',
  });

  it('produces the graded arm of ItemOutcome', () => {
    const outcome = outcomeFromGrade(rich());

    expect(outcome.status).toBe('graded');
  });

  it('mirrors score, maxScore, passed and feedback onto the outcome', () => {
    const record = rich();
    const outcome = outcomeFromGrade(record);

    if (outcome.status !== 'graded') {
      throw new Error('expected a graded outcome');
    }
    expect(outcome.score).toBe(record.score);
    expect(outcome.maxScore).toBe(record.maxScore);
    expect(outcome.passed).toBe(record.passed);
    expect(outcome.feedback).toBe(record.feedback);
  });

  it('keeps the full record under .grade, by reference', () => {
    const record = rich();
    const outcome = outcomeFromGrade(record);

    if (outcome.status !== 'graded') {
      throw new Error('expected a graded outcome');
    }
    expect(outcome.grade).toBe(record);
    expect(outcome.grade.corrections?.[0]?.corrected).toBe('I went to the beach');
    expect(outcome.grade.requiresHumanReview).toBe(true);
    expect(outcome.grade.confidence).toBe('medium');
    expect(outcome.grade.grader?.kind).toBe('ai');
    expect(outcome.grade.usage?.costUsd).toBe(0.0042);
    expect(outcome.grade.gradedAt).toBe('2026-08-19T10:00:00.000Z');
  });

  it('does not hoist rubric detail onto the outcome itself', () => {
    const outcome = outcomeFromGrade(rich());

    expect(Object.keys(outcome).sort()).toEqual([
      'feedback',
      'grade',
      'maxScore',
      'passed',
      'score',
      'status',
    ]);
    expect('criteria' in outcome).toBe(false);
    expect('corrections' in outcome).toBe(false);
    expect('details' in outcome).toBe(false);
  });

  it('mirrors a failing, feedback-less grade without substituting anything', () => {
    const outcome = outcomeFromGrade({
      score: 0.1,
      maxScore: 1,
      passed: false,
      feedback: null,
    });

    if (outcome.status !== 'graded') {
      throw new Error('expected a graded outcome');
    }
    expect(outcome.score).toBe(0.1);
    expect(outcome.passed).toBe(false);
    expect(outcome.feedback).toBeNull();
  });

  it('mirrors a non-1 maxScore verbatim rather than normalising it', () => {
    const outcome = outcomeFromGrade({ score: 4, maxScore: 5, passed: true, feedback: null });

    if (outcome.status !== 'graded') {
      throw new Error('expected a graded outcome');
    }
    expect(outcome.maxScore).toBe(5);
    expect(outcome.score).toBe(4);
  });

  it('round-trips a record built by gradeFromRubric', () => {
    const record = grade(
      [
        { name: 'Task achievement', score: 1, weight: 2 },
        { name: 'Coherence', score: 0.5, weight: 1.5 },
        { name: 'Lexical resource', score: 0.25, weight: 1.5 },
      ],
      wr({ passThreshold: 0.6 }),
      { feedback: 'Solid attempt.' },
    );
    const outcome = outcomeFromGrade(record);

    if (outcome.status !== 'graded') {
      throw new Error('expected a graded outcome');
    }
    expect(outcome.score).toBe(0.625);
    expect(outcome.passed).toBe(true);
    expect(outcome.feedback).toBe('Solid attempt.');
    expect(outcome.grade.criteria).toHaveLength(3);
    expect(hasGrade(outcome)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasGrade()
// ---------------------------------------------------------------------------

describe('hasGrade()', () => {
  const graded = (): ItemOutcome =>
    outcomeFromGrade({ score: 0.9, maxScore: 1, passed: true, feedback: 'Great.' });

  it('is true for a synchronously scored outcome', () => {
    expect(hasGrade(scoredOutcome())).toBe(true);
  });

  it('is true for an asynchronously graded outcome', () => {
    expect(hasGrade(graded())).toBe(true);
  });

  it('is false for a deferred outcome', () => {
    expect(hasGrade(deferredOutcome())).toBe(false);
  });

  it('is false for an unscorable outcome', () => {
    expect(hasGrade(unscorableOutcome())).toBe(false);
  });

  it('covers every arm of ItemOutcome exactly once', () => {
    const all: ItemOutcome[] = [scoredOutcome(), graded(), deferredOutcome(), unscorableOutcome()];

    expect(all.map(hasGrade)).toEqual([true, true, false, false]);
  });

  it('narrows the union so score/maxScore/passed/feedback are readable', () => {
    // The explicit annotations below are the assertion: this block fails to
    // COMPILE if the predicate stops narrowing. `details` and `grade` are
    // deliberately NOT read here — they live on only one arm each.
    const readScore = (outcome: ItemOutcome): number | null => {
      if (!hasGrade(outcome)) {
        return null;
      }
      const score: number = outcome.score;
      const maxScore: number = outcome.maxScore;
      const passed: boolean = outcome.passed;
      const feedback: string | null = outcome.feedback;

      return passed && feedback !== null ? score / maxScore : score;
    };

    expect(readScore(scoredOutcome())).toBe(0.8);
    expect(readScore(graded())).toBe(0.9);
    expect(readScore(deferredOutcome())).toBeNull();
    expect(readScore(unscorableOutcome())).toBeNull();
  });

  it('narrows to a union that still discriminates scored from graded', () => {
    const describeOutcome = (outcome: ItemOutcome): string => {
      if (!hasGrade(outcome)) {
        return `ungraded:${outcome.status}`;
      }
      return outcome.status === 'graded'
        ? `graded:${outcome.grade.score}`
        : `scored:${outcome.details.length}`;
    };

    expect(describeOutcome(scoredOutcome())).toBe('scored:0');
    expect(describeOutcome(graded())).toBe('graded:0.9');
    expect(describeOutcome(deferredOutcome())).toBe('ungraded:deferred');
    expect(describeOutcome(unscorableOutcome())).toBe('ungraded:unscorable');
  });
});

// ---------------------------------------------------------------------------
// Integration: evaluate() defers, then a grade arrives
// ---------------------------------------------------------------------------

describe('deferred written-response, then a grade arrives', () => {
  const text = 'I visited Lisbon last summer with my sister.'; // 8 words
  const activity = wr({ minWords: 5, maxWords: 100, passThreshold: 0.6 });

  it('defers at submit time with progress facts but no score', () => {
    // The client-supplied wordCount (999) is deliberately wrong; the SDK
    // recomputes it with countWords().
    const outcome = evaluate(activity, wrResponse(text, 999));

    expect(outcome.status).toBe('deferred');
    if (outcome.status !== 'deferred') {
      throw new Error('expected a deferred outcome');
    }
    expect(outcome.reason).toBe('requires_async_grading');
    expect(outcome.maxScore).toBe(1);
    expect(outcome.partial).toEqual({ withinWordBounds: true, wordCount: 8 });

    // The whole point: "not graded yet" is not a zero.
    expect('score' in outcome).toBe(false);
    expect('passed' in outcome).toBe(false);
    expect('feedback' in outcome).toBe(false);
    expect('grade' in outcome).toBe(false);
    expect(hasGrade(outcome)).toBe(false);
  });

  it('still defers — never scores 0 — when the response is under length', () => {
    const outcome = evaluate(activity, wrResponse('Too short.'));

    expect(outcome.status).toBe('deferred');
    if (outcome.status !== 'deferred') {
      throw new Error('expected a deferred outcome');
    }
    expect(outcome.partial).toEqual({ withinWordBounds: false, wordCount: 2 });
    expect('score' in outcome).toBe(false);
  });

  it('is distinguishable from the graded outcome that supersedes it', () => {
    const before = evaluate(activity, wrResponse(text, 8));
    const after = outcomeFromGrade(
      grade(
        [
          { name: 'Task achievement', score: 1, weight: 2 },
          { name: 'Coherence', score: 0.5, weight: 1.5 },
          { name: 'Lexical resource', score: 0.25, weight: 1.5 },
          { name: 'Interaction', weight: 4, notApplicable: true },
        ],
        activity,
        { feedback: 'Good detail; tighten the ending.' },
      ),
    );

    expect(before.status).toBe('deferred');
    expect(after.status).toBe('graded');
    expect(before.status).not.toBe(after.status);

    expect(hasGrade(before)).toBe(false);
    expect(hasGrade(after)).toBe(true);

    expect('score' in before).toBe(false);
    expect('score' in after).toBe(true);

    if (after.status !== 'graded') {
      throw new Error('expected a graded outcome');
    }
    // 3.125 / 5 = 0.625, with the N/A criterion excluded but still echoed.
    expect(after.score).toBe(0.625);
    expect(after.passed).toBe(true); // activity passThreshold 0.6
    expect(after.grade.criteria).toHaveLength(4);
    expect(after.grade.criteria?.[3]?.notApplicable).toBe(true);
  });

  it('routes both states through one exhaustive switch', () => {
    const render = (outcome: ItemOutcome): string => {
      switch (outcome.status) {
        case 'scored':
          return `scored ${outcome.score}`;
        case 'graded':
          return `graded ${outcome.score}`;
        case 'deferred':
          return `pending (${outcome.partial?.wordCount ?? 0} words)`;
        case 'unscorable':
          return `unscorable: ${outcome.reason}`;
      }
    };

    expect(render(evaluate(activity, wrResponse(text, 8)))).toBe('pending (8 words)');
    expect(render(outcomeFromGrade(grade([{ name: 'A', score: 0.75 }], activity)))).toBe(
      'graded 0.75',
    );
  });
});
