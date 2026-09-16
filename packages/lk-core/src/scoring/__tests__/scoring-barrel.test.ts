import { describe, expect, it } from 'vitest';
import * as scoring from '../index.js';
import { computePassThreshold, DEFAULT_PASS_THRESHOLD, selectFeedback } from '../pass-threshold.js';
import { roundingPolicyOf } from '../rounding.js';
import { SPEECH_ASSESSMENT_MAX_TEXT_LENGTH } from '../speech/limits.js';
import { heardTokens } from '../speech/tokens.js';

describe('the scoring barrel', () => {
  it('re-exports the pass line unchanged: the same bindings, under the same names', () => {
    expect(scoring.DEFAULT_PASS_THRESHOLD).toBe(DEFAULT_PASS_THRESHOLD);
    expect(scoring.DEFAULT_PASS_THRESHOLD).toBe(0.7);
    expect(scoring.computePassThreshold).toBe(computePassThreshold);
  });

  it('keeps the internals unreachable: what this file exports is public API', () => {
    // `src/index.ts` does `export *` from here, and there is a `./scoring`
    // subpath, so a name added here is public at both.
    expect('selectFeedback' in scoring).toBe(false);
    expect('roundingPolicyOf' in scoring).toBe(false);
    expect('CANONICAL_LOCALE_RE' in scoring).toBe(false);
    expect('containsUnspacedScript' in scoring).toBe(false);
    expect('heardTokens' in scoring).toBe(false);
    expect('SPEECH_ASSESSMENT_MAX_TEXT_LENGTH' in scoring).toBe(false);
    // Imported by name above, so the assertions are about reach, not spelling.
    expect(typeof selectFeedback).toBe('function');
    expect(typeof roundingPolicyOf).toBe('function');
    expect(typeof heardTokens).toBe('function');
    expect(SPEECH_ASSESSMENT_MAX_TEXT_LENGTH).toBe(8000);
  });

  it('exports the new speech names, which vectors and verify-dist call by name', () => {
    expect(typeof scoring.validateSpeechAssessment).toBe('function');
    expect(typeof scoring.outcomeFromUnscorable).toBe('function');
    expect(typeof scoring.alignReadAloud).toBe('function');
    expect(typeof scoring.gradeReadAloud).toBe('function');
    expect(typeof scoring.inspectWav).toBe('function');
  });
});
