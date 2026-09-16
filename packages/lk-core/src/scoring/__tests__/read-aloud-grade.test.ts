import { describe, expect, it, vi } from 'vitest';
import { repeatedly, slowdown } from '../../__tests__/timing.js';
import { ActivitySchemaError, RedactedScoringError } from '../../errors.js';
// The module, not the function: one test makes `gradeFromRubric` refuse, which
// is the only condition left that reaches `gradeReadAloud`'s own refusal.
import * as grading from '../../grading.js';
import { redact } from '../../redact.js';
import type { ReadAloudData, ReadAloudLearnerResponse } from '../../types/activity.js';
import type { GradeRecord } from '../../types/grading.js';
import type {
  GradeReadAloudOptions,
  SpeechAssessment,
  SpeechUnscorable,
  SpeechUnscorableCode,
  SpeechWord,
} from '../../types/speech.js';
import {
  gradeReadAloud,
  READ_ALOUD_MAX_REFERENCE_LENGTH,
  SPEECH_ASSESSMENT_MAX_WORDS,
  validateSpeechAssessment,
} from '../index.js';
import {
  BLANK_RESPONSE,
  gradingOptions,
  readAloudItem,
  recordedResponse,
  SENTENCE,
  sentenceWords,
  speechAssessment,
  spoken,
  TAKE_KEY,
} from './read-aloud-fixtures.js';

/** The grade, when the take was graded. Fails the test when it was refused. */
function graded(result: GradeRecord | SpeechUnscorable): GradeRecord {
  if ('unscorable' in result) {
    throw new Error(`expected a grade, got ${result.code}: ${result.reason}`);
  }
  return result;
}

/** The refusal, when the take was refused. Fails the test when it was graded. */
function refused(result: GradeRecord | SpeechUnscorable): SpeechUnscorable {
  if (!('unscorable' in result)) {
    throw new Error(`expected a refusal, got a grade of ${result.score}`);
  }
  return result;
}

/** Grades the fixture take, with the given parts replaced. */
function grade(
  over: {
    data?: Partial<ReadAloudData>;
    response?: ReadAloudLearnerResponse;
    assessment?: Partial<SpeechAssessment> | null;
    options?: Partial<GradeReadAloudOptions>;
  } = {},
): GradeRecord | SpeechUnscorable {
  return gradeReadAloud(
    readAloudItem(over.data),
    over.response ?? recordedResponse(),
    over.assessment === null ? null : speechAssessment(over.assessment),
    gradingOptions(over.options),
  );
}

