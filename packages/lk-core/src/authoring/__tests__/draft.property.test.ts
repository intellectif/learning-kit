import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_ACTIVITY_TYPES, type BuiltInActivityType } from '../../built-in-types.js';
import { validateActivity } from '../../schemas/index.js';
import { evaluate } from '../../scoring/index.js';
import type { ActivityData, ActivityType, LearnerResponse } from '../../types/activity.js';
import { validateDraft } from '../index.js';
import { DRAFT_ISSUE_SEVERITY } from '../issues.js';
import { validateItemGroupDraft } from '../item-group.js';

/**
 * The guarantees `validateDraft` makes, over drafts nobody wrote by hand.
 *
 * The one that needs generated input is the documented-code guarantee, and its
 * scope is what an editor hands over: every field absent, `null`, or a value of
 * its own JavaScript type — including the empty strings, whitespace, zeros,
 * negatives, fractions, non-finite numbers and whole numbers too large to hold
 * exactly that real forms produce, the empty string of a `<select>` nobody has
 * chosen from, `null` and `undefined` entries in lists, and a `schemaVersion` or
 * `type` that is missing or wrong. For all of that, every issue carries a
 * DOCUMENTED code. A schema failure the draft checks did not anticipate would
 * surface as the schema library's own code, at `invalid`, and make an unfinished
 * question read as a broken one — the drift a new schema rule without a matching
 * draft rule causes, and what this catches.
 *
 * Out of scope, deliberately, and documented as passed through: a value of the
 * wrong JavaScript type (a `title` of `42`, a `shuffle` of `"yes"`) and a value
 * outside an enumeration (a `mode` of `"bogus"`).
 */

const BUILT_IN = BUILT_IN_ACTIVITY_TYPES;

/** Many runs: each is two schema parses and a check, all pure and fast. */
const RUNS = { numRuns: 1000 };

const NBSP = String.fromCodePoint(0xa0);

/** Drops `undefined`, so an absent field is absent rather than present-and-undefined. */
const compact = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

/** Absent, `null`, or an arbitrary of the field's own type. */
const orUnset = (arbitrary: fc.Arbitrary<unknown>) =>
  fc.oneof(fc.constantFrom<unknown>(undefined, null), arbitrary);

/** Mostly `inner`, sometimes `null` or `undefined`: an entry in a list. */
const entry = (inner: fc.Arbitrary<unknown>) =>
  fc.oneof(
    { arbitrary: fc.constantFrom<unknown>(null, undefined), weight: 1 },
    { arbitrary: inner, weight: 9 },
  );

const text = fc.constantFrom<unknown>(undefined, null, '', '   ', NBSP, 'Tokyo', 'went');
const optionalText = fc.constantFrom<unknown>(undefined, null, '', 'Extra text');
const optionalBool = fc.constantFrom<unknown>(undefined, null, true, false);

/** Usually right, sometimes missing or wrong: a payload an editor built itself. */
const envelope = (type: ActivityType) => ({
  schemaVersion: fc.oneof(
    { arbitrary: fc.constant<unknown>('1.0'), weight: 6 },
    { arbitrary: fc.constantFrom<unknown>(undefined, null, '', '2.0'), weight: 1 },
  ),
  type: fc.oneof(
    { arbitrary: fc.constant<unknown>(type), weight: 6 },
    {
      arbitrary: fc.constantFrom<unknown>(undefined, null, '', ...BUILT_IN),
      weight: 1,
    },
  ),
  id: fc.constantFrom<unknown>(undefined, null, '', 'activity-1'),
  title: text,
});

const feedbackArb = fc
  .record({
    correct: fc.constantFrom<unknown>(undefined, null, '', '  ', 'Bien'),
    incorrect: fc.constantFrom<unknown>(undefined, null, '', 'Casi'),
  })
  .map(compact);

