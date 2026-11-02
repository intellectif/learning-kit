import { describe, expect, it, vi } from 'vitest';
import { ActivitySchemaError, RedactedScoringError } from '../../errors.js';
// The module, not the function: one test makes `gradeFromRubric` refuse, which
// is the only condition left that reaches the grade's own refusal.
import * as grading from '../../grading.js';
import { redact } from '../../redact.js';
import type {
  SpeakingResponseData,
  SpeakingResponseLearnerResponse,
} from '../../types/activity.js';
import type { AiGradingJudgement } from '../../types/ai.js';
import type { GradeRecord } from '../../types/grading.js';
import type {
  GradeSpeakingResponseOptions,
  SpeechAssessment,
  SpeechUnscorable,
} from '../../types/speech.js';
import { calibrationReport, gradeSpeakingResponse, routeGrade } from '../index.js';
import { gradingOptions, speechAssessment, spoken } from './read-aloud-fixtures.js';

const TAKE_KEY = 'answer-1';

/** What the learner said, verbatim: twelve words. */
const TRANSCRIPT = 'um I think the city is uh more better for young people';

/** A speaking item: two judged criteria, then pronunciation and fluency from the engine. */
function speakingItem(over: Partial<SpeakingResponseData> = {}): SpeakingResponseData {
  return {
    schemaVersion: '1.0',
    type: 'speaking-response',
    id: 'sr-1',
    title: 'City or country',
    prompt: 'Would you rather live in a city or in the country? Say why.',
    locale: 'en-US',
    recording: { maxSeconds: 60 },
    rubric: {
      criteria: [
        { name: 'Content', weight: 2 },
        { name: 'Language', weight: 1 },
        { name: 'Pronunciation', weight: 1, measure: 'pronunciation' },
        { name: 'Fluency', weight: 1, measure: 'fluency' },
      ],
    },
    feedback: { correct: 'Well said.', incorrect: 'Try again.' },
    ...over,
  };
}

/** An unscripted assessment of `TAKE_KEY`, measured against the transcript. */
/** Fields to replace on an assessment; `undefined` removes one. */
type Over<T> = { [K in keyof T]?: T[K] | undefined };

function unscripted(over: Over<SpeechAssessment> = {}): SpeechAssessment {
  const { referenceText: _scripted, ...base } = speechAssessment({
    task: 'unscripted',
    recordingKey: TAKE_KEY,
    scores: { accuracy: 90, fluency: 60, prosody: 70, completeness: 100 },
    recognizedText: TRANSCRIPT,
    transcript: { text: TRANSCRIPT, source: { kind: 'auto', id: 'transcriber' } },
    words: TRANSCRIPT.split(' ').map((text) => spoken(text, { accuracy: 90 })),
  });
  return { ...base, ...over } as SpeechAssessment;
}

/** A model's judgement of the two judged criteria. */
function judgement(over: Over<AiGradingJudgement> = {}): AiGradingJudgement {
  return {
    criteria: [
      { name: 'Content', score: 0.75, level: 'Good', comment: 'A clear reason.' },
      { name: 'Language', score: 0.5, probabilities: [0.1, 0.4, 0.5] },
    ],
    feedback: 'You gave a reason; watch "more better".',
    corrections: [{ original: 'more better', corrected: 'better' }],
    rationale: 'One reason, developed.',
    requiresHumanReview: false,
    provenance: { model: 'judge-1', promptHash: 'p-1', generatedAt: '2026-11-02T10:00:00Z' },
    usage: { promptTokens: 900, completionTokens: 120 },
    ...over,
  } as AiGradingJudgement;
}

const recorded = (key: string = TAKE_KEY): SpeakingResponseLearnerResponse => ({
  type: 'speaking-response',
  recording: { key, mimeType: 'audio/wav' },
});

const BLANK: SpeakingResponseLearnerResponse = { type: 'speaking-response', recording: null };

