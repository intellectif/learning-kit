import { describe, expect, it } from 'vitest';
import type { ValidationError } from '../../types/activity.js';
import { validateSpeechAssessment } from '../index.js';

/** Characters are built from their numbers so this file stays ASCII. */
const cp = (...points: number[]): string => String.fromCodePoint(...points);
/** IPA symbols: eth, schwa and turned v. */
const ETH = cp(0x00f0);
const SCHWA = cp(0x0259);
const TURNED_V = cp(0x028c);
const GRINNING_FACE = cp(0x1f600);
/** One character NFKC expands into four Arabic words. */
const MANY_WORDS = cp(0xfdfa);

type Json = Record<string, unknown>;

const word = (over: Json = {}): Json => ({
  text: 'the',
  accuracy: 96,
  error: 'none',
  startMs: 120,
  durationMs: 180,
  ...over,
});

/** A complete, well-formed assessment: every optional field present. */
const assessment = (over: Json = {}): Json => ({
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-GB',
  referenceText: 'The quick brown fox.',
  recordingKey: 'takes/7f3a91',
  assessor: { kind: 'auto', id: 'engine-1', model: 'pronunciation-2' },
  scale: 100,
  scores: { accuracy: 92, fluency: 81, completeness: 100, prosody: 64, overall: 85 },
  recognizedText: 'the quick fox',
  miscue: 'assessor',
  phonemeAlphabet: 'ipa',
  words: [
    word({
      syllables: [{ text: 'the', grapheme: 'the', accuracy: 96, startMs: 120, durationMs: 180 }],
      phonemes: [
        { symbol: ETH, accuracy: 97, startMs: 120, durationMs: 90 },
        {
          symbol: SCHWA,
          accuracy: 88,
          startMs: 210,
          durationMs: 90,
          heardAs: [{ symbol: TURNED_V, score: 41 }],
        },
      ],
      breaks: { unexpected: 0.1, missing: 0.4 },
    }),
    word({
      text: 'quick',
      accuracy: 71,
      error: 'mispronunciation',
      vendorError: 'Mispronunciation',
      startMs: 300,
      durationMs: 220,
    }),
    word({ text: 'brown', error: 'omission', startMs: 520, durationMs: 0 }),
  ],
  prosody: { monotoneConfidence: 0.2 },
  signal: { snrDb: 31.5 },
  ...over,
});

/** Marks a field to remove rather than to set. */
const ABSENT = Symbol('absent');

/** The fixture with `path` set to `value`, or with that field removed for {@link ABSENT}. */
function withField(path: readonly (string | number)[], value: unknown): Json {
  const root = assessment();
  let target = root as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) {
    target = target[key] as Record<string | number, unknown>;
  }
  const last = path[path.length - 1] as string | number;
  if (value === ABSENT) {
    Reflect.deleteProperty(target, last);
  } else {
    target[last] = value;
  }
  return root;
}

/** The errors of a refused value. Fails when it was accepted. */
function errorsOf(value: unknown): ValidationError[] {
  const result = validateSpeechAssessment(value);
  if (result.success) {
    throw new Error('expected the assessment to be refused');
  }
  return result.errors;
}

/** The codes reported at exactly `path`. */
const codesAt = (errors: ValidationError[], path: readonly string[]): string[] =>
  errors.filter((error) => error.path.join('.') === path.join('.')).map((error) => error.code);

type FieldCase = [string, (string | number)[], unknown, string[], string];
type ShapeCase = [string, (string | number)[], unknown];
type MissingCase = [string, (string | number)[]];

// ==========================================================================
// Field rules
// ==========================================================================