const mediaArb = fc
  .record({
    type: fc.constantFrom<unknown>(undefined, null, '', 'image', 'audio', 'video', 'embed'),
    url: fc.constantFrom<unknown>(
      undefined,
      null,
      '',
      '  ',
      '/a.mp3',
      'https://cdn.example/a.png',
      'https://www.youtube.com/embed/x',
      'javascript:alert(1)',
      'data:text/html,x',
      'a.mp3',
    ),
    alt: fc.constantFrom<unknown>(undefined, null, '', '  ', 'A description'),
    captionsUrl: fc.constantFrom<unknown>(undefined, null, '', '  ', '/c.vtt', 'c.vtt'),
    playback: fc.constantFrom<unknown>(
      undefined,
      null,
      { maxPlays: 2 },
      { maxPlays: 0 },
      { maxPlays: 1.5 },
      { maxPlays: 2 ** 53 },
      { maxPlays: null },
      { controls: 'native', maxPlays: 2 },
      { controls: 'minimal' },
      { controls: '' },
      { seek: 'allow', maxPlays: 2 },
      { seek: null, rate: 'fixed' },
      { nativeControlHints: ['hide-download'], rate: 'fixed' },
      { nativeControlHints: [null] },
      { nativeControlHints: [undefined] },
      { maxPlay: 2 },
    ),
  })
  .map(compact);

const sharedArbs = {
  passThreshold: fc.constantFrom<unknown>(undefined, null, 0, 0.7, 1, 1.5, -0.1, Number.NaN),
  difficultyLevel: fc.constantFrom<unknown>(undefined, null, 1, 5, 0, 6, 2.5),
  feedback: orUnset(feedbackArb),
  media: orUnset(mediaArb),
  locale: fc.constantFrom<unknown>(undefined, null, '', 'es', 'en-US', 'en_US'),
  learningObjectives: orUnset(
    fc.array(fc.constantFrom<unknown>('Past tense', '', null, undefined), { maxLength: 3 }),
  ),
  redacted: fc.oneof(
    { arbitrary: fc.constant<unknown>(undefined), weight: 8 },
    { arbitrary: fc.constantFrom<unknown>(true, false), weight: 1 },
  ),
};

const optionArb = entry(
  fc
    .record({
      id: fc.constantFrom<unknown>(undefined, null, '', 'a', 'b', 'c'),
      text,
      isCorrect: optionalBool,
      feedback: optionalText,
    })
    .map(compact),
);

const multipleChoiceDraft = fc
  .record({
    ...envelope('multiple-choice'),
    question: text,
    questionHtml: optionalText,
    mode: fc.constantFrom<unknown>(undefined, null, '', 'single', 'multi'),
    scoringStrategy: fc.constantFrom<unknown>(undefined, null, '', 'all-or-nothing', 'partial'),
    options: orUnset(fc.array(optionArb, { maxLength: 28 })),
    shuffle: optionalBool,
    ...sharedArbs,
  })
  .map(compact);

const passageArb = fc.oneof(
  fc.constantFrom<unknown>(undefined, null, '', '   '),
  fc
    .array(fc.constantFrom('I', 'went', '{{a}}', '{{b}}', '{{ c }}', '{{}}', ' '), {
      minLength: 1,
      maxLength: 6,
    })
    .map((parts) => parts.join(' ')),
);

const localeArb = fc.constantFrom<unknown>(
  undefined,
  null,
  '',
  'tr',
  'en-US',
  'en_US',
  'not a locale',
);

const matchArb = fc
  .record({
    levenshtein: fc.constantFrom<unknown>(
      undefined,
      null,
      0,
      1,
      2,
      -1,
      1.5,
      Number.NaN,
      2 ** 53,
      Number.MAX_VALUE,
    ),
    normalize: fc.constantFrom<unknown>(undefined, null, '', 'none', 'NFC', 'NFKC'),
    caseSensitive: optionalBool,
    trim: optionalBool,
    foldDiacritics: optionalBool,
    collapseInnerWhitespace: optionalBool,
    ignorePunctuation: optionalBool,
    locale: localeArb,
  })
  .map(compact);

