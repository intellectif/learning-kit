import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { SpeechUnscorableCode, WavInspectionPolicy } from '../../types/speech.js';
import {
  alignReadAloud,
  dictationReferenceWords,
  gradeReadAloud,
  inspectWav,
  validateSpeechAssessment,
} from '../index.js';
import {
  arbitraryReadAloudItem,
  arbitraryReferenceText,
  arbitraryTake,
} from './read-aloud-arbitraries.js';
import { ascii, BLANK_RESPONSE, u32 } from './read-aloud-fixtures.js';
import { arbitrarySpeechAssessment } from './speech-arbitraries.js';

const RUNS = { numRuns: 200 };

/** Every reason a take can be refused for. */
const CODES: readonly SpeechUnscorableCode[] = [
  'invalid_assessment',
  'task_mismatch',
  'locale_mismatch',
  'reference_mismatch',
  'recording_mismatch',
  'assessor_not_accepted',
  'no_speech',
  'insufficient_voiced_time',
  'implausible_speech_rate',
  'missing_dimension',
];

/** A policy `inspectWav` accepts: a finite floor at or below full scale, and a window above 0. */
const arbitraryInspectionPolicy = (): fc.Arbitrary<WavInspectionPolicy> =>
  fc.record({
    silenceDbfs: fc.double({ min: -120, max: 0, noNaN: true }),
    frameMs: fc.double({ min: 1e-3, max: 1000, noNaN: true, minExcluded: true }),
  });

/** Bytes: anything at all, and bytes that start out looking like a WAV. */
const arbitraryBytes = (): fc.Arbitrary<Uint8Array> =>
  fc.oneof(
    fc.uint8Array({ maxLength: 300 }),
    fc
      .uint8Array({ maxLength: 300 })
      .map(
        (tail) =>
          new Uint8Array([...ascii('RIFF'), ...u32(tail.length + 4), ...ascii('WAVE'), ...tail]),
      ),
  );