const REFUSED: FieldCase[] = [
  [
    'an unknown assessment version',
    ['assessmentVersion'],
    '1.1',
    ['assessmentVersion'],
    'invalid_value',
  ],
  [
    'a numeric assessment version',
    ['assessmentVersion'],
    1,
    ['assessmentVersion'],
    'invalid_value',
  ],
  ['an unknown status', ['status'], 'silent', ['status'], 'invalid_value'],
  ['an unknown task', ['task'], 'free', ['task'], 'invalid_value'],
  ['an unknown miscue setting', ['miscue'], 'auto', ['miscue'], 'invalid_value'],
  ['a locale with no region', ['locale'], 'en', ['locale'], 'invalid_format'],
  ['a locale spelt with an underscore', ['locale'], 'en_US', ['locale'], 'invalid_format'],
  ['a lowercased region', ['locale'], 'en-us', ['locale'], 'invalid_format'],
  ['a locale that is not a string', ['locale'], 42, ['locale'], 'invalid_type'],
  [
    'a reference text past 8000 units',
    ['referenceText'],
    'a'.repeat(8001),
    ['referenceText'],
    'too_big',
  ],
  [
    'a reference text of 4001 astral characters',
    ['referenceText'],
    GRINNING_FACE.repeat(4001),
    ['referenceText'],
    'too_big',
  ],
  [
    'a reference text that is not a string',
    ['referenceText'],
    5,
    ['referenceText'],
    'invalid_type',
  ],
  ['an empty recording key', ['recordingKey'], '', ['recordingKey'], 'too_small'],
  ['a recording key past 1024', ['recordingKey'], 'k'.repeat(1025), ['recordingKey'], 'too_big'],
  [
    'an unknown assessor kind',
    ['assessor', 'kind'],
    'engine',
    ['assessor', 'kind'],
    'invalid_value',
  ],
  ['an assessor id past 256', ['assessor', 'id'], 'i'.repeat(257), ['assessor', 'id'], 'too_big'],
  [
    'an assessor model past 256',
    ['assessor', 'model'],
    'm'.repeat(257),
    ['assessor', 'model'],
    'too_big',
  ],
  [
    'an assessor prompt hash past 256',
    ['assessor', 'promptHash'],
    'p'.repeat(257),
    ['assessor', 'promptHash'],
    'too_big',
  ],
  [
    'an unknown key on the assessor',
    ['assessor', 'vendor'],
    'x',
    ['assessor'],
    'unrecognized_keys',
  ],
  ['an assessor that is not an object', ['assessor'], 'auto', ['assessor'], 'invalid_type'],
  ['a scale that is not 100', ['scale'], 1, ['scale'], 'invalid_value'],
  ['a scale given as text', ['scale'], '100', ['scale'], 'invalid_value'],
  ['an accuracy above 100', ['scores', 'accuracy'], 100.5, ['scores', 'accuracy'], 'too_big'],
  ['a negative fluency', ['scores', 'fluency'], -0.5, ['scores', 'fluency'], 'too_small'],
  ['a NaN prosody score', ['scores', 'prosody'], Number.NaN, ['scores', 'prosody'], 'invalid_type'],
  [
    'an infinite overall score',
    ['scores', 'overall'],
    Number.POSITIVE_INFINITY,
    ['scores', 'overall'],
    'invalid_type',
  ],
  ['an unknown score name', ['scores', 'pronunciation'], 90, ['scores'], 'unrecognized_keys'],
  [
    'a recognised text past 8000 units',
    ['recognizedText'],
    'a'.repeat(8001),
    ['recognizedText'],
    'too_big',
  ],
  [
    'an unknown phoneme alphabet',
    ['phonemeAlphabet'],
    'x-sampa',
    ['phonemeAlphabet'],
    'invalid_value',
  ],
  ['words that are not an array', ['words'], 'the quick brown fox', ['words'], 'invalid_type'],
  [
    'more words than the cap',
    ['words'],
    Array.from({ length: 1001 }, () => word()),
    ['words'],
    'too_big',
  ],
  ['an empty word', ['words', 0, 'text'], '', ['words', '0', 'text'], 'too_small'],
  [
    'a word past 200 characters',
    ['words', 0, 'text'],
    'w'.repeat(201),
    ['words', '0', 'text'],
    'too_big',
  ],
  [
    'a word accuracy above 100',
    ['words', 0, 'accuracy'],
    101,
    ['words', '0', 'accuracy'],
    'too_big',
  ],
  [
    'a negative word accuracy',
    ['words', 0, 'accuracy'],
    -1,
    ['words', '0', 'accuracy'],
    'too_small',
  ],
  [
    'an unknown word error',
    ['words', 0, 'error'],
    'substitution',
    ['words', '0', 'error'],
    'invalid_value',
  ],
  [
    'a vendor error past 64',
    ['words', 0, 'vendorError'],
    'v'.repeat(65),
    ['words', '0', 'vendorError'],
    'too_big',
  ],
  ['a negative start time', ['words', 0, 'startMs'], -1, ['words', '0', 'startMs'], 'too_small'],
  [
    'an infinite duration',
    ['words', 0, 'durationMs'],
    Number.POSITIVE_INFINITY,
    ['words', '0', 'durationMs'],
    'invalid_type',
  ],
  ['an unknown key on a word', ['words', 0, 'confidence'], 1, ['words', '0'], 'unrecognized_keys'],
  [
    'more syllables than the cap',
    ['words', 0, 'syllables'],
    Array.from({ length: 51 }, () => ({ text: 'syl' })),
    ['words', '0', 'syllables'],
    'too_big',
  ],
  [
    'an empty syllable',
    ['words', 0, 'syllables'],
    [{ text: '' }],
    ['words', '0', 'syllables', '0', 'text'],
    'too_small',
  ],
  [
    'a syllable grapheme past 64',
    ['words', 0, 'syllables'],
    [{ text: 'syl', grapheme: 'g'.repeat(65) }],
    ['words', '0', 'syllables', '0', 'grapheme'],
    'too_big',
  ],
  [
    'a syllable accuracy above 100',
    ['words', 0, 'syllables'],
    [{ text: 'syl', accuracy: 101 }],
    ['words', '0', 'syllables', '0', 'accuracy'],
    'too_big',
  ],
  [
    'a negative syllable start',
    ['words', 0, 'syllables'],
    [{ text: 'syl', startMs: -1 }],
    ['words', '0', 'syllables', '0', 'startMs'],
    'too_small',
  ],
  [
    'an unknown key on a syllable',
    ['words', 0, 'syllables'],
    [{ text: 'syl', stress: 1 }],
    ['words', '0', 'syllables', '0'],
    'unrecognized_keys',
  ],
  [
    'more phonemes than the cap',
    ['words', 0, 'phonemes'],
    Array.from({ length: 51 }, () => ({ symbol: ETH })),
    ['words', '0', 'phonemes'],
    'too_big',
  ],
  [
    'an empty phoneme symbol',
    ['words', 0, 'phonemes'],
    [{ symbol: '' }],
    ['words', '0', 'phonemes', '0', 'symbol'],
    'too_small',
  ],
  [
    'a phoneme symbol past 16',
    ['words', 0, 'phonemes'],
    [{ symbol: 's'.repeat(17) }],
    ['words', '0', 'phonemes', '0', 'symbol'],
    'too_big',
  ],
  [
    'a negative phoneme accuracy',
    ['words', 0, 'phonemes'],
    [{ symbol: ETH, accuracy: -1 }],
    ['words', '0', 'phonemes', '0', 'accuracy'],
    'too_small',
  ],
  [
    'a NaN phoneme duration',
    ['words', 0, 'phonemes'],
    [{ symbol: ETH, durationMs: Number.NaN }],
    ['words', '0', 'phonemes', '0', 'durationMs'],
    'invalid_type',
  ],
  [
    'more heard-as candidates than the cap',
    ['words', 0, 'phonemes'],
    [{ symbol: ETH, heardAs: Array.from({ length: 11 }, () => ({ symbol: SCHWA, score: 10 })) }],
    ['words', '0', 'phonemes', '0', 'heardAs'],
    'too_big',
  ],
  [
    'a heard-as score above 100',
    ['words', 0, 'phonemes'],
    [{ symbol: ETH, heardAs: [{ symbol: SCHWA, score: 101 }] }],
    ['words', '0', 'phonemes', '0', 'heardAs', '0', 'score'],
    'too_big',
  ],
  [
    'an unknown key on a heard-as candidate',
    ['words', 0, 'phonemes'],
    [{ symbol: ETH, heardAs: [{ symbol: SCHWA, score: 10, rank: 1 }] }],
    ['words', '0', 'phonemes', '0', 'heardAs', '0'],
    'unrecognized_keys',
  ],
  [
    'an unknown key on a phoneme',
    ['words', 0, 'phonemes'],
    [{ symbol: ETH, stress: 1 }],
    ['words', '0', 'phonemes', '0'],
    'unrecognized_keys',
  ],
  [
    'a break confidence above 1',
    ['words', 0, 'breaks', 'unexpected'],
    1.01,
    ['words', '0', 'breaks', 'unexpected'],
    'too_big',
  ],
  [
    'a negative break confidence',
    ['words', 0, 'breaks', 'missing'],
    -0.01,
    ['words', '0', 'breaks', 'missing'],
    'too_small',
  ],
  [
    'an unknown key on the breaks',
    ['words', 0, 'breaks', 'pause'],
    1,
    ['words', '0', 'breaks'],
    'unrecognized_keys',
  ],
  [
    'a monotone confidence above 1',
    ['prosody', 'monotoneConfidence'],
    1.5,
    ['prosody', 'monotoneConfidence'],
    'too_big',
  ],
  ['an unknown key on the prosody', ['prosody', 'pitch'], 1, ['prosody'], 'unrecognized_keys'],
  [
    'an infinite signal-to-noise ratio',
    ['signal', 'snrDb'],
    Number.POSITIVE_INFINITY,
    ['signal', 'snrDb'],
    'invalid_type',
  ],
  ['an unknown key on the signal', ['signal', 'clipping'], true, ['signal'], 'unrecognized_keys'],
  ['an unknown key on the assessment', ['engine'], 'v2', [], 'unrecognized_keys'],
];