const blankArb = entry(
  fc
    .record({
      id: fc.constantFrom<unknown>(undefined, null, '', 'a', 'b', 'c'),
      acceptedAnswers: orUnset(
        fc.array(fc.constantFrom<unknown>('', '  ', null, undefined, 'went', 'go'), {
          maxLength: 3,
        }),
      ),
      caseSensitive: optionalBool,
      trimWhitespace: optionalBool,
      match: orUnset(matchArb),
      hint: optionalText,
      feedback: optionalText,
    })
    .map(compact),
);

const fillInTheBlanksDraft = fc
  .record({
    ...envelope('fill-in-the-blanks'),
    passage: passageArb,
    passageHtml: optionalText,
    blanks: orUnset(fc.array(blankArb, { maxLength: 4 })),
    scoringStrategy: fc.constantFrom<unknown>(undefined, null, '', 'all-or-nothing', 'partial'),
    ...sharedArbs,
  })
  .map(compact);

const wordCountArb = fc.constantFrom<unknown>(
  undefined,
  null,
  0,
  -0,
  1,
  // 79/80/81 put a maximum exactly one below a minimum within reach.
  79,
  80,
  81,
  120,
  500,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  2 ** 53,
  1e21,
);

const criterionArb = entry(
  fc
    .record({
      name: text,
      description: optionalText,
      weight: fc.constantFrom<unknown>(
        undefined,
        null,
        0,
        0.3,
        1,
        2,
        -1,
        Number.NaN,
        Infinity,
        // Two of these overflow a rubric's total.
        Number.MAX_VALUE,
      ),
    })
    .map(compact),
);

const writtenResponseDraft = fc
  .record({
    ...envelope('written-response'),
    prompt: text,
    promptHtml: optionalText,
    minWords: wordCountArb,
    maxWords: wordCountArb,
    rubric: orUnset(
      fc
        .record({
          label: optionalText,
          criteria: orUnset(fc.array(criterionArb, { maxLength: 4 })),
        })
        .map(compact),
    ),
    languageTarget: optionalText,
    ...sharedArbs,
  })
  .map(compact);

/** A choice, with every field absent, null, blank or written. */
const choiceArb = entry(
  fc
    .record({
      id: fc.constantFrom<unknown>(undefined, null, '', 'of', 'from', 'to'),
      text: text,
    })
    .map(compact),
);

const choiceListArb = orUnset(fc.array(choiceArb, { maxLength: 4 }));

const gapArb = entry(
  fc
    .record({
      id: fc.constantFrom<unknown>(undefined, null, '', 'a', 'b'),
      // Both, neither, or one — so the one-choice-source rule is exercised in
      // every direction rather than only the happy one.
      choices: choiceListArb,
      bankId: fc.constantFrom<unknown>(undefined, null, '', 'prep', 'ghost'),
      correctChoiceId: fc.constantFrom<unknown>(undefined, null, '', 'from', 'nobody'),
      feedback: optionalText,
    })
    .map(compact),
);

const bankArb = entry(
  fc
    .record({
      id: fc.constantFrom<unknown>(undefined, null, '', 'prep'),
      choices: choiceListArb,
    })
    .map(compact),
);

/** Passages that pair with the gap ids above, and several that do not. */
const gapPassageArb = fc.constantFrom<unknown>(
  undefined,
  null,
  '',
  '   ',
  'Where are you {{a}}?',
  "Where are you {{a}}? I'm {{b}} Spain.",
  'Twice over {{a}} and {{a}}.',
  'A stranger {{ghost}} here.',
  'No placeholders at all.',
);