function options(over: Partial<GradeSpeakingResponseOptions> = {}): GradeSpeakingResponseOptions {
  return { ...gradingOptions(), ...over };
}

/** Grades the fixture answer, with the given parts replaced. */
function grade(
  over: {
    data?: Partial<SpeakingResponseData>;
    response?: SpeakingResponseLearnerResponse;
    assessment?: Over<SpeechAssessment> | null;
    judgement?: Over<AiGradingJudgement> | null;
    options?: Partial<GradeSpeakingResponseOptions>;
  } = {},
): GradeRecord | SpeechUnscorable {
  return gradeSpeakingResponse(
    speakingItem(over.data),
    over.response ?? recorded(),
    {
      assessment: over.assessment === null ? null : unscripted(over.assessment),
      judgement: over.judgement === null ? null : judgement(over.judgement),
    },
    options(over.options),
  );
}

function graded(result: GradeRecord | SpeechUnscorable): GradeRecord {
  if ('unscorable' in result) {
    throw new Error(`expected a grade, got ${result.code}: ${result.reason}`);
  }
  return result;
}

function refused(result: GradeRecord | SpeechUnscorable): SpeechUnscorable {
  if (!('unscorable' in result)) {
    throw new Error(`expected a refusal, got a grade of ${result.score}`);
  }
  return result;
}

/** A rubric the engine scores alone. */
const MEASURED_ONLY: Partial<SpeakingResponseData> = {
  rubric: {
    criteria: [
      { name: 'Pronunciation', weight: 1, measure: 'pronunciation' },
      { name: 'Fluency', weight: 1, measure: 'fluency' },
    ],
  },
};