describe('Read-aloud grading properties', () => {
  it('never grades outside [0, 1], and never invents a number it cannot compute', () => {
    fc.assert(
      fc.property(arbitraryTake(), ({ data, response, assessment, options }) => {
        const result = gradeReadAloud(data, response, assessment, options);
        if ('unscorable' in result) {
          expect(CODES).toContain(result.code);
          expect('score' in result).toBe(false);
          return;
        }
        expect(Number.isFinite(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(result.maxScore).toBe(1);
      }),
      RUNS,
    );
  });

  it('a blank always scores 0, with a mark against every word of the text', () => {
    fc.assert(
      fc.property(arbitraryReadAloudItem(), (data) => {
        const result = gradeReadAloud(data, BLANK_RESPONSE, null, {
          measured: null,
          plausibility: { maxWordsPerSecond: 6, minVoicedMs: 500 },
        });
        if ('unscorable' in result) {
          throw new Error(`a blank was refused: ${result.code}`);
        }
        expect(result.score).toBe(0);
        expect(result.details).toHaveLength(
          (dictationReferenceWords({ transcript: data.referenceText })[0] as readonly unknown[])
            .length,
        );
        expect(result.details?.every((detail) => detail.score === 0)).toBe(true);
      }),
      RUNS,
    );
  });

  it('a weighted dimension the assessment does not carry is refused, not scored', () => {
    fc.assert(
      fc.property(arbitraryTake('some'), ({ data, response, assessment, options }) => {
        const absent = data.scoring.dimensions.filter(
          (dimension) => dimension.weight > 0 && assessment.scores[dimension.name] === undefined,
        );
        const result = gradeReadAloud(data, response, assessment, options);
        if (absent.length === 0) {
          return;
        }
        if (!('unscorable' in result)) {
          throw new Error(`graded ${result.score} without ${absent[0]?.name}`);
        }
        expect(result.code).toBe('missing_dimension');
      }),
      RUNS,
    );
  });

  it('the same evidence always produces the same grade and the same marks', () => {
    fc.assert(
      fc.property(arbitraryTake(), ({ data, response, assessment, options }) => {
        expect(gradeReadAloud(data, response, assessment, options)).toEqual(
          gradeReadAloud(data, response, assessment, options),
        );
        expect(alignReadAloud(data, assessment)).toEqual(alignReadAloud(data, assessment));
      }),
      RUNS,
    );
  });

  it('the marked words are dictationReferenceWords, in order, whatever was heard', () => {
    fc.assert(
      fc.property(arbitraryReferenceText(), arbitrarySpeechAssessment(), (referenceText, heard) => {
        const expected = dictationReferenceWords({ transcript: referenceText })[0] as readonly {
          itemId: string;
          word: string;
        }[];
        const entries = alignReadAloud({ referenceText }, heard);
        const marked = entries.filter((entry) => entry.itemId !== undefined);

        expect(marked.map((entry) => entry.itemId)).toEqual(expected.map((word) => word.itemId));
        expect(marked.map((entry) => entry.reference)).toEqual(expected.map((word) => word.word));
        for (const entry of entries) {
          expect(entry.itemId === undefined).toBe(entry.state === 'inserted');
        }
      }),
      RUNS,
    );
  });

  it('reads any bytes at all without throwing, given a policy it can apply', () => {
    fc.assert(
      fc.property(arbitraryBytes(), arbitraryInspectionPolicy(), (bytes, policy) => {
        const inspection = inspectWav(bytes, policy);
        if (!inspection.valid) {
          expect(['not_wav', 'unsupported_encoding', 'truncated']).toContain(inspection.reason);
          return;
        }
        expect(inspection.durationMs).toBeGreaterThanOrEqual(0);
        expect(inspection.voicedMs).toBeGreaterThanOrEqual(0);
        expect(inspection.voicedMs).toBeLessThanOrEqual(inspection.durationMs);
        expect(inspection.peakDbfs).toBeLessThanOrEqual(0);
      }),
      RUNS,
    );
  });

  it('measures a recording the way gradeReadAloud demands: voiced time inside the duration', () => {
    fc.assert(
      fc.property(arbitraryBytes(), arbitraryInspectionPolicy(), (bytes, policy) => {
        const inspection = inspectWav(bytes, policy);
        if (!inspection.valid) {
          return;
        }
        // What `inspectWav` measures is what `gradeReadAloud` accepts, so a
        // server can pass one straight to the other.
        expect(() =>
          gradeReadAloud(
            {
              schemaVersion: '1.0',
              type: 'read-aloud',
              id: 'ra-measured',
              title: 'Read aloud',
              referenceText: 'the cat sat',
              locale: 'en-US',
              recording: { maxSeconds: 30 },
              scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
            },
            { type: 'read-aloud', recording: { key: 'take-1', mimeType: 'audio/wav' } },
            {
              assessmentVersion: '1.0',
              status: 'assessed',
              task: 'scripted',
              locale: 'en-US',
              referenceText: 'the cat sat',
              recordingKey: 'take-1',
              assessor: { kind: 'auto' },
              scale: 100,
              scores: { accuracy: 50 },
              miscue: 'assessor',
              words: [],
            },
            {
              measured: { durationMs: inspection.durationMs, voicedMs: inspection.voicedMs },
              plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
            },
          ),
        ).not.toThrow();
      }),
      RUNS,
    );
  });

  it('accepts every assessment it aligns, and aligns every assessment it accepts', () => {
    fc.assert(
      fc.property(arbitraryReferenceText(), arbitrarySpeechAssessment(), (referenceText, heard) => {
        // The one gate is `validateSpeechAssessment`: nothing else can refuse.
        expect(validateSpeechAssessment(heard).success).toBe(true);
        expect(() => alignReadAloud({ referenceText }, heard)).not.toThrow();
      }),
      RUNS,
    );
  });
});
