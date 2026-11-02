import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultConfig, resolveConfig } from '../../config.js';
import { PracticeConfigError } from '../../errors.js';
import type {
  Evidence,
  EvidenceMapper,
  ResolvedPracticeConfig,
  SkillEffect,
  TaskSnapshot,
} from '../../types.js';
import { contextWeight, heldReason, mapEvidence } from '../map.js';

const config = defaultConfig();
const T0 = 1_767_225_600_000;

function configWith(input: object): ResolvedPracticeConfig {
  const result = resolveConfig(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

const TASK: TaskSnapshot = {
  itemId: 'i',
  skills: [{ skillId: 'a', weight: 1 }],
  stage: 'recall',
  difficulty: 0,
  origin: 'authored',
};
const TIMED: TaskSnapshot = { ...TASK, fluentSeconds: 10, slowSeconds: 60 };

const AUTO = { kind: 'auto', score: 3, maxScore: 4, passed: true } as const;

function evidence(source: Evidence['source'], extra: Partial<Evidence> = {}): Evidence {
  return { id: 'e', itemId: 'i', at: T0, source, ...extra };
}

function one(e: Evidence, task = TASK, c = config): SkillEffect {
  const mapped = mapEvidence(e, task, {}, c);
  expect(mapped.held).toBe(false);
  expect(mapped.perSkill).toHaveLength(1);
  return mapped.perSkill[0] as SkillEffect;
}

const effect = (rating: SkillEffect['rating'], correct: number, weight = 1) => ({
  skillId: 'a',
  rating,
  correct,
  weight,
  memory: 'review',
  reason: 'overall',
});

describe('mapEvidence: the R7.2 rows', () => {
  it('auto, not passed: again, score / maxScore', () => {
    expect(one(evidence({ ...AUTO, passed: false }))).toEqual(effect('again', 0.75));
  });

  it('auto, passed after hints or failed attempts: hard, score / maxScore', () => {
    expect(one(evidence(AUTO, { hintsUsed: 1 }))).toEqual(effect('hard', 0.75));
    expect(one(evidence(AUTO, { attempts: 2 }))).toEqual(effect('hard', 0.75));
    expect(one(evidence(AUTO, { hintsUsed: 0, attempts: 0 }))).toEqual(effect('good', 1));
  });

  it('auto, passed first try: good, 1', () => {
    expect(one(evidence(AUTO))).toEqual(effect('good', 1));
  });

  it('auto, fluent: easy only when the duration and fluentSeconds are both set', () => {
    expect(one(evidence(AUTO, { durationMs: 10_000 }), TIMED)).toEqual(effect('easy', 1));
    expect(one(evidence(AUTO, { durationMs: 10_001 }), TIMED)).toEqual(effect('good', 1));
    expect(one(evidence(AUTO), TIMED)).toEqual(effect('good', 1));
    expect(one(evidence(AUTO, { durationMs: 1 }))).toEqual(effect('good', 1));
    // Hints win over fluency.
    expect(one(evidence(AUTO, { durationMs: 1, hintsUsed: 1 }), TIMED)).toEqual(
      effect('hard', 0.75),
    );
  });

  it('auto, slow: hard with correct 1, only when the duration and slowSeconds are both set', () => {
    expect(one(evidence(AUTO, { durationMs: 60_001 }), TIMED)).toEqual(effect('hard', 1));
    expect(one(evidence(AUTO, { durationMs: 60_000 }), TIMED)).toEqual(effect('good', 1));
    const slowOnly = { ...TASK, slowSeconds: 60 };
    expect(one(evidence(AUTO, { durationMs: 60_001 }), slowOnly)).toEqual(effect('hard', 1));
    expect(one(evidence(AUTO, { durationMs: 1 }), slowOnly)).toEqual(effect('good', 1));
    expect(one(evidence(AUTO, { durationMs: 999_999 }))).toEqual(effect('good', 1));
  });

  it('auto with checks: passed by the fraction, correct the fraction', () => {
    const checks = (passed: number, total: number) => ({
      ...AUTO,
      passed: false,
      checks: { passed, total },
    });
    expect(one(evidence(checks(4, 4)))).toEqual(effect('good', 1));
    expect(one(evidence(checks(3, 4)))).toEqual(effect('again', 0.75));
    expect(one(evidence(checks(3, 4), { hintsUsed: 1 }))).toEqual(effect('again', 0.75));
    expect(one(evidence(checks(0, 0)))).toEqual(effect('again', 0));
    const lenient = configWith({ evidenceOptions: { checksPassFraction: 0.75 } });
    expect(one(evidence(checks(3, 4)), TASK, lenient)).toEqual(effect('good', 0.75));
    expect(one(evidence(checks(3, 4), { attempts: 1 }), TASK, lenient)).toEqual(
      effect('hard', 0.75),
    );
    expect(one(evidence(checks(3, 4), { durationMs: 1 }), TIMED, lenient)).toEqual(
      effect('easy', 0.75),
    );
  });

  it('ai, high: as auto', () => {
    const ai = { kind: 'ai', score: 1, maxScore: 2, passed: true, confidence: 'high' } as const;
    expect(one(evidence(ai))).toEqual(effect('good', 1));
    expect(one(evidence(ai, { durationMs: 1 }), TIMED)).toEqual(effect('easy', 1));
    expect(one(evidence({ ...ai, passed: false }))).toEqual(effect('again', 0.5));
    expect(one(evidence(ai, { requiresHumanReview: false } as never))).toEqual(effect('good', 1));
  });

  it('ai, medium: as auto but never easy, at aiMediumWeight', () => {
    const ai = { kind: 'ai', score: 1, maxScore: 2, passed: true, confidence: 'medium' } as const;
    expect(one(evidence(ai, { durationMs: 1 }), TIMED)).toEqual(effect('good', 1, 0.5));
    expect(one(evidence(ai, { durationMs: 99_000 }), TIMED)).toEqual(effect('hard', 1, 0.5));
    expect(one(evidence(ai, { hintsUsed: 2 }))).toEqual(effect('hard', 0.5, 0.5));
    const custom = configWith({ evidenceOptions: { aiMediumWeight: 0.25 } });
    expect(one(evidence(ai), TASK, custom).weight).toBe(0.25);
  });

  it('ai, low or requiresHumanReview, and pending: held, with no update', () => {
    const held = (e: Evidence) => {
      const mapped = mapEvidence(e, TASK, {}, config);
      expect(mapped).toEqual({
        held: true,
        perSkill: [
          { skillId: 'a', rating: null, correct: 0, weight: 0, memory: 'none', reason: 'held' },
        ],
      });
    };
    const ai = { kind: 'ai', score: 1, maxScore: 1, passed: true } as const;
    held(evidence({ ...ai, confidence: 'low' }));
    held(evidence({ ...ai, confidence: 'high', requiresHumanReview: true }));
    held(evidence({ kind: 'pending', reason: 'deferred' }));
    expect(heldReason(evidence({ ...ai, confidence: 'low' }))).toBe('low-confidence');
    expect(heldReason(evidence({ ...ai, confidence: 'low', requiresHumanReview: true }))).toBe(
      'human-review',
    );
    expect(heldReason(evidence({ kind: 'pending', reason: 'routed-to-person' }))).toBe(
      'routed-to-person',
    );
    expect(heldReason(evidence({ ...ai, confidence: 'medium' }))).toBeNull();
    expect(heldReason(evidence(AUTO))).toBeNull();
  });

  it('human: as auto', () => {
    const human = { kind: 'human', score: 8, maxScore: 10, passed: true, graderId: 'g' } as const;
    expect(one(evidence(human))).toEqual(effect('good', 1));
    expect(one(evidence({ ...human, passed: false }))).toEqual(effect('again', 0.8));
    expect(one(evidence(human, { attempts: 1 }))).toEqual(effect('hard', 0.8));
  });

  it('self: the learner rating, selfCorrect, selfWeight', () => {
    expect(one(evidence({ kind: 'self', rating: 'again' }))).toEqual(effect('again', 0, 0.5));
    expect(one(evidence({ kind: 'self', rating: 'hard' }))).toEqual(effect('hard', 0.6, 0.5));
    expect(one(evidence({ kind: 'self', rating: 'good' }))).toEqual(effect('good', 1, 0.5));
    expect(one(evidence({ kind: 'self', rating: 'easy' }, { durationMs: 99_000 }), TIMED)).toEqual(
      effect('easy', 1, 0.5),
    );
    const custom = configWith({
      evidenceOptions: {
        selfWeight: 0.2,
        selfCorrect: { again: 0, hard: 0.5, good: 0.9, easy: 1 },
      },
    });
    expect(one(evidence({ kind: 'self', rating: 'good' }), TASK, custom)).toEqual(
      effect('good', 0.9, 0.2),
    );
  });

  it('exposure: no rating, no weight, no review', () => {
    const task = {
      ...TASK,
      skills: [
        { skillId: 'a', weight: 0.6 },
        { skillId: 'b', weight: 0.4 },
      ],
    };
    expect(mapEvidence(evidence({ kind: 'exposure' }), task, {}, config)).toEqual({
      held: false,
      perSkill: ['a', 'b'].map((skillId) => ({
        skillId,
        rating: null,
        correct: 0,
        weight: 0,
        memory: 'none',
        reason: 'exposure',
      })),
    });
  });

  it('clamps score / maxScore, and uses passed when maxScore is 0', () => {
    expect(one(evidence({ ...AUTO, score: 5, passed: false })).correct).toBe(1);
    expect(one(evidence({ ...AUTO, score: -1, passed: false })).correct).toBe(0);
    expect(one(evidence({ ...AUTO, score: 0, maxScore: 0, passed: false })).correct).toBe(0);
    expect(one(evidence({ ...AUTO, score: 0, maxScore: 0 }), TASK).correct).toBe(1);
    expect(one(evidence({ ...AUTO, score: 0, maxScore: 0 }, { hintsUsed: 1 })).correct).toBe(1);
  });
});

describe('mapEvidence: skills of the attempt (R7.4)', () => {
  const TWO: TaskSnapshot = {
    ...TASK,
    skills: [
      { skillId: 'a', weight: 0.75 },
      { skillId: 'b', weight: 0.25 },
    ],
  };

  it('maps the overall outcome at the item weight, with the memory weight floor', () => {
    const mapped = mapEvidence(evidence(AUTO), TWO, {}, config);
    expect(mapped.perSkill).toEqual([
      { ...effect('good', 1, 0.75) },
      { ...effect('good', 1, 0.25), skillId: 'b', memory: 'none', reason: 'below-weight-floor' },
    ]);
    const exact = {
      ...TWO,
      skills: [
        { skillId: 'a', weight: 0.7 },
        { skillId: 'b', weight: 0.3 },
      ],
    };
    expect(mapEvidence(evidence(AUTO), exact, {}, config).perSkill[1]?.memory).toBe('review');
    const self = mapEvidence(evidence({ kind: 'self', rating: 'good' }), TWO, {}, config);
    expect(self.perSkill[1]).toEqual({
      ...effect('good', 1, 0.125),
      skillId: 'b',
      memory: 'none',
      reason: 'below-weight-floor',
    });
  });

  it('maps a skill outcome as the source kind, with one review at the source weight', () => {
    const outcomes = [
      { skillId: 'b', score: 1, maxScore: 2 },
      { skillId: 'a', score: 2, maxScore: 2 },
    ];
    const mapped = mapEvidence(evidence(AUTO, { skillOutcomes: outcomes }), TWO, {}, config);
    expect(mapped.perSkill).toEqual([
      { ...effect('good', 1), reason: 'outcome' },
      { ...effect('again', 0.5), skillId: 'b', reason: 'outcome' },
    ]);
  });

  it('uses the outcome passed flag, the evidence attempts, hints and duration', () => {
    const outcome = (passed?: boolean) => [
      passed === undefined
        ? { skillId: 'a', score: 1, maxScore: 2 }
        : { skillId: 'a', score: 1, maxScore: 2, passed },
    ];
    const map = (e: Partial<Evidence>, task = TIMED, source: Evidence['source'] = AUTO) =>
      one(evidence(source, e), task);
    expect(map({ skillOutcomes: outcome(true) })).toEqual({
      ...effect('good', 0.5),
      reason: 'outcome',
    });
    expect(map({ skillOutcomes: outcome(true), hintsUsed: 1 })).toEqual({
      ...effect('hard', 0.5),
      reason: 'outcome',
    });
    expect(map({ skillOutcomes: outcome(true), durationMs: 1 }).rating).toBe('easy');
    expect(map({ skillOutcomes: outcome(true), durationMs: 70_000 }).rating).toBe('hard');
    expect(map({ skillOutcomes: outcome(false) }).rating).toBe('again');
    expect(map({ skillOutcomes: outcome() }).rating).toBe('again');
    const medium = {
      kind: 'ai',
      score: 0,
      maxScore: 1,
      passed: false,
      confidence: 'medium',
    } as const;
    expect(map({ skillOutcomes: outcome(true), durationMs: 1 }, TIMED, medium)).toEqual({
      ...effect('good', 0.5, 0.5),
      reason: 'outcome',
    });
    const zero = [{ skillId: 'a', score: 0, maxScore: 0 }];
    expect(map({ skillOutcomes: zero }).correct).toBe(1);
  });

  it('takes the first outcome when a skill is named twice', () => {
    const outcomes = [
      { skillId: 'a', score: 0, maxScore: 1 },
      { skillId: 'a', score: 1, maxScore: 1 },
    ];
    expect(one(evidence(AUTO, { skillOutcomes: outcomes })).rating).toBe('again');
  });

  it('leaves a skill with criteria and no outcome not assessed', () => {
    const task = { ...TWO, criteria: [{ name: 'tests', skillId: 'b' }] };
    const mapped = mapEvidence(evidence(AUTO), task, {}, config);
    expect(mapped.perSkill[1]).toEqual({
      skillId: 'b',
      rating: null,
      correct: 0,
      weight: 0,
      memory: 'none',
      reason: 'not-assessed',
    });
    const answered = mapEvidence(
      evidence(AUTO, {
        skillOutcomes: [{ skillId: 'b', score: 1, maxScore: 1 }],
        supplements: 'x',
      }),
      task,
      {},
      config,
    );
    expect(answered.perSkill[1]?.reason).toBe('supplement');
    const self = mapEvidence(evidence({ kind: 'self', rating: 'good' }), task, {}, config);
    expect(self.perSkill[1]?.reason).toBe('not-assessed');
  });

  it('updates a component named by an outcome, after the task skills', () => {
    const outcomes = [
      { skillId: 'c', score: 1, maxScore: 1 },
      { skillId: 'd', score: 0, maxScore: 1 },
    ];
    const mapped = mapEvidence(evidence(AUTO, { skillOutcomes: outcomes }), TASK, {}, config);
    expect(mapped.perSkill.map((e) => [e.skillId, e.reason, e.rating])).toEqual([
      ['a', 'overall', 'good'],
      ['c', 'outcome', 'good'],
      ['d', 'outcome', 'again'],
    ]);
  });

  it('ignores outcomes on a self-rating', () => {
    const outcomes = [
      { skillId: 'a', score: 0, maxScore: 1 },
      { skillId: 'c', score: 1, maxScore: 1 },
    ];
    const mapped = mapEvidence(
      evidence({ kind: 'self', rating: 'good' }, { skillOutcomes: outcomes }),
      TASK,
      {},
      config,
    );
    expect(mapped.perSkill).toEqual([effect('good', 1, 0.5)]);
  });
});

describe('mapEvidence: supplements and contexts (R7.2, R7.3)', () => {
  it('a supplement updates ability only', () => {
    expect(one(evidence(AUTO, { supplements: 'first' }))).toEqual({
      ...effect('good', 1),
      memory: 'none',
      reason: 'supplement',
    });
    const task = {
      ...TASK,
      skills: [
        { skillId: 'a', weight: 0.8 },
        { skillId: 'b', weight: 0.2 },
      ],
    };
    const mapped = mapEvidence(evidence(AUTO, { supplements: 'first' }), task, {}, config);
    expect(mapped.perSkill[1]?.reason).toBe('supplement');
  });

  it('exam: a failed answer reviews, a passed one only with examsMoveSchedule', () => {
    expect(one(evidence({ ...AUTO, passed: false }, { context: 'exam' }))).toEqual(
      effect('again', 0.75),
    );
    expect(one(evidence(AUTO, { context: 'exam' }))).toEqual({
      ...effect('good', 1),
      memory: 'none',
      reason: 'context',
    });
    const moves = configWith({ contexts: { examsMoveSchedule: true } });
    expect(one(evidence(AUTO, { context: 'exam' }), TASK, moves)).toEqual(effect('good', 1));
  });

  it('diagnostic and pretest never review; practice does', () => {
    for (const context of ['diagnostic', 'pretest'] as const) {
      expect(one(evidence({ ...AUTO, passed: false }, { context }))).toEqual({
        ...effect('again', 0.75),
        memory: 'none',
        reason: 'context',
      });
    }
    expect(one(evidence(AUTO, { context: 'practice' }))).toEqual(effect('good', 1));
    const task = {
      ...TASK,
      skills: [
        { skillId: 'a', weight: 0.9 },
        { skillId: 'b', weight: 0.1 },
      ],
    };
    const floor = mapEvidence(evidence(AUTO, { context: 'pretest' }), task, {}, config);
    expect(floor.perSkill[1]?.reason).toBe('below-weight-floor');
  });

  it('gives the context weight, which the mapper does not apply', () => {
    const custom = configWith({ contexts: { diagnosticWeight: 0.4, pretestWeight: 0.1 } });
    expect(contextWeight(undefined, custom)).toBe(1);
    expect(contextWeight('practice', custom)).toBe(1);
    expect(contextWeight('exam', custom)).toBe(1);
    expect(contextWeight('diagnostic', custom)).toBe(0.4);
    expect(contextWeight('pretest', custom)).toBe(0.1);
    expect(contextWeight('pretest', config)).toBe(0);
    expect(one(evidence(AUTO, { context: 'diagnostic' }), TASK, custom).weight).toBe(1);
  });
});

describe('mapEvidence: configuration and invariants', () => {
  it('throws PracticeConfigError when a custom mapper is configured', () => {
    const mapper: EvidenceMapper = {
      id: 'custom',
      version: 1,
      params: {},
      map: () => ({ held: false, perSkill: [] }),
    };
    const custom = configWith({ evidenceMapper: mapper });
    expect(custom.evidenceOptions).toBeNull();
    let error: unknown;
    try {
      mapEvidence(evidence(AUTO), TASK, {}, custom);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PracticeConfigError);
    expect(error).toBeInstanceOf(Error);
    expect((error as PracticeConfigError).name).toBe('PracticeConfigError');
    expect((error as PracticeConfigError).issues).toEqual([
      expect.objectContaining({ code: 'CONFIG_CONFLICT', path: ['evidenceOptions'] }),
    ]);
    expect((error as PracticeConfigError).message).toMatch(/^lk-practice: mapEvidence/);
    expect(Object.isFrozen((error as PracticeConfigError).issues)).toBe(true);
  });

  it('returns frozen results', () => {
    const mapped = mapEvidence(evidence(AUTO), TASK, {}, config);
    expect(Object.isFrozen(mapped)).toBe(true);
    expect(Object.isFrozen(mapped.perSkill)).toBe(true);
    expect(Object.isFrozen(mapped.perSkill[0])).toBe(true);
  });

  it('keeps correct and weight in [0, 1] for any graded attempt (property)', () => {
    const graded = fc.record({
      kind: fc.constantFrom('auto', 'human', 'ai'),
      score: fc.double({ min: -2, max: 12, noNaN: true }),
      maxScore: fc.double({ min: 0, max: 10, noNaN: true }),
      passed: fc.boolean(),
      confidence: fc.constantFrom('high', 'medium'),
    });
    fc.assert(
      fc.property(
        graded,
        fc.option(fc.nat(100_000), { nil: undefined }),
        fc.nat(2),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (source, durationMs, hintsUsed, weight) => {
          const task = {
            ...TIMED,
            skills: [
              { skillId: 'a', weight },
              { skillId: 'b', weight: 1 - weight },
            ],
          };
          const extra = durationMs === undefined ? { hintsUsed } : { hintsUsed, durationMs };
          const mapped = mapEvidence(evidence(source as never, extra), task, {}, config);
          for (const e of mapped.perSkill) {
            expect(e.correct).toBeGreaterThanOrEqual(0);
            expect(e.correct).toBeLessThanOrEqual(1);
            expect(e.weight).toBeGreaterThanOrEqual(0);
            expect(e.weight).toBeLessThanOrEqual(1);
            if (e.rating === 'easy')
              expect(source.kind === 'ai' && source.confidence === 'medium').toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