const ACCEPTED: ShapeCase[] = [
  ['a reference text of exactly 8000 units', ['referenceText'], 'a'.repeat(8000)],
  ['a reference text of 4000 astral characters', ['referenceText'], GRINNING_FACE.repeat(4000)],
  ['an empty reference text', ['referenceText'], ''],
  ['a recording key of exactly 1024', ['recordingKey'], 'k'.repeat(1024)],
  ['a human assessor', ['assessor'], { kind: 'human', id: 'teacher-2' }],
  ['an ai assessor', ['assessor'], { kind: 'ai', model: 'speech-3', promptHash: 'sha256:ab' }],
  ['no scores at all', ['scores'], {}],
  ['scores at both ends of the scale', ['scores'], { accuracy: 0, fluency: 100 }],
  ['no words', ['words'], []],
  ['as many words as the cap', ['words'], Array.from({ length: 1000 }, () => word())],
  ['a word of exactly 200 characters', ['words', 0, 'text'], 'w'.repeat(200)],
  ['a vendor error of exactly 64', ['words', 0, 'vendorError'], 'v'.repeat(64)],
  ['a word with no accuracy, which is not a zero', ['words', 0, 'accuracy'], ABSENT],
  ['a time of zero', ['words', 0, 'startMs'], 0],
  [
    'as many syllables as the cap',
    ['words', 0, 'syllables'],
    Array.from({ length: 50 }, () => ({ text: 'syl' })),
  ],
  ['an empty grapheme', ['words', 0, 'syllables'], [{ text: 'syl', grapheme: '' }]],
  [
    'as many phonemes as the cap',
    ['words', 0, 'phonemes'],
    Array.from({ length: 50 }, () => ({ symbol: ETH })),
  ],
  ['a phoneme symbol of exactly 16 units', ['words', 0, 'phonemes'], [{ symbol: ETH.repeat(16) }]],
  [
    'as many heard-as candidates as the cap',
    ['words', 0, 'phonemes'],
    [{ symbol: ETH, heardAs: Array.from({ length: 10 }, () => ({ symbol: SCHWA, score: 10 })) }],
  ],
  ['breaks at both ends of the range', ['words', 0, 'breaks'], { unexpected: 0, missing: 1 }],
  ['no prosody', ['prosody'], ABSENT],
  ['an empty prosody object', ['prosody'], {}],
  ['a negative signal-to-noise ratio', ['signal', 'snrDb'], -12.5],
  ['no signal', ['signal'], ABSENT],
  ['no recognised text', ['recognizedText'], ABSENT],
  ['an explicit undefined on an optional field', ['recognizedText'], undefined],
  ['a no-speech status', ['status'], 'no_speech'],
  ['the sapi alphabet', ['phonemeAlphabet'], 'sapi'],
  ['a miscue setting of none', ['miscue'], 'none'],
];

