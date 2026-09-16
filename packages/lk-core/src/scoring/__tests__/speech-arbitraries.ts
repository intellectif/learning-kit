import fc from 'fast-check';
import type { SpeechAssessment, SpeechWord } from '../../types/speech.js';

/** A score on the 0..100 scale. */
const score = (): fc.Arbitrary<number> => fc.double({ min: 0, max: 100, noNaN: true });
/** A confidence in 0..1. */
const confidence = (): fc.Arbitrary<number> => fc.double({ min: 0, max: 1, noNaN: true });
/** A time, or a length of time, in milliseconds. */
const ms = (): fc.Arbitrary<number> => fc.double({ min: 0, max: 600_000, noNaN: true });
/** A non-empty label of at most `max` characters. */
const label = (max: number): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: Math.min(max, 20) });

const syllable = () =>
  fc.record(
    {
      text: label(64),
      grapheme: fc.string({ maxLength: 20 }),
      accuracy: score(),
      startMs: ms(),
      durationMs: ms(),
    },
    { requiredKeys: ['text'] },
  );

const phoneme = () =>
  fc.record(
    {
      symbol: label(16),
      accuracy: score(),
      startMs: ms(),
      durationMs: ms(),
      heardAs: fc.array(fc.record({ symbol: label(16), score: score() }), { maxLength: 3 }),
    },
    { requiredKeys: [] },
  );

const word = (): fc.Arbitrary<SpeechWord> =>
  fc.record(
    {
      text: label(200),
      accuracy: score(),
      error: fc.constantFrom('none', 'mispronunciation', 'omission', 'insertion'),
      vendorError: fc.string({ maxLength: 20 }),
      startMs: ms(),
      durationMs: ms(),
      syllables: fc.array(syllable(), { maxLength: 3 }),
      phonemes: fc.array(phoneme(), { maxLength: 3 }),
      breaks: fc.record({ unexpected: confidence(), missing: confidence() }, { requiredKeys: [] }),
    },
    { requiredKeys: ['text', 'error'] },
  ) as fc.Arbitrary<SpeechWord>;

/**
 * Without the phoneme symbols: an assessment may only carry one when it says
 * which alphabet the symbols are written in.
 */
function stripPhonemeSymbols(spoken: SpeechWord): SpeechWord {
  if (spoken.phonemes === undefined) {
    return spoken;
  }
  return {
    ...spoken,
    phonemes: spoken.phonemes.map(({ symbol: _symbol, heardAs: _heardAs, ...rest }) => rest),
  };
}

/**
 * A well-formed {@link SpeechAssessment}: every field inside its limits, and
 * both cross-field rules satisfied, so `validateSpeechAssessment` accepts it.
 */
export function arbitrarySpeechAssessment(): fc.Arbitrary<SpeechAssessment> {
  return fc
    .record(
      {
        status: fc.constantFrom('assessed', 'no_speech'),
        task: fc.constantFrom('scripted', 'unscripted'),
        locale: fc.constantFrom('en-US', 'en-GB', 'es-419', 'pt-BR', 'zh-Hant-TW', 'fil-PH'),
        referenceText: fc.string({ maxLength: 80 }),
        recordingKey: label(64),
        assessor: fc.record(
          {
            kind: fc.constantFrom('auto', 'ai', 'human'),
            id: label(32),
            model: label(32),
            promptHash: label(32),
          },
          { requiredKeys: ['kind'] },
        ),
        scores: fc.record(
          {
            accuracy: score(),
            fluency: score(),
            completeness: score(),
            prosody: score(),
            overall: score(),
          },
          { requiredKeys: [] },
        ),
        recognizedText: fc.string({ maxLength: 120 }),
        miscue: fc.constantFrom('assessor', 'none'),
        phonemeAlphabet: fc.constantFrom('ipa', 'sapi'),
        words: fc.array(word(), { maxLength: 6 }),
        prosody: fc.record({ monotoneConfidence: confidence() }, { requiredKeys: [] }),
        signal: fc.record(
          { snrDb: fc.double({ min: -100, max: 100, noNaN: true }) },
          {
            requiredKeys: [],
          },
        ),
      },
      {
        requiredKeys: [
          'status',
          'task',
          'locale',
          'referenceText',
          'recordingKey',
          'assessor',
          'scores',
          'miscue',
          'words',
        ],
      },
    )
    .map(
      (raw) =>
        ({
          assessmentVersion: '1.0',
          scale: 100,
          ...raw,
          words:
            raw.phonemeAlphabet === undefined
              ? (raw.words as SpeechWord[]).map(stripPhonemeSymbols)
              : raw.words,
        }) as SpeechAssessment,
    );
}
