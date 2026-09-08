/**
 * Configurable free-text answer matching (R3.3).
 *
 * Grade-stability contract: the DEFAULTS reproduce the v1 fill-in-the-blanks
 * semantics exactly (trim, then locale-insensitive lowercase, strict `===`).
 * Every tolerance below is opt-in, because changing a default here changes
 * historical grades — and this SDK powers real summative exams.
 */
export interface TextMatchPolicy {
  /** Compare case-sensitively. Default `false` (v1 behaviour). */
  caseSensitive?: boolean;
  /** Strip leading/trailing whitespace before comparing. Default `true` (v1 behaviour). */
  trim?: boolean;
  /**
   * Unicode normalization applied to both sides before comparing. Default
   * `'none'` (v1 behaviour). `'NFC'` makes a decomposed `está` (combining
   * U+0301) equal its composed form — the fix for accent-input mismatches in
   * EN/ES/PT content.
   */
  normalize?: 'none' | 'NFC' | 'NFKC';
  /** Treat diacritics as equal to their base letters (`está` ≡ `esta`). Default `false`. */
  foldDiacritics?: boolean;
  /** Collapse runs of inner whitespace to a single space. Default `false`. */
  collapseInnerWhitespace?: boolean;
  /** Ignore Unicode punctuation on both sides. Default `false`. */
  ignorePunctuation?: boolean;
  /** Maximum Levenshtein edit distance still accepted as a match. Default `0`. */
  levenshtein?: number;
  /**
   * BCP 47 tag for locale-aware case folding (e.g. `'tr'` for Turkish dotted /
   * dotless I). Default: locale-insensitive `toLowerCase()` (v1 behaviour).
   */
  locale?: string;
}

/**
 * How a match was achieved. Lets a consumer award full credit for an `exact`
 * match and partial credit for a `folded` or `fuzzy` one (e.g. diacritic
 * tolerance in a listening gap-fill vs. a spelling test).
 * - `exact` — equal under the baseline trim/case rules alone.
 * - `normalized` — required Unicode normalization, whitespace collapse, or punctuation tolerance.
 * - `folded` — required diacritic folding.
 * - `fuzzy` — required Levenshtein tolerance.
 * - `none` — no accepted answer matched.
 */
export interface TextMatchResult {
  matched: boolean;
  via: 'exact' | 'normalized' | 'folded' | 'fuzzy' | 'none';
}

/** Combining marks (any script) removed for diacritic folding after NFD decomposition. */
const COMBINING_MARKS_RE = /\p{M}/gu;
/**
 * Unicode punctuation (`\p{P}`) removed by `ignorePunctuation`. Deliberately
 * NOT `\p{S}`: symbols like `$`, `+`, `%` can be the substance of an answer
 * (`$100` vs `100`), so a "punctuation" toggle must not erase them.
 */
const PUNCTUATION_RE = /\p{P}/gu;

function applyBaseline(value: string, policy: TextMatchPolicy): string {
  let result = value;
  if (policy.trim !== false) {
    result = result.trim();
  }
  if (policy.caseSensitive !== true) {
    result = policy.locale ? result.toLocaleLowerCase(policy.locale) : result.toLowerCase();
  }
  return result;
}

function applyNormalization(value: string, policy: TextMatchPolicy): string {
  let result = value;
  if (policy.normalize === 'NFC' || policy.normalize === 'NFKC') {
    result = result.normalize(policy.normalize);
  }
  if (policy.ignorePunctuation === true) {
    result = result.replace(PUNCTUATION_RE, '');
  }
  if (policy.collapseInnerWhitespace === true) {
    // "Inner" means between non-space runs. Only trim the ends when the
    // policy's trim is on (its default) — an explicit `trim: false` must not
    // be silently overridden by the collapse.
    result = result.replace(/(?<=\S)\s+(?=\S)/g, ' ');
    if (policy.trim !== false) {
      result = result.trim();
    }
  }
  return result;
}

function applyDiacriticFold(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS_RE, '').normalize('NFC');
}

/**
 * Levenshtein distance with an early-exit bound: returns `max + 1` as soon as
 * the distance provably exceeds `max`.
 */
export function levenshteinDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length] as number;
}

/**
 * Matches a learner's input against one or more accepted answers under a
 * {@link TextMatchPolicy}. Tolerances are evaluated in stages — baseline
 * (trim/case), then normalization, then diacritic folding, then Levenshtein —
 * and {@link TextMatchResult.via} reports the first stage that produced the
 * match, so graders can award credit by match quality.
 *
 * With no policy (or an empty one) this is byte-for-byte the v1 matching
 * semantics: `trim` + locale-insensitive `toLowerCase` + strict equality.
 */
export function matchText(
  input: string,
  accepted: string | readonly string[],
  policy: TextMatchPolicy = {},
): TextMatchResult {
  const acceptedList = typeof accepted === 'string' ? [accepted] : accepted;
  const baselineInput = applyBaseline(input, policy);
  const baselineAccepted = acceptedList.map((answer) => applyBaseline(answer, policy));

  if (baselineAccepted.some((answer) => answer === baselineInput)) {
    return { matched: true, via: 'exact' };
  }

  const usesNormalization =
    policy.normalize === 'NFC' ||
    policy.normalize === 'NFKC' ||
    policy.ignorePunctuation === true ||
    policy.collapseInnerWhitespace === true;
  const normalizedInput = usesNormalization
    ? applyNormalization(baselineInput, policy)
    : baselineInput;
  const normalizedAccepted = usesNormalization
    ? baselineAccepted.map((answer) => applyNormalization(answer, policy))
    : baselineAccepted;

  if (usesNormalization && normalizedAccepted.some((answer) => answer === normalizedInput)) {
    return { matched: true, via: 'normalized' };
  }

  const foldedInput =
    policy.foldDiacritics === true ? applyDiacriticFold(normalizedInput) : normalizedInput;
  const foldedAccepted =
    policy.foldDiacritics === true
      ? normalizedAccepted.map((answer) => applyDiacriticFold(answer))
      : normalizedAccepted;

  if (policy.foldDiacritics === true && foldedAccepted.some((answer) => answer === foldedInput)) {
    return { matched: true, via: 'folded' };
  }

  // A learner who typed nothing made no typo. Levenshtein distance from an
  // empty string is just the answer's length, so `levenshtein: 1` on a
  // one-letter blank ("a", "I") marked an UNANSWERED blank correct — the
  // fuzzy stage rescuing a blank rather than a misspelling. No author enabling
  // typo tolerance intends that, so an empty input never reaches this stage.
  // Exact and normalized matching are untouched: an author who genuinely lists
  // "" as an accepted answer still gets it, deliberately, one stage earlier.
  const maxDistance = policy.levenshtein ?? 0;
  if (
    maxDistance > 0 &&
    foldedInput.trim().length > 0 &&
    foldedAccepted.some(
      (answer) => levenshteinDistance(foldedInput, answer, maxDistance) <= maxDistance,
    )
  ) {
    return { matched: true, via: 'fuzzy' };
  }

  return { matched: false, via: 'none' };
}