const MISSING: MissingCase[] = [
  ['the assessment version', ['assessmentVersion']],
  ['the status', ['status']],
  ['the task', ['task']],
  ['the locale', ['locale']],
  ['the assessor', ['assessor']],
  ['the assessor kind', ['assessor', 'kind']],
  ['the scale', ['scale']],
  ['the scores', ['scores']],
  ['the miscue setting', ['miscue']],
  ['the words', ['words']],
  ['a word text', ['words', 0, 'text']],
  ['a word error', ['words', 0, 'error']],
  ['a syllable text', ['words', 0, 'syllables', 0, 'text']],
  ['a heard-as symbol', ['words', 0, 'phonemes', 1, 'heardAs', 0, 'symbol']],
];

describe('validateSpeechAssessment — field rules', () => {
  it.each(REFUSED)('refuses %s', (_label, path, value, expectedPath, code) => {
    expect(codesAt(errorsOf(withField(path, value)), expectedPath)).toContain(code);
  });

  it.each(ACCEPTED)('accepts %s', (_label, path, value) => {
    expect(validateSpeechAssessment(withField(path, value)).success).toBe(true);
  });

  it.each(MISSING)('refuses an assessment missing %s', (_label, path) => {
    const paths = errorsOf(withField(path, ABSENT)).map((error) => error.path.join('.'));

    expect(paths).toContain(path.join('.'));
  });

  it('gives every error a path, a message and a code', () => {
    for (const error of errorsOf(withField(['locale'], 'en'))) {
      expect(Array.isArray(error.path)).toBe(true);
      expect(error.message).not.toBe('');
      expect(error.code).not.toBe('');
    }
  });
});

