import { describe, expect, it } from 'vitest';
import type { ActivitySchemaError } from '../../errors.js';
import { assertRedacted, redact } from '../../redact.js';
import { dictationType } from '../../registry/index.js';
import {
  dictationJsonSchema,
  jsonSchemaFor,
  RedactedDictationDataSchema,
  validateActivity,
} from '../../schemas/index.js';
import type { DictationData, DictationLearnerResponse } from '../../types/activity.js';
import {
  alignDictation,
  DICTATION_MAX_TEXT_LENGTH,
  dictationReferenceWords,
  diffDictationChars,
  evaluate,
  score,
} from '../index.js';

const activity: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc1',
  title: 'Listen and type the sentence',
  transcript: 'The cat sat on the mat.',
  media: { type: 'audio', url: 'https://cdn.example/cat.mp3', alt: 'Recording' },
};

const typed = (text: string, hintsRevealed?: number): DictationLearnerResponse => ({
  type: 'dictation',
  text,
  ...(hintsRevealed !== undefined ? { hintsRevealed } : {}),
});

/** `[itemId, outcome, learnerResponse, score]` per detail: the audit record of a mark. */
const marks = (result: {
  details: { itemId: string; outcome?: string; learnerResponse: unknown; score?: number }[];
}) =>
  result.details.map((detail) => [
    detail.itemId,
    detail.outcome,
    detail.learnerResponse,
    detail.score === undefined ? undefined : Number(detail.score.toFixed(4)),
  ]);

const COMPOSED_E = String.fromCodePoint(0xe9);
const DECOMPOSED_E = `e${String.fromCodePoint(0x301)}`;
const CURLY_APOSTROPHE = String.fromCodePoint(0x2019);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const NBSP = String.fromCodePoint(0xa0);

