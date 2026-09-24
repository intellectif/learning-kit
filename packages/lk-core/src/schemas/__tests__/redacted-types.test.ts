import { describe, expect, it } from 'vitest';
import { redact } from '../../redact.js';
import type {
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  MultipleChoiceData,
  ReadAloudData,
  WrittenResponseData,
} from '../../types/activity.js';
import type {
  RedactedActivity,
  RedactedDictationData,
  RedactedFillInTheBlanksData,
  RedactedGapSelectData,
  RedactedMultipleChoiceData,
  RedactedReadAloudData,
  RedactedWrittenResponseData,
} from '../index.js';
import {
  RedactedDictationDataSchema,
  RedactedFillInTheBlanksDataSchema,
  RedactedGapSelectDataSchema,
  RedactedMultipleChoiceDataSchema,
  RedactedReadAloudDataSchema,
  RedactedWrittenResponseDataSchema,
} from '../redacted.js';

const mc: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Capitals',
  question: 'Capital of France?',
  mode: 'single',
  scoringStrategy: 'partial',
  feedback: { correct: 'Yes', incorrect: 'No' },
  options: [
    { id: 'a', text: 'Paris', isCorrect: true, feedback: 'Right' },
    { id: 'b', text: 'Lyon', isCorrect: false },
  ],
};

const fib: FillInTheBlanksData = {
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'q2',
  title: 'Sky',
  passage: 'The sky is {{c}}.',
  blanks: [{ id: 'c', acceptedAnswers: ['blue'], hint: 'a colour' }],
  scoringStrategy: 'all-or-nothing',
};

const wr: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'q3',
  title: 'Essay',
  prompt: 'Describe your holiday.',
  minWords: 10,
  maxWords: 50,
  rubric: { criteria: [{ name: 'Task', weight: 1 }] },
};

const gs: GapSelectData = {
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'q4',
  title: 'Prepositions',
  passage: "Where are you {{a}}? I'm {{b}} Spain.",
  banks: [
    {
      id: 'prep',
      choices: [
        { id: 'of', text: 'of' },
        { id: 'from', text: 'from' },
        { id: 'to', text: 'to' },
        { id: 'on', text: 'on' },
      ],
    },
  ],
  gaps: [
    { id: 'a', bankId: 'prep', correctChoiceId: 'from', feedback: 'from + place of origin' },
    { id: 'b', bankId: 'prep', correctChoiceId: 'from' },
  ],
  scoringStrategy: 'partial',
};

// Carries a rule set on purpose: `tolerance` is classified as one scalar leaf,
// and this is the fixture that would break if it were ever made a nested policy.
const dc: DictationData = {
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'q5',
  title: 'Listen and type the sentence',
  transcript: "It isn't raining in Lisbon today.",
  acceptedTranscripts: ["It isn't raining in Lisboa today."],
  media: {
    type: 'audio',
    url: 'https://cdn.example/lisbon.mp3',
    alt: 'Recording, normal speed',
    playback: { seek: 'none', rate: 'fixed' },
  },
  slowMedia: { type: 'audio', url: 'https://cdn.example/lisbon-slow.mp3', alt: 'Recording, slow' },
  hints: { mode: 'progressive-words' },
  tolerance: {
    equivalences: [
      { from: "isn't", to: 'is not' },
      { from: "it's", to: 'it is' },
    ],
  },
  feedback: { correct: 'Well heard.', incorrect: 'Listen once more.' },
};

// The type with no answer key at all: everything here is learner-visible, and
// the authored feedback is the only field redaction has to remove.
const ra: ReadAloudData = {
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'q6',
  title: 'Read the weather report aloud',
  instructions: 'Read it at your natural pace.',
  referenceText: 'It is not raining in Lisbon today.',
  locale: 'en-US',
  media: {
    type: 'audio',
    url: 'https://cdn.example/lisbon-model.mp3',
    alt: 'Model recording, normal speed',
    playback: { seek: 'none', rate: 'fixed' },
  },
  slowMedia: {
    type: 'audio',
    url: 'https://cdn.example/lisbon-model-slow.mp3',
    alt: 'Model recording, slow',
  },
  recording: { maxSeconds: 45, minSeconds: 2, maxTakes: 2 },
  scoring: {
    dimensions: [
      { name: 'accuracy', weight: 2 },
      { name: 'fluency', weight: 1 },
    ],
  },
  feedback: { correct: 'Clearly read.', incorrect: 'Read it once more.' },
};

/**
 * The point of deriving these types with `z.infer` is that they cannot drift
 * from the validator. These tests pin the other half: that what `redact()`
 * actually PRODUCES satisfies the derived type. A type alone proves nothing at
 * runtime, and a hand-written interface beside a schema is exactly what went
 * stale in every consumer that wrote one.
 */
