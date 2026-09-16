import fc from 'fast-check';
import type {
  ReadAloudData,
  ReadAloudDimension,
  ReadAloudDimensionWeight,
  ReadAloudLearnerResponse,
} from '../../types/activity.js';
import type { GradeReadAloudOptions, SpeechAssessment, SpeechWord } from '../../types/speech.js';
import { TAKE_KEY } from './read-aloud-fixtures.js';

/** Ordinary words of a spaced script, which is all a read-aloud item accepts. */
const WORDS = ['the', 'cat', 'sat', 'on', 'mat', 'dog', 'ran', 'red'];

const DIMENSIONS: readonly ReadAloudDimension[] = [
  'accuracy',
  'fluency',
  'completeness',
  'prosody',
];

/** A reference text: one to eight ordinary words. */
export function arbitraryReferenceText(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 8 })
    .map((words) => words.join(' '));
}

/** One to four weighted dimensions, distinct, at least one carrying a weight. */
export function arbitraryDimensions(): fc.Arbitrary<ReadAloudDimensionWeight[]> {
  return fc
    .uniqueArray(fc.constantFrom(...DIMENSIONS), { minLength: 1, maxLength: 4 })
    .chain((names) =>
      fc
        .array(fc.double({ min: 0, max: 1000, noNaN: true }), {
          minLength: names.length,
          maxLength: names.length,
        })
        .map((weights) => names.map((name, index) => ({ name, weight: weights[index] as number }))),
    )
    .filter((dimensions) => dimensions.some((dimension) => dimension.weight > 0));
}

/** Valid read-aloud data. */
export function arbitraryReadAloudItem(): fc.Arbitrary<ReadAloudData> {
  return fc
    .record({
      referenceText: arbitraryReferenceText(),
      dimensions: arbitraryDimensions(),
      passThreshold: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
    })
    .map(({ referenceText, dimensions, passThreshold }) => ({
      schemaVersion: '1.0' as const,
      type: 'read-aloud' as const,
      id: 'ra-property',
      title: 'Read the text aloud',
      referenceText,
      locale: 'en-US',
      recording: { maxSeconds: 30 },
      scoring: { dimensions },
      ...(passThreshold !== undefined ? { passThreshold } : {}),
    }));
}

/** The words an assessor might report for a reading: any label, any classification. */
function arbitraryWords(): fc.Arbitrary<SpeechWord[]> {
  return fc.array(
    fc
      .record(
        {
          text: fc.constantFrom(...WORDS, 'um', 'the cat'),
          accuracy: fc.double({ min: 0, max: 100, noNaN: true }),
          error: fc.constantFrom('none', 'mispronunciation', 'omission', 'insertion'),
        },
        { requiredKeys: ['text', 'error'] },
      )
      .map((word) => word as SpeechWord),
    { maxLength: 10 },
  );
}

/** A take a grade can be attempted on: the evidence binds to the item unless a case breaks it. */
export interface ArbitraryTake {
  data: ReadAloudData;
  response: ReadAloudLearnerResponse;
  assessment: SpeechAssessment;
  options: GradeReadAloudOptions;
}

/**
 * A take whose evidence binds to its item: scripted, same locale, same text,
 * same recording, measured plausibly. What varies is what a grade is made of —
 * the weights, the scores, the words and how they were read.
 *
 * `scoredDimensions` decides which authored dimensions the assessment carries a
 * score for: `'all'` never trips `missing_dimension`, and `'some'` may.
 */
export function arbitraryTake(
  scoredDimensions: 'all' | 'some' = 'all',
): fc.Arbitrary<ArbitraryTake> {
  return fc
    .record({
      data: arbitraryReadAloudItem(),
      words: arbitraryWords(),
      miscue: fc.constantFrom('assessor', 'none'),
      scores: fc.dictionary(
        fc.constantFrom(...DIMENSIONS),
        fc.double({ min: 0, max: 100, noNaN: true }),
      ),
      durationMs: fc.double({ min: 1, max: 300_000, noNaN: true }),
      // Some of the recording is always voiced, so the rate check cannot be
      // what refuses a take: what is under test is the arithmetic.
      voicedFraction: fc.double({ min: 0.1, max: 1, noNaN: true }),
    })
    .map(({ data, words, miscue, scores, durationMs, voicedFraction }) => {
      const authored: Record<string, number> = { ...scores };
      if (scoredDimensions === 'all') {
        for (const dimension of data.scoring.dimensions) {
          authored[dimension.name] = authored[dimension.name] ?? 50;
        }
      }
      return {
        data,
        response: {
          type: 'read-aloud' as const,
          recording: { key: TAKE_KEY, mimeType: 'audio/wav' },
        },
        assessment: {
          assessmentVersion: '1.0' as const,
          status: 'assessed' as const,
          task: 'scripted' as const,
          locale: data.locale,
          referenceText: data.referenceText,
          recordingKey: TAKE_KEY,
          assessor: { kind: 'auto' as const, id: 'pronunciation-engine' },
          scale: 100 as const,
          scores: authored,
          miscue: miscue as SpeechAssessment['miscue'],
          words,
        },
        options: {
          measured: { durationMs, voicedMs: durationMs * voicedFraction },
          // Wide enough that no reading of at most ten words can reach it: the
          // policy is exercised by its own tests, not by these.
          plausibility: { maxWordsPerSecond: 1_000_000, minVoicedMs: 0 },
        },
      };
    });
}
