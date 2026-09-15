/**
 * The code points of `text`, as numbers. A surrogate pair is one code point; a
 * lone surrogate iterates as one code point too — deterministic, never thrown.
 */
export function codePoints(text: string): number[] {
  return Array.from(text, (character) => character.codePointAt(0) as number);
}

/**
 * Exact, unbounded Levenshtein distance between the code-point sequences of
 * `a` and `b`: insertions, deletions and substitutions cost 1 each, and a
 * transposition is two edits. Two-row Wagner–Fischer: O(|a|·|b|) time,
 * O(min(|a|, |b|)) memory.
 *
 * Deliberately NOT `levenshteinDistance` from `text-match.ts`: that one counts
 * UTF-16 code units, stops early once a bound is passed (returning `max + 1`,
 * not a distance), and is frozen by every fill-in-the-blanks grade vector. A
 * dictation grade needs the whole distance, over characters a learner can see.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  let left = codePoints(a);
  let right = codePoints(b);
  if (left.length < right.length) {
    [left, right] = [right, left];
  }
  if (right.length === 0) {
    return left.length;
  }

  let previous = new Uint32Array(right.length + 1);
  let current = new Uint32Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) {
    previous[j] = j;
  }
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    const leftPoint = left[i - 1];
    for (let j = 1; j <= right.length; j += 1) {
      const deletion = (previous[j] as number) + 1;
      const insertion = (current[j - 1] as number) + 1;
      const substitution = (previous[j - 1] as number) + (leftPoint === right[j - 1] ? 0 : 1);
      current[j] = Math.min(deletion, insertion, substitution);
    }
    [previous, current] = [current, previous];
  }
  return previous[right.length] as number;
}

/**
 * How alike two strings are, in [0, 1]: `(max − distance) / max` over code
 * points, where `max` is the longer length. One division, correctly rounded,
 * so an exact rational tie at an authored threshold passes — `0.67` for 33
 * edits in 100 — where `1 − distance / max` evaluates to `0.6699999999999999`
 * and would fail it. Two empty strings are `0`, not `1`: nothing was dictated.
 */
export function similarity(a: string, b: string): number {
  const max = Math.max(codePoints(a).length, codePoints(b).length);
  return max === 0 ? 0 : (max - editDistance(a, b)) / max;
}
