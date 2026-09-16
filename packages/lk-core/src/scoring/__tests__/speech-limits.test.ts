import { describe, expect, it } from 'vitest';
import {
  DICTATION_MAX_TRANSCRIPT_LENGTH,
  READ_ALOUD_MAX_DIMENSION_WEIGHT,
  READ_ALOUD_MAX_REFERENCE_LENGTH,
  READ_ALOUD_MAX_SECONDS,
  READ_ALOUD_MAX_TAKES,
  SPEECH_ASSESSMENT_MAX_WORDS,
} from '../index.js';

describe('read-aloud and speech limits', () => {
  it('are the numbers the schema, the draft checks and the docs state', () => {
    expect(READ_ALOUD_MAX_REFERENCE_LENGTH).toBe(2000);
    expect(READ_ALOUD_MAX_SECONDS).toBe(300);
    expect(READ_ALOUD_MAX_TAKES).toBe(20);
    expect(READ_ALOUD_MAX_DIMENSION_WEIGHT).toBe(1000);
    expect(SPEECH_ASSESSMENT_MAX_WORDS).toBe(1000);
  });

  it('cap the reference text exactly where the dictation aligner cuts a transcript', () => {
    // The reference is tokenised as a dictation transcript is, and the aligner
    // cuts one at this many code points without saying so: a longer text would
    // be graded against words it had silently lost.
    expect(READ_ALOUD_MAX_REFERENCE_LENGTH).toBe(DICTATION_MAX_TRANSCRIPT_LENGTH);
  });
});
