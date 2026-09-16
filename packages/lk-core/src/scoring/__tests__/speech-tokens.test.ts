import { describe, expect, it } from 'vitest';
import type { SpeechWord } from '../../types/speech.js';
import { SPEECH_ASSESSMENT_MAX_TEXT_LENGTH } from '../speech/limits.js';
import { heardTokens } from '../speech/tokens.js';

// The collector is tested here rather than through `alignReadAloud`, because
// `validateSpeechAssessment` now bounds the same total the same way: no
// assessment that validates can reach the budget, so the branch that stops
// collecting has no public route to it. The budget is kept as a backstop for a
// public call whose evidence this build did not check, and a backstop nothing
// exercises is a backstop nobody knows the shape of.

/** Characters are built from their numbers so this file stays ASCII. */
const cp = (...points: number[]): string => String.fromCodePoint(...points);
/** One character NFKC expands into four Arabic words. */
const MANY_WORDS = cp(0xfdfa);

const spoken = (text: string, error: SpeechWord['error'] = 'none'): SpeechWord => ({ text, error });

/** `count` words of `length` characters, each normalising to one token. */
const wordsOf = (count: number, length: number): SpeechWord[] =>
  Array.from({ length: count }, () => spoken('w'.repeat(length)));

describe('heardTokens', () => {
  it('takes the tokens of every word, in reading order, remembering which word', () => {
    expect(heardTokens([spoken('The cat'), spoken('sat!')])).toEqual({
      tokens: [
        { text: 'the', wordIndex: 0 },
        { text: 'cat', wordIndex: 0 },
        { text: 'sat', wordIndex: 1 },
      ],
      // 3 + 3 + 3 tokens and the two spaces that join them.
      length: 11,
    });
  });

  it('gives no token for a word the assessor inserted, and charges its text all the same', () => {
    const tokens = heardTokens([
      spoken('the'),
      spoken('um', 'insertion'),
      spoken(cp(0x2014)),
      spoken('cat'),
    ]);

    // The insertion has no reference word to pair with, so it is placed by its
    // own position afterwards rather than aligned.
    expect(tokens.tokens).toEqual([
      { text: 'the', wordIndex: 0 },
      { text: 'cat', wordIndex: 3 },
    ]);
    // `the` 3, `um` 2 and its space, `cat` 3 and its space: the aligner emits
    // the insertion too, so its text is text the call answers with, and the
    // bound the validator states over this number has to hold for it.
    expect(tokens.length).toBe(10);
  });

  it('charges nothing for a word that normalises to nothing, inserted or not', () => {
    const dash = cp(0x2014);

    expect(heardTokens([spoken(dash, 'insertion')])).toEqual({ tokens: [], length: 0 });
    expect(heardTokens([spoken(dash)])).toEqual({ tokens: [], length: 0 });
  });

  it('cannot be walked past by tagging the text an insertion', () => {
    // 1000 words of eight expanding characters: 8000 UTF-16 units as written,
    // which the raw rule allows, and 144 000 code points once spelled.
    const words = Array.from({ length: 1000 }, () =>
      spoken(MANY_WORDS.repeat(8), 'insertion' as const),
    );

    expect(heardTokens(words).tokens).toEqual([]);
    expect(heardTokens(words).length).toBeGreaterThan(SPEECH_ASSESSMENT_MAX_TEXT_LENGTH);
  });

  it('charges the space that joins a token to the last one, and none to the first', () => {
    expect(heardTokens([spoken('a')]).length).toBe(1);
    expect(heardTokens([spoken('a b')]).length).toBe(3);
    expect(heardTokens([spoken('a'), spoken('b'), spoken('c')]).length).toBe(5);
  });

  it('keeps the token that lands exactly on the budget', () => {
    // 39 words of 200 characters spell 7838, so a 161-character word lands the
    // last token on 8000 with nothing to spare.
    const words = [...wordsOf(39, 200), spoken('w'.repeat(161))];

    expect(heardTokens(words).length).toBe(SPEECH_ASSESSMENT_MAX_TEXT_LENGTH);
    expect(heardTokens(words).tokens).toHaveLength(40);
  });

  it('drops the whole token that would land one code point past it, never half of one', () => {
    // Half a token pairs with the wrong reference word, and the word it marks
    // is one nobody read.
    const words = [...wordsOf(39, 200), spoken('w'.repeat(162))];
    const heard = heardTokens(words);

    expect(heard.tokens).toHaveLength(39);
    expect(heard.tokens.every((token) => token.text.length === 200)).toBe(true);
    expect(heard.length).toBe(SPEECH_ASSESSMENT_MAX_TEXT_LENGTH + 1);
  });

  it('counts the tokens past the budget too, so the total can be named', () => {
    // 8000 characters written, 144 039 spelled. The length is what refuses an
    // assessment; the tokens are only what would be aligned if one got this far.
    const heard = heardTokens(Array.from({ length: 40 }, () => spoken(MANY_WORDS.repeat(200))));

    expect(heard.length).toBe(144039);
    // Every token costs at least its character and the space before it, so the
    // budget holds no more than half its own length in tokens.
    expect(heard.tokens.length).toBeLessThanOrEqual(SPEECH_ASSESSMENT_MAX_TEXT_LENGTH / 2);
    expect(heard.tokens.length).toBeGreaterThan(0);
  });

  it('has nothing to collect from no words at all', () => {
    expect(heardTokens([])).toEqual({ tokens: [], length: 0 });
  });
});