const gapSelectDraft = fc
  .record({
    ...envelope('gap-select'),
    passage: gapPassageArb,
    passageHtml: optionalText,
    gaps: orUnset(fc.array(gapArb, { maxLength: 3 })),
    banks: orUnset(fc.array(bankArb, { maxLength: 2 })),
    scoringStrategy: fc.constantFrom<unknown>(undefined, null, '', 'all-or-nothing', 'partial'),
    presentation: fc.constantFrom<unknown>(undefined, null, '', 'dropdown', 'drag'),
    shuffleChoices: optionalBool,
    ...sharedArbs,
  })
  .map(compact);

const LONG_TRANSCRIPT = 'a'.repeat(2001);
const LONG_REWRITE = 'b'.repeat(201);

/** A transcript, or what an editor holds instead of one. */
const transcriptArb = fc.constantFrom<unknown>(
  undefined,
  null,
  '',
  '   ',
  NBSP,
  '...',
  '& ',
  LONG_TRANSCRIPT,
  'Tokyo',
  'It is raining.',
  "It isn't raining in Lisbon today.",
);

/** A recording as a dictation may or may not have it: every kind, captions, a description that is the answer. */
const dictationMediaArb = fc
  .record({
    type: fc.constantFrom<unknown>(undefined, null, '', 'image', 'audio', 'video', 'embed'),
    url: fc.constantFrom<unknown>(
      undefined,
      null,
      '',
      '/a.mp3',
      'https://cdn.example/a.mp3',
      'a.mp3',
    ),
    alt: fc.constantFrom<unknown>(
      undefined,
      null,
      '',
      '  ',
      'Recording',
      'It is raining.',
      'Tokyo',
    ),
    captionsUrl: fc.constantFrom<unknown>(undefined, null, '', '/c.vtt'),
    playback: fc.constantFrom<unknown>(
      undefined,
      null,
      { maxPlays: 2 },
      { maxPlays: null },
      { seek: 'none', rate: 'fixed' },
      { controls: '' },
    ),
  })
  .map(compact);

const slowMediaArb = fc
  .record({
    type: fc.constantFrom<unknown>(undefined, null, '', 'audio', 'image'),
    url: fc.constantFrom<unknown>(undefined, null, '', '/a.mp3', '/slow.mp3', 'slow.mp3'),
    alt: fc.constantFrom<unknown>(undefined, null, '', 'Recording, slow', 'It is raining.'),
    captionsUrl: fc.constantFrom<unknown>(undefined, null, '/c.vtt'),
    playback: fc.constantFrom<unknown>(undefined, null, { rate: 'fixed' }),
  })
  .map(compact);

const equivalenceArb = entry(
  fc
    .record({
      from: fc.constantFrom<unknown>(undefined, null, '', '  ', '...', '&', 'is not', "isn't"),
      to: fc.constantFrom<unknown>(undefined, null, '', '...', 'is not', 'and', "$'", LONG_REWRITE),
    })
    .map(compact),
);

const dictationDraft = fc
  .record({
    ...envelope('dictation'),
    transcript: transcriptArb,
    acceptedTranscripts: orUnset(
      fc.oneof(
        fc.array(fc.constantFrom<unknown>('', '  ', null, undefined, 'It is raining.', 'Tokyo'), {
          maxLength: 3,
        }),
        fc.constant<unknown>(Array.from({ length: 11 }, (_, index) => `Sentence ${index}`)),
      ),
    ),
    slowMedia: orUnset(slowMediaArb),
    hints: fc.constantFrom<unknown>(
      undefined,
      null,
      {},
      { mode: 'progressive-words' },
      { mode: '' },
      { mode: null },
      { mode: 'all-at-once' },
    ),
    tolerance: fc
      .constantFrom<unknown>(undefined, null, {}, { equivalences: null })
      .chain((fixed) =>
        fixed === undefined
          ? fc.oneof(
              fc.constant<unknown>(undefined),
              fc.array(equivalenceArb, { maxLength: 3 }).map((equivalences) => ({ equivalences })),
            )
          : fc.constant(fixed),
      ),
    ...sharedArbs,
    media: orUnset(dictationMediaArb),
  })
  .map(compact);

