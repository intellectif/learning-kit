import { describe, expect, it } from 'vitest';
import {
  AI_COACHING_MAX_TIP_LENGTH,
  AI_COACHING_MAX_WORDS,
  aiCoachingRequest,
  checkAiCoaching,
} from '../ai-coaching.js';
import {
  gradingOptions,
  readAloudItem,
  recordedResponse,
  speechAssessment,
  spoken,
} from '../scoring/__tests__/read-aloud-fixtures.js';
import { gradeReadAloud } from '../scoring/index.js';
import type { AiCoachingRequest } from '../types/ai.js';
import type { GradeRecord } from '../types/grading.js';
import type { SpeechAssessment } from '../types/speech.js';

/**
 * Coaching on a read-aloud: what a model is told about the engine's marks, and
 * what the SDK refuses to show. The check that matters is the one only this SDK
 * can run — a word the model coaches must be one the engine marked, and a sound
 * it names must be one the engine reported.
 */

/** "the cat sat on the mat", with "cat" mispronounced — its vowel heard as ɛ — and "on" left out. */
const marked = (over: Partial<SpeechAssessment> = {}): SpeechAssessment =>
  speechAssessment({
    phonemeAlphabet: 'ipa',
    scores: { accuracy: 72, fluency: 80, completeness: 83, overall: 75 },
    words: [
      spoken('the', { accuracy: 95 }),
      spoken('cat', {
        accuracy: 40,
        error: 'mispronunciation',
        phonemes: [
          { symbol: 'k', accuracy: 90 },
          {
            symbol: 'æ',
            accuracy: 20,
            heardAs: [
              { symbol: 'ɛ', score: 70 },
              { symbol: 'æ', score: 20 },
            ],
          },
          { symbol: 't', accuracy: 85 },
        ],
      }),
      spoken('sat', { accuracy: 92 }),
      spoken('on', { error: 'omission' }),
      spoken('the', { accuracy: 94 }),
      spoken('mat', { accuracy: 90 }),
    ],
    ...over,
  });

const graded = (assessment: SpeechAssessment): GradeRecord => {
  const result = gradeReadAloud(readAloudItem(), recordedResponse(), assessment, gradingOptions());
  if ('unscorable' in result) {
    throw new Error(result.reason);
  }
  return result;
};

const request = (over: Parameters<typeof aiCoachingRequest>[0] = { data: readAloudItem() }) => {
  const built = aiCoachingRequest(over);
  if (built === null) {
    throw new Error('no request');
  }
  return built;
};

const withMarks = (): AiCoachingRequest =>
  request({ data: readAloudItem(), assessment: marked(), grade: graded(marked()) });

