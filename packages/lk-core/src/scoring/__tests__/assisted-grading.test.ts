import { describe, expect, it } from 'vitest';
import { contentHash } from '../../content-hash.js';
import type { WrittenResponseData, WrittenResponseRubric } from '../../types/activity.js';
import type { AiGradingJudgement } from '../../types/ai.js';
import type { CriterionScore, GradeRecord } from '../../types/grading.js';
import {
  type CalibrationPair,
  type CalibrationReport,
  calibrationReport,
  graderConfiguration,
  pearson,
  quadraticKappa,
  standardizedMeanDifference,
} from '../assisted/calibration.js';
import { gradeFromJudgement } from '../assisted/grade-from-judgement.js';
import { inAuditSample, outcomeFromRoutedGrade, routeGrade } from '../assisted/routing.js';
import { composeAssessmentScore } from '../compose.js';

/**
 * Assisted grading: the grade a checked judgement gives, how one grader
 * configuration agrees with people, and where a grade goes — to count, or to a
 * person first. Every number here was worked out by hand, not read off the code.
 */

const TASK = ['Not met', 'Partly met', 'Met'];

const RUBRIC: WrittenResponseRubric = {
  criteria: [
    { name: 'Task', weight: 2, levels: TASK.map((label) => ({ label })) },
    { name: 'Grammar', weight: 1 },
  ],
};

const item: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr-weekend',
  title: 'Your weekend',
  prompt: 'Write about your weekend.',
  minWords: 5,
  maxWords: 80,
  passThreshold: 0.7,
  languageTarget: 'en-A2',
  rubric: RUBRIC,
};

const judgement = (over: Partial<AiGradingJudgement> = {}): AiGradingJudgement => ({
  criteria: [
    {
      name: 'Task',
      level: 'Met',
      score: 1,
      probabilities: [0.05, 0.15, 0.8],
      comment: 'Covers it.',
    },
    { name: 'Grammar', score: 0.6, comment: 'Two slips.' },
  ],
  feedback: 'Watch your past tenses.',
  corrections: [{ original: 'buyed', corrected: 'bought', range: { start: 36, end: 41 } }],
  rationale: 'Task complete; two errors.',
  requiresHumanReview: false,
  provenance: { model: 'grader-1', promptHash: 'p1', generatedAt: '2026-10-18T09:00:00Z' },
  usage: { promptTokens: 900 },
  ...over,
});

/** A grade of Task on a level and Grammar on a score, as `gradeFromJudgement` would make it. */
function graded(
  by: 'ai' | 'human',
  task: number,
  grammar: number,
  extra: { probabilities?: number[]; without?: 'Grammar'; over?: Partial<GradeRecord> } = {},
): GradeRecord {
  const taskScore = task / 2;
  const score = (2 * taskScore + grammar) / 3;
  return {
    score,
    maxScore: 1,
    passed: score >= 0.7,
    feedback: null,
    criteria: [
      {
        name: 'Task',
        band: TASK[task] as string,
        score: taskScore,
        weight: 2,
        ...(extra.probabilities !== undefined ? { levelProbabilities: extra.probabilities } : {}),
      },
      ...(extra.without === 'Grammar' ? [] : [{ name: 'Grammar', score: grammar, weight: 1 }]),
    ],
    grader:
      by === 'ai'
        ? { kind: 'ai', model: 'grader-1', promptHash: 'p1' }
        : { kind: 'human', id: 'teacher-1' },
    ...extra.over,
  };
}

const PERSON_TASK = [0, 1, 2, 2, 1];
const MODEL_TASK = [0, 2, 2, 1, 1];
const PERSON_GRAMMAR = [0.2, 0.4, 0.6, 0.8, 1];
const MODEL_GRAMMAR = [0.3, 0.5, 0.7, 0.9, 1];
const SECOND_TASK = [0, 1, 2, 2, 2];
const SECOND_GRAMMAR = [0.2, 0.4, 0.6, 0.6, 1];

const PAIRS: CalibrationPair[] = PERSON_TASK.map((level, i) => ({
  model: graded('ai', MODEL_TASK[i] as number, MODEL_GRAMMAR[i] as number),
  person: graded('human', level, PERSON_GRAMMAR[i] as number),
}));

function reportOf(pairs: CalibrationPair[] = PAIRS, scope = item): CalibrationReport {
  const built = calibrationReport(pairs, scope);
  if (!built.ok) {
    throw new Error(built.reason);
  }
  return built.report;
}

