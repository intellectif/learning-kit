import { describe, expect, it } from 'vitest';
import { levenshteinDistance, matchText } from '../text-match.js';

/** Decomposed form: 'esta' + combining acute accent (U+0301) on the final 'a'. */
const DECOMPOSED_ESTA = 'está';
/** Composed form: 'está' with precomposed U+00E1. */
const COMPOSED_ESTA = 'está';

describe('matchText — default policy (v1 semantics)', () => {
  it('matches after trim + locale-insensitive lowercase and reports via "exact"', () => {
    expect(matchText('  CaT  ', 'cat')).toEqual({ matched: true, via: 'exact' });
  });

  it('accepts a single accepted answer given as a plain string', () => {
    expect(matchText('dog', 'dog')).toEqual({ matched: true, via: 'exact' });
  });

  it('accepts an array of accepted answers and matches any element', () => {
    expect(matchText('two', ['one', 'two'])).toEqual({ matched: true, via: 'exact' });
  });

  it('returns { matched: false, via: "none" } when nothing matches', () => {
    expect(matchText('three', ['one', 'two'])).toEqual({ matched: false, via: 'none' });
  });

  it('does NOT match decomposed esta+U+0301 against composed está by default', () => {
    expect(matchText(DECOMPOSED_ESTA, COMPOSED_ESTA)).toEqual({ matched: false, via: 'none' });
  });

  it('does NOT fold diacritics by default', () => {
    expect(matchText('esta', COMPOSED_ESTA)).toEqual({ matched: false, via: 'none' });
  });
});

describe('matchText — baseline options', () => {
  it('caseSensitive: true rejects a case difference the default would accept', () => {
    expect(matchText('Cat', 'cat', { caseSensitive: true })).toEqual({
      matched: false,
      via: 'none',
    });
    expect(matchText('Cat', 'Cat', { caseSensitive: true })).toEqual({
      matched: true,
      via: 'exact',
    });
  });

  it('trim: false rejects leading/trailing whitespace the default would strip', () => {
    expect(matchText('  cat', 'cat', { trim: false })).toEqual({ matched: false, via: 'none' });
    expect(matchText('cat', 'cat', { trim: false })).toEqual({ matched: true, via: 'exact' });
  });

  it('locale-aware lowercasing: Turkish dotless I matches under locale "tr" but not the default', () => {
    // Default toLowerCase(): 'I' -> 'i', which is not U+0131 (dotless i).
    expect(matchText('I', 'ı')).toEqual({ matched: false, via: 'none' });
    // toLocaleLowerCase('tr'): 'I' -> U+0131.
    expect(matchText('I', 'ı', { locale: 'tr' })).toEqual({ matched: true, via: 'exact' });
  });
});

describe('matchText — normalization stage (via "normalized")', () => {
  it('normalize: "NFC" makes decomposed and composed está equal', () => {
    expect(matchText(DECOMPOSED_ESTA, COMPOSED_ESTA, { normalize: 'NFC' })).toEqual({
      matched: true,
      via: 'normalized',
    });
  });

  it('normalize: "NFKC" also folds compatibility characters (fi ligature)', () => {
    expect(matchText('ﬁsh', 'fish', { normalize: 'NFKC' })).toEqual({
      matched: true,
      via: 'normalized',
    });
  });

  it('normalize: "NFC" does not fold compatibility characters', () => {
    expect(matchText('ﬁsh', 'fish', { normalize: 'NFC' })).toEqual({
      matched: false,
      via: 'none',
    });
  });

  it('ignorePunctuation strips Unicode punctuation from both sides', () => {
    expect(matchText("it's", ['other', 'its'], { ignorePunctuation: true })).toEqual({
      matched: true,
      via: 'normalized',
    });
  });

  it('collapseInnerWhitespace collapses runs of inner whitespace to one space', () => {
    expect(matchText('hello \t  world', 'hello world', { collapseInnerWhitespace: true })).toEqual({
      matched: true,
      via: 'normalized',
    });
  });

  it('reports via "none" when normalization is enabled but still no match', () => {
    expect(matchText('dog', 'cat', { normalize: 'NFC', ignorePunctuation: true })).toEqual({
      matched: false,
      via: 'none',
    });
  });
});

