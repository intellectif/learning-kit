import { describe, expect, it } from 'vitest';
import type { ReadAloudData } from '../../types/activity.js';
import type { SpeechAssessment } from '../../types/speech.js';
import { normalizeDictationText } from '../dictation/normalize.js';
import { alignReadAloud, DICTATION_MAX_TEXT_LENGTH, dictationReferenceWords } from '../index.js';
import { readAloudItem, SENTENCE, speechAssessment, spoken } from './read-aloud-fixtures.js';

/** The item every case reads, and an assessment of it with the given words. */
const heardWords = (words: SpeechAssessment['words'], over: Partial<SpeechAssessment> = {}) =>
  alignReadAloud(readAloudItem(), speechAssessment({ words, ...over }));

/** An em dash: a word that survives no normalisation at all. */
const EM_DASH = String.fromCodePoint(0x2014);

/** One character NFKC expands into four Arabic words. */
const MANY_WORDS = String.fromCodePoint(0xfdfa);

describe('alignReadAloud()', () => {
  it('numbers the reference words exactly as dictationReferenceWords does', () => {
    const entries = alignReadAloud(readAloudItem(), speechAssessment());
    const expected = dictationReferenceWords({ transcript: SENTENCE })[0] as readonly {
      itemId: string;
      word: string;
    }[];

    expect(entries.map((entry) => entry.itemId)).toEqual(expected.map((word) => word.itemId));
    expect(entries.map((entry) => entry.reference)).toEqual(expected.map((word) => word.word));
    expect(entries.map((entry) => entry.itemId)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6']);
  });

  it('marks a reading of the text as correct, carrying each word accuracy and index', () => {
    const entries = alignReadAloud(readAloudItem(), speechAssessment());

    expect(entries.every((entry) => entry.state === 'correct')).toBe(true);
    expect(entries.map((entry) => entry.heard)).toEqual(SENTENCE.split(' '));
    expect(entries.map((entry) => entry.accuracy)).toEqual([90, 90, 90, 90, 90, 90]);
    expect(entries.map((entry) => entry.wordIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('normalises both sides: the marks are lowercase, unpunctuated tokens', () => {
    const entries = heardWords([
      spoken('The'),
      spoken('CAT!'),
      spoken('sat'),
      spoken('on'),
      spoken('the'),
      spoken('Mat.'),
    ]);

    expect(entries.map((entry) => entry.heard)).toEqual(['the', 'cat', 'sat', 'on', 'the', 'mat']);
    expect(entries.every((entry) => entry.state === 'correct')).toBe(true);
  });

  describe('miscue', () => {
    const misread = [
      spoken('the'),
      spoken('cot'),
      spoken('sat'),
      spoken('on'),
      spoken('the'),
      spoken('mat'),
    ];

    it('trusts an assessor that judges miscues: a word it reported as read is correct', () => {
      const entries = heardWords(misread, { miscue: 'assessor' });

      expect(entries[1]).toMatchObject({ itemId: 'w2', reference: 'cat', heard: 'cot' });
      expect(entries[1]?.state).toBe('correct');
    });

    it('compares the words itself when the assessor judged no miscues', () => {
      const entries = heardWords(misread, { miscue: 'none' });

      expect(entries[1]?.state).toBe('mispronounced');
      expect(entries[1]?.heard).toBe('cot');
      // Only the word that differs: the rest still read as written.
      expect(entries.filter((entry) => entry.state === 'mispronounced')).toHaveLength(1);
    });

    it("takes the assessor's own mispronunciation label whatever the miscue setting", () => {
      const entries = heardWords(
        [
          spoken('the'),
          spoken('cat', { error: 'mispronunciation', accuracy: 21 }),
          spoken('sat'),
          spoken('on'),
          spoken('the'),
          spoken('mat'),
        ],
        { miscue: 'assessor' },
      );

      expect(entries[1]).toMatchObject({ state: 'mispronounced', heard: 'cat', accuracy: 21 });
    });
  });

  it('marks an omission as read nothing, keeping the accuracy the assessor gave it', () => {
    const entries = heardWords([
      spoken('the'),
      spoken('cat', { error: 'omission', accuracy: 0 }),
      spoken('sat'),
      spoken('on'),
      spoken('the'),
      spoken('mat'),
    ]);

    expect(entries[1]).toEqual({
      itemId: 'w2',
      reference: 'cat',
      heard: '',
      state: 'omitted',
      accuracy: 0,
      wordIndex: 1,
    });
  });

  it('marks a reference word nothing was heard for as omitted, with no accuracy and no index', () => {
    const entries = heardWords([
      spoken('the'),
      spoken('sat'),
      spoken('on'),
      spoken('the'),
      spoken('mat'),
    ]);

    expect(entries[1]).toEqual({ itemId: 'w2', reference: 'cat', heard: '', state: 'omitted' });
    expect(Object.hasOwn(entries[1] as object, 'accuracy')).toBe(false);
    expect(Object.hasOwn(entries[1] as object, 'wordIndex')).toBe(false);
  });

  it('marks a heard word the text does not contain as inserted, with no itemId', () => {
    const entries = heardWords([...SENTENCE.split(' ').map((word) => spoken(word)), spoken('too')]);
    const inserted = entries.filter((entry) => entry.state === 'inserted');

    expect(inserted).toEqual([{ reference: '', heard: 'too', state: 'inserted', wordIndex: 6 }]);
    expect(entries).toHaveLength(7);
  });

  describe('a word the assessor tagged as an insertion', () => {
    const readWith = (...inserted: number[]) => {
      const words = SENTENCE.split(' ').map((word) => spoken(word));
      // Insert from the back, so the earlier positions still mean what they say.
      for (const at of [...inserted].sort((a, b) => b - a)) {
        words.splice(at, 0, spoken('um', { error: 'insertion', accuracy: 12 }));
      }
      return heardWords(words);
    };

    it('goes first when nothing was read before it', () => {
      const entries = readWith(0);

      expect(entries[0]).toEqual({
        reference: '',
        heard: 'um',
        state: 'inserted',
        accuracy: 12,
        wordIndex: 0,
      });
      expect(entries.slice(1).map((entry) => entry.itemId)).toEqual([
        'w1',
        'w2',
        'w3',
        'w4',
        'w5',
        'w6',
      ]);
    });

    it('goes after the last word read before it', () => {
      const entries = readWith(2);

      expect(entries.map((entry) => entry.state)).toEqual([
        'correct',
        'correct',
        'inserted',
        'correct',
        'correct',
        'correct',
        'correct',
      ]);
      expect(entries[2]?.wordIndex).toBe(2);
    });

    it('keeps several in a row in the order the assessor reported them', () => {
      const [the, cat, ...rest] = SENTENCE.split(' ');
      const entries = heardWords([
        spoken(the as string),
        spoken(cat as string),
        spoken('um', { error: 'insertion' }),
        spoken('er', { error: 'insertion' }),
        spoken('ah', { error: 'insertion' }),
        ...rest.map((word) => spoken(word)),
      ]);
      const insertedAt = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.state === 'inserted');

      expect(insertedAt.map(({ index }) => index)).toEqual([2, 3, 4]);
      expect(insertedAt.map(({ entry }) => entry.wordIndex)).toEqual([2, 3, 4]);
      expect(insertedAt.map(({ entry }) => entry.heard)).toEqual(['um', 'er', 'ah']);
    });

    it('is emitted even when its text normalises to nothing, so every word is reachable', () => {
      const entries = heardWords([
        spoken('the'),
        spoken(EM_DASH, { error: 'insertion' }),
        ...SENTENCE.split(' ')
          .slice(1)
          .map((word) => spoken(word)),
      ]);

      expect(entries[1]).toEqual({ reference: '', heard: '', state: 'inserted', wordIndex: 1 });
    });
  });

  it('pairs a repeated word with the reading of it, not with the first occurrence', () => {
    const entries = heardWords([
      spoken('the'),
      spoken('cat'),
      spoken('sat'),
      spoken('on'),
      spoken('the', { error: 'mispronunciation' }),
      spoken('mat'),
    ]);

    expect(entries[0]?.state).toBe('correct');
    expect(entries[4]).toMatchObject({ itemId: 'w5', reference: 'the', state: 'mispronounced' });
  });

  it('drops a word that normalises to no token at all', () => {
    const entries = heardWords([
      spoken('the'),
      spoken(EM_DASH, { accuracy: 44 }),
      spoken('cat'),
      spoken('sat'),
      spoken('on'),
      spoken('the'),
      spoken('mat'),
    ]);

    expect(entries.every((entry) => entry.state === 'correct')).toBe(true);
    expect(entries.map((entry) => entry.wordIndex)).toEqual([0, 2, 3, 4, 5, 6]);
  });

  it('keeps every token of a word that normalises to several, all pointing at that word', () => {
    const entries = heardWords([spoken('the'), spoken(MANY_WORDS, { accuracy: 55 })]);
    const tokens = normalizeDictationText(MANY_WORDS).split(' ');

    expect(tokens.length).toBeGreaterThan(1);
    expect(entries.filter((entry) => entry.wordIndex === 1)).toHaveLength(tokens.length);
    expect(entries.filter((entry) => entry.wordIndex === 1).map((entry) => entry.heard)).toEqual(
      tokens,
    );
  });

  it('keeps two words the punctuation between them merges as one token', () => {
    const item = readAloudItem({ referenceText: 'rock and roll' });
    const entries = alignReadAloud(
      item,
      speechAssessment({ referenceText: 'rock and roll', words: [spoken('rock&roll')] }),
    );

    expect(entries.map((entry) => entry.itemId)).toEqual(['w1', 'w2', 'w3']);
    expect(entries.filter((entry) => entry.heard === 'rockroll')).toHaveLength(1);
    expect(entries.filter((entry) => entry.state === 'omitted')).toHaveLength(2);
  });

  it('omits the accuracy key entirely when the assessor measured no accuracy', () => {
    const entries = heardWords([spoken('the'), spoken('cat')]);

    expect(Object.hasOwn(entries[0] as object, 'accuracy')).toBe(false);
    expect(entries[0]?.accuracy).toBeUndefined();
  });

  describe('the token budget', () => {
    /** A padding word: 200 characters, which normalise to one token of its own. */
    const FULL = 'p'.repeat(200);
    /** How many of those come before the word whose length dials in the budget. */
    const PADDING = 39;
    /** A text of more words than the budget leaves tokens to pair them with. */
    const LONGER_TEXT = Array.from(
      { length: 45 },
      (_, index) => `w${String(index).padStart(2, '0')}`,
    ).join(' ');

    /** What one more token costs the budget: the token, and the space before it. */
    const cost = (token: string, first = false): number => token.length + (first ? 0 : 1);

    /**
     * A reading of `LONGER_TEXT` whose last token lands exactly on the budget,
     * or `over` code points past it. Every word is one token, so what the
     * aligner keeps is arithmetic rather than a guess.
     */
    const readTo = (over: number) => {
      const padded = cost(FULL, true) + (PADDING - 1) * cost(FULL);
      const last = DICTATION_MAX_TEXT_LENGTH - padded - 1 + over;

      return alignReadAloud(
        readAloudItem({ referenceText: LONGER_TEXT }),
        speechAssessment({
          referenceText: LONGER_TEXT,
          words: [...Array.from({ length: PADDING }, () => spoken(FULL)), spoken('p'.repeat(last))],
        }),
      );
    };

    /** The marks made from a heard token, and the reference words left unread. */
    const shape = (entries: ReturnType<typeof readTo>) => ({
      heard: entries.filter((entry) => entry.wordIndex !== undefined).length,
      omitted: entries.filter((entry) => entry.state === 'omitted').map((entry) => entry.reference),
    });

    it('keeps the token that lands exactly on the budget', () => {
      // 40 tokens against 45 reference words: five words are left with nothing
      // read for them, and the aligner marks them omitted.
      expect(shape(readTo(0))).toEqual({
        heard: PADDING + 1,
        omitted: ['w00', 'w01', 'w02', 'w03', 'w04'],
      });
    });

    it('refuses one code point more rather than marking part of the reading', () => {
      // `validateSpeechAssessment` bounds the same total, measured the same
      // way, so a reading past the budget never reaches the aligner at all:
      // the tail is refused, never silently dropped. What the budget does when
      // it is reached is tested on the collector itself, in
      // speech-tokens.test.ts, because no validated assessment can reach it.
      expect(() => readTo(1)).toThrow(TypeError);
    });

    it('bounds the work for an assessment whose words expand under normalisation', () => {
      // 8000 UTF-16 units of text, which is everything the written rule allows,
      // spelling 144 000 code points because each character stands for four
      // Arabic words. It is the second rule that refuses it, and without that
      // rule the aligner would have marked this reading from its first tokens
      // and dropped every word after them.
      const words = Array.from({ length: 40 }, () => spoken(MANY_WORDS.repeat(200)));

      expect(40 * normalizeDictationText(MANY_WORDS.repeat(200)).length).toBeGreaterThan(
        DICTATION_MAX_TEXT_LENGTH,
      );
      expect(() => alignReadAloud(readAloudItem(), speechAssessment({ words }))).toThrow(TypeError);
    });
  });

  it('does not validate the item, which is what its doc comment now says', () => {
    // Only the assessment is checked. An item that is not one answers rather
    // than refusing, because there is no reference word to pair anything with,
    // and a text past the cap is cut by the tokeniser with no signal. A caller
    // validates the item first; `gradeReadAloud` is safe without that because
    // it runs the schema itself.
    const assessment = speechAssessment();

    for (const notAnItem of [{}, 7, { referenceText: 42 }]) {
      const entries = alignReadAloud(
        notAnItem as unknown as Pick<ReadAloudData, 'referenceText'>,
        assessment,
      );

      expect(entries.every((entry) => entry.state === 'inserted')).toBe(true);
      expect(entries).toHaveLength(assessment.words.length);
    }

    // Past `READ_ALOUD_MAX_REFERENCE_LENGTH` the words simply stop being
    // marked: 700 written, and the tokeniser reads as far as the cap.
    const overlong = Array.from({ length: 700 }, (_, index) => `w${index}`).join(' ');
    const marked = alignReadAloud({ referenceText: overlong }, assessment).filter(
      (entry) => entry.itemId !== undefined,
    );

    expect(marked.length).toBeGreaterThan(0);
    expect(marked.length).toBeLessThan(700);
  });

  it('refuses anything that is not a well-formed assessment', () => {
    expect(() => alignReadAloud(readAloudItem(), null as unknown as SpeechAssessment)).toThrow(
      TypeError,
    );
    expect(() =>
      alignReadAloud(readAloudItem(), speechAssessment({ scale: 50 as unknown as 100 })),
    ).toThrow(/scale/);
    // The root refusal names the value rather than a path it has no field for.
    expect(() => alignReadAloud(readAloudItem(), 7 as unknown as SpeechAssessment)).toThrow(
      /not a speech assessment/,
    );
  });

  it('is deterministic: the same inputs give the same marks', () => {
    const assessment = speechAssessment();

    expect(alignReadAloud(readAloudItem(), assessment)).toEqual(
      alignReadAloud(readAloudItem(), assessment),
    );
  });
});