// ==========================================================================
// A well-formed assessment
// ==========================================================================

describe('validateSpeechAssessment — a well-formed assessment', () => {
  it('accepts it and hands back its data', () => {
    const input = assessment();
    const result = validateSpeechAssessment(input);

    if (!result.success) {
      throw new Error(`refused a well-formed assessment: ${JSON.stringify(result.errors)}`);
    }
    expect(result.data).toEqual(input);
    // A checked copy, not the caller's object.
    expect(result.data).not.toBe(input);
  });

  it('accepts an unscripted assessment carrying neither binding', () => {
    const unscripted = withField(['task'], 'unscripted');
    Reflect.deleteProperty(unscripted, 'referenceText');
    Reflect.deleteProperty(unscripted, 'recordingKey');

    expect(validateSpeechAssessment(unscripted).success).toBe(true);
  });

  it('accepts an object with no prototype, which a JSON parser can produce', () => {
    const bare = Object.create(null) as Json;
    Object.assign(bare, assessment());

    expect(validateSpeechAssessment(bare).success).toBe(true);
  });
});

// ==========================================================================
// Cross-field rules
// ==========================================================================

describe('validateSpeechAssessment — scripted_binding_required', () => {
  it('requires the reference text of a scripted assessment', () => {
    expect(errorsOf(withField(['referenceText'], ABSENT))).toEqual([
      { path: ['referenceText'], message: expect.any(String), code: 'scripted_binding_required' },
    ]);
  });

  it('requires the recording key of a scripted assessment', () => {
    expect(errorsOf(withField(['recordingKey'], ABSENT))).toEqual([
      { path: ['recordingKey'], message: expect.any(String), code: 'scripted_binding_required' },
    ]);
  });

  it('reports both bindings, each at its own path', () => {
    const value = withField(['referenceText'], ABSENT);
    Reflect.deleteProperty(value, 'recordingKey');

    expect(errorsOf(value).map((error) => [error.path, error.code])).toEqual([
      [['referenceText'], 'scripted_binding_required'],
      [['recordingKey'], 'scripted_binding_required'],
    ]);
  });

  it('counts an explicit undefined as missing', () => {
    expect(codesAt(errorsOf(withField(['recordingKey'], undefined)), ['recordingKey'])).toEqual([
      'scripted_binding_required',
    ]);
  });

  it('leaves a binding of the wrong type to the field rule, rather than reporting it twice', () => {
    expect(codesAt(errorsOf(withField(['referenceText'], 5)), ['referenceText'])).toEqual([
      'invalid_type',
    ]);
  });

  it('asks for no binding when the task itself is not a task', () => {
    const value = withField(['task'], 'Scripted');
    Reflect.deleteProperty(value, 'referenceText');
    Reflect.deleteProperty(value, 'recordingKey');

    expect(errorsOf(value).map((error) => error.code)).toEqual(['invalid_value']);
  });

  it('reports beside the field errors, not only once they are fixed', () => {
    const value = withField(['locale'], 'en');
    Reflect.deleteProperty(value, 'recordingKey');
    const codes = errorsOf(value).map((error) => error.code);

    expect(codes).toContain('invalid_format');
    expect(codes).toContain('scripted_binding_required');
  });
});