const LONG_REFERENCE_TEXT = 'a'.repeat(2001);
/** A Han letter standing in Latin text: a script that puts no spaces between its words. */
const UNSPACED_REFERENCE_TEXT = `Read ${String.fromCodePoint(0x4e2d)} aloud`;
/** Written, within the cap, and nothing survives normalisation: no word to mark. */
const UNREADABLE_REFERENCE_TEXT = '...';

const referenceTextArb = fc.constantFrom<unknown>(
  undefined,
  null,
  '',
  '   ',
  NBSP,
  LONG_REFERENCE_TEXT,
  UNSPACED_REFERENCE_TEXT,
  UNREADABLE_REFERENCE_TEXT,
  'The quick brown fox jumps over the lazy dog.',
);

/** Every spelling of a language tag an editor's field can hold, canonical and not. */
const readAloudLocaleArb = fc.constantFrom<unknown>(
  undefined,
  null,
  '',
  '  ',
  'en',
  'en-US',
  'en_US',
  'EN-US',
  'es-419',
  'not a locale',
);

const recordingArb = fc
  .record({
    maxSeconds: fc.constantFrom<unknown>(undefined, null, 0, 0.5, 45, 300, 301, -1, Number.NaN),
    minSeconds: fc.constantFrom<unknown>(undefined, null, 0, 2, 45, 60, -1, Number.NaN),
    maxTakes: fc.constantFrom<unknown>(undefined, null, 1, 2, 20, 0, 21, 1.5, 2 ** 53),
  })
  .map(compact);

const dimensionArb = entry(
  fc
    .record({
      name: fc.constantFrom<unknown>(
        undefined,
        null,
        '',
        'accuracy',
        'fluency',
        'completeness',
        'prosody',
        'diction',
      ),
      weight: fc.constantFrom<unknown>(undefined, null, 0, 1, 0.5, 1000, 1001, -1, Number.NaN),
    })
    .map(compact),
);

const readAloudMediaArb = fc
  .record({
    type: fc.constantFrom<unknown>(undefined, null, '', 'audio', 'image', 'video', 'embed'),
    url: fc.constantFrom<unknown>(
      undefined,
      null,
      '',
      '/model.mp3',
      'https://cdn.example/model.mp3',
      'model.mp3',
    ),
    alt: fc.constantFrom<unknown>(undefined, null, '', '  ', 'Model recording'),
    captionsUrl: fc.constantFrom<unknown>(undefined, null, '', '/c.vtt'),
    playback: fc.constantFrom<unknown>(
      undefined,
      null,
      { maxPlays: 2 },
      { maxPlays: null },
      { seek: 'none', rate: 'fixed' },
      { controls: '' },
    ),
  })
  .map(compact);

/** The slow recording, including the two keys its strict schema refuses. */
const readAloudSlowMediaArb = fc
  .record({
    type: fc.constantFrom<unknown>(undefined, null, '', 'audio', 'image'),
    url: fc.constantFrom<unknown>(
      undefined,
      null,
      '',
      '/model.mp3',
      '/model-slow.mp3',
      'model-slow.mp3',
    ),
    alt: fc.constantFrom<unknown>(undefined, null, '', 'Model recording, slow'),
    captionsUrl: fc.constantFrom<unknown>(undefined, '/c.vtt'),
    playback: fc.constantFrom<unknown>(undefined, { rate: 'fixed' }),
  })
  .map(compact);

const readAloudDraft = fc
  .record({
    ...envelope('read-aloud'),
    instructions: optionalText,
    referenceText: referenceTextArb,
    recording: orUnset(recordingArb),
    // At most four dimensions: there are four names, so an editor that offers
    // them cannot produce a fifth row, and no draft rule names a longer list.
    scoring: orUnset(
      fc.record({ dimensions: orUnset(fc.array(dimensionArb, { maxLength: 4 })) }).map(compact),
    ),
    ...sharedArbs,
    // After the shared fields: read-aloud's locale decides the grade, so it has
    // a wider set of spellings than the presentation-only one.
    locale: readAloudLocaleArb,
    media: orUnset(readAloudMediaArb),
    slowMedia: orUnset(readAloudSlowMediaArb),
  })
  .map(compact);