describe('gradeSpeakingResponse()', () => {
  describe('arguments', () => {
    it('refuses a plausibility policy or a rounding policy it cannot apply', () => {
      for (const maxWordsPerSecond of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() =>
          grade({ options: { plausibility: { maxWordsPerSecond, minVoicedMs: 500 } } }),
        ).toThrow(RangeError);
      }
      for (const minVoicedMs of [-1, Number.NaN, Number.NEGATIVE_INFINITY]) {
        expect(() =>
          grade({ options: { plausibility: { maxWordsPerSecond: 6, minVoicedMs } } }),
        ).toThrow(RangeError);
      }
      expect(() =>
        gradeSpeakingResponse(
          speakingItem(),
          recorded(),
          { assessment: unscripted(), judgement: judgement() },
          undefined as unknown as GradeSpeakingResponseOptions,
        ),
      ).toThrow(/maxWordsPerSecond of type undefined/);
      expect(() => grade({ options: { rounding: { dp: -1, mode: 'half-up' } } })).toThrow(
        RangeError,
      );
    });

    it('throws ActivitySchemaError for data that is not speaking-response data', () => {
      expect(() => grade({ data: { locale: 'english' } })).toThrow(ActivitySchemaError);
    });

    it('throws RedactedScoringError for a learner-safe projection', () => {
      const projection = redact(speakingItem()) as unknown as SpeakingResponseData;

      expect(() =>
        gradeSpeakingResponse(
          projection,
          recorded(),
          { assessment: unscripted(), judgement: judgement() },
          options(),
        ),
      ).toThrow(RedactedScoringError);

      const inherited = Object.create({ redacted: true }) as SpeakingResponseData;
      Object.assign(inherited, speakingItem());
      expect(() =>
        gradeSpeakingResponse(
          inherited,
          recorded(),
          { assessment: unscripted(), judgement: judgement() },
          options(),
        ),
      ).toThrow(RedactedScoringError);
    });

    it('throws TypeError for a response it cannot read', () => {
      const notSpeaking = {
        type: 'read-aloud',
        recording: null,
      } as unknown as SpeakingResponseLearnerResponse;

      expect(() => grade({ response: notSpeaking })).toThrow(TypeError);
      expect(() =>
        gradeSpeakingResponse(
          speakingItem(),
          null as unknown as SpeakingResponseLearnerResponse,
          { assessment: unscripted(), judgement: judgement() },
          options(),
        ),
      ).toThrow(/needs a speaking-response response/);
    });

    it('throws TypeError for a recording graded without its evidence or its measurement', () => {
      expect(() => grade({ assessment: null })).toThrow(/unscripted assessment/);
      expect(() =>
        gradeSpeakingResponse(
          speakingItem(),
          recorded(),
          undefined as unknown as { assessment: null; judgement: null },
          options(),
        ),
      ).toThrow(TypeError);
      expect(() => grade({ judgement: null })).toThrow(/"Content", "Language"/);
      expect(() => grade({ options: { measured: null } })).toThrow(/options.measured/);
    });

    it('throws RangeError for a measurement that cannot be a recording', () => {
      const bad = [
        { durationMs: -1, voicedMs: 0 },
        { durationMs: Number.NaN, voicedMs: 0 },
        { durationMs: 1000, voicedMs: -1 },
        { durationMs: 1000, voicedMs: Number.POSITIVE_INFINITY },
        { durationMs: 1000, voicedMs: 1001 },
        { durationMs: '1000', voicedMs: 0 },
        { durationMs: 1000, voicedMs: '0' },
      ];
      for (const measured of bad) {
        expect(() =>
          grade({ options: { measured: measured as GradeSpeakingResponseOptions['measured'] } }),
        ).toThrow(RangeError);
      }
    });
  });

  describe('a blank', () => {
    it('is a 0 graded from the item alone, without evidence or a measurement', () => {
      const result = graded(
        gradeSpeakingResponse(
          speakingItem(),
          BLANK,
          { assessment: null, judgement: null },
          options({ measured: null }),
        ),
      );

      expect(result).toEqual({
        score: 0,
        maxScore: 1,
        passed: false,
        feedback: 'Try again.',
        criteria: [],
      });
    });
  });

  describe('refusals', () => {
    it.each([
      ['invalid_assessment', { scale: 50 as unknown as 100 }],
      ['task_mismatch', { task: 'scripted' as const, referenceText: TRANSCRIPT }],
      ['locale_mismatch', { locale: 'en-GB' }],
      ['recording_mismatch', { recordingKey: 'answer-2' }],
      ['recording_mismatch', { recordingKey: undefined }],
      ['assessor_not_accepted', { assessor: { kind: 'ai' as const, model: 'm' } }],
      ['no_speech', { status: 'no_speech' as const }],
    ])('%s', (code, assessment) => {
      expect(refused(grade({ assessment })).code).toBe(code);
    });

    it('names the recording the evidence was for, or that it names none', () => {
      expect(refused(grade({ assessment: { recordingKey: 'answer-2' } })).reason).toMatch(
        /"answer-2"/,
      );
      expect(refused(grade({ assessment: { recordingKey: undefined } })).reason).toMatch(
        /names no recording/,
      );
    });

    it('accepts a model as the assessor when the caller opts in', () => {
      const result = grade({
        assessment: { assessor: { kind: 'ai', model: 'm' } },
        options: { allowAiAssessor: true },
      });

      expect(graded(result).score).toBeGreaterThan(0);
    });

    it('refuses too little voiced time', () => {
      const result = grade({ options: { measured: { durationMs: 4000, voicedMs: 400 } } });

      expect(refused(result).code).toBe('insufficient_voiced_time');
    });

    it('counts the rate from the transcript the judge reads', () => {
      // Twelve words in a second of voiced time is above six a second.
      const fast = grade({
        options: {
          measured: { durationMs: 4000, voicedMs: 1000 },
          plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
        },
      });
      expect(refused(fast).code).toBe('implausible_speech_rate');
      expect(refused(fast).reason).toMatch(/12 word/);

      // The same voiced time with a two-word transcript is plausible, whatever
      // the engine recognised.
      const short = grade({
        assessment: { transcript: { text: 'I agree', source: { kind: 'human' } } },
        options: {
          measured: { durationMs: 4000, voicedMs: 1000 },
          plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
        },
      });
      expect(graded(short).score).toBeGreaterThan(0);
    });

    it('counts what the engine recognised when there is no transcript', () => {
      const result = grade({
        assessment: { transcript: undefined },
        options: {
          measured: { durationMs: 4000, voicedMs: 1000 },
          plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
        },
      });

      expect(refused(result).code).toBe('implausible_speech_rate');
    });

    it('refuses words heard in no voiced time at all', () => {
      const result = grade({
        options: {
          measured: { durationMs: 4000, voicedMs: 0 },
          plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
        },
      });

      expect(refused(result).code).toBe('implausible_speech_rate');
    });

    it('grades no words in no voiced time as heard, and leaves the measures to say how', () => {
      const result = grade({
        data: MEASURED_ONLY,
        assessment: { transcript: undefined, recognizedText: '', words: [] },
        judgement: null,
        options: {
          measured: { durationMs: 4000, voicedMs: 0 },
          plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
        },
      });

      expect(graded(result).score).toBeCloseTo(0.75, 10);
    });

    it('refuses a weighted measure the assessment has no score for', () => {
      const result = refused(grade({ assessment: { scores: { accuracy: 90 } } }));

      expect(result.code).toBe('missing_dimension');
      expect(result.reason).toMatch(/"Fluency" from fluency/);
    });

    it('leaves out an unweighted measure the engine did not score', () => {
      const result = graded(
        grade({
          data: {
            rubric: {
              criteria: [
                { name: 'Content', weight: 1 },
                { name: 'Pronunciation', weight: 1, measure: 'pronunciation' },
                { name: 'Prosody', weight: 0, measure: 'prosody' },
              ],
            },
          },
          assessment: { scores: { accuracy: 90 } },
          judgement: { criteria: [{ name: 'Content', score: 0.5 }] },
        }),
      );

      expect(result.criteria?.map((one) => one.name)).toEqual(['Content', 'Pronunciation']);
      expect(result.score).toBeCloseTo(0.7, 10);
    });

    it('keeps an unweighted measure the engine did score, at weight 0', () => {
      const result = graded(
        grade({
          data: {
            rubric: {
              criteria: [
                { name: 'Content', weight: 1 },
                { name: 'Prosody', weight: 0, measure: 'prosody' },
              ],
            },
          },
          judgement: { criteria: [{ name: 'Content', score: 0.5 }] },
        }),
      );

      expect(result.criteria).toContainEqual({
        name: 'Prosody',
        score: 70,
        maxScore: 100,
        weight: 0,
      });
      expect(result.score).toBe(0.5);
    });
  });

  describe('a judgement that does not fit the item', () => {
    it.each([
      ['not a list', { criteria: null as unknown as [] }, /no list of criteria/],
      ['a null entry', { criteria: [null as unknown as never] }, /criterion of type undefined/],
      [
        'a name that is not text',
        { criteria: [{ name: 7 as unknown as string, score: 1 }] },
        /criterion 7/,
      ],
      [
        'a criterion the item does not have',
        { criteria: [{ name: 'Grammar', score: 1 }] },
        /"Grammar"/,
      ],
      [
        'a measured criterion the judge was not asked to score',
        {
          criteria: [
            { name: 'Content', score: 1 },
            { name: 'Language', score: 1 },
            { name: 'Fluency', score: 1 },
          ],
        },
        /"Fluency"/,
      ],
      [
        'a criterion twice',
        {
          criteria: [
            { name: 'Content', score: 1 },
            { name: ' content ', score: 1 },
          ],
        },
        /" content "/,
      ],
      [
        'a score above its scale',
        { criteria: [{ name: 'Content', score: 3 }] },
        /"Content" 3, off its 0..1 scale/,
      ],
      ['a score below its scale', { criteria: [{ name: 'Content', score: -0.1 }] }, /-0.1/],
      [
        'a score that is not a number',
        { criteria: [{ name: 'Content', score: Number.NaN }] },
        /NaN/,
      ],
      [
        'a score that is text',
        { criteria: [{ name: 'Content', score: '1' as unknown as number }] },
        /of type string/,
      ],
      [
        'a criterion left out',
        { criteria: [{ name: 'Content', score: 1 }] },
        /leaves out criterion "Language"/,
      ],
    ])('is refused: %s', (_case, over, reason) => {
      const result = refused(grade({ judgement: over as Partial<AiGradingJudgement> }));

      expect(result.code).toBe('judgement_mismatch');
      expect(result.reason).toMatch(reason);
    });

    it('is refused when the rubric leaves the judge nothing to score', () => {
      const result = refused(grade({ data: MEASURED_ONLY }));

      expect(result.code).toBe('judgement_mismatch');
    });

    it('matches names as a judgement names them: case, spacing and composition ignored', () => {
      const result = graded(
        grade({
          judgement: {
            criteria: [
              { name: '  CONTENT ', score: 1 },
              { name: 'language', score: 1 },
            ],
          },
        }),
      );

      expect(result.criteria?.map((one) => one.name)).toEqual([
        'Content',
        'Language',
        'Pronunciation',
        'Fluency',
      ]);
    });
  });

  describe('the grade', () => {
    it('is the weighted total of the judged criteria and the engine measures', () => {
      const result = graded(grade());

      // Content 0.75 ×2, Language 0.5 ×1, Pronunciation 0.9 ×1, Fluency 0.6 ×1.
      expect(result.score).toBeCloseTo((1.5 + 0.5 + 0.9 + 0.6) / 5, 10);
      expect(result.passed).toBe(true);
      expect(result.criteria).toEqual([
        { name: 'Content', score: 0.75, weight: 2, band: 'Good', comment: 'A clear reason.' },
        { name: 'Language', score: 0.5, weight: 1, levelProbabilities: [0.1, 0.4, 0.5] },
        { name: 'Pronunciation', score: 90, maxScore: 100, weight: 1 },
        { name: 'Fluency', score: 60, maxScore: 100, weight: 1 },
      ]);
    });

    it("is the judge's record when a judge scored", () => {
      const result = graded(grade());

      expect(result.feedback).toBe('You gave a reason; watch "more better".');
      expect(result.corrections).toEqual([{ original: 'more better', corrected: 'better' }]);
      expect(result.rationale).toBe('One reason, developed.');
      expect(result.requiresHumanReview).toBe(false);
      expect(result.grader).toEqual({ kind: 'ai', model: 'judge-1', promptHash: 'p-1' });
      expect(result.usage).toEqual({ promptTokens: 900, completionTokens: 120 });
      expect(result.gradedAt).toBe('2026-11-02T10:00:00Z');
    });

    it('keeps only what the judgement carries, and the authored feedback when it gave none', () => {
      const result = graded(
        grade({
          judgement: {
            feedback: null,
            corrections: [],
            rationale: undefined,
            requiresHumanReview: true,
            provenance: undefined,
            usage: undefined,
          },
        }),
      );

      expect(result.feedback).toBe('Well said.');
      expect(result).not.toHaveProperty('corrections');
      expect(result).not.toHaveProperty('rationale');
      expect(result).not.toHaveProperty('usage');
      expect(result).not.toHaveProperty('gradedAt');
      expect(result.requiresHumanReview).toBe(true);
      expect(result.grader).toEqual({ kind: 'ai' });

      const partly = graded(grade({ judgement: { provenance: {} } }));
      expect(partly.grader).toEqual({ kind: 'ai' });
    });

    it("is the engine's when the engine scored every criterion", () => {
      const result = graded(grade({ data: MEASURED_ONLY, judgement: null }));

      expect(result.score).toBeCloseTo(0.75, 10);
      expect(result.feedback).toBe('Well said.');
      expect(result.grader).toEqual({ kind: 'auto', id: 'pronunciation-engine' });
      expect(result).not.toHaveProperty('requiresHumanReview');

      // An empty judgement of a rubric that asks the judge nothing changes nothing.
      const withEmpty = graded(grade({ data: MEASURED_ONLY, judgement: { criteria: [] } }));
      expect(withEmpty).toEqual(result);
    });

    it('lets the judge score the measured criteria, and reads no engine score', () => {
      const result = graded(
        grade({
          assessment: { scores: {} },
          judgement: {
            criteria: [
              { name: 'Content', score: 1 },
              { name: 'Language', score: 1 },
              { name: 'Pronunciation', score: 0.5 },
              { name: 'Fluency', score: 0.5 },
            ],
          },
          options: { judgeMeasures: true },
        }),
      );

      expect(result.score).toBeCloseTo((2 + 1 + 0.5 + 0.5) / 5, 10);
      expect(result.criteria?.every((one) => one.maxScore === undefined)).toBe(true);
    });

    it('needs a judgement of the measured criteria too when the judge scores them', () => {
      expect(() =>
        grade({ data: MEASURED_ONLY, judgement: null, options: { judgeMeasures: true } }),
      ).toThrow(/"Pronunciation", "Fluency"/);
    });

    it('compares the pass line rounded when asked, and never rounds the score', () => {
      // 0.6995 is below 0.7 raw, and 0.70 at two decimals.
      const data: Partial<SpeakingResponseData> = {
        passThreshold: 0.7,
        rubric: { criteria: [{ name: 'Content', weight: 1 }] },
      };
      const judged = { criteria: [{ name: 'Content', score: 0.6995 }] };

      expect(graded(grade({ data, judgement: judged })).passed).toBe(false);
      const rounded = graded(
        grade({ data, judgement: judged, options: { rounding: { dp: 2, mode: 'half-up' } } }),
      );
      expect(rounded.passed).toBe(true);
      expect(rounded.score).toBe(0.6995);
    });

    it('refuses rather than inventing a number when no weighted total can be computed', () => {
      const refusing = vi
        .spyOn(grading, 'gradeFromRubric')
        .mockReturnValue({ unscorable: true, reason: 'Criterion weights do not sum.' });

      try {
        const result = refused(grade());

        expect(result.code).toBe('invalid_assessment');
        expect(result.reason).toMatch(/weights do not sum/);
      } finally {
        refusing.mockRestore();
      }
    });
  });
});

