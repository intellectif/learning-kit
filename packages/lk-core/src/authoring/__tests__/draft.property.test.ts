import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateActivity } from '../../schemas/index.js';
import { evaluate } from '../../scoring/index.js';
import type { ActivityData, ActivityType, LearnerResponse } from '../../types/activity.js';
import { validateDraft } from '../index.js';
import { DRAFT_ISSUE_SEVERITY } from '../issues.js';

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

const BUILT_IN: ActivityType[] = ['multiple-choice', 'fill-in-the-blanks', 'written-response'];

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

const EDITOR_DRAFTS: [ActivityType, fc.Arbitrary<Record<string, unknown>>][] = [
  ['multiple-choice', multipleChoiceDraft],
  ['fill-in-the-blanks', fillInTheBlanksDraft],
  ['written-response', writtenResponseDraft],
];

/** A well-formed response for each type, to score a complete draft with. */
const RESPONSES: Record<string, LearnerResponse> = {
  'multiple-choice': { type: 'multiple-choice', selectedOptionIds: ['a'] },
  'fill-in-the-blanks': { type: 'fill-in-the-blanks', answers: { a: 'Went', b: '' } },
  'written-response': { type: 'written-response', text: 'I went home.', wordCount: 3 },
};

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

  it.each(
    EDITOR_DRAFTS,
  )('gives every issue a documented code and severity for any editor-shaped %s draft', (type, drafts) => {
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
  });

  it.each(
    EDITOR_DRAFTS,
  )('is never looser than validateActivity, and a complete %s draft always scores', (type, drafts) => {
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