describe('aiCoachingRequest', () => {
  it('tells a model the text, the engine’s marks word by word, its sounds, and its scores', () => {
    const grade = graded(marked());
    const built = aiCoachingRequest({
      data: readAloudItem({ instructions: 'Read it slowly.' }),
      assessment: marked(),
      grade,
      learnerLocale: 'es',
    });
    expect(built).toEqual({
      feature: 'pronunciation-coaching',
      facts: {
        activityType: 'read-aloud',
        activityId: 'ra-1',
        title: 'Read the sentence aloud',
        locale: 'en-US',
        referenceText: 'the cat sat on the mat',
        instructions: 'Read it slowly.',
        assessor: 'auto',
        phonemeAlphabet: 'ipa',
        // The overall score is the engine's summary, not a dimension the item weighs.
        scores: { accuracy: 72, fluency: 80, completeness: 83 },
        words: [
          { itemId: 'w1', word: 'the', heard: 'the', state: 'correct', accuracy: 95 },
          {
            itemId: 'w2',
            word: 'cat',
            heard: 'cat',
            state: 'mispronounced',
            accuracy: 40,
            sounds: [
              { symbol: 'k', accuracy: 90 },
              {
                symbol: 'æ',
                accuracy: 20,
                heardAs: [
                  { symbol: 'ɛ', score: 70 },
                  { symbol: 'æ', score: 20 },
                ],
              },
              { symbol: 't', accuracy: 85 },
            ],
          },
          { itemId: 'w3', word: 'sat', heard: 'sat', state: 'correct', accuracy: 92 },
          { itemId: 'w4', word: 'on', heard: '', state: 'omitted' },
          { itemId: 'w5', word: 'the', heard: 'the', state: 'correct', accuracy: 94 },
          { itemId: 'w6', word: 'mat', heard: 'mat', state: 'correct', accuracy: 90 },
        ],
      },
      grade: { score: grade.score, maxScore: grade.maxScore, passed: grade.passed },
      learnerLocale: 'es',
    });
  });

  it('reads the marks from a stored grade when the assessment was not kept: states and scores, no sounds', () => {
    const grade = graded(marked());
    const built = request({ data: readAloudItem(), grade });
    expect(built.facts).toMatchObject({
      assessor: 'auto',
      scores: { accuracy: 72, fluency: 80 },
      words: [
        { itemId: 'w1', word: 'the', state: 'correct', accuracy: 95 },
        { itemId: 'w2', word: 'cat', state: 'mispronounced', accuracy: 40 },
        { itemId: 'w3', state: 'correct' },
        { itemId: 'w4', word: 'on', state: 'omitted' },
        { itemId: 'w5', state: 'correct' },
        { itemId: 'w6', state: 'correct' },
      ],
    });
    expect(built.facts.words.some((word) => word.sounds !== undefined)).toBe(false);
    expect(built.facts).not.toHaveProperty('phonemeAlphabet');
    // An omitted word has no accuracy to report, whatever its stored score.
    expect(built.facts.words[3]).not.toHaveProperty('accuracy');
  });

  it('builds nothing for another type, an author who switched explanations off, or a reading with no marks', () => {
    const mc = { type: 'multiple-choice', id: 'mc', title: 'Q' };
    expect(aiCoachingRequest({ data: mc, assessment: marked() })).toBeNull();
    expect(
      aiCoachingRequest({
        data: readAloudItem({ ai: { explanations: false } }),
        assessment: marked(),
      }),
    ).toBeNull();
    // Hints off leaves coaching on: it reads explanations.
    expect(
      aiCoachingRequest({ data: readAloudItem({ ai: { hints: false } }), assessment: marked() }),
    ).not.toBeNull();
    expect(aiCoachingRequest({ data: readAloudItem() })).toBeNull();
    expect(
      aiCoachingRequest({ data: readAloudItem(), grade: { ...graded(marked()), details: [] } }),
    ).toBeNull();
    // An assessment the SDK refuses is no marks, whatever grade is beside it.
    const broken = { ...marked(), scale: 5 } as unknown as SpeechAssessment;
    expect(aiCoachingRequest({ data: readAloudItem(), assessment: broken })).toBeNull();
    expect(
      aiCoachingRequest({ data: readAloudItem(), assessment: broken, grade: graded(marked()) }),
    ).toBeNull();
  });

  it('tells a model only the sounds the engine named, what it said of them, and who assessed', () => {
    const built = request({
      data: readAloudItem(),
      assessment: marked({
        assessor: { kind: 'human', id: 'teacher-1' },
        scores: { accuracy: 72, prosody: 64, overall: 70 },
        words: [
          spoken('the', { accuracy: 95 }),
          spoken('cat', {
            accuracy: 40,
            error: 'mispronunciation',
            phonemes: [
              // A sound the engine placed but did not name: nothing to coach by name.
              { accuracy: 30 },
              // Heard as nothing in particular: no candidates to pass on.
              { symbol: 'æ', accuracy: 20, heardAs: [] },
              { symbol: 't', accuracy: 85 },
            ],
          }),
          spoken('sat', { accuracy: 92 }),
          spoken('on', { error: 'omission' }),
          spoken('the', { accuracy: 94 }),
          spoken('mat', { accuracy: 90 }),
          // Read, but not in the text: marked, and never coachable.
          spoken('now', {
            error: 'insertion',
            accuracy: 80,
            phonemes: [{ symbol: 'n', accuracy: 80 }],
          }),
        ],
      }),
    });
    expect(built.facts.assessor).toBe('human');
    expect(built.facts.scores).toEqual({ accuracy: 72, prosody: 64 });
    expect(built.facts.words[1]?.sounds).toEqual([
      { symbol: 'æ', accuracy: 20 },
      { symbol: 't', accuracy: 85 },
    ]);
    const inserted = built.facts.words.find((word) => word.state === 'inserted');
    expect(inserted).toEqual({ word: '', heard: 'now', state: 'inserted', accuracy: 80 });
    // The unnamed sound is not there to trip the check on the ones that are.
    expect(
      checkAiCoaching(
        {
          text: 'The vowel.',
          words: [{ itemId: 'w2', tip: 'Open it.', sound: { expected: 'æ' } }],
        },
        built,
      ),
    ).toMatchObject({ ok: true, coaching: { words: [{ sound: { expected: 'æ' } }] } });
  });

  it('reads a stored grade defensively: no details, a detail it cannot place, and scores to two places', () => {
    const grade = graded(marked());
    const { details: _details, ...withoutDetails } = grade;
    expect(
      aiCoachingRequest({ data: readAloudItem(), grade: withoutDetails as GradeRecord }),
    ).toBeNull();
    const built = request({
      data: readAloudItem(),
      grade: {
        ...grade,
        grader: { kind: 'ai', model: 'm-1' },
        criteria: [{ name: 'accuracy', score: 0.57, maxScore: 1, weight: 1 }],
        details: [
          {
            itemId: 'w2',
            outcome: 'incorrect',
            learnerResponse: ['kat'],
            correctResponse: ['cat'],
            weight: 1,
            score: 0.57,
          },
          // No word to name, and an outcome a reading does not have: neither is a mark.
          {
            outcome: 'incorrect',
            learnerResponse: 'x',
            correctResponse: 'y',
            weight: 1,
            score: 0,
          } as unknown as NonNullable<GradeRecord['details']>[number],
          {
            itemId: 'w3',
            outcome: 'partially-correct',
            learnerResponse: 'sat',
            correctResponse: 'sat',
            weight: 1,
            score: 0.5,
          } as unknown as NonNullable<GradeRecord['details']>[number],
          {
            itemId: 'w5',
            outcome: 'incorrect',
            learnerResponse: ['the', 'the'],
            correctResponse: ['the', 'mat'],
            weight: 1,
            score: 0.5,
          },
        ],
      },
    });
    expect(built.facts.assessor).toBe('ai');
    expect(built.facts.scores).toEqual({ accuracy: 57 });
    expect(built.facts.words).toEqual([
      { itemId: 'w2', word: 'cat', heard: 'kat', state: 'mispronounced', accuracy: 57 },
      { itemId: 'w5', word: 'the mat', heard: 'the the', state: 'mispronounced', accuracy: 50 },
    ]);
  });

  it('leaves out what a stored grade cannot say: a dimension without its scale, and details that are no marks', () => {
    const grade = graded(marked());
    const built = request({
      data: readAloudItem(),
      grade: {
        ...grade,
        criteria: [
          { name: 'accuracy', score: 72, maxScore: 100, weight: 1 },
          { name: 'fluency', score: 0.8, weight: 1 } as unknown as NonNullable<
            GradeRecord['criteria']
          >[number],
          { name: 'completeness', score: 5, maxScore: 0, weight: 1 },
        ],
      },
    });
    expect(built.facts.scores).toEqual({ accuracy: 72 });
    // Details, none of them a reading's mark: no marks at all.
    expect(
      aiCoachingRequest({
        data: readAloudItem(),
        grade: {
          ...grade,
          details: [
            {
              itemId: 'w1',
              outcome: 'partially-correct',
              learnerResponse: 'the',
              correctResponse: 'the',
              weight: 1,
              score: 0.5,
            } as unknown as NonNullable<GradeRecord['details']>[number],
          ],
        },
      }),
    ).toBeNull();
  });

  it('gives a model the grade only when it can be read', () => {
    const grade = graded(marked());
    for (const bad of [
      { score: Number.NaN },
      { maxScore: Number.POSITIVE_INFINITY },
      { passed: 'yes' },
    ]) {
      const built = request({
        data: readAloudItem(),
        assessment: marked(),
        grade: { ...grade, ...bad } as unknown as GradeRecord,
      });
      expect(built, JSON.stringify(bad)).not.toHaveProperty('grade');
    }
  });

  it('builds nothing for an item that is not a read-aloud, even one shaped like it, or a reading without its text', () => {
    const grade = graded(marked());
    const lookalike = { ...readAloudItem(), type: 'my-reading' };
    expect(aiCoachingRequest({ data: lookalike, assessment: marked(), grade })).toBeNull();
    const { referenceText: _text, ...untexted } = readAloudItem();
    expect(aiCoachingRequest({ data: untexted, grade })).toBeNull();
    const { locale: _locale, ...unlocalised } = readAloudItem();
    expect(aiCoachingRequest({ data: unlocalised, grade })).toBeNull();
  });

  it('reads no marks from an assessment the grader would not read: no speech, unscripted, another text or locale', () => {
    for (const over of [
      { status: 'no_speech', words: [] },
      { task: 'unscripted' },
      { referenceText: 'the cat sat on the hat' },
      { locale: 'en-GB' },
    ] as Partial<SpeechAssessment>[]) {
      expect(
        aiCoachingRequest({ data: readAloudItem(), assessment: marked(over) }),
        JSON.stringify(over),
      ).toBeNull();
      // Nor from a stored grade beside it: the learner is looking at the
      // assessment, and coaching on other marks would not be about it.
      expect(
        aiCoachingRequest({
          data: readAloudItem(),
          assessment: marked(over),
          grade: graded(marked()),
        }),
        JSON.stringify(over),
      ).toBeNull();
    }
  });
});