describe('validateSpeechAssessment — phoneme_alphabet_required', () => {
  it('requires the alphabet when a phoneme names a symbol, and says so once', () => {
    // The fixture names a symbol on two phonemes of the same word.
    expect(errorsOf(withField(['phonemeAlphabet'], ABSENT))).toEqual([
      { path: ['phonemeAlphabet'], message: expect.any(String), code: 'phoneme_alphabet_required' },
    ]);
  });

  it('requires it when a phoneme only lists what was heard instead', () => {
    const value = withField(
      ['words'],
      [{ text: 'the', error: 'none', phonemes: [{ heardAs: [{ symbol: SCHWA, score: 10 }] }] }],
    );
    Reflect.deleteProperty(value, 'phonemeAlphabet');

    expect(codesAt(errorsOf(value), ['phonemeAlphabet'])).toEqual(['phoneme_alphabet_required']);
  });

  it('counts an empty heard-as list as naming what was heard', () => {
    const value = withField(
      ['words'],
      [{ text: 'the', error: 'none', phonemes: [{ heardAs: [] }] }],
    );
    Reflect.deleteProperty(value, 'phonemeAlphabet');

    expect(codesAt(errorsOf(value), ['phonemeAlphabet'])).toEqual(['phoneme_alphabet_required']);
  });

  it('asks for nothing when the phonemes carry only scores and times', () => {
    const value = withField(
      ['words'],
      [{ text: 'the', error: 'none', phonemes: [{ accuracy: 90, startMs: 0, durationMs: 10 }] }],
    );
    Reflect.deleteProperty(value, 'phonemeAlphabet');

    expect(validateSpeechAssessment(value).success).toBe(true);
  });

  it('leaves an unknown alphabet to the field rule', () => {
    expect(
      codesAt(errorsOf(withField(['phonemeAlphabet'], 'x-sampa')), ['phonemeAlphabet']),
    ).toEqual(['invalid_value']);
  });

  it.each<[string, unknown]>([
    ['words that are not an array', 'many'],
    ['a word that is not an object', ['the']],
    ['phonemes that are not an array', [{ text: 'the', error: 'none', phonemes: 'two' }]],
    ['a phoneme that is not an object', [{ text: 'the', error: 'none', phonemes: ['t'] }]],
  ])('reads %s defensively: the field rule reports, the cross rule does not', (_label, words) => {
    const value = withField(['words'], words);
    Reflect.deleteProperty(value, 'phonemeAlphabet');

    expect(codesAt(errorsOf(value), ['phonemeAlphabet'])).toEqual([]);
  });
});