describe('dictation — score', () => {
  it('gives full credit for the transcript, however it is cased and punctuated', () => {
    for (const text of [
      'The cat sat on the mat.',
      'the cat sat on the mat',
      'THE CAT SAT ON THE MAT!!',
    ]) {
      const result = score('dictation', activity, typed(text));
      expect(result.score).toBe(1);
      expect(result.passed).toBe(true);
      expect(result.details).toHaveLength(6);
      expect(
        result.details.every((detail) => detail.outcome === 'correct' && detail.score === 1),
      ).toBe(true);
    }
  });

  it('is the character similarity of the whole sentence, one division, in [0, 1]', () => {
    // 22 code points once normalised; one substitution.
    const result = score('dictation', activity, typed('The cat sat on the met.'));
    expect(result.score).toBe((22 - 1) / 22);
    expect(result.maxScore).toBe(1);
    expect(marks(result)).toEqual([
      ['w1', 'correct', 'the', 1],
      ['w2', 'correct', 'cat', 1],
      ['w3', 'correct', 'sat', 1],
      ['w4', 'correct', 'on', 1],
      ['w5', 'correct', 'the', 1],
      ['w6', 'incorrect', 'met', 0.6667],
    ]);
    // Not the mean of its details: the sentence is graded as one string.
    expect(result.score).not.toBe((5 + 2 / 3) / 6);
  });

  it('reports a missing transcript word as an omission, and an extra typed word in the alignment only', () => {
    const missing = score('dictation', activity, typed('The cat sat on mat.'));
    expect(missing.score).toBe(18 / 22);
    expect(marks(missing)).toEqual([
      ['w1', 'correct', 'the', 1],
      ['w2', 'correct', 'cat', 1],
      ['w3', 'correct', 'sat', 1],
      ['w4', 'correct', 'on', 1],
      ['w5', 'incorrect-omission', '', 0],
      ['w6', 'correct', 'mat', 1],
    ]);
    expect(missing.details.map((detail) => detail.correctResponse)).toEqual([
      'the',
      'cat',
      'sat',
      'on',
      'the',
      'mat',
    ]);

    const extra = score('dictation', activity, typed('The big cat sat on the mat.'));
    expect(extra.score).toBe(22 / 26);
    // Six details for six transcript words; "big" is nobody's answer.
    expect(extra.details).toHaveLength(6);
    expect(extra.details.every((detail) => detail.outcome === 'correct')).toBe(true);
    const alignment = alignDictation(activity, 'The big cat sat on the mat.');
    expect(alignment.words[1]).toEqual({
      reference: '',
      attempt: 'big',
      similarity: 0,
      status: 'extra',
    });
    expect(alignment.words[1]).not.toHaveProperty('itemId');
  });

  it('scores nothing typed as 0, every word missing, and treats whitespace or punctuation alone the same', () => {
    for (const text of ['', '   ', '...', `${NBSP}\n\t`, '¿?']) {
      const result = score('dictation', activity, typed(text));
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
      expect(result.details.map((detail) => detail.outcome)).toEqual(
        Array.from({ length: 6 }, () => 'incorrect-omission'),
      );
      expect(result.details.map((detail) => detail.learnerResponse)).toEqual([
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    }
    expect(dictationType.isAnswered?.(typed('  ...  '))).toBe(false);
    expect(dictationType.isAnswered?.(typed('a'))).toBe(true);
    expect(dictationType.isAnswered?.(undefined)).toBe(false);
  });

  it('ignores case, sentence punctuation, spacing, format characters and typographic apostrophes', () => {
    const contraction: DictationData = { ...activity, transcript: "It isn't raining." };
    expect(
      score('dictation', contraction, typed(`it isn${CURLY_APOSTROPHE}t  raining`)).score,
    ).toBe(1);
    expect(
      score('dictation', contraction, typed(`It${ZERO_WIDTH_SPACE} isn't\nraining`)).score,
    ).toBe(1);
    // Inside a word, an apostrophe and a hyphen are spelling.
    expect(score('dictation', contraction, typed('It isnt raining.')).score).toBe(15 / 16);
    const hyphen: DictationData = { ...activity, transcript: 'a well-known author' };
    expect(score('dictation', hyphen, typed('a well known author')).score).toBe(18 / 19);
    expect(score('dictation', hyphen, typed('a wellknown author')).score).toBe(18 / 19);
  });

  it('compares composed and decomposed accents as the same letter, and counts code points, not UTF-16 units', () => {
    const accented: DictationData = { ...activity, transcript: `caf${COMPOSED_E}` };
    expect(score('dictation', accented, typed(`caf${DECOMPOSED_E}`)).score).toBe(1);
    expect(score('dictation', accented, typed('cafe')).score).toBe(3 / 4);
    const emoji: DictationData = { ...activity, transcript: 'I love it \u{1f600}' };
    // 11 code points; the emoji is one of them, not two.
    expect(score('dictation', emoji, typed('I love it')).score).toBe(9 / 11);
  });

  it('applies whole-word equivalences to both sides, in order, exactly once, and keeps `to` literal', () => {
    const rules: DictationData = {
      ...activity,
      transcript: "It isn't raining. Roche's office is closed.",
      tolerance: {
        equivalences: [
          { from: "isn't", to: 'is not' },
          { from: "he's", to: 'he is' },
        ],
      },
    };
    expect(
      score('dictation', rules, typed("It is not raining. Roche's office is closed.")).score,
    ).toBe(1);
    // "he's" inside "Roche's" is not a word, so it is not rewritten.
    expect(alignDictation(rules, '').reference).toBe("it is not raining roche's office is closed");
    const symbol: DictationData = {
      ...activity,
      transcript: 'rock and roll',
      tolerance: { equivalences: [{ from: '&', to: 'and' }] },
    };
    expect(score('dictation', symbol, typed('rock & roll')).score).toBe(1);
    const multiWord: DictationData = {
      ...activity,
      transcript: "It isn't raining",
      tolerance: { equivalences: [{ from: 'is not', to: "isn't" }] },
    };
    for (const text of ['It is not raining', 'It is  not raining', 'It is\nnot raining']) {
      expect(score('dictation', multiWord, typed(text)).score).toBe(1);
    }
    const literal: DictationData = {
      ...activity,
      transcript: 'the $$',
      tolerance: { equivalences: [{ from: 'price', to: '$$' }] },
    };
    expect(score('dictation', literal, typed('the price')).score).toBe(1);
    const ordered: DictationData = {
      ...activity,
      transcript: 'c',
      tolerance: {
        equivalences: [
          { from: 'b', to: 'c' },
          { from: 'a', to: 'b' },
        ],
      },
    };
    // `a` becomes `b` once; the rule before it never sees the result.
    expect(alignDictation(ordered, 'a').attempt).toBe('b');
    expect(score('dictation', ordered, typed('a')).score).toBe(0);
  });

  it('scores against every accepted transcript and keeps the best, ties to the transcript', () => {
    const alternatives: DictationData = {
      ...activity,
      transcript: 'The colour of the sky.',
      acceptedTranscripts: ['The color of the sky.'],
    };
    expect(score('dictation', alternatives, typed('the color of the sky')).score).toBe(1);
    expect(alignDictation(alternatives, 'the color of the sky').candidateIndex).toBe(1);
    expect(alignDictation(alternatives, 'the colour of the sky').candidateIndex).toBe(0);
    // An exact tie — one edit from each, same length — goes to the transcript.
    const tie = alignDictation({ transcript: 'ab', acceptedTranscripts: ['ac'] }, 'ax');
    expect(tie.candidateIndex).toBe(0);
    expect(tie.similarity).toBe(0.5);
    expect(alignDictation(alternatives, '').candidateIndex).toBe(0);
    expect(dictationReferenceWords(alternatives)).toEqual([
      [
        { itemId: 'w1', word: 'the' },
        { itemId: 'w2', word: 'colour' },
        { itemId: 'w3', word: 'of' },
        { itemId: 'w4', word: 'the' },
        { itemId: 'w5', word: 'sky' },
      ],
      [
        { itemId: 'w1', word: 'the' },
        { itemId: 'w2', word: 'color' },
        { itemId: 'w3', word: 'of' },
        { itemId: 'w4', word: 'the' },
        { itemId: 'w5', word: 'sky' },
      ],
    ]);
  });

  it('never reads hintsRevealed', () => {
    expect(score('dictation', activity, typed('The cat sat on the mat.', 6))).toEqual(
      score('dictation', activity, typed('The cat sat on the mat.')),
    );
  });

  it('cuts the learner text at the cap, before and after normalisation, and says so', () => {
    const long = alignDictation(activity, 'a'.repeat(DICTATION_MAX_TEXT_LENGTH + 1));
    expect(long.truncated).toBe(true);
    expect(long.attempt).toHaveLength(DICTATION_MAX_TEXT_LENGTH);
    expect(alignDictation(activity, 'a'.repeat(DICTATION_MAX_TEXT_LENGTH)).truncated).toBe(false);
    // 7,999 code points that a rule expands past the cap.
    const expanding: DictationData = {
      ...activity,
      tolerance: { equivalences: [{ from: '&', to: 'x'.repeat(39) }] },
    };
    const grown = alignDictation(expanding, '& '.repeat(3999).concat('&'));
    expect(grown.truncated).toBe(true);
    expect(grown.attempt.length).toBeLessThanOrEqual(DICTATION_MAX_TEXT_LENGTH);
    expect(Number.isFinite(score('dictation', expanding, typed('& '.repeat(4000))).score)).toBe(
      true,
    );
  });

  it('reads stale or transcript-less data defensively and never throws', () => {
    expect(alignDictation({}, 'anything')).toEqual({
      candidateIndex: -1,
      reference: '',
      attempt: 'anything',
      truncated: false,
      similarity: 0,
      words: [],
    });
    const stale = alignDictation(
      { transcript: '...', acceptedTranscripts: ['the cat'] },
      'the cat',
    );
    expect(stale.candidateIndex).toBe(1);
    expect(stale.similarity).toBe(1);
    expect(
      dictationReferenceWords({ transcript: '...', acceptedTranscripts: ['the cat'] }),
    ).toEqual([
      [],
      [
        { itemId: 'w1', word: 'the' },
        { itemId: 'w2', word: 'cat' },
      ],
    ]);
    const broken = { ...activity, transcript: '...' } as DictationData;
    expect(score('dictation', broken, typed('anything'))).toMatchObject({ score: 0, details: [] });
    expect(
      alignDictation(
        { transcript: 42, acceptedTranscripts: 'nope', tolerance: { equivalences: 'x' } } as never,
        'x',
      ).candidateIndex,
    ).toBe(-1);
    expect(alignDictation(activity, undefined as never).attempt).toBe('');
    expect(score('dictation', activity, { type: 'dictation' } as never).score).toBe(0);
  });

  it('pins the pairing tie orders: a pairing over a gap, a missing word before an extra one', () => {
    const tail = alignDictation({ transcript: 'the cat sat' }, 'thecat sat');
    expect(tail.words.map((word) => `${word.reference}|${word.attempt}|${word.status}`)).toEqual([
      'the||missing',
      'cat|thecat|incorrect',
      'sat|sat|correct',
    ]);
    const swapped = alignDictation({ transcript: 'the cat the' }, 'cat the cat');
    expect(swapped.words.map((word) => `${word.reference}|${word.attempt}|${word.status}`)).toEqual(
      ['|cat|extra', 'the|the|correct', 'cat|cat|correct', 'the||missing'],
    );
  });
});

describe('dictation — the character diff', () => {
  it('lists one edit per code point and prefers a substitution to a gap pair', () => {
    expect(diffDictationChars('ab', 'ba')).toEqual([
      { op: 'substitute', reference: 'a', attempt: 'b' },
      { op: 'substitute', reference: 'b', attempt: 'a' },
    ]);
    expect(diffDictationChars('cat', 'cta').filter((op) => op.op !== 'equal')).toHaveLength(2);
    expect(diffDictationChars('the cat', 'the cat')).toHaveLength(7);
    expect(diffDictationChars('', 'ab').map((op) => op.op)).toEqual(['extra', 'extra']);
    expect(diffDictationChars('ab', '').map((op) => op.op)).toEqual(['missing', 'missing']);
    expect(diffDictationChars('\u{1f600}', '\u{1f603}')).toEqual([
      { op: 'substitute', reference: '\u{1f600}', attempt: '\u{1f603}' },
    ]);
  });
});

describe('dictation — the pass line', () => {
  const transcript = 'a'.repeat(2000);
  const nearMiss: DictationData = { ...activity, transcript };
  // 601 substitutions in 2003 characters: raw 0.69995…, "70%" once rounded.
  const tie = typed(`${'a'.repeat(1402)}${'b'.repeat(601)}`);

  it('compares the raw score by default, so a 69.995% is a fail, and the rounded score on request', () => {
    const raw = score('dictation', nearMiss, tie);
    expect(raw.score).toBe((2003 - 601) / 2003);
    expect(raw.passed).toBe(false);
    const rounded = score('dictation', nearMiss, tie, { rounding: { mode: 'half-up', dp: 2 } });
    expect(rounded.score).toBe(raw.score);
    expect(rounded.passed).toBe(true);
    expect(evaluate(nearMiss, tie)).toMatchObject({ status: 'scored', passed: false });
    expect(evaluate(nearMiss, tie, { rounding: { mode: 'half-up', dp: 2 } })).toMatchObject({
      status: 'scored',
      passed: true,
    });
  });

  it('selects the authored feedback by the same comparison the pass line uses', () => {
    const withFeedback: DictationData = {
      ...nearMiss,
      feedback: { correct: 'Well heard.', incorrect: 'Once more.' },
    };
    expect(score('dictation', withFeedback, tie).feedback).toBe('Once more.');
    expect(
      score('dictation', withFeedback, tie, { rounding: { mode: 'half-up', dp: 2 } }).feedback,
    ).toBe('Well heard.');
  });

  it('passes an exact rational tie at an authored threshold, as the other built-ins do', () => {
    const authored: DictationData = {
      ...activity,
      transcript: 'a'.repeat(100),
      passThreshold: 0.67,
    };
    const result = score('dictation', authored, typed(`${'a'.repeat(67)}${'b'.repeat(33)}`));
    expect(result.score).toBe(0.67);
    expect(result.passed).toBe(true);
  });
});

describe('dictation — evaluate, redaction and interop', () => {
  it('evaluates to a scored outcome, and to unscorable on a redacted projection', () => {
    expect(evaluate(activity, typed('The cat sat on the mat.'))).toMatchObject({
      status: 'scored',
      score: 1,
      passed: true,
    });
    const projection = redact(activity);
    expect(evaluate(projection as unknown as DictationData, typed('anything'))).toMatchObject({
      status: 'unscorable',
    });
    expect(() => score('dictation', projection as unknown as DictationData, typed('x'))).toThrow();
  });

  it('redacts the whole answer key and keeps what the learner needs to hear', () => {
    const full: DictationData = {
      ...activity,
      acceptedTranscripts: ['A cat sat on the mat.'],
      slowMedia: { type: 'audio', url: 'https://cdn.example/cat-slow.mp3', alt: 'Recording, slow' },
      hints: { mode: 'progressive-words' },
      tolerance: { equivalences: [{ from: '&', to: 'and' }] },
      feedback: { correct: 'Yes', incorrect: 'No' },
    };
    const projection = redact(full);
    expect(() => assertRedacted(projection)).not.toThrow();
    expect(projection).toEqual({
      redacted: true,
      schemaVersion: '1.0',
      type: 'dictation',
      id: 'dc1',
      title: 'Listen and type the sentence',
      media: { type: 'audio', url: 'https://cdn.example/cat.mp3', alt: 'Recording' },
      slowMedia: { type: 'audio', url: 'https://cdn.example/cat-slow.mp3', alt: 'Recording, slow' },
      hints: { mode: 'progressive-words' },
    });
  });

  it('refuses a hand-built projection whose captions give the answer or whose slow recording escapes the budget', () => {
    const base = redact(activity) as unknown as Record<string, unknown>;
    const recording = { type: 'audio', url: 'https://cdn.example/cat.mp3', alt: 'Recording' };
    const slowMedia = { type: 'audio', url: 'https://cdn.example/cat-slow.mp3' };
    const pathsOf = (payload: unknown): string[] => {
      const parsed = RedactedDictationDataSchema.safeParse(payload);
      return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
    };
    /** What `assertRedacted` reports: `[path, message]` per issue, or nothing when it passes. */
    const refusalOf = (payload: unknown): [string, string][] => {
      try {
        assertRedacted(payload);
        return [];
      } catch (error) {
        return (error as ActivitySchemaError).errors.map((found) => [
          found.path.join('.'),
          found.message,
        ]);
      }
    };

    const captioned = {
      ...base,
      media: { ...recording, captionsUrl: 'https://cdn.example/cat.vtt' },
    };
    expect(pathsOf(captioned)).toEqual(['media.captionsUrl']);
    expect(refusalOf(captioned)).toEqual([
      ['media.captionsUrl', expect.stringMatching(/captions are the answer/)],
    ]);

    // A track is refused the same way, whatever its kind: before 0.16 this
    // payload passed, so the words of the dictation reached an exam client.
    for (const kind of ['captions', 'subtitles'] as const) {
      const tracked = {
        ...base,
        media: {
          ...recording,
          tracks: [{ kind, src: 'https://cdn.example/cat.vtt', srclang: 'es', label: 'Español' }],
        },
      };
      expect(pathsOf(tracked)).toEqual(['media.tracks']);
      expect(refusalOf(tracked)).toEqual([
        ['media.tracks', expect.stringMatching(/captions are the answer/)],
      ]);
    }

    const bypass = { ...base, media: { ...recording, playback: { maxPlays: 2 } }, slowMedia };
    expect(pathsOf(bypass)).toEqual(['slowMedia']);
    expect(refusalOf(bypass)).toEqual([['slowMedia', expect.stringMatching(/play budget/)]]);

    const orphan = { ...base, media: undefined, slowMedia };
    expect(pathsOf(orphan)).toEqual(['media']);

    // Near misses stay learner-safe: a budget with no slow copy, and a slow
    // recording beside a policy that spends no budget.
    expect(pathsOf({ ...base, media: { ...recording, playback: { maxPlays: 2 } } })).toEqual([]);
    expect(
      pathsOf({ ...base, media: { ...recording, playback: { seek: 'none' } }, slowMedia }),
    ).toEqual([]);
  });

  it('describes itself to xAPI as a fill-in with every accepted transcript as a pattern', () => {
    expect(dictationType.interop?.xapiInteractionType).toBe('fill-in');
    expect(
      dictationType.interop?.correctResponsesPattern?.({
        ...activity,
        acceptedTranscripts: ['A cat sat on the mat.'],
      }),
    ).toEqual(['The cat sat on the mat.', 'A cat sat on the mat.']);
    expect(dictationType.interactions).toEqual(['text-changed', 'hint-requested', 'submitted']);
  });

  it('exports a JSON Schema whose only closed objects are the playback policy and a caption track', () => {
    expect(jsonSchemaFor('dictation')).toEqual(dictationJsonSchema);
    const closed: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        for (const [index, child] of node.entries()) {
          walk(child, `${path}[${index}]`);
        }
      } else if (typeof node === 'object' && node !== null) {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'additionalProperties' && value === false) {
            closed.push(path);
          } else {
            walk(value, `${path}.${key}`);
          }
        }
      }
    };
    walk(dictationJsonSchema, '$');
    expect(closed).toHaveLength(2);
    expect(closed.some((path) => path.includes('playback'))).toBe(true);
    expect(closed.some((path) => path.includes('tracks'))).toBe(true);
    // The raw length caps JSON Schema can state, in code points as zod counts them.
    interface Node {
      maxLength?: number;
      maxItems?: number;
      items?: Node;
      properties?: Record<string, Node>;
    }
    const at = (node: Node | undefined, ...keys: string[]): Node | undefined =>
      keys.reduce<Node | undefined>((current, key) => current?.properties?.[key], node);
    const root = dictationJsonSchema as Node;
    expect(at(root, 'transcript')?.maxLength).toBe(2000);
    expect(at(root, 'acceptedTranscripts')?.items?.maxLength).toBe(2000);
    expect(at(root, 'acceptedTranscripts')?.maxItems).toBe(10);
    const rules = at(root, 'tolerance', 'equivalences');
    expect(rules?.maxItems).toBe(100);
    expect([at(rules?.items, 'from')?.maxLength, at(rules?.items, 'to')?.maxLength]).toEqual([
      200, 200,
    ]);
  });
});