describe('gradeReadAloud()', () => {
  describe('arguments', () => {
    it('refuses a plausibility policy it cannot apply, before reading anything else', () => {
      const badRates = [0, -1, Number.NaN, Number.POSITIVE_INFINITY];

      for (const maxWordsPerSecond of badRates) {
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
        grade({
          options: {
            plausibility: { maxWordsPerSecond: '6' as unknown as number, minVoicedMs: 500 },
          },
        }),
      ).toThrow(/maxWordsPerSecond of type string/);
      expect(() =>
        grade({
          options: { plausibility: { maxWordsPerSecond: 6 } as unknown as never },
        }),
      ).toThrow(/minVoicedMs of type undefined/);
    });

    it('refuses options that carry no policy at all, however they arrived', () => {
      const item = readAloudItem();

      expect(() =>
        gradeReadAloud(item, recordedResponse(), speechAssessment(), {} as GradeReadAloudOptions),
      ).toThrow(RangeError);
      expect(() =>
        gradeReadAloud(
          item,
          recordedResponse(),
          speechAssessment(),
          undefined as unknown as GradeReadAloudOptions,
        ),
      ).toThrow(RangeError);
    });

    it('refuses a rounding policy it cannot apply', () => {
      expect(() =>
        grade({ options: { rounding: { mode: 'nearest' as unknown as 'half-up', dp: 2 } } }),
      ).toThrow(RangeError);
      expect(() => grade({ options: { rounding: { mode: 'half-up', dp: 1.5 } } })).toThrow(
        RangeError,
      );
    });

    it('refuses activity data that is not a read-aloud item', () => {
      expect(() => grade({ data: { referenceText: '   ' } })).toThrow(ActivitySchemaError);
      try {
        grade({ data: { locale: 'EN_US' } });
        throw new Error('expected a throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ActivitySchemaError);
        expect((error as ActivitySchemaError).activityType).toBe('read-aloud');
        expect((error as ActivitySchemaError).errors[0]?.path).toEqual(['locale']);
      }
    });

    it("checks its own configuration before the content bank's data", () => {
      // A broken policy is the server's bug; a broken item is the bank's. The
      // first is reported even when both are wrong.
      expect(() =>
        grade({
          data: { referenceText: ' ' },
          options: { plausibility: { maxWordsPerSecond: 0, minVoicedMs: 0 } },
        }),
      ).toThrow(RangeError);
    });

    it('refuses a redacted projection of an item, rather than grading a copy with no key', () => {
      const projection = redact(readAloudItem({ feedback: { correct: 'Clear and steady.' } }));

      // A read-aloud projection keeps every field this grade reads, so without
      // the refusal it would come back a plausible number with the authored
      // feedback silently missing — where a type whose projection drops its
      // answer key fails closed on a non-finite score instead.
      expect(() =>
        gradeReadAloud(
          projection as unknown as ReadAloudData,
          recordedResponse(),
          speechAssessment(),
          gradingOptions(),
        ),
      ).toThrow(RedactedScoringError);
      expect(graded(grade()).score).toBeGreaterThan(0);
    });

    it('refuses a marker the item inherits, as every other entry point does', () => {
      // The schema copies own enumerable keys, so an inherited `redacted` is
      // absent from the value it parses. `score()` reads the argument and
      // refuses this for every type it grades; asking the parsed value alone
      // would have let a read-aloud projection through the one public grader
      // that does not go through `score()`.
      const inherited = Object.assign(
        Object.create({ redacted: true }) as object,
        readAloudItem(),
      ) as ReadAloudData;

      expect(Object.hasOwn(inherited, 'redacted')).toBe(false);
      expect((inherited as unknown as { redacted?: unknown }).redacted).toBe(true);
      expect(() =>
        gradeReadAloud(inherited, recordedResponse(), speechAssessment(), gradingOptions()),
      ).toThrow(RedactedScoringError);
    });

    it('asks the value it parsed whether the item is redacted, not the object it was handed', () => {
      // A `redacted` that answers the schema `true` and a second read `false`.
      // The content schema is loose, so it carries the key into the value it
      // parsed, and the guard reads it there — where a getter cannot change
      // its mind between the check and the grade.
      let reads = 0;
      const projection = redact(readAloudItem()) as unknown as Record<string, unknown>;
      Object.defineProperty(projection, 'redacted', {
        enumerable: true,
        get: () => reads++ === 0,
      });

      expect(() =>
        gradeReadAloud(
          projection as unknown as ReadAloudData,
          recordedResponse(),
          speechAssessment(),
          gradingOptions(),
        ),
      ).toThrow(RedactedScoringError);
      expect(reads).toBeGreaterThan(0);
    });

    describe('the item it grades is the item it validated', () => {
      /**
       * An item whose `field` is a getter answering `values` in turn, and a
       * count of how often the grade asked for it. The schema reads each key
       * once, so a count above 1 is a read the grade took from the caller's
       * object after the parse — which is the whole hazard.
       */
      function answering(
        field: keyof ReadAloudData,
        values: readonly unknown[],
      ): { item: ReadAloudData; reads: () => number } {
        const item = readAloudItem();
        let reads = 0;
        Object.defineProperty(item, field, {
          enumerable: true,
          get: () => values[Math.min(reads++, values.length - 1)],
        });
        return { item, reads: () => reads };
      }

      it('marks the words of the text the schema read, not a longer one handed over later', () => {
        // Before round 3 `referenceText` was read three times per grade: the
        // schema parse, the check against the assessment's own copy, and the
        // aligner. A getter honest for the first two and longer for the third
        // came back with five marks more than the item has words — the learner
        // marked against words it never asked for.
        const { item, reads } = answering('referenceText', [
          SENTENCE,
          SENTENCE,
          `${SENTENCE} and ran away`,
        ]);
        const two = [spoken('the', { accuracy: 90 }), spoken('cat', { accuracy: 90 })];

        const result = graded(
          gradeReadAloud(
            item,
            recordedResponse(),
            speechAssessment({ words: two, recognizedText: 'the cat' }),
            gradingOptions(),
          ),
        );

        expect(result.details?.map((detail) => detail.correctResponse)).toEqual(
          SENTENCE.split(' '),
        );
        expect(reads()).toBe(1);
      });

      it('passes against the threshold the schema read, not one handed over later', () => {
        // 2 is outside the schema's [0, 1], so no parsed item can carry it: it
        // reached the comparison only from a second read of the argument, and
        // it turned a pass into a fail.
        const { item, reads } = answering('passThreshold', [0.5, 2]);

        expect(
          graded(gradeReadAloud(item, recordedResponse(), speechAssessment(), gradingOptions()))
            .passed,
        ).toBe(true);
        expect(reads()).toBe(1);
      });

      it('stores the feedback the item authored, not one swapped in after the parse', () => {
        const authored = { correct: 'Clear and steady.', incorrect: 'Read it once more.' };
        const { item, reads } = answering('feedback', [
          authored,
          { correct: 'not authored', incorrect: 'not authored' },
        ]);

        expect(
          graded(gradeReadAloud(item, recordedResponse(), speechAssessment(), gradingOptions()))
            .feedback,
        ).toBe(authored.correct);
        expect(reads()).toBe(1);
      });

      it('compares the locale the schema read, not one handed over later', () => {
        const { item, reads } = answering('locale', ['en-US', 'fr-FR']);

        expect(
          graded(gradeReadAloud(item, recordedResponse(), speechAssessment(), gradingOptions()))
            .score,
        ).toBeGreaterThan(0);
        expect(reads()).toBe(1);
      });

      it('weighs the dimensions the schema read, not ones handed over later', () => {
        const { item, reads } = answering('scoring', [
          { dimensions: [{ name: 'accuracy', weight: 2 }] },
          { dimensions: [{ name: 'prosody', weight: 1 }] },
        ]);

        const result = graded(
          gradeReadAloud(item, recordedResponse(), speechAssessment(), gradingOptions()),
        );

        expect(result.criteria?.map((criterion) => criterion.name)).toEqual(['accuracy']);
        expect(reads()).toBe(1);
      });

      it('reads a blank from the checked item too', () => {
        // Steps 1 to 5 run for a blank, and so does the grade it builds: the
        // pass line, the feedback and the word list all come from the parse.
        const { item, reads } = answering('passThreshold', [0.5, 2]);

        expect(graded(gradeReadAloud(item, BLANK_RESPONSE, null, gradingOptions())).passed).toBe(
          false,
        );
        expect(reads()).toBe(1);
      });
    });

    describe('the take it grades is the take it checked', () => {
      /**
       * A response whose `recording` is a getter answering `values` in turn,
       * and a count of the reads. The response has no schema, so the check is
       * the only place its fields are read: a count above 1 would be a read
       * the grade took from the caller's object afterwards.
       */
      function respondingWith(values: readonly unknown[]): {
        response: ReadAloudLearnerResponse;
        reads: () => number;
      } {
        const response = { type: 'read-aloud' } as ReadAloudLearnerResponse;
        let reads = 0;
        Object.defineProperty(response, 'recording', {
          enumerable: true,
          get: () => values[Math.min(reads++, values.length - 1)],
        });
        return { response, reads: () => reads };
      }

      it('grades a real take, even when the response answers null afterwards', () => {
        // The recording was read twice: once by the check and once by the
        // grade. A getter answering a take and then `null` graded a whole
        // reading as a blank 0, with every word marked omitted.
        const { response, reads } = respondingWith([
          { key: TAKE_KEY, mimeType: 'audio/wav' },
          null,
        ]);

        const result = graded(
          gradeReadAloud(readAloudItem(), response, speechAssessment(), gradingOptions()),
        );

        expect(result.score).toBeGreaterThan(0);
        expect(result.criteria?.length).toBeGreaterThan(0);
        expect(reads()).toBe(1);
      });

      it('binds the assessment to the key it checked, not one swapped in afterwards', () => {
        // `key` was read twice as well: for the non-empty check and for the
        // binding. A getter answering another key first walked straight past
        // the refusal that ties evidence to the take it was made for.
        const recording = { mimeType: 'audio/wav' };
        let keyReads = 0;
        Object.defineProperty(recording, 'key', {
          enumerable: true,
          get: () => (keyReads++ === 0 ? 'some-other-take' : TAKE_KEY),
        });

        expect(
          refused(
            gradeReadAloud(
              readAloudItem(),
              { type: 'read-aloud', recording } as ReadAloudLearnerResponse,
              speechAssessment(),
              gradingOptions(),
            ),
          ).code,
        ).toBe('recording_mismatch');
        expect(keyReads).toBe(1);
      });

      it('reads a blank once too', () => {
        const { response, reads } = respondingWith([
          null,
          { key: TAKE_KEY, mimeType: 'audio/wav' },
        ]);

        expect(
          graded(gradeReadAloud(readAloudItem(), response, null, gradingOptions())).score,
        ).toBe(0);
        expect(reads()).toBe(1);
      });
    });

    it('refuses anything that is not a read-aloud response', () => {
      const notResponses: unknown[] = [
        null,
        undefined,
        'read-aloud',
        { type: 'dictation', recording: null },
        { type: 'read-aloud' },
        { type: 'read-aloud', recording: { key: '', mimeType: 'audio/wav' } },
        { type: 'read-aloud', recording: { key: TAKE_KEY } },
        { type: 'read-aloud', recording: { key: TAKE_KEY, mimeType: 7 } },
      ];

      for (const response of notResponses) {
        expect(() =>
          gradeReadAloud(
            readAloudItem(),
            response as ReadAloudLearnerResponse,
            speechAssessment(),
            gradingOptions(),
          ),
        ).toThrow(TypeError);
      }
    });

    it('needs an assessment and a measurement for a take that was recorded', () => {
      expect(() => grade({ assessment: null })).toThrow(TypeError);
      expect(() =>
        gradeReadAloud(
          readAloudItem(),
          recordedResponse(),
          undefined as unknown as SpeechAssessment,
          gradingOptions(),
        ),
      ).toThrow(TypeError);
      expect(() => grade({ options: { measured: null } })).toThrow(TypeError);
      expect(() => grade({ options: { measured: undefined as unknown as null } })).toThrow(
        /inspectWav/,
      );
    });

    it('refuses a measurement that cannot be true of one recording', () => {
      const impossible = [
        { durationMs: Number.NaN, voicedMs: 0 },
        { durationMs: Number.POSITIVE_INFINITY, voicedMs: 0 },
        { durationMs: -1, voicedMs: 0 },
        { durationMs: 1000, voicedMs: Number.NaN },
        { durationMs: 1000, voicedMs: -1 },
        { durationMs: 1000, voicedMs: 1001 },
        { durationMs: '1000' as unknown as number, voicedMs: 0 },
        { durationMs: 1000, voicedMs: '10' as unknown as number },
      ];

      for (const measured of impossible) {
        expect(() => grade({ options: { measured } })).toThrow(RangeError);
      }
      // Voiced time is summed window by window, so float noise at the edge is
      // not a contradiction.
      expect(() =>
        grade({ options: { measured: { durationMs: 1000, voicedMs: 1000 + 1e-6 } } }),
      ).not.toThrow();
    });
  });

  describe('a blank', () => {
    it('is a grade of 0 with a mark against every word of the text', () => {
      const result = graded(
        gradeReadAloud(readAloudItem(), BLANK_RESPONSE, null, gradingOptions({ measured: null })),
      );

      expect(result.score).toBe(0);
      expect(result.maxScore).toBe(1);
      expect(result.passed).toBe(false);
      expect(result.criteria).toEqual([]);
      expect(result.details).toHaveLength(6);
      expect(result.details?.[1]).toEqual({
        itemId: 'w2',
        correct: false,
        outcome: 'incorrect-omission',
        learnerResponse: '',
        correctResponse: 'cat',
        weight: 1,
        score: 0,
      });
    });

    it('reads neither the assessment nor the measurement', () => {
      const withEvidence = gradeReadAloud(
        readAloudItem(),
        BLANK_RESPONSE,
        speechAssessment({ scores: { accuracy: 100, fluency: 100 } }),
        gradingOptions(),
      );

      expect(withEvidence).toEqual(
        gradeReadAloud(readAloudItem(), BLANK_RESPONSE, null, gradingOptions({ measured: null })),
      );
    });

    it('carries no grader: nobody measured a recording that was never made', () => {
      const result = graded(
        gradeReadAloud(readAloudItem(), BLANK_RESPONSE, null, gradingOptions({ measured: null })),
      );

      expect(Object.hasOwn(result, 'grader')).toBe(false);
      expect(Object.keys(result)).toEqual([
        'score',
        'maxScore',
        'passed',
        'feedback',
        'criteria',
        'details',
      ]);
    });

    it("goes through the item's own pass line, which an item can set at 0", () => {
      const result = graded(
        gradeReadAloud(
          readAloudItem({ passThreshold: 0, feedback: { correct: 'Submitted.' } }),
          BLANK_RESPONSE,
          null,
          gradingOptions({ measured: null }),
        ),
      );

      expect(result.passed).toBe(true);
      expect(result.feedback).toBe('Submitted.');
    });
  });

  describe('evidence it refuses', () => {
    const cases: [SpeechUnscorableCode, Parameters<typeof grade>[0]][] = [
      ['invalid_assessment', { assessment: { scale: 50 as unknown as 100 } }],
      ['task_mismatch', { assessment: { task: 'unscripted' } }],
      ['locale_mismatch', { assessment: { locale: 'en-GB' } }],
      ['reference_mismatch', { assessment: { referenceText: 'the cat sat on the rug' } }],
      ['recording_mismatch', { assessment: { recordingKey: 'take-2' } }],
      ['assessor_not_accepted', { assessment: { assessor: { kind: 'ai', model: 'a-model' } } }],
      ['no_speech', { assessment: { status: 'no_speech' } }],
      ['insufficient_voiced_time', { options: { measured: { durationMs: 900, voicedMs: 100 } } }],
      ['implausible_speech_rate', { options: { measured: { durationMs: 900, voicedMs: 500 } } }],
      ['missing_dimension', { assessment: { scores: { accuracy: 80 } } }],
    ];

    for (const [code, over] of cases) {
      it(`refuses ${code} rather than scoring it 0`, () => {
        const result = refused(grade(over));

        expect(result.code).toBe(code);
        expect(result.unscorable).toBe(true);
        expect(result.reason).not.toBe('');
        expect('score' in result).toBe(false);
      });
    }

    it('names what is wrong, so an adapter can be fixed', () => {
      expect(refused(grade({ assessment: { scale: 50 as unknown as 100 } })).reason).toMatch(
        /scale/,
      );
      expect(refused(grade({ assessment: { locale: 'en-GB' } })).reason).toMatch(/en-GB/);
      expect(refused(grade({ assessment: { scores: { accuracy: 80 } } })).reason).toMatch(
        /fluency/,
      );
    });

    it('names the first weighted dimension the assessment does not carry', () => {
      const result = refused(
        grade({
          data: {
            scoring: {
              dimensions: [
                { name: 'prosody', weight: 1 },
                { name: 'accuracy', weight: 1 },
              ],
            },
          },
          assessment: { scores: {} },
        }),
      );

      expect(result.reason).toMatch(/prosody/);
    });

    it('accepts a generative assessor only when the caller opted in', () => {
      const aiAssessed = { assessor: { kind: 'ai' as const, model: 'a-model' } };

      expect(refused(grade({ assessment: aiAssessed })).code).toBe('assessor_not_accepted');
      expect(
        graded(grade({ assessment: aiAssessed, options: { allowAiAssessor: true } })).grader,
      ).toEqual({ kind: 'ai', model: 'a-model' });
      // Only `true` opts in: a truthy value is not a decision someone made.
      expect(
        refused(
          grade({
            assessment: aiAssessed,
            options: { allowAiAssessor: 1 as unknown as boolean },
          }),
        ).code,
      ).toBe('assessor_not_accepted');
    });

    it('accepts a human assessor without an opt-in', () => {
      expect(
        graded(grade({ assessment: { assessor: { kind: 'human', id: 'teacher-7' } } })).grader,
      ).toEqual({ kind: 'human', id: 'teacher-7' });
    });

    it('refuses a reading with no voiced time behind it', () => {
      const result = refused(
        grade({
          options: {
            measured: { durationMs: 900, voicedMs: 0 },
            plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
          },
        }),
      );

      expect(result.code).toBe('implausible_speech_rate');
    });

    it('grades a take that claims no words at all, rather than calling it implausible', () => {
      // No words and no recognised text: there is no rate to be implausible.
      // The reading is graded — as every word of the text unread.
      const result = graded(
        grade({
          assessment: { words: [], recognizedText: '' },
          options: {
            measured: { durationMs: 900, voicedMs: 0 },
            plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
          },
        }),
      );

      expect(result.details).toHaveLength(6);
      expect(result.details?.every((detail) => detail.outcome === 'incorrect-omission')).toBe(true);
    });

    it("counts the assessor's recognised text when it reported any", () => {
      const fast = grade({
        assessment: { recognizedText: SENTENCE },
        options: { measured: { durationMs: 2000, voicedMs: 900 } },
      });

      // Six words in 0.9 s is 6.67 a second, above the 6 the policy allows.
      expect(refused(fast).code).toBe('implausible_speech_rate');
      expect(refused(fast).reason).toMatch(/6 word/);
    });

    it('counts the words it kept when there is no recognised text to count', () => {
      const words = [
        spoken('the'),
        spoken('cat', { error: 'omission' }),
        spoken('sat'),
        spoken('on', { error: 'omission' }),
        spoken('the'),
        spoken('mat'),
        spoken('um', { error: 'insertion' }),
      ];
      const measured = { durationMs: 2000, voicedMs: 1000 };

      // Four words were read in a second, not seven: an omission was not
      // spoken, and an insertion is not the item's word.
      expect(
        graded(grade({ assessment: { words, recognizedText: '   ' }, options: { measured } })),
      ).toMatchObject({ maxScore: 1 });
      expect(graded(grade({ assessment: { words }, options: { measured } })).details).toHaveLength(
        6,
      );
    });

    it('applies each check in order, so one answer is given for one take', () => {
      const precedence: [SpeechUnscorableCode, Parameters<typeof grade>[0]][] = [
        [
          'invalid_assessment',
          { assessment: { scale: 50 as unknown as 100, task: 'unscripted', locale: 'fr-FR' } },
        ],
        ['task_mismatch', { assessment: { task: 'unscripted', locale: 'fr-FR' } }],
        [
          'locale_mismatch',
          { assessment: { locale: 'fr-FR', referenceText: 'another text entirely' } },
        ],
        [
          'reference_mismatch',
          { assessment: { referenceText: 'another text entirely', recordingKey: 'take-9' } },
        ],
        [
          'recording_mismatch',
          { assessment: { recordingKey: 'take-9', assessor: { kind: 'ai' } } },
        ],
        [
          'assessor_not_accepted',
          { assessment: { assessor: { kind: 'ai' }, status: 'no_speech' } },
        ],
        [
          'no_speech',
          {
            assessment: { status: 'no_speech' },
            options: { measured: { durationMs: 900, voicedMs: 10 } },
          },
        ],
        ['insufficient_voiced_time', { options: { measured: { durationMs: 900, voicedMs: 10 } } }],
        [
          'implausible_speech_rate',
          {
            assessment: { scores: { accuracy: 80 } },
            options: { measured: { durationMs: 900, voicedMs: 500 } },
          },
        ],
      ];

      for (const [code, over] of precedence) {
        expect([code, refused(grade(over)).code]).toEqual([code, code]);
      }
    });

    it('refuses rather than inventing a number when no weighted total can be computed', () => {
      // No item and no assessment can reach this: both are read from what their
      // schemas parsed, so every weight is a number in [0, 1000] with one above
      // 0, and every score a finite 0..100. Until round 3 a weight getter that
      // answered the schema one number and the arithmetic another did reach it;
      // reading the parsed item closed that with the rest of the item-side
      // getters, and the branch now defends only against `gradeFromRubric`
      // itself changing — a different module, with its own owner. So the
      // collaborator is made to refuse, which is exactly the condition the
      // branch exists for.
      const refusing = vi
        .spyOn(grading, 'gradeFromRubric')
        .mockReturnValue({ unscorable: true, reason: 'Criterion weights do not sum.' });

      try {
        const result = refused(grade());

        expect(result.code).toBe('invalid_assessment');
        expect(result.reason).toMatch(/weights do not sum/);
        // A refusal, not a grade: nothing was invented from a total that could
        // not be computed.
        expect(result).not.toHaveProperty('score');
      } finally {
        refusing.mockRestore();
      }
    });

    describe('an assessment too big to align', () => {
      /** One character NFKC expands into four Arabic words. */
      const MANY_WORDS = String.fromCodePoint(0xfdfa);

      /** The most the word cap alone allows: 1000 words of 200 characters each. */
      const oversized = (character: string): SpeechWord[] =>
        Array.from({ length: SPEECH_ASSESSMENT_MAX_WORDS }, () =>
          spoken(character.repeat(200), { accuracy: 90 }),
        );

      it.each([
        ['plain characters', 'z'],
        ['characters that each stand for four words', MANY_WORDS],
      ])('refuses %s rather than aligning 200 000 of them', (_label, character) => {
        const result = refused(grade({ assessment: { words: oversized(character) } }));

        expect(result.code).toBe('invalid_assessment');
        expect(result.reason).toMatch(/200000 characters/);
      });

      it('refuses a reading that spells more than it is written with', () => {
        // The reason the two bounds must be one bound: 39 words of noise at the
        // per-word cap, and then the six words the learner actually read. It is
        // 7817 characters as written, which the first rule accepts, and 140 461
        // once normalised — so the aligner's budget would have run out inside
        // the noise, the six real words would never have been paired at all,
        // and every word of the item would have been marked correct from a word
        // nobody said.
        const noise = Array.from({ length: 39 }, () =>
          spoken(MANY_WORDS.repeat(200), { accuracy: 77 }),
        );
        const result = refused(grade({ assessment: { words: [...noise, ...sentenceWords()] } }));

        expect(result.code).toBe('invalid_assessment');
        expect(result.reason).toMatch(/140461 characters between them once they are normalised/);
      });
    });

    it('grades the value it validated, not the object it was handed', () => {
      /** A word whose accuracy answers `answer` with the number of the read. */
      const counting = (reads: { count: number }, answer: (read: number) => number): SpeechWord => {
        const word = spoken('the');
        Object.defineProperty(word, 'accuracy', {
          enumerable: true,
          get: () => answer(reads.count++),
        });
        return word;
      };
      const rest = SENTENCE.split(' ')
        .slice(1)
        .map((word) => spoken(word, { accuracy: 90 }));

      // What checking the evidence costs in reads of the caller's object: the
      // reads it is entitled to. Anything past them is the grade reading the
      // argument again instead of the value the check handed back.
      const checking = { count: 0 };
      validateSpeechAssessment(
        speechAssessment({ words: [counting(checking, () => 90), ...rest] }),
      );

      // 90 for as long as the check is looking, and a million afterwards. A
      // mark is the accuracy over 100, so the second answer would store 10 000.
      const grading = { count: 0 };
      const words = [counting(grading, (read) => (read < checking.count ? 90 : 1e6)), ...rest];
      const result = graded(grade({ assessment: { words } }));

      expect(grading.count).toBe(checking.count);
      expect(result.details?.[0]?.score).toBe(0.9);
      expect(
        result.details?.every((detail) => detail.score === undefined || detail.score <= 1),
      ).toBe(true);
    });
  });

  describe('the grade', () => {
    it('is the weighted total of the authored dimensions, each out of 100', () => {
      const result = graded(grade());

      // accuracy 80 at weight 2, fluency 70 at weight 1.
      expect(result.score).toBeCloseTo((0.8 * 2 + 0.7) / 3, 12);
      expect(result.maxScore).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.criteria).toEqual([
        { name: 'accuracy', score: 80, maxScore: 100, weight: 2 },
        { name: 'fluency', score: 70, maxScore: 100, weight: 1 },
      ]);
    });

    it('ignores a dimension the item does not weigh, and does not miss its score', () => {
      const result = graded(
        grade({
          data: {
            scoring: {
              dimensions: [
                { name: 'accuracy', weight: 1 },
                { name: 'prosody', weight: 0 },
              ],
            },
          },
          assessment: { scores: { accuracy: 60 } },
        }),
      );

      expect(result.criteria).toEqual([{ name: 'accuracy', score: 60, maxScore: 100, weight: 1 }]);
      expect(result.score).toBeCloseTo(0.6, 12);
    });

    it('writes the keys in a stable order, ending with the marks and the grader', () => {
      expect(Object.keys(graded(grade()))).toEqual([
        'score',
        'maxScore',
        'passed',
        'feedback',
        'criteria',
        'details',
        'grader',
      ]);
    });

    it('selects the authored feedback by the result', () => {
      const feedback = { correct: 'Clear and steady.', incorrect: 'Read it again, slowly.' };

      expect(graded(grade({ data: { feedback } })).feedback).toBe('Clear and steady.');
      expect(
        graded(grade({ data: { feedback }, assessment: { scores: { accuracy: 10, fluency: 10 } } }))
          .feedback,
      ).toBe('Read it again, slowly.');
      expect(graded(grade()).feedback).toBeNull();
    });

    it('copies the assessor onto the grade, rather than keeping a handle on it', () => {
      const assessment = speechAssessment();
      const result = graded(
        gradeReadAloud(readAloudItem(), recordedResponse(), assessment, gradingOptions()),
      );

      expect(result.grader).toEqual({ kind: 'auto', id: 'pronunciation-engine' });
      expect(result.grader).not.toBe(assessment.assessor);
    });

    it('compares the pass line as the score is displayed, when asked to', () => {
      const atTheLine = {
        data: { scoring: { dimensions: [{ name: 'accuracy' as const, weight: 1 }] } },
        assessment: { scores: { accuracy: 69.6 } },
      };

      expect(graded(grade(atTheLine)).passed).toBe(false);
      const rounded = graded(
        grade({ ...atTheLine, options: { rounding: { mode: 'half-up', dp: 2 } } }),
      );
      expect(rounded.passed).toBe(true);
      // The comparison is rounded; the score is not.
      expect(rounded.score).toBeCloseTo(0.696, 12);
    });

    describe('the per-word marks', () => {
      it('carries one per reference word, never one for a word the learner added', () => {
        const result = graded(
          grade({
            assessment: {
              words: [
                ...SENTENCE.split(' ').map((word) => spoken(word, { accuracy: 90 })),
                spoken('too', { error: 'insertion', accuracy: 10 }),
              ],
            },
          }),
        );

        expect(result.details).toHaveLength(6);
        expect(result.details?.map((detail) => detail.itemId)).toEqual([
          'w1',
          'w2',
          'w3',
          'w4',
          'w5',
          'w6',
        ]);
      });

      it('marks a mispronounced word wrong and scores it by its accuracy', () => {
        const result = graded(
          grade({
            assessment: {
              words: [
                spoken('the', { accuracy: 90 }),
                spoken('cat', { error: 'mispronunciation', accuracy: 35 }),
                ...SENTENCE.split(' ')
                  .slice(2)
                  .map((word) => spoken(word, { accuracy: 90 })),
              ],
            },
          }),
        );

        expect(result.details?.[1]).toEqual({
          itemId: 'w2',
          correct: false,
          outcome: 'incorrect',
          learnerResponse: 'cat',
          correctResponse: 'cat',
          weight: 1,
          score: 0.35,
        });
      });

      it('scores an omitted word 0, whatever accuracy came with it', () => {
        const result = graded(
          grade({
            assessment: {
              words: [
                spoken('the', { accuracy: 90 }),
                spoken('cat', { error: 'omission', accuracy: 77 }),
                ...SENTENCE.split(' ')
                  .slice(2)
                  .map((word) => spoken(word, { accuracy: 90 })),
              ],
            },
          }),
        );

        expect(result.details?.[1]).toMatchObject({
          outcome: 'incorrect-omission',
          learnerResponse: '',
          score: 0,
        });
      });

      it('writes no score at all for a word the assessor did not measure', () => {
        const result = graded(
          grade({ assessment: { words: SENTENCE.split(' ').map((word) => spoken(word)) } }),
        );
        const first = result.details?.[0] as object;

        expect(Object.hasOwn(first, 'score')).toBe(false);
        expect(result.details?.[0]).toEqual({
          itemId: 'w1',
          correct: true,
          outcome: 'correct',
          learnerResponse: 'the',
          correctResponse: 'the',
          weight: 1,
        });
      });

      it('never feeds the score: the same dimensions grade the same however words were read', () => {
        const readWell = graded(grade());
        const readBadly = graded(
          grade({
            assessment: {
              words: SENTENCE.split(' ').map((word) =>
                spoken(word, { error: 'mispronunciation', accuracy: 1 }),
              ),
            },
          }),
        );

        expect(readBadly.score).toBe(readWell.score);
        expect(readBadly.details?.every((detail) => detail.correct === false)).toBe(true);
      });
    });

    it('is deterministic: the same evidence grades the same way twice', () => {
      expect(grade()).toEqual(grade());
    });
  });

  describe('the cost of a grade', () => {
    /** A reference text of `count` words, padded to exactly `length` code points. */
    const referenceOf = (count: number, length: number): string => {
      const text = Array.from(
        { length: count },
        (_, index) => `w${String(index).padStart(3, '0')}`,
      ).join(' ');
      return `${text}${'x'.repeat(length - text.length)}`;
    };

    /** A grading run over `words` assessed words against a reference of `count` words. */
    const grading = (count: number, length: number, words: number) => {
      const referenceText = referenceOf(count, length);
      const data = readAloudItem({
        referenceText,
        scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
      });
      const assessment = speechAssessment({
        referenceText,
        recognizedText: '',
        scores: { accuracy: 88 },
        words: Array.from({ length: words }, (_, index) =>
          spoken(`w${String(index).padStart(3, '0')}`, { accuracy: 88 }),
        ),
      });
      const options = gradingOptions({
        measured: { durationMs: 300_000, voicedMs: 250_000 },
        plausibility: { maxWordsPerSecond: 6, minVoicedMs: 500 },
      });
      return () => gradeReadAloud(data, recordedResponse(), assessment, options);
    };

    it('stays inside the aligner: the biggest item it accepts costs what O(n·m) says', () => {
      const full = grading(400, READ_ALOUD_MAX_REFERENCE_LENGTH, SPEECH_ASSESSMENT_MAX_WORDS);
      const quarter = grading(
        100,
        READ_ALOUD_MAX_REFERENCE_LENGTH / 4,
        SPEECH_ASSESSMENT_MAX_WORDS / 4,
      );

      // Quartering both sides divides the aligner's cells by 16, so four
      // quarter-sized grades hold a quarter of the full grade's cells: the
      // ratio is at most 4 for O(n·m), and less because the rest of the work —
      // validating the words, normalising them — is linear and equal on both
      // sides. Anything markedly above 4 is a third factor of n.
      expect(slowdown(full, repeatedly(4, quarter))).toBeLessThan(4);
    });
  });
});
