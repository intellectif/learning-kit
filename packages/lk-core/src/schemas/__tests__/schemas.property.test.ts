import fc from 'fast-check';
import { describe, it } from 'vitest';
import { validateActivity } from '../index.js';
import { arbitraryFillInTheBlanksData, arbitraryMultipleChoiceData } from './arbitraries.js';

const REQUIRED_MC = [
  'schemaVersion',
  'type',
  'id',
  'title',
  'question',
  'mode',
  'options',
  'scoringStrategy',
] as const;
const REQUIRED_FIB = [
  'schemaVersion',
  'type',
  'id',
  'title',
  'passage',
  'blanks',
  'scoringStrategy',
] as const;

describe('Activity schema properties', () => {
  it('valid activity data survives a JSON round-trip', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbitraryMultipleChoiceData(), arbitraryFillInTheBlanksData()),
        (data) => {
          const roundTripped = JSON.parse(JSON.stringify(data));
          const result = validateActivity(data.type, roundTripped);
          return result.success === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validateActivity accepts valid and rejects corrupted data', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbitraryMultipleChoiceData().map((d) => ({ d, keys: REQUIRED_MC }) as const),
          arbitraryFillInTheBlanksData().map((d) => ({ d, keys: REQUIRED_FIB }) as const),
        ),
        fc.nat(),
        ({ d, keys }, n) => {
          const valid = validateActivity(d.type, d);
          if (!valid.success) {
            return false;
          }
          const key = keys[n % keys.length] as string;
          const corrupted = { ...(d as unknown as Record<string, unknown>) };
          delete corrupted[key];
          const invalid = validateActivity(d.type, corrupted);
          return invalid.success === false && invalid.errors.length > 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});