/** An editor's draft of each type: a type without one does not compile. */
const EDITOR_DRAFTS = Object.entries({
  'multiple-choice': multipleChoiceDraft,
  'fill-in-the-blanks': fillInTheBlanksDraft,
  'written-response': writtenResponseDraft,
  'gap-select': gapSelectDraft,
  dictation: dictationDraft,
  'read-aloud': readAloudDraft,
} satisfies Record<BuiltInActivityType, fc.Arbitrary<Record<string, unknown>>>) as [
  BuiltInActivityType,
  fc.Arbitrary<Record<string, unknown>>,
][];

/** A well-formed response for each type, to score a complete draft with. */
const RESPONSES = {
  'multiple-choice': { type: 'multiple-choice', selectedOptionIds: ['a'] },
  'fill-in-the-blanks': { type: 'fill-in-the-blanks', answers: { a: 'Went', b: '' } },
  'written-response': { type: 'written-response', text: 'I went home.', wordCount: 3 },
  'gap-select': { type: 'gap-select', selections: { a: 'from', b: '' } },
  dictation: { type: 'dictation', text: 'It is raining.' },
  // A learner who submitted without recording: the blank a deferred type still
  // has to evaluate without throwing.
  'read-aloud': { type: 'read-aloud', recording: null },
} satisfies Record<BuiltInActivityType, LearnerResponse>;