describe('checkAiCoaching: the words coached are the words the engine marked', () => {
  const coach = (words: unknown, into: AiCoachingRequest = withMarks()) =>
    checkAiCoaching({ text: 'Two things to work on.', words }, into);

  it('shows coaching on the marked words in reading order, each word and sound spelt as the engine spelt it', () => {
    const checked = coach([
      { itemId: 'w4', tip: 'Say every word, even the short ones.' },
      {
        itemId: 'w2',
        tip: 'Open your mouth wider for the vowel.',
        // A decomposed spelling of a symbol still names the same sound.
        sound: { expected: 'æ'.normalize('NFD'), heard: 'ɛ' },
      },
    ]);
    expect(checked).toEqual({
      ok: true,
      coaching: {
        text: 'Two things to work on.',
        words: [
          {
            itemId: 'w2',
            word: 'cat',
            tip: 'Open your mouth wider for the vowel.',
            sound: { expected: 'æ', heard: 'ɛ' },
          },
          { itemId: 'w4', word: 'on', tip: 'Say every word, even the short ones.' },
        ],
      },
    });
  });

  it('refuses the whole reply when it coaches a word read correctly, or one the text does not have', () => {
    for (const itemId of ['w1', 'w9', 'mat']) {
      expect(
        coach([
          { itemId: 'w2', tip: 'Open the vowel.' },
          { itemId, tip: 'Work on this one.' },
        ]),
        itemId,
      ).toEqual({ ok: false, refusal: 'contradicts-marks' });
    }
  });

  it('refuses a sound the engine did not report for the word, or did not hear it as', () => {
    for (const sound of [
      { expected: 'ʃ' },
      { expected: 'æ', heard: 'ʌ' },
      { expected: 'k', heard: 'g' },
    ]) {
      expect(coach([{ itemId: 'w2', tip: 'The vowel.', sound }]), JSON.stringify(sound)).toEqual({
        ok: false,
        refusal: 'contradicts-marks',
      });
    }
    // A sound on an omitted word the engine gave no sounds for: nothing stands behind it.
    expect(coach([{ itemId: 'w4', tip: 'Say it.', sound: { expected: 'ɒ' } }])).toEqual({
      ok: false,
      refusal: 'contradicts-marks',
    });
  });

  it('refuses any sound where the marks came without sounds', () => {
    const fromGrade = request({ data: readAloudItem(), grade: graded(marked()) });
    expect(coach([{ itemId: 'w2', tip: 'The vowel.' }], fromGrade).ok).toBe(true);
    expect(
      coach([{ itemId: 'w2', tip: 'The vowel.', sound: { expected: 'æ' } }], fromGrade),
    ).toEqual({
      ok: false,
      refusal: 'contradicts-marks',
    });
  });

  it('refuses words that are not coaching, and more than a learner can read', () => {
    for (const bad of [
      'w2: open the vowel',
      { itemId: 'w2', tip: 'Open the vowel.' },
      [null],
      [{ itemId: 'w2' }],
      [{ itemId: 2, tip: 'Open the vowel.' }],
      [{ itemId: 'w2', tip: '   ' }],
      [
        { itemId: 'w2', tip: 'Open the vowel.' },
        { itemId: 'w2', tip: 'And again.' },
      ],
      [{ itemId: 'w2', tip: 'The vowel.', sound: 'æ' }],
      [{ itemId: 'w2', tip: 'The vowel.', sound: { heard: 'ɛ' } }],
      [{ itemId: 'w2', tip: 'The vowel.', sound: { expected: 'æ', heard: 5 } }],
    ]) {
      expect(coach(bad), JSON.stringify(bad)).toEqual({ ok: false, refusal: 'malformed' });
    }
    expect(coach([{ itemId: 'w2', tip: 't'.repeat(AI_COACHING_MAX_TIP_LENGTH + 1) }])).toEqual({
      ok: false,
      refusal: 'too-long',
    });
    expect(
      coach(Array.from({ length: AI_COACHING_MAX_WORDS + 1 }, () => ({ itemId: 'w2', tip: 'x' }))),
    ).toEqual({ ok: false, refusal: 'too-long' });
    expect(
      coach([{ itemId: 'w2', tip: 'The vowel.', sound: { expected: 'æ'.repeat(17) } }]),
    ).toEqual({ ok: false, refusal: 'too-long' });
  });

  it('takes up to the limits and no further: 20 words, a tip of 500 code points, a sound of 16', () => {
    const words = Array.from({ length: 21 }, (_, index) => `w${index}`);
    const long = readAloudItem({ referenceText: words.join(' ') });
    const everyWordSlipped = speechAssessment({
      referenceText: long.referenceText,
      words: words.map((word) => spoken(word, { accuracy: 30, error: 'mispronunciation' })),
    });
    const into = request({ data: long, assessment: everyWordSlipped });
    const coachOn = (count: number) =>
      checkAiCoaching(
        {
          text: 'Slow down.',
          words: Array.from({ length: count }, (_, index) => ({
            itemId: `w${index + 1}`,
            tip: 'Again.',
          })),
        },
        into,
      );
    expect(coachOn(AI_COACHING_MAX_WORDS).ok).toBe(true);
    expect(coachOn(AI_COACHING_MAX_WORDS + 1)).toEqual({ ok: false, refusal: 'too-long' });

    // Code points, not UTF-16 units: 500 emoji are 1000 units, and fit.
    const tip = '🙂'.repeat(AI_COACHING_MAX_TIP_LENGTH);
    expect(coach([{ itemId: 'w2', tip }]).ok).toBe(true);

    const symbol = 'ʃ'.repeat(16);
    const withLongSymbol = request({
      data: readAloudItem(),
      assessment: marked({
        words: [
          spoken('the', { accuracy: 95 }),
          spoken('cat', {
            accuracy: 40,
            error: 'mispronunciation',
            phonemes: [{ symbol, accuracy: 20, heardAs: [{ symbol, score: 50 }] }],
          }),
          spoken('sat'),
          spoken('on'),
          spoken('the'),
          spoken('mat'),
        ],
      }),
    });
    expect(
      coach([{ itemId: 'w2', tip: 'x', sound: { expected: symbol } }], withLongSymbol).ok,
    ).toBe(true);
    expect(
      coach(
        [{ itemId: 'w2', tip: 'x', sound: { expected: symbol, heard: `${symbol}ʃ` } }],
        withLongSymbol,
      ),
    ).toEqual({ ok: false, refusal: 'too-long' });
  });

  it('reads a sound however it is composed or padded, and shows it as the engine spelt it', () => {
    // "õ" precomposed from the engine; the model decomposes it, and pads the other.
    const nasal = request({
      data: readAloudItem(),
      assessment: marked({
        words: [
          spoken('the', { accuracy: 95 }),
          spoken('cat', {
            accuracy: 40,
            error: 'mispronunciation',
            phonemes: [{ symbol: '\u00f5', accuracy: 20, heardAs: [{ symbol: 'o', score: 60 }] }],
          }),
          spoken('sat'),
          spoken('on'),
          spoken('the'),
          spoken('mat'),
        ],
      }),
    });
    expect(
      coach(
        [{ itemId: 'w2', tip: 'Through the nose.', sound: { expected: 'o\u0303', heard: ' o ' } }],
        nasal,
      ),
    ).toMatchObject({
      ok: true,
      coaching: { words: [{ sound: { expected: '\u00f5', heard: 'o' } }] },
    });
    expect(
      coach([{ itemId: 'w2', tip: 'Through the nose.', sound: { expected: ' \u00f5\n' } }], nasal),
    ).toMatchObject({ ok: true, coaching: { words: [{ sound: { expected: '\u00f5' } }] } });
  });

  it('reads the text as every AI text is read, carries provenance, and ignores any number', () => {
    expect(checkAiCoaching({ text: '   ' }, withMarks())).toEqual({ ok: false, refusal: 'empty' });
    expect(checkAiCoaching('Good.', withMarks())).toEqual({ ok: false, refusal: 'malformed' });
    const checked = checkAiCoaching(
      {
        text: 'Clear reading.',
        score: 100,
        provenance: { model: 'm-1' },
        usage: { promptTokens: 120, completionTokens: 40 },
      },
      withMarks(),
    );
    expect(checked).toEqual({
      ok: true,
      coaching: {
        text: 'Clear reading.',
        words: [],
        provenance: { model: 'm-1' },
        usage: { promptTokens: 120, completionTokens: 40 },
      },
    });
  });
});