describe('derived redacted types match redact() output', () => {
  it('types a redacted multiple-choice item, with no answer key to read', () => {
    const parsed = RedactedMultipleChoiceDataSchema.parse(redact(mc));
    const typed: RedactedMultipleChoiceData = parsed;

    expect(typed.type).toBe('multiple-choice');
    expect(typed.question).toBe('Capital of France?');
    expect(typed.options.map((option) => option.text)).toEqual(['Paris', 'Lyon']);
    // The compiler has no `isCorrect` to offer here; assert it is gone at runtime too.
    expect(typed.options.every((option) => !('isCorrect' in option))).toBe(true);
    expect(typed).not.toHaveProperty('scoringStrategy');
    expect(typed).not.toHaveProperty('feedback');
  });

  it('types a redacted fill-in-the-blanks item, keeping only the hint', () => {
    const typed: RedactedFillInTheBlanksData = RedactedFillInTheBlanksDataSchema.parse(redact(fib));
    expect(typed.blanks).toEqual([{ id: 'c', hint: 'a colour' }]);
  });

  it('types a redacted written response, keeping the rubric', () => {
    const typed: RedactedWrittenResponseData = RedactedWrittenResponseDataSchema.parse(redact(wr));
    expect(typed.minWords).toBe(10);
    expect(typed.rubric?.criteria[0]?.name).toBe('Task');
  });

  it('types a redacted gap select, keeping every choice the learner picks from', () => {
    const typed: RedactedGapSelectData = RedactedGapSelectDataSchema.parse(redact(gs));
    // The inversion that makes this a separate type: the candidate answers
    // survive redaction here, where Fill-in-the-Blanks strips them.
    expect(typed.banks?.[0]?.choices.map((choice) => choice.text)).toEqual([
      'of',
      'from',
      'to',
      'on',
    ]);
    expect(typed.gaps.map((gap) => gap.id)).toEqual(['a', 'b']);
    // And the one field that must not: no gap carries a correctChoiceId.
    for (const gap of typed.gaps) {
      expect(gap).not.toHaveProperty('correctChoiceId');
      expect(gap).not.toHaveProperty('feedback');
    }
  });

  it('types a redacted dictation, keeping both recordings and the hint mode and nothing of the key', () => {
    // The fixture carries two equivalence rules: the case a nested policy over
    // `tolerance` projects to `[{}, {}]` on, which is not empty, survives
    // `reveal: 'none'`, and fails the strict schema — so every item carrying a
    // rule set would throw here.
    const projection = redact(dc);
    const typed: RedactedDictationData = RedactedDictationDataSchema.parse(projection);
    expect(typed.media?.url).toBe('https://cdn.example/lisbon.mp3');
    expect(typed.slowMedia).toEqual({
      type: 'audio',
      url: 'https://cdn.example/lisbon-slow.mp3',
      alt: 'Recording, slow',
    });
    expect(typed.hints).toEqual({ mode: 'progressive-words' });
    for (const key of ['transcript', 'acceptedTranscripts', 'tolerance', 'feedback']) {
      expect(projection).not.toHaveProperty(key);
    }
    // The answer key comes back, intact, once the attempt is over.
    const revealed = redact(dc, { reveal: 'after-submit' });
    expect(revealed.transcript).toBe(dc.transcript);
    expect(revealed.acceptedTranscripts).toEqual(dc.acceptedTranscripts);
    expect(revealed.tolerance).toEqual(dc.tolerance);
  });

  it('types a redacted read aloud, keeping the text to read and what the grade measures', () => {
    const projection = redact(ra);
    const typed: RedactedReadAloudData = RedactedReadAloudDataSchema.parse(projection);
    // The text IS the item: a learner who could not see it could not read it.
    expect(typed.referenceText).toBe(ra.referenceText);
    // And the locale survives, because it decides the grade: an assessment made
    // for another locale is unscorable.
    expect(typed.locale).toBe('en-US');
    expect(typed.recording).toEqual({ maxSeconds: 45, minSeconds: 2, maxTakes: 2 });
    expect(typed.scoring.dimensions).toEqual([
      { name: 'accuracy', weight: 2 },
      { name: 'fluency', weight: 1 },
    ]);
    expect(typed.slowMedia?.url).toBe('https://cdn.example/lisbon-model-slow.mp3');
    // The one thing removed: feedback written about a grade that does not exist yet.
    expect(projection).not.toHaveProperty('feedback');
    const revealed = redact(ra, { reveal: 'after-submit' });
    expect(revealed.feedback).toEqual(ra.feedback);
  });

  it('narrows the RedactedActivity union on `type`, like ActivityData does', () => {
    const items: RedactedActivity[] = [
      RedactedMultipleChoiceDataSchema.parse(redact(mc)),
      RedactedFillInTheBlanksDataSchema.parse(redact(fib)),
      RedactedWrittenResponseDataSchema.parse(redact(wr)),
      RedactedGapSelectDataSchema.parse(redact(gs)),
      RedactedDictationDataSchema.parse(redact(dc)),
      RedactedReadAloudDataSchema.parse(redact(ra)),
    ];

    const described = items.map((item) => {
      if (item.type === 'multiple-choice') {
        return `${item.options.length} options`;
      }
      if (item.type === 'fill-in-the-blanks') {
        return `${item.blanks.length} blanks`;
      }
      if (item.type === 'gap-select') {
        return `${item.gaps.length} gaps`;
      }
      if (item.type === 'dictation') {
        return `${item.slowMedia === undefined ? 1 : 2} recordings`;
      }
      if (item.type === 'read-aloud') {
        return `${item.scoring.dimensions.length} dimensions`;
      }
      // Narrowed to the written response by elimination — no cast needed.
      return `${item.minWords}-${item.maxWords} words`;
    });

    expect(described).toEqual([
      '2 options',
      '1 blanks',
      '10-50 words',
      '2 gaps',
      '2 recordings',
      '2 dimensions',
    ]);
  });
});