describe('dictation — schema guards', () => {
  const full: DictationData = {
    ...activity,
    acceptedTranscripts: ['A cat sat on the mat.'],
    slowMedia: { type: 'audio', url: 'https://cdn.example/cat-slow.mp3', alt: 'Recording, slow' },
    tolerance: { equivalences: [{ from: "isn't", to: 'is not' }] },
  };

  it('accepts a well-formed activity, sidecars included', () => {
    const result = validateActivity('dictation', { ...full, 'x-editor-note': 'kept' });
    expect(result.success).toBe(true);
    expect(result.success ? result.data : undefined).toMatchObject({ 'x-editor-note': 'kept' });
  });

  it.each<[string, Partial<Record<keyof DictationData, unknown>>, string]>([
    ['a video recording', { media: { type: 'video', url: '/a.mp4' } }, 'media.type'],
    [
      'a playback policy on the slow recording',
      { slowMedia: { ...full.slowMedia, playback: { rate: 'fixed' } } },
      'slowMedia.playback',
    ],
    [
      'a slow recording beside a play budget',
      { media: { ...activity.media, playback: { maxPlays: 2 } } },
      'slowMedia',
    ],
    [
      'a slow recording on the same file',
      { slowMedia: { type: 'audio', url: activity.media?.url } },
      'slowMedia.url',
    ],
    ['a slow recording without a recording', { media: undefined }, 'media'],
    ['a transcript that normalises to nothing', { transcript: '... ¿?' }, 'transcript'],
    ['a transcript over the cap', { transcript: 'a'.repeat(2001) }, 'transcript'],
    [
      'a transcript a rule expands past the cap',
      { transcript: '& '.repeat(1000), tolerance: { equivalences: [{ from: '&', to: 'and' }] } },
      'transcript',
    ],
    [
      'eleven accepted transcripts',
      { acceptedTranscripts: Array.from({ length: 11 }, (_, i) => `Sentence ${i}`) },
      'acceptedTranscripts',
    ],
    [
      'an accepted transcript that repeats the transcript',
      { acceptedTranscripts: ['the cat sat on the mat'] },
      'acceptedTranscripts',
    ],
    [
      'an accepted transcript of only punctuation',
      { acceptedTranscripts: ['...'] },
      'acceptedTranscripts',
    ],
    [
      'a rule with a blank from',
      { tolerance: { equivalences: [{ from: '', to: 'x' }] } },
      'tolerance.equivalences.0.from',
    ],
    [
      'a rule whose from is only whitespace',
      { tolerance: { equivalences: [{ from: '   ', to: 'x' }] } },
      'tolerance.equivalences',
    ],
    [
      'a rule with an empty to',
      { tolerance: { equivalences: [{ from: 'x', to: '' }] } },
      'tolerance.equivalences.0.to',
    ],
    [
      'a rule whose to is only punctuation',
      { tolerance: { equivalences: [{ from: 'x', to: '...' }] } },
      'tolerance.equivalences',
    ],
    [
      'a rule whose to is over the cap',
      { tolerance: { equivalences: [{ from: 'x', to: 'y'.repeat(201) }] } },
      'tolerance.equivalences.0.to',
    ],
    [
      'captions on the recording',
      { media: { ...activity.media, captionsUrl: '/cat.vtt' } },
      'media.captionsUrl',
    ],
    [
      'captions on the slow recording',
      { slowMedia: { ...full.slowMedia, captionsUrl: '/cat.vtt' } },
      'slowMedia.captionsUrl',
    ],
    // A track of any kind: a translation gives the words away as surely.
    [
      'a caption track on the recording',
      {
        media: {
          ...activity.media,
          tracks: [{ kind: 'captions', src: '/cat.vtt', srclang: 'en', label: 'English' }],
        },
      },
      'media.tracks',
    ],
    [
      'a subtitle track on the recording',
      {
        media: {
          ...activity.media,
          tracks: [{ kind: 'subtitles', src: '/gato.vtt', srclang: 'es', label: 'Español' }],
        },
      },
      'media.tracks',
    ],
    [
      'a track on the slow recording',
      {
        slowMedia: {
          ...full.slowMedia,
          tracks: [{ kind: 'subtitles', src: '/gato.vtt', srclang: 'es', label: 'Español' }],
        },
      },
      'slowMedia.tracks',
    ],
    ['a title that contains the transcript', { title: 'Type: the cat sat on the mat' }, 'title'],
    [
      'a recording description that contains an accepted transcript',
      { media: { ...activity.media, alt: 'A cat sat on the mat' } },
      'media.alt',
    ],
    [
      'a slow recording description that contains the transcript',
      { slowMedia: { ...full.slowMedia, alt: 'The cat sat on the mat, slowly' } },
      'slowMedia.alt',
    ],
  ])('refuses %s', (_label, patch, path) => {
    const result = validateActivity('dictation', { ...full, ...patch });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.errors.map((error) => error.path.join('.'))).toContain(
      path,
    );
  });

  it.each<[string, Partial<Record<keyof DictationData, unknown>>]>([
    ['a rule that names a symbol', { tolerance: { equivalences: [{ from: '&', to: 'and' }] } }],
    [
      'a rule that rewrites to a symbol',
      { tolerance: { equivalences: [{ from: 'dollars', to: '$$' }] } },
    ],
    ['a multi-word rule', { tolerance: { equivalences: [{ from: 'is not', to: "isn't" }] } }],
    // Punctuation is only stripped AFTER the rules run, so a rule may name it.
    [
      'a rule that names punctuation',
      { tolerance: { equivalences: [{ from: '...', to: 'and so on' }] } },
    ],
    [
      'a description that describes the recording',
      { slowMedia: { ...full.slowMedia, alt: 'Recording, slow' } },
    ],
    ['a title that shares a word with the transcript', { title: 'The sentence' }],
    ['no recording at all', { media: undefined, slowMedia: undefined }],
  ])('accepts %s', (_label, patch) => {
    expect(validateActivity('dictation', { ...full, ...patch }).success).toBe(true);
  });
});