describe('validateDraft properties', () => {
  it.each(BUILT_IN)('never throws on any input for %s', (type) => {
    fc.assert(
      fc.property(fc.anything(), (draft) => {
        const result = validateDraft(type, draft);
        expect(['complete', 'incomplete', 'invalid']).toContain(result.status);
      }),
      RUNS,
    );
  });

  it.each(EDITOR_DRAFTS)(
    'gives every issue a documented code and severity for any editor-shaped %s draft',
    (type, drafts) => {
      fc.assert(
        fc.property(drafts, (draft) => {
          const result = validateDraft(type, draft);
          const undocumented = result.issues.filter(
            (found) =>
              !Object.hasOwn(DRAFT_ISSUE_SEVERITY, found.code) ||
              DRAFT_ISSUE_SEVERITY[found.code as keyof typeof DRAFT_ISSUE_SEVERITY] !==
                found.severity,
          );
          expect(undocumented).toEqual([]);
        }),
        RUNS,
      );
    },
  );

  it.each(EDITOR_DRAFTS)(
    'is never looser than validateActivity, and a complete %s draft always scores',
    (type, drafts) => {
      fc.assert(
        fc.property(drafts, (draft) => {
          const result = validateDraft(type, draft);
          const stored = validateActivity(type, draft);
          if (result.status === 'complete') {
            expect(stored.success).toBe(true);
            expect(result.issues).toEqual([]);
            const response = RESPONSES[type] as LearnerResponse;
            expect(() => evaluate(result.data as ActivityData, response)).not.toThrow();
          }
          if (!stored.success) {
            expect(result.status).not.toBe('complete');
            expect(result.issues.length).toBeGreaterThan(0);
          }
          expect(result.status === 'invalid').toBe(
            result.issues.some((found) => found.severity === 'invalid'),
          );
        }),
        RUNS,
      );
    },
  );

  it('never throws on any input for an item group', () => {
    // The container has no registered descriptor to guard it — `item-group` is
    // reserved precisely so it cannot be registered — so this is the only thing
    // standing between an editor and a thrown error on a half-typed testlet.
    fc.assert(
      fc.property(fc.anything(), (draft) => {
        const result = validateItemGroupDraft(draft);
        expect(['complete', 'incomplete', 'invalid']).toContain(result.status);
      }),
      RUNS,
    );
  });

  it('gives every item-group issue a documented code and severity', () => {
    const stimulus = fc
      .record({
        id: fc.constantFrom<unknown>(undefined, null, '', 's1'),
        kind: fc.constantFrom<unknown>(undefined, null, '', 'text', 'audio', 'image', 'bogus'),
        body: fc.constantFrom<unknown>(undefined, null, '', '   ', 'A passage.'),
        bodyHtml: fc.constantFrom<unknown>(undefined, null, '', '<p>A passage.</p>'),
        media: fc.constantFrom<unknown>(
          undefined,
          null,
          { type: 'audio', url: '/a.mp3' },
          { type: 'image', url: '/a.png', alt: 'a picture' },
          { type: 'image', url: 'javascript:alert(1)', alt: 'x' },
        ),
      })
      .map(compact);
    const groups = fc
      .record({
        schemaVersion: fc.constantFrom<unknown>(undefined, '1.0', '2.0'),
        type: fc.constantFrom<unknown>(undefined, 'item-group', 'multiple-choice'),
        id: fc.constantFrom<unknown>(undefined, null, '', 'g1'),
        stimulus: orUnset(stimulus),
        items: orUnset(fc.array(entry(multipleChoiceDraft), { maxLength: 2 })),
        shuffle: fc.constantFrom<unknown>(undefined, null, '', 'none', 'within-group', 'bogus'),
      })
      .map(compact);

    fc.assert(
      fc.property(groups, (draft) => {
        const result = validateItemGroupDraft(draft);
        const undocumented = result.issues.filter(
          (found) =>
            !Object.hasOwn(DRAFT_ISSUE_SEVERITY, found.code) ||
            DRAFT_ISSUE_SEVERITY[found.code as keyof typeof DRAFT_ISSUE_SEVERITY] !==
              found.severity,
        );
        expect(undocumented).toEqual([]);
      }),
      RUNS,
    );
  });

  it('never lets a complete fill-in-the-blanks draft crash scoring, whatever its match policy', () => {
    // The editor-shaped arbitrary rarely yields a complete draft, so this one
    // starts from a complete draft and varies only the matching tolerances —
    // with locales drawn from arbitrary strings, most of them not language tags.
    const policy = fc
      .record({
        caseSensitive: fc.constantFrom<unknown>(undefined, true, false),
        trim: fc.constantFrom<unknown>(undefined, true, false),
        normalize: fc.constantFrom<unknown>(undefined, 'none', 'NFC', 'NFKC'),
        foldDiacritics: fc.constantFrom<unknown>(undefined, true, false),
        collapseInnerWhitespace: fc.constantFrom<unknown>(undefined, true, false),
        ignorePunctuation: fc.constantFrom<unknown>(undefined, true, false),
        levenshtein: fc.constantFrom<unknown>(undefined, 0, 1, 2),
        locale: fc.oneof(
          fc.constantFrom<unknown>(undefined, '', 'tr', 'en-US', 'en_US', 'root', 'i-klingon'),
          fc.string({ maxLength: 12 }),
        ),
      })
      .map(compact);
    fc.assert(
      fc.property(policy, fc.string({ maxLength: 8 }), (match, answer) => {
        const draft = {
          schemaVersion: '1.0',
          type: 'fill-in-the-blanks',
          id: 'f1',
          title: 'Past tense',
          passage: 'Yesterday I {{a}} home.',
          blanks: [{ id: 'a', acceptedAnswers: ['went'], match }],
          scoringStrategy: 'partial',
        };
        const result = validateDraft('fill-in-the-blanks', draft);
        if (result.status === 'complete') {
          expect(() =>
            evaluate(result.data, { type: 'fill-in-the-blanks', answers: { a: answer } }),
          ).not.toThrow();
        }
      }),
      RUNS,
    );
  });
});