describe('matchText — diacritic folding (via "folded")', () => {
  it('foldDiacritics matches esta against está', () => {
    expect(matchText('esta', COMPOSED_ESTA, { foldDiacritics: true })).toEqual({
      matched: true,
      via: 'folded',
    });
  });

  it('reports via "none" when folding is enabled but still no match', () => {
    expect(matchText('otra', COMPOSED_ESTA, { foldDiacritics: true })).toEqual({
      matched: false,
      via: 'none',
    });
  });
});

describe('matchText — Levenshtein tolerance (via "fuzzy")', () => {
  it('accepts a distance-1 typo with levenshtein: 1', () => {
    expect(matchText('kat', 'cat', { levenshtein: 1 })).toEqual({ matched: true, via: 'fuzzy' });
  });

  it('accepts a distance-2 typo with levenshtein: 2', () => {
    // 'recieve' -> 'receive' needs two substitutions in plain Levenshtein.
    expect(matchText('recieve', 'receive', { levenshtein: 2 })).toEqual({
      matched: true,
      via: 'fuzzy',
    });
  });

  it('rejects when the distance exceeds the budget', () => {
    expect(matchText('recieve', 'receive', { levenshtein: 1 })).toEqual({
      matched: false,
      via: 'none',
    });
  });

  it('levenshtein: 0 (explicit) disables the fuzzy stage', () => {
    expect(matchText('kat', 'cat', { levenshtein: 0 })).toEqual({ matched: false, via: 'none' });
  });
});

describe('matchText — stage precedence', () => {
  it('exact beats normalized when both would match', () => {
    expect(
      matchText('hello', 'hello', { normalize: 'NFC', collapseInnerWhitespace: true }),
    ).toEqual({
      matched: true,
      via: 'exact',
    });
  });

  it('normalized beats folded when both would match', () => {
    expect(
      matchText(DECOMPOSED_ESTA, COMPOSED_ESTA, { normalize: 'NFC', foldDiacritics: true }),
    ).toEqual({ matched: true, via: 'normalized' });
  });

  it('folded beats fuzzy when both would match', () => {
    expect(matchText('esta', COMPOSED_ESTA, { foldDiacritics: true, levenshtein: 2 })).toEqual({
      matched: true,
      via: 'folded',
    });
  });

  it('fuzzy applies only after exact, normalized, and folded all miss', () => {
    expect(matchText('estq', COMPOSED_ESTA, { foldDiacritics: true, levenshtein: 1 })).toEqual({
      matched: true,
      via: 'fuzzy',
    });
  });
});

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc', 0)).toBe(0);
    expect(levenshteinDistance('', '', 3)).toBe(0);
  });

  it('returns max + 1 when the length difference alone exceeds max', () => {
    expect(levenshteinDistance('a', 'abcd', 1)).toBe(2);
  });

  it('returns the other length when one side is empty', () => {
    expect(levenshteinDistance('', 'ab', 2)).toBe(2);
    expect(levenshteinDistance('ab', '', 2)).toBe(2);
  });

  it('returns max + 1 via the row-minimum early exit when every row entry exceeds max', () => {
    // Same lengths (no length-difference exit); true distance 3, budget 1.
    expect(levenshteinDistance('abc', 'xyz', 1)).toBe(2);
  });

  it('computes the exact distance through the full DP when within budget', () => {
    expect(levenshteinDistance('kitten', 'sitting', 3)).toBe(3);
    expect(levenshteinDistance('cat', 'cot', 1)).toBe(1);
  });
});

describe('matchText — review-pinned edge cases (v0.3 release review)', () => {
  it('ignorePunctuation does NOT strip symbols: "$100" stays distinct from "100"', () => {
    expect(matchText('100', '$100', { ignorePunctuation: true })).toEqual({
      matched: false,
      via: 'none',
    });
  });

  it('collapseInnerWhitespace with explicit trim: false preserves outer whitespace', () => {
    // Inner runs collapse; the ends are untouched because trim is explicitly off.
    expect(matchText(' a  b ', ' a b ', { collapseInnerWhitespace: true, trim: false })).toEqual({
      matched: true,
      via: 'normalized',
    });
    expect(matchText(' a  b ', 'a b', { collapseInnerWhitespace: true, trim: false })).toEqual({
      matched: false,
      via: 'none',
    });
  });

  it('collapseInnerWhitespace still trims ends re-exposed by punctuation removal', () => {
    expect(
      matchText('. a  b .', 'a b', { ignorePunctuation: true, collapseInnerWhitespace: true }),
    ).toEqual({ matched: true, via: 'normalized' });
  });
});