describe('a spoken answer, routed', () => {
  it('routes as a written answer does: the item is the calibration scope', () => {
    const item = speakingItem();
    const model = graded(grade());
    expect(routeGrade(model, { mode: 'exam', item })).toMatchObject({
      to: 'person',
      reasons: ['no-calibration'],
    });

    // A person marked the same answers; the engine's criteria are part of what is measured.
    const person = (content: number, language: number): GradeRecord => ({
      ...model,
      criteria: [
        { name: 'Content', score: content, weight: 2 },
        { name: 'Language', score: language, weight: 1 },
        { name: 'Pronunciation', score: 85, maxScore: 100, weight: 1 },
        { name: 'Fluency', score: 65, maxScore: 100, weight: 1 },
      ],
      grader: { kind: 'human', id: 'teacher-1' },
    });
    const report = calibrationReport(
      [
        { model, person: person(0.75, 0.5) },
        { model, person: person(0.5, 0.5) },
      ],
      item,
    );
    if (!report.ok) {
      throw new Error(report.reason);
    }
    expect(report.report.criteria.map((one) => one.name)).toEqual([
      'Content',
      'Language',
      'Pronunciation',
      'Fluency',
    ]);
    expect(routeGrade(model, { mode: 'exam', item, calibration: report.report })).toMatchObject({
      to: 'model',
      reasons: [],
    });
  });
});
