import { alignSequences, STEP } from './align.js';

/** One code-point edit between a reference string and an attempt. */
export interface DictationCharOp {
  op: 'equal' | 'substitute' | 'missing' | 'extra';
  /** One code point of the reference, or `''` for an extra character. */
  reference: string;
  /** One code point of the attempt, or `''` for a missing character. */
  attempt: string;
}

/**
 * The code-point edit operations between two NORMALISED strings — the
 * `reference` and `attempt` of a `DictationAlignment`, or one word pair from
 * it — for a marked display: a character the learner typed right, typed
 * wrong, left out, or added. Ties are broken preferring an equal or substituted
 * pair, then a missing character, then an extra one, from the end of both
 * strings; the number of non-`equal` ops is the edit distance.
 *
 * Decoration, never grading: it needs O(|reference|·|attempt|) memory, so the
 * scorer does not call it, and a display computes it once per result.
 */
export function diffDictationChars(reference: string, attempt: string): DictationCharOp[] {
  const referencePoints = Array.from(reference);
  const attemptPoints = Array.from(attempt);
  return alignSequences(referencePoints, attemptPoints).map(
    ({ step, referenceIndex, attemptIndex }) => {
      if (step === STEP.missing) {
        return { op: 'missing', reference: referencePoints[referenceIndex] as string, attempt: '' };
      }
      if (step === STEP.extra) {
        return { op: 'extra', reference: '', attempt: attemptPoints[attemptIndex] as string };
      }
      const referencePoint = referencePoints[referenceIndex] as string;
      const attemptPoint = attemptPoints[attemptIndex] as string;
      return {
        op: referencePoint === attemptPoint ? 'equal' : 'substitute',
        reference: referencePoint,
        attempt: attemptPoint,
      };
    },
  );
}