describe('validateSpeechAssessment — the total text of the words', () => {
  /** `count` words of `length` characters each: `count * length` UTF-16 units. */
  const wordsOf = (count: number, length: number): Json[] =>
    Array.from({ length: count }, () => word({ text: 'w'.repeat(length) }));

  /**
   * Forty one-token words spelling exactly `spelled` code points between them:
   * the tokens themselves, and the thirty-nine spaces that join them, which is
   * what the aligner reads and so what the second rule measures.
   */
  const spelling = (spelled: number): Json[] => {
    const count = 40;
    const letters = spelled - (count - 1);
    const each = Math.floor(letters / count);
    return Array.from({ length: count }, (_, index) =>
      word({ text: 'w'.repeat(each + (index < letters - each * count ? 1 : 0)) }),
    );
  };

  it('accepts words that spell exactly the budget between them', () => {
    expect(validateSpeechAssessment(withField(['words'], spelling(8000))).success).toBe(true);
  });

  it('refuses one code point more, at words, as too big', () => {
    const errors = errorsOf(withField(['words'], spelling(8001)));

    expect(errors).toEqual([{ path: ['words'], message: expect.any(String), code: 'too_big' }]);
    // The budget and what was given, so an adapter knows how far over it is.
    expect(errors[0]?.message).toContain('8001');
    expect(errors[0]?.message).toContain('8000');
  });

  it('refuses one written character more, at words, as too big', () => {
    // 8001 units in words short enough that what they spell is well inside the
    // budget: the raw rule stands on its own.
    const errors = errorsOf(withField(['words'], [...wordsOf(100, 80), word({ text: 'w' })]));

    expect(errors).toEqual([{ path: ['words'], message: expect.any(String), code: 'too_big' }]);
    expect(errors[0]?.message).toContain('8001');
  });

  it('accepts a written total at the cap when what it spells is inside it', () => {
    // 8000 units written, 7999 spelled: a full stop is read and then folded
    // away. The two rules measure two different kinds of work.
    const punctuated = Array.from({ length: 40 }, () => word({ text: `${'w'.repeat(199)}.` }));

    expect(validateSpeechAssessment(withField(['words'], punctuated)).success).toBe(true);
  });

  it('refuses text that is inside the cap as written and past it once normalised', () => {
    // 8000 units written, and 144 039 spelled, because each character stands
    // for four Arabic words. Without this rule the aligner would take the
    // tokens its budget holds and drop every word after them in silence — so
    // the words the learner actually read would never be marked at all.
    const words = Array.from({ length: 40 }, () => word({ text: MANY_WORDS.repeat(200) }));
    const errors = errorsOf(withField(['words'], words));

    expect(errors).toEqual([{ path: ['words'], message: expect.any(String), code: 'too_big' }]);
    expect(errors[0]?.message).toContain('144039');
    expect(errors[0]?.message).toContain('normalised');
  });

  it('reports what the words are written with before what they spell', () => {
    // Past both rules. The cheap one answers, and nothing is normalised to
    // find that out.
    const errors = errorsOf(
      withField(
        ['words'],
        Array.from({ length: 41 }, () => word({ text: MANY_WORDS.repeat(200) })),
      ),
    );

    expect(errors[0]?.message).toContain('8200');
  });

  it('refuses the largest assessment the word cap alone allows', () => {
    // 1000 words of 200 characters is 200 000 units — two orders of magnitude
    // past what the aligner can pair against an item's text.
    expect(codesAt(errorsOf(withField(['words'], wordsOf(1000, 200))), ['words'])).toEqual([
      'too_big',
    ]);
  });

  it('stands aside once a field rule has refused a word, rather than reporting it twice', () => {
    const overlong = withField(['words'], [...wordsOf(40, 200), word({ text: 'w'.repeat(201) })]);

    expect(codesAt(errorsOf(overlong), ['words'])).toEqual([]);
    expect(codesAt(errorsOf(overlong), ['words', '40', 'text'])).toEqual(['too_big']);
  });

  it('totals the text zod read, not what a second read of the word says', () => {
    // A text that answers the field rule 200 characters and every read after
    // it one. The totals are computed from the value zod parsed, so the rule
    // sees the 200 the aligner would, and the assessment is refused.
    let reads = 0;
    const shifting = () => {
      const entry = word();
      Object.defineProperty(entry, 'text', {
        enumerable: true,
        get: () => (reads++ < 41 ? 'w'.repeat(200) : 'w'),
      });
      return entry;
    };

    expect(
      codesAt(errorsOf(withField(['words'], Array.from({ length: 41 }, shifting))), ['words']),
    ).toEqual(['too_big']);
  });

  it('never throws on a text that refuses to be read twice', () => {
    // Nothing reads a word's text after zod has, so a getter that throws on
    // every read past the first is never asked a second time and no Error
    // escapes a validator whose contract is that it returns one.
    let reads = 0;
    const hostile = word();
    Object.defineProperty(hostile, 'text', {
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads > 1) {
          throw new Error('read twice');
        }
        return 'w'.repeat(200);
      },
    });

    expect(validateSpeechAssessment(withField(['words'], [hostile])).success).toBe(true);
    expect(reads).toBe(1);
  });

  it('counts a word the assessor inserted, which spells text the aligner emits', () => {
    // 1000 insertions of eight expanding characters: 8000 units written, which
    // the raw rule allows, and 144 999 code points spelled — the 144 000 the
    // alignment's `heard` strings carry, plus the 999 spaces that join them.
    // An insertion is never paired, so it charges the matrix nothing — but
    // `alignReadAloud` normalises it and carries it into its answer, so it is
    // text the call holds, and a bound that skipped it would be a bound on the
    // wrong thing.
    const inserted = Array.from({ length: 1000 }, () =>
      word({ text: MANY_WORDS.repeat(8), error: 'insertion' }),
    );
    const errors = errorsOf(withField(['words'], inserted));

    expect(codesAt(errors, ['words'])).toEqual(['too_big']);
    expect(errors[0]?.message).toContain('144999');
  });

  it('counts UTF-16 units, so an astral character costs the two it is written with', () => {
    // 4100 code points, 8200 units: counted in code points this would be well
    // inside the budget. The written rule is a bound on the work of reading,
    // and the work is done on the string as it is stored.
    const astral = Array.from({ length: 41 }, () => word({ text: GRINNING_FACE.repeat(100) }));

    expect(codesAt(errorsOf(withField(['words'], astral)), ['words'])).toEqual(['too_big']);
  });

  it('says nothing about words that are not a list at all', () => {
    expect(codesAt(errorsOf(withField(['words'], 'the quick brown fox')), ['words'])).toEqual([
      'invalid_type',
    ]);
  });
});

// ==========================================================================
// The root
// ==========================================================================

describe('validateSpeechAssessment — the root', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'assessed'],
    ['a boolean', true],
    ['an array', []],
    ['a function', () => 0],
  ])('refuses %s at the root, with one error and no field errors', (_label, value) => {
    const errors = errorsOf(value);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toEqual([]);
    expect(errors[0]?.code).toBe('invalid_type');
  });

  it('refuses an object that is nothing like an assessment, naming every missing field', () => {
    const errors = errorsOf({ hello: 'world' });

    expect(errors.length).toBeGreaterThan(1);
    expect(errors.map((error) => error.path.join('.'))).toContain('words');
  });
});
