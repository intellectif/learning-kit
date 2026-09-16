import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateSpeechAssessment } from '../index.js';
import { arbitrarySpeechAssessment } from './speech-arbitraries.js';

const RUNS = { numRuns: 200 };

/** Everything fast-check can build, including shapes JSON never produces. */
const anything = (): fc.Arbitrary<unknown> =>
  fc.anything({
    withBigInt: true,
    withBoxedValues: true,
    withDate: true,
    withMap: true,
    withNullPrototype: true,
    withObjectString: true,
    withSet: true,
    withSparseArray: true,
    withTypedArray: true,
    withUnicodeString: true,
  });

/** The keys of an assessment, one of which each mutated value replaces. */
const KEYS = [
  'assessmentVersion',
  'status',
  'task',
  'locale',
  'referenceText',
  'recordingKey',
  'assessor',
  'scale',
  'scores',
  'recognizedText',
  'miscue',
  'phonemeAlphabet',
  'words',
  'prosody',
  'signal',
] as const;

/** A well-formed assessment with one field replaced by anything at all. */
const mutated = fc
  .tuple(arbitrarySpeechAssessment(), fc.constantFrom(...KEYS), anything())
  .map(([assessment, key, value]) => ({ ...assessment, [key]: value }));

describe('Speech assessment properties', () => {
  // Feature: learning-kit-sdk, Property 16: validateSpeechAssessment never throws
  it('Property 16: never throws, and always answers with a well-formed result', () => {
    fc.assert(
      fc.property(fc.oneof(anything(), mutated), (value) => {
        const result = validateSpeechAssessment(value);
        if (result.success) {
          expect(typeof result.data).toBe('object');
          return;
        }
        expect(result.errors.length).toBeGreaterThan(0);
        for (const error of result.errors) {
          expect(error.path.every((segment) => typeof segment === 'string')).toBe(true);
          expect(typeof error.message).toBe('string');
          expect(error.message).not.toBe('');
          expect(typeof error.code).toBe('string');
          expect(error.code).not.toBe('');
        }
      }),
      RUNS,
    );
  });

  it('accepts every well-formed assessment, and gives back what it was given', () => {
    fc.assert(
      fc.property(arbitrarySpeechAssessment(), (input) => {
        const result = validateSpeechAssessment(input);
        if (!result.success) {
          throw new Error(
            `refused a well-formed assessment: ${JSON.stringify(result.errors.slice(0, 2))}`,
          );
        }
        expect(result.data).toEqual(input);
      }),
      RUNS,
    );
  });
});