describe('gradeFromJudgement', () => {
  it('computes the total with the item weights and pass line, and keeps the record whole', () => {
    expect(gradeFromJudgement(judgement(), item)).toEqual({
      score: (2 * 1 + 0.6) / 3,
      maxScore: 1,
      passed: true,
      feedback: 'Watch your past tenses.',
      criteria: [
        {
          name: 'Task',
          score: 1,
          weight: 2,
          band: 'Met',
          levelProbabilities: [0.05, 0.15, 0.8],
          comment: 'Covers it.',
        },
        { name: 'Grammar', score: 0.6, weight: 1, comment: 'Two slips.' },
      ],
      corrections: [{ original: 'buyed', corrected: 'bought', range: { start: 36, end: 41 } }],
      rationale: 'Task complete; two errors.',
      requiresHumanReview: false,
      grader: { kind: 'ai', model: 'grader-1', promptHash: 'p1' },
      usage: { promptTokens: 900 },
      gradedAt: '2026-10-18T09:00:00Z',
    });
  });

  it('names criteria as the author did, and records what the grader did not say as absent', () => {
    const grade = gradeFromJudgement(
      judgement({
        criteria: [
          { name: 'task', level: 'Partly met', score: 0.5 },
          { name: 'GRAMMAR', score: 1 },
        ],
        corrections: [],
        rationale: undefined as never,
        provenance: undefined as never,
        usage: undefined as never,
      }),
      item,
    );
    if ('unscorable' in grade) {
      throw new Error(grade.reason);
    }
    expect(grade.criteria?.map((one) => one.name)).toEqual(['Task', 'Grammar']);
    expect(grade.grader).toEqual({ kind: 'ai' });
    for (const key of ['corrections', 'rationale', 'usage', 'gradedAt']) {
      expect(grade).not.toHaveProperty(key);
    }
  });

  it('takes the pass line from the options before the item, as gradeFromRubric does', () => {
    const grade = gradeFromJudgement(judgement(), item, { passThreshold: 0.9 });
    expect('unscorable' in grade ? null : grade.passed).toBe(false);
  });

  it('is unscorable for a judgement of another rubric, and never a grade', () => {
    const other = gradeFromJudgement(
      judgement({ criteria: [...judgement().criteria, { name: 'Style', score: 1 }] }),
      item,
    );
    expect(other).toMatchObject({ unscorable: true });
    const twice = gradeFromJudgement(
      judgement({ criteria: [...judgement().criteria, { name: 'task', score: 1 }] }),
      item,
    );
    expect(twice).toMatchObject({ unscorable: true });
    const short = gradeFromJudgement(
      judgement({ criteria: [judgement().criteria[0]] as never }),
      item,
    );
    expect(short).toEqual({
      unscorable: true,
      reason:
        'The judgement leaves out criterion "Grammar". A total over fewer criteria would grade a different task.',
    });
    expect(gradeFromJudgement(judgement(), { ...item, rubric: undefined } as never)).toMatchObject({
      unscorable: true,
    });
  });

  it('is unscorable for an item whose rubric names a criterion twice: one of the two would go uncounted', () => {
    const repeated = {
      ...item,
      rubric: { criteria: [...RUBRIC.criteria, { name: ' grammar ', weight: 3 }] },
    };
    expect(gradeFromJudgement(judgement(), repeated)).toEqual({
      unscorable: true,
      reason:
        "This item's rubric names a criterion twice, so a judgement cannot say which of the two it grades.",
    });
  });

  it("passes gradeFromRubric's own refusals through", () => {
    const broken = gradeFromJudgement(
      judgement({
        criteria: [
          { name: 'Task', score: Number.NaN },
          { name: 'Grammar', score: 1 },
        ],
      }),
      item,
    );
    expect(broken).toMatchObject({ unscorable: true });
  });
});

describe('calibration statistics', () => {
  it('quadratic kappa, worked by hand: 9/14 on three levels', () => {
    expect(quadraticKappa(PERSON_TASK, MODEL_TASK, 3)).toBeCloseTo(9 / 14, 12);
    expect(quadraticKappa([0, 1, 2], [0, 1, 2], 3)).toBe(1);
    expect(quadraticKappa([1, 1], [1, 1], 3)).toBeNull();
    expect(quadraticKappa([], [], 3)).toBeNull();
    expect(quadraticKappa([0], [0], 1)).toBeNull();
  });

  it('Pearson r and the standardised mean difference, null where undefined', () => {
    expect(pearson([0, 0.5, 1, 1, 0.5], [0, 1, 1, 0.5, 0.5])).toBeCloseTo(0.45 / 0.7, 12);
    expect(pearson([1], [1])).toBeNull();
    expect(pearson([1, 1], [0, 1])).toBeNull();
    expect(standardizedMeanDifference(MODEL_GRAMMAR, PERSON_GRAMMAR)).toBeCloseTo(
      0.08 / Math.sqrt((0.0656 + 0.08) / 2),
      10,
    );
    expect(standardizedMeanDifference([], [])).toBeNull();
    expect(standardizedMeanDifference([0.5, 0.5], [0.5, 0.5])).toBeNull();
  });
});

describe('calibrationReport', () => {
  it('measures a criterion on levels: agreement, kappa, confusion and the scores', () => {
    const task = reportOf().criteria[0];
    expect(task).toMatchObject({
      name: 'Task',
      scale: 'levels',
      levels: 3,
      pairs: 5,
      exactAgreement: 3 / 5,
      adjacentAgreement: 1,
      confusion: [
        [1, 0, 0],
        [0, 1, 1],
        [0, 1, 1],
      ],
      standardizedMeanDifference: 0,
      probabilityPairs: 0,
      calibrationError: null,
      brierScore: null,
    });
    expect(task?.quadraticKappa).toBeCloseTo(9 / 14, 12);
    expect(task?.pearson).toBeCloseTo(9 / 14, 12);
    expect(task?.meanAbsoluteError).toBeCloseTo(0.2, 12);
    expect(task).not.toHaveProperty('humanPairs');
  });

  it('measures a criterion on scores: r, error and difference, no kappa', () => {
    const grammar = reportOf().criteria[1];
    expect(grammar).toMatchObject({ name: 'Grammar', scale: 'score', pairs: 5 });
    expect(grammar?.pearson).toBeCloseTo(0.36 / Math.sqrt(0.4 * 0.328), 10);
    expect(grammar?.meanAbsoluteError).toBeCloseTo(0.08, 12);
    expect(grammar?.standardizedMeanDifference).toBeCloseTo(0.08 / Math.sqrt(0.0728), 10);
    for (const key of ['quadraticKappa', 'exactAgreement', 'confusion', 'levels']) {
      expect(grammar).not.toHaveProperty(key);
    }
  });

  it('measures the totals, pass or fail included', () => {
    const total = reportOf().total;
    const person = PAIRS.map((pair) => pair.person.score);
    const model = PAIRS.map((pair) => pair.model.score);
    expect(total.pairs).toBe(5);
    expect(total.passAgreement).toBe(3 / 5);
    expect(total.meanAbsoluteError).toBeCloseTo(
      model.reduce((sum, m, i) => sum + Math.abs(m - (person[i] as number)), 0) / 5,
      12,
    );
    expect(total.pearson).toBeCloseTo(pearson(model, person) as number, 12);
  });

  it("measures the model's level probabilities: calibration error and Brier score", () => {
    const pairs = PAIRS.map((pair, i) =>
      i === 0
        ? { ...pair, model: graded('ai', 0, 0.3, { probabilities: [0.7, 0.2, 0.1] }) }
        : i === 1
          ? { ...pair, model: graded('ai', 2, 0.5, { probabilities: [0.1, 0.3, 0.6] }) }
          : pair,
    );
    const task = reportOf(pairs).criteria[0];
    expect(task?.probabilityPairs).toBe(2);
    // Bins 0.7 (right) and 0.6 (wrong): half of |1 - 0.7| plus half of |0 - 0.6|.
    expect(task?.calibrationError).toBeCloseTo(0.45, 12);
    // (0.09 + 0.04 + 0.01) and (0.01 + 0.49 + 0.36), averaged.
    expect(task?.brierScore).toBeCloseTo(0.5, 12);
  });

  it('measures calibration over bins several grades share, and a Brier score against the right level', () => {
    const odds = [
      [0.7, 0.2, 0.1],
      [0.1, 0.15, 0.75],
      [0.05, 0.05, 0.9],
      [0.2, 0.6, 0.2],
      [0.1, 0.8, 0.1],
    ];
    const pairs = PAIRS.map((pair, i) => ({
      ...pair,
      model: graded('ai', MODEL_TASK[i] as number, MODEL_GRAMMAR[i] as number, {
        probabilities: odds[i] as number[],
      }),
    }));
    const task = reportOf(pairs).criteria[0];
    expect(task?.probabilityPairs).toBe(5);
    // Bins 7 (0.7 right, 0.75 wrong), 9 (0.9 right), 6 (0.6 wrong) and 8 (0.8 right):
    // (|1 - 1.45| + |1 - 0.9| + |0 - 0.6| + |1 - 0.8|) / 5.
    expect(task?.calibrationError).toBeCloseTo((0.45 + 0.1 + 0.6 + 0.2) / 5, 12);
    // Per pair, against the person's level: 0.14, 1.295, 0.015, 1.04 and 0.06.
    expect(task?.brierScore).toBeCloseTo(2.55 / 5, 12);
  });

  it('ignores probabilities that are not a distribution whose likeliest is the level chosen', () => {
    const counted = (probabilities: number[]) =>
      reportOf(
        PAIRS.map((pair, i) =>
          i === 0 ? { ...pair, model: graded('ai', 0, 0.3, { probabilities }) } : pair,
        ),
      ).criteria[0]?.probabilityPairs;
    const holed = Object.assign(new Array<number>(3), { 0: 0.7, 1: 0.3 });
    for (const probabilities of [
      [0.7, 0.3],
      [0.7, 0.4, -0.1],
      [0.7, 0.2, Number.NaN],
      [0.5, 0.2, 0.1],
      [1.0000005, 0, 0],
      [0.2, 0.7, 0.1],
      holed,
    ]) {
      expect(counted(probabilities)).toBe(0);
    }
    expect(counted([0.7, 0.2, 0.1 + 5e-7])).toBe(1);
    expect(counted([0.45, 0.45, 0.1])).toBe(1);
  });

  /** The report's measure of one criterion, with pair 1's model judgement of it replaced. */
  const measured = (index: 0 | 1, judged: CriterionScore | null) =>
    reportOf(
      PAIRS.map((pair, i) => {
        if (i !== 0) {
          return pair;
        }
        const kept = (pair.model.criteria ?? []).filter((_, at) => at !== index);
        return { ...pair, model: { ...pair.model, criteria: judged ? [...kept, judged] : kept } };
      }),
    ).criteria[index];

  it('reads a score as gradeFromRubric does: out of its maximum, a hair outside clamped', () => {
    const base = reportOf().criteria[1];
    expect(measured(1, { name: 'grammar', score: 3, maxScore: 10 })).toEqual(base);
    expect(measured(1, { name: 'Grammar', score: 1 + 1e-12 })).toEqual(
      measured(1, { name: 'Grammar', score: 1 }),
    );
    expect(measured(1, { name: 'Grammar', score: -1e-12 })).toEqual(
      measured(1, { name: 'Grammar', score: 0 }),
    );
  });

  it('measures no score it cannot read as one', () => {
    for (const judged of [
      null,
      { name: 'Grammar', band: 'Good' },
      { name: 'Grammar', score: Number.NaN },
      { name: 'Grammar', score: 0, maxScore: 0 },
      { name: 'Grammar', score: -0.5, maxScore: -1 },
      { name: 'Grammar', score: 0, maxScore: Number.POSITIVE_INFINITY },
      { name: 'Grammar', score: 1.5 },
      { name: 'Grammar', score: -0.1 },
      { name: 'Grammar', score: 0.3, notApplicable: true },
    ]) {
      expect(measured(1, judged)?.pairs).toBe(4);
    }
  });

  it('reads a level by its label, as labels are compared, and no level the criterion lacks', () => {
    expect(measured(0, { name: 'TASK', band: '  not MET ', weight: 2 })).toEqual(
      reportOf().criteria[0],
    );
    for (const judged of [
      { name: 'Task', score: 0, weight: 2 },
      { name: 'Task', band: 'Brilliant', weight: 2 },
    ]) {
      expect(measured(0, judged)?.pairs).toBe(4);
    }
  });

  it('measures no criterion of a grade that has none, but counts its total', () => {
    const bare: GradeRecord = { score: 0.5, maxScore: 1, passed: false, feedback: null };
    const report = reportOf(PAIRS.map((pair, i) => (i === 4 ? { ...pair, person: bare } : pair)));
    expect(report.criteria.map((one) => one.pairs)).toEqual([4, 4]);
    expect(report.total.pairs).toBe(5);
  });

  it('gives every metric of a criterion nobody could measure as null', () => {
    const blind = PAIRS.map((pair) => ({
      ...pair,
      model: { ...pair.model, criteria: [{ name: 'Task', score: 0.5, weight: 2 }] },
    }));
    const [task, grammar] = reportOf(blind).criteria;
    expect(task).toEqual({
      name: 'Task',
      scale: 'levels',
      levels: 3,
      pairs: 0,
      pearson: null,
      meanAbsoluteError: null,
      standardizedMeanDifference: null,
      exactAgreement: null,
      adjacentAgreement: null,
      quadraticKappa: null,
      confusion: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      probabilityPairs: 0,
      calibrationError: null,
      brierScore: null,
    });
    expect(grammar).toEqual({
      name: 'Grammar',
      scale: 'score',
      pairs: 0,
      pearson: null,
      meanAbsoluteError: null,
      standardizedMeanDifference: null,
    });
  });

  it('compares with two people, when a second person marked the same responses', () => {
    const pairs = PAIRS.map((pair, i) => ({
      ...pair,
      secondPerson: graded('human', SECOND_TASK[i] as number, PERSON_GRAMMAR[i] as number),
    }));
    const [task, grammar] = reportOf(pairs).criteria;
    const humanKappa = 1 - 0.25 / 1.55;
    expect(task?.humanPairs).toBe(5);
    expect(task?.humanQuadraticKappa).toBeCloseTo(humanKappa, 12);
    expect(task?.degradation).toBeCloseTo(humanKappa - 9 / 14, 12);
    expect(grammar?.humanPearson).toBe(1);
    expect(grammar?.degradation).toBeCloseTo(1 - (grammar?.pearson as number), 12);
    expect(reportOf(pairs).total.humanPairs).toBe(5);
  });

  it('compares the people only where the second judged the criterion', () => {
    const pairs = PAIRS.map((pair, i) => ({
      ...pair,
      secondPerson: graded('human', SECOND_TASK[i] as number, SECOND_GRAMMAR[i] as number, {
        ...(i === 0 ? { without: 'Grammar' as const } : {}),
      }),
    }));
    expect(reportOf(pairs).criteria.map((one) => one.humanPairs)).toEqual([5, 4]);
  });

  it('gives no degradation where either agreement is undefined', () => {
    const modelVaried = (i: number) =>
      graded('ai', MODEL_TASK[i] as number, MODEL_GRAMMAR[i] as number);
    const personVaried = (i: number) =>
      graded('human', PERSON_TASK[i] as number, PERSON_GRAMMAR[i] as number);
    const secondVaried = (i: number) =>
      graded('human', SECOND_TASK[i] as number, SECOND_GRAMMAR[i] as number);
    const flatModel = () => graded('ai', 1, 0.5);
    const flatPerson = () => graded('human', 1, 0.5);
    const build = (
      model: (i: number) => GradeRecord,
      person: (i: number) => GradeRecord,
      second: (i: number) => GradeRecord,
    ) =>
      reportOf(
        PERSON_TASK.map((_, i) => ({
          model: model(i),
          person: person(i),
          secondPerson: second(i),
        })),
      );

    // The second person never varies: no human r on scores or on totals.
    const flatSecond = build(modelVaried, personVaried, flatPerson);
    expect(flatSecond.criteria[1]).toMatchObject({ humanPearson: null, degradation: null });
    expect(flatSecond.total).toMatchObject({ humanPearson: null, degradation: null });
    expect(flatSecond.total.pearson).not.toBeNull();

    // Both people on one level: no human kappa, though the model's is defined.
    const flatPeople = build(modelVaried, flatPerson, flatPerson);
    expect(flatPeople.criteria[0]).toMatchObject({
      quadraticKappa: 0,
      humanQuadraticKappa: null,
      degradation: null,
    });

    // The model never varies: no model r on scores or on totals.
    const flatGrader = build(flatModel, personVaried, secondVaried);
    expect(flatGrader.criteria[1]).toMatchObject({ pearson: null, degradation: null });
    expect(flatGrader.criteria[1]?.humanPearson).not.toBeNull();
    expect(flatGrader.total).toMatchObject({ pearson: null, degradation: null });
    expect(flatGrader.total.humanPearson).not.toBeNull();

    // The model and the person on one level: no model kappa, though the human one is defined.
    const flatPair = build(flatModel, flatPerson, secondVaried);
    expect(flatPair.criteria[0]).toMatchObject({
      quadraticKappa: null,
      humanQuadraticKappa: 0,
      degradation: null,
    });
  });

  it('measures a criterion only over the pairs where both judged it on its scale', () => {
    const pairs = PAIRS.map((pair, i) =>
      i === 0
        ? { ...pair, person: graded('human', 0, 0.2, { without: 'Grammar' }) }
        : i === 1
          ? {
              ...pair,
              model: graded('ai', 1, 0.5, {
                over: {
                  criteria: [
                    { name: 'Task', band: 'Brilliant', weight: 2 },
                    { name: 'Grammar', score: 0.5, weight: 1 },
                  ],
                },
              }),
            }
          : pair,
    );
    const [task, grammar] = reportOf(pairs).criteria;
    expect(task?.pairs).toBe(4);
    expect(grammar?.pairs).toBe(4);
  });

  it('binds the report to one configuration, and hashes it', () => {
    const report = reportOf();
    expect(report.configuration).toEqual({
      model: 'grader-1',
      promptHash: 'p1',
      rubricHash: contentHash(item.rubric),
      languageTarget: 'en-A2',
    });
    expect(report.reportHash).toBe(reportOf().reportHash);
    const { reportHash, ...rest } = report;
    expect(reportHash).toBe(contentHash(rest));
    const changed = PAIRS.map((pair, i) =>
      i === 4 ? { ...pair, person: graded('human', 0, 1) } : pair,
    );
    expect(reportOf(changed).reportHash).not.toBe(reportHash);
  });

  it('says why it cannot measure', () => {
    const reason = (pairs: CalibrationPair[], scope: Partial<WrittenResponseData> = item) => {
      const built = calibrationReport(pairs, scope);
      return built.ok ? 'measured' : built.reason;
    };
    expect(reason([])).toMatch(/No pairs/);
    expect(reason(PAIRS, { ...item, rubric: undefined } as never)).toMatch(/No rubric/);
    expect(
      reason(PAIRS, {
        ...item,
        rubric: { criteria: [{ name: 'Task', weight: 1, levels: [{ label: 'Only' }] }] },
      }),
    ).toMatch(/levels the grading functions cannot read/);
    // Each problem in the second pair, so the reason must name the pair it is in.
    const second = (pair: Partial<CalibrationPair>) => [
      PAIRS[0] as CalibrationPair,
      { ...PAIRS[1], ...pair } as CalibrationPair,
    ];
    expect(reason(second({ model: { ...graded('ai', 2, 0.5), score: 85 } }))).toMatch(
      /^Pair 2 has a grade whose numbers cannot be a grade/,
    );
    expect(reason(second({ secondPerson: { ...graded('human', 1, 0.4), maxScore: 0 } }))).toMatch(
      /^Pair 2 has a grade whose numbers/,
    );
    expect(reason(second({ person: graded('ai', 1, 0.4) }))).toMatch(
      /^Pair 2 has a person's grade that a grader other than a person gave/,
    );
    expect(reason(second({ secondPerson: graded('ai', 1, 0.4) }))).toMatch(
      /^Pair 2 has a person's/,
    );
    expect(
      reason(second({ model: graded('ai', 2, 0.5, { over: { grader: { kind: 'ai' } } }) })),
    ).toMatch(/^Pair 2's model grade does not name its model and prompt/);
    expect(
      reason(
        second({
          model: graded('ai', 2, 0.5, {
            over: { grader: { kind: 'ai', model: 'grader-1', promptHash: 'p2' } },
          }),
        }),
      ),
    ).toMatch(/^Pair 2's model grade comes from another configuration/);
    expect(
      reason(PAIRS, {
        ...item,
        rubric: { criteria: [RUBRIC.criteria[1], { name: 'Style', weight: 1, levels: 'x' }] },
      } as never),
    ).toBe('Criterion "Style" has levels the grading functions cannot read.');
  });

  it("treats a person's grade with no grader as a person's", () => {
    const pairs = PAIRS.map((pair) => ({
      ...pair,
      person: { ...pair.person, grader: undefined } as never,
    }));
    expect(calibrationReport(pairs, item).ok).toBe(true);
  });
});

describe('graderConfiguration', () => {
  it("names the grade's model and prompt, the rubric's content and the target", () => {
    expect(graderConfiguration(graded('ai', 1, 1), item)).toEqual({
      model: 'grader-1',
      promptHash: 'p1',
      rubricHash: contentHash(item.rubric),
      languageTarget: 'en-A2',
    });
    expect(graderConfiguration(graded('ai', 1, 1), { rubric: RUBRIC })?.languageTarget).toBeNull();
    expect(graderConfiguration(graded('ai', 1, 1), {})?.rubricHash).toBe(contentHash(null));
    expect(graderConfiguration(graded('human', 1, 1), item)).toBeNull();
    expect(
      graderConfiguration(
        graded('ai', 1, 1, { over: { grader: { kind: 'ai', model: '', promptHash: 'p1' } } }),
        item,
      ),
    ).toBeNull();
  });
});

describe('routeGrade', () => {
  const model = graded('ai', 2, 0.9);

  it('fails closed in an exam: no calibration of this configuration, no grade counts', () => {
    expect(routeGrade(model, { mode: 'exam', item })).toEqual({
      to: 'person',
      reasons: ['no-calibration'],
    });
    expect(routeGrade(model, { mode: 'practice', item })).toEqual({ to: 'model', reasons: [] });
  });

  it('lets a grade count in an exam once a matching report is supplied, and records it', () => {
    const report = reportOf();
    expect(routeGrade(model, { mode: 'exam', item, calibration: report })).toEqual({
      to: 'model',
      reasons: [],
      calibration: { reportHash: report.reportHash, pairs: 5 },
    });
  });

  it('does not take a report of another configuration: model, prompt, rubric or target', () => {
    const report = reportOf();
    const otherPrompt = graded('ai', 2, 0.9, {
      over: { grader: { kind: 'ai', model: 'grader-1', promptHash: 'p2' } },
    });
    const editedRubric = {
      ...item,
      rubric: {
        criteria: [
          {
            name: 'Task',
            weight: 2,
            levels: [
              { label: 'Not met' },
              { label: 'Partly met' },
              { label: 'Met', description: 'Edited.' },
            ],
          },
          { name: 'Grammar', weight: 1 },
        ],
      },
    };
    for (const [grade, scope] of [
      [otherPrompt, item],
      [model, editedRubric],
      [model, { ...item, languageTarget: 'en-B1' }],
    ] as const) {
      expect(routeGrade(grade, { mode: 'exam', item: scope, calibration: report }).reasons).toEqual(
        ['no-calibration'],
      );
    }
  });

  it('holds a report to every threshold the host set, and to none it did not', () => {
    const report = reportOf();
    const route = (calibration: object) =>
      routeGrade(model, { mode: 'exam', item, calibration: report, policy: { calibration } })
        .reasons;
    expect(route({})).toEqual([]);
    expect(
      route({ minQuadraticKappa: 0.6, minPearson: 0.6, minPairs: 5, maxMeanAbsoluteError: 0.2 }),
    ).toEqual([]);
    expect(route({ minQuadraticKappa: 0.7 })).toEqual(['calibration-below-policy']);
    expect(route({ minExactAgreement: 0.61 })).toEqual(['calibration-below-policy']);
    expect(route({ minPairs: 6 })).toEqual(['calibration-below-policy']);
    expect(route({ minPearson: 0.995 })).toEqual(['calibration-below-policy']);
    expect(route({ maxMeanAbsoluteError: 0.1 })).toEqual(['calibration-below-policy']);
    expect(route({ maxAbsStandardizedMeanDifference: 0.29 })).toEqual(['calibration-below-policy']);
    // No second person: a degradation cannot be shown, so its threshold fails.
    expect(route({ maxDegradation: 1 })).toEqual(['calibration-below-policy']);
    // No grade carried probabilities: calibration error is not checked.
    expect(route({ maxCalibrationError: 0 })).toEqual([]);
  });

  it('checks calibration error where grades carried probabilities', () => {
    const pairs = PAIRS.map((pair, i) =>
      i === 0 ? { ...pair, model: graded('ai', 0, 0.3, { probabilities: [0.7, 0.2, 0.1] }) } : pair,
    );
    const report = reportOf(pairs);
    // One pair, right at 0.7: an error of 0.3 (as a double, a hair above it).
    expect(report.criteria[0]?.calibrationError).toBeCloseTo(0.3, 12);
    const route = (max: number) =>
      routeGrade(model, {
        mode: 'exam',
        item,
        calibration: report,
        policy: { calibration: { maxCalibrationError: max } },
      }).reasons;
    expect(route(0.31)).toEqual([]);
    expect(route(0.29)).toEqual(['calibration-below-policy']);
  });

  it('fails a threshold whose metric is undefined: what cannot be shown is not assumed', () => {
    const flat = PERSON_TASK.map(() => ({
      model: graded('ai', 1, 0.5),
      person: graded('human', 1, 0.5),
    }));
    const report = reportOf(flat);
    const policy = { calibration: { minQuadraticKappa: 0 } };
    expect(routeGrade(model, { mode: 'exam', item, calibration: report, policy }).reasons).toEqual([
      'calibration-below-policy',
    ]);
  });

  it('sends an unsure, asked-for, low-confidence or sampled grade to a person, giving every reason in order', () => {
    const doubtful = graded('ai', 2, 0.9, {
      probabilities: [0.3, 0.3, 0.4],
      over: { requiresHumanReview: true, confidence: 'low' },
    });
    const key = Array.from({ length: 50 }, (_, i) => `attempt-${i}:slot-3`).find((k) =>
      inAuditSample(k, 0.5, 'term-1'),
    );
    expect(key).toBeDefined();
    expect(
      routeGrade(doubtful, {
        mode: 'exam',
        item,
        policy: {
          minLevelProbability: 0.5,
          routeLowConfidence: true,
          audit: { rate: 0.5, seed: 'term-1' },
        },
        sampleKey: key as string,
      }).reasons,
    ).toEqual(['no-calibration', 'unsure', 'model-asked', 'low-confidence', 'audit-sample']);
    expect(
      routeGrade(doubtful, { mode: 'practice', item, policy: { minLevelProbability: 0.4 } })
        .reasons,
    ).toEqual(['model-asked']);
    expect(
      routeGrade(graded('ai', 2, 0.9, { over: { confidence: 'low' } }), { mode: 'practice', item })
        .to,
    ).toBe('model');
  });

  it('sends a grade to a person when a criterion on levels shows no probability to hold to the minimum', () => {
    const route = (grade: GradeRecord, scope: Partial<WrittenResponseData> = item) =>
      routeGrade(grade, { mode: 'practice', item: scope, policy: { minLevelProbability: 0.5 } })
        .reasons;
    const sure = graded('ai', 2, 0.9, { probabilities: [0.1, 0.2, 0.7] });
    expect(route(sure)).toEqual([]);
    const withTask = (task: CriterionScore | null) =>
      graded('ai', 2, 0.9, {
        over: {
          criteria: [...(task ? [task] : []), { name: 'Grammar', score: 0.9, weight: 1 }],
        },
      });
    for (const unsure of [
      graded('ai', 2, 0.9),
      graded('ai', 2, 0.9, { probabilities: [0.3, 0.3, 0.3] }),
      withTask(null),
      withTask({ name: 'Task', band: 'Brilliant', weight: 2 }),
    ]) {
      expect(route(unsure)).toEqual(['unsure']);
    }
    expect(route(withTask({ name: 'Task', notApplicable: true, weight: 2 }))).toEqual([]);
    const unreadable = {
      ...item,
      rubric: { criteria: [{ name: 'Task', weight: 1, levels: [{ label: 'Only' }] }] },
    };
    expect(route(sure, unreadable)).toEqual(['unsure']);
    const scoresOnly = { ...item, rubric: { criteria: [{ name: 'Grammar', weight: 1 }] } };
    expect(route(graded('ai', 2, 0.9), scoresOnly)).toEqual([]);
    expect(route(graded('ai', 2, 0.9), { ...item, rubric: undefined } as never)).toEqual([]);
  });

  it('refuses a mode it does not know, rather than read it as practice', () => {
    expect(() => routeGrade(model, { mode: 'Exam' as never, item })).toThrow(RangeError);
  });

  it('refuses an audit with no sample key, rather than sample nothing', () => {
    expect(() =>
      routeGrade(model, { mode: 'practice', item, policy: { audit: { rate: 0.1, seed: 's' } } }),
    ).toThrow(RangeError);
  });

  it('refuses a policy that cannot be applied, before reading the grade', () => {
    const bad = [
      { minLevelProbability: 1.5 },
      { minLevelProbability: Number.NaN },
      { calibration: { minPairs: Number.POSITIVE_INFINITY } },
      { calibration: { maxMeanAbsoluteError: -0.1 } },
      { calibration: { minExactAgreement: 2 } },
      { calibration: { maxCalibrationError: 1.1 } },
      { calibration: { minQuadraticKappa: '0.7' } },
      { audit: { rate: 2, seed: 's' } },
      { audit: { rate: 0.1, seed: 7 } },
    ];
    for (const policy of bad) {
      expect(() => routeGrade(model, { mode: 'practice', item, policy: policy as never })).toThrow(
        RangeError,
      );
    }
  });
});

describe('inAuditSample', () => {
  it('is stable for a key, and draws a new sample with a new seed', () => {
    expect(inAuditSample('a:1', 0.3, 's')).toBe(inAuditSample('a:1', 0.3, 's'));
    const keys = Array.from({ length: 200 }, (_, i) => `attempt-${i}:slot-1`);
    const first = keys.filter((k) => inAuditSample(k, 0.3, 'term-1'));
    const second = keys.filter((k) => inAuditSample(k, 0.3, 'term-2'));
    expect(first).not.toEqual(second);
  });

  it('takes none at 0, all at 1, and close to the rate in between', () => {
    const keys = Array.from({ length: 20_000 }, (_, i) => `attempt-${i}:slot-2`);
    expect(keys.some((k) => inAuditSample(k, 0, 's'))).toBe(false);
    expect(keys.every((k) => inAuditSample(k, 1, 's'))).toBe(true);
    const share = keys.filter((k) => inAuditSample(k, 0.1, 's')).length / keys.length;
    expect(Math.abs(share - 0.1)).toBeLessThan(0.01);
  });

  it('draws two responses of one attempt independently, though their keys differ by a character', () => {
    // Without the finaliser, slot 2 was in the sample 97 times in 100 that slot 1 was.
    const attempts = Array.from({ length: 20_000 }, (_, i) => `attempt-${i}`);
    for (const [first, second] of [
      ['slot-1', 'slot-2'],
      ['essay-a', 'essay-b'],
    ]) {
      const drawn = attempts.filter((a) => inAuditSample(`${a}:${first}`, 0.25, 'term-1'));
      const together = drawn.filter((a) => inAuditSample(`${a}:${second}`, 0.25, 'term-1'));
      expect(Math.abs(together.length / drawn.length - 0.25)).toBeLessThan(0.03);
    }
  });

  it('refuses a rate outside 0 to 1, and a key or seed that is not a string', () => {
    expect(() => inAuditSample('k', -0.1, 's')).toThrow(RangeError);
    expect(() => inAuditSample('k', 1.01, 's')).toThrow(RangeError);
    expect(() => inAuditSample(undefined as never, 0.5, 's')).toThrow(RangeError);
    expect(() => inAuditSample('k', 0.5, 7 as never)).toThrow(RangeError);
  });
});

describe('outcomeFromRoutedGrade', () => {
  const model = graded('ai', 2, 0.9);

  it('lets a grade routed to the model count, with the decision on the record', () => {
    const routing = { to: 'model' as const, reasons: [] };
    expect(outcomeFromRoutedGrade(model, routing)).toMatchObject({
      status: 'graded',
      score: model.score,
      grade: { routing },
    });
  });

  it('refuses a routed grade whose numbers cannot be a grade, as outcomeFromGrade does', () => {
    expect(
      outcomeFromRoutedGrade({ ...model, score: 85 }, { to: 'model', reasons: [] }),
    ).toMatchObject({
      status: 'deferred',
      reason: 'grade_rejected',
    });
  });

  it('holds a grade routed to a person, and the attempt stays provisional', () => {
    const routing = { to: 'person' as const, reasons: ['no-calibration' as const] };
    const outcome = outcomeFromRoutedGrade(model, routing);
    expect(outcome).toEqual({
      status: 'deferred',
      reason: 'awaiting_human_review',
      maxScore: 1,
      pendingGrade: { ...model, routing },
    });
    const composed = composeAssessmentScore(
      [
        {
          id: 'writing',
          weight: 1,
          items: [
            {
              slotId: 'quiz',
              points: 1,
              outcome: {
                status: 'scored',
                score: 1,
                maxScore: 1,
                passed: true,
                feedback: null,
                details: [],
              },
            },
            { slotId: 'essay', points: 1, outcome },
          ],
        },
      ],
      { passThreshold: 0.5, rounding: { mode: 'half-up', dp: 2 } },
    );
    expect(composed).toMatchObject({
      status: 'provisional',
      passed: null,
      pendingSlotIds: ['essay'],
    });
  });
});
