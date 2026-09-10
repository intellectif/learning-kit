/**
 * Inputs for the grade-stability corpus. EXPECTED VALUES ARE NOT WRITTEN HERE.
 *
 * `generate-vectors.mjs` executes each case against the built package and
 * freezes whatever it returns. Writing an expectation by hand would pin what
 * someone believed the arithmetic does, which is exactly the belief the corpus
 * exists to test.
 *
 * What earns a case a place:
 *  - a number a stored grade depends on (every scoring path, every default);
 *  - a default a future release could plausibly "improve" -- diacritic folding,
 *    rounding mode, empty-input handling -- because an improved default is a
 *    changed historical grade;
 *  - a sharp edge that is deliberate and documented, pinned so it is changed on
 *    purpose or not at all.
 *
 * This file is ASCII-only. Every character a vector depends on is built with
 * String.fromCodePoint rather than typed. A composed and a decomposed accent, a
 * no-break space and an ordinary space look identical on screen, and both the
 * repo formatter (Biome rewrites unicode escape sequences into raw characters)
 * and an editor that normalises to NFC on save can turn one into the other
 * silently. The invariants under the constants make that fail loudly.
 *
 * Fixtures carry no real content. Ids are hierarchical so a failure names the
 * area before the case.
 */

// -- Characters that must not be confused ----------------------------------

const COMPOSED_E = String.fromCodePoint(0xe9); // e-acute as ONE code point (NFC)
const DECOMPOSED_E = `e${String.fromCodePoint(0x301)}`; // "e" + COMBINING ACUTE ACCENT (NFD)
const ESTA = `est${String.fromCodePoint(0xe1)}`; // "esta" with a composed a-acute
const NBSP = String.fromCodePoint(0xa0); // NO-BREAK SPACE
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x3000);
const CURLY_APOSTROPHE = String.fromCodePoint(0x2019); // RIGHT SINGLE QUOTATION MARK
const DOTLESS_I = String.fromCodePoint(0x131); // LATIN SMALL LETTER DOTLESS I
const FI_LIGATURE = String.fromCodePoint(0xfb01); // LATIN SMALL LIGATURE FI
const EM_DASH = String.fromCodePoint(0x2014);
const E_GRAVE = String.fromCodePoint(0xe8);
const CJK_WORD = String.fromCodePoint(0x6f22, 0x5b57, 0x3067, 0x3059); // four CJK characters, no spaces

// Built from code points rather than typed: a formatter or an editor that
// normalises to NFC on save would rewrite a typed one without anyone noticing.
// These checks make such a rewrite fail generation instead of passing quietly.
const invariant = (ok, message) => {
  if (!ok) throw new Error(`vector-cases.mjs: ${message}`);
};
invariant(COMPOSED_E !== DECOMPOSED_E, 'the composed and decomposed e-acute are identical');
invariant(
  DECOMPOSED_E.normalize('NFC') === COMPOSED_E,
  'the decomposed e-acute does not normalise to the composed one',
);
invariant(NBSP !== ' ', 'NBSP has become an ordinary space');

// -- Fixtures ----------------------------------------------------------------

const mc = (over = {}) => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc-capitals',
  title: 'Capitals',
  question: 'Which of these are capital cities?',
  mode: 'multi',
  scoringStrategy: 'all-or-nothing',
  options: [
    { id: 'a', text: 'Lisbon', isCorrect: true },
    { id: 'b', text: 'Porto', isCorrect: false },
    { id: 'c', text: 'Madrid', isCorrect: true },
    { id: 'd', text: 'Seville', isCorrect: false },
  ],
  ...over,
});

const TWO_OPTIONS = [
  { id: 'a', text: 'Lisbon', isCorrect: true },
  { id: 'b', text: 'Porto', isCorrect: false },
];

const pick = (...ids) => ({ type: 'multiple-choice', selectedOptionIds: ids });

const fib = (over = {}) => ({
  schemaVersion: '1.0',
  type: 'fill-in-the-blanks',
  id: 'fib-articles',
  title: 'Articles',
  passage: 'We bought {{b1}} lamp for {{b2}} study and {{b3}} hall.',
  scoringStrategy: 'partial',
  blanks: [
    { id: 'b1', acceptedAnswers: ['a'] },
    { id: 'b2', acceptedAnswers: ['the'] },
    { id: 'b3', acceptedAnswers: ['the'] },
  ],
  ...over,
});

const oneBlank = (acceptedAnswers, match) =>
  fib({
    passage: 'Answer: {{b1}}.',
    blanks: [{ id: 'b1', acceptedAnswers, ...(match ? { match } : {}) }],
  });

const fill = (answers) => ({ type: 'fill-in-the-blanks', answers });

const wr = (over = {}) => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'wr-weekend',
  title: 'Your weekend',
  prompt: 'Describe your last weekend in 5 to 12 words.',
  minWords: 5,
  maxWords: 12,
  ...over,
});

const write = (text) => ({
  type: 'written-response',
  text,
  wordCount: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
});

const HALF_UP_2 = { mode: 'half-up', dp: 2 };
const NFC_COLLAPSE = { normalize: 'NFC', collapseInnerWhitespace: true };

const scoredOutcome = (score, maxScore = 1) => ({
  status: 'scored',
  score,
  maxScore,
  passed: score / (maxScore || 1) >= 0.7,
  feedback: null,
  details: [],
});
const deferredOutcome = () => ({
  status: 'deferred',
  reason: 'requires_async_grading',
  maxScore: 1,
});
const unscorableOutcome = () => ({
  status: 'unscorable',
  reason: 'Activity type "drag-and-drop" is not registered',
  maxScore: 1,
});
const gradedOutcome = (score) => {
  const grade = { score, maxScore: 1, passed: score >= 0.7, feedback: null };
  return { status: 'graded', grade, score, maxScore: 1, passed: score >= 0.7, feedback: null };
};

const item = (slotId, points, outcome) => ({ slotId, points, outcome });
const section = (id, weight, items, over = {}) => ({ id, weight, items, ...over });
const policy = (over = {}) => ({ passThreshold: 0.7, rounding: HALF_UP_2, ...over });

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const BANDS = [
  { name: 'A', min: 0.9 },
  { name: 'B', min: 0.8 },
  { name: 'C', min: 0.7 },
  { name: 'F', min: 0 },
];

// Written responses of an exact length, for pinning inclusive bounds.
const words = (n) => Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ');

// A blank authored before `match` existed: its flags sit on the blank itself.
const legacyBlank = (acceptedAnswers, flags, match) =>
  fib({
    passage: 'Answer: {{b1}}.',
    blanks: [{ id: 'b1', acceptedAnswers, ...flags, ...(match ? { match } : {}) }],
  });

// A stored plan, shaped as planAttempt freezes it. The hashes are opaque on
// purpose: scoredItemsFromPlan reads slot identity and points, never fingerprints.
const plan = (slots) => ({
  planVersion: '1.0',
  planHash: 'not-recomputed',
  slots: slots.map((slot, index) => ({
    slotId: slot.slotId,
    index,
    activityId: `act-${slot.slotId}`,
    activityType: 'multiple-choice',
    points: slot.points ?? 1,
    contentHash: 'not-recomputed',
  })),
  totalPoints: slots.reduce((sum, slot) => sum + (slot.points ?? 1), 0),
});
const THREE_SLOTS = plan([{ slotId: '1' }, { slotId: '2', points: 2 }, { slotId: '3' }]);
// The two shapes scoredItemsFromPlan gives a missing slot, for composing on top.
const zeroOutcome = () => ({
  status: 'scored',
  score: 0,
  maxScore: 1,
  passed: false,
  feedback: null,
  details: [],
});
const noResponseOutcome = () => ({
  status: 'deferred',
  reason: 'no_response_recorded',
  maxScore: 1,
});

// -- Cases -------------------------------------------------------------------

export const CASES = [
  // Multiple choice -- all-or-nothing is literal.
  {
    id: 'score/mc/all-or-nothing/exact-selection',
    fn: 'score',
    args: ['multiple-choice', mc(), pick('a', 'c')],
  },
  {
    id: 'score/mc/all-or-nothing/one-of-two',
    fn: 'score',
    args: ['multiple-choice', mc(), pick('a')],
  },
  {
    id: 'score/mc/all-or-nothing/extra-wrong-pick',
    fn: 'score',
    args: ['multiple-choice', mc(), pick('a', 'c', 'b')],
  },
  {
    id: 'score/mc/all-or-nothing/empty-selection',
    fn: 'score',
    args: ['multiple-choice', mc(), pick()],
  },
  {
    id: 'score/mc/single/correct',
    fn: 'score',
    args: ['multiple-choice', mc({ mode: 'single', options: TWO_OPTIONS }), pick('a')],
  },
  {
    id: 'score/mc/single/wrong',
    fn: 'score',
    args: ['multiple-choice', mc({ mode: 'single', options: TWO_OPTIONS }), pick('b')],
  },

  // Multiple choice -- partial credit subtracts wrong picks and floors at zero.
  {
    id: 'score/mc/partial/one-of-two-correct',
    fn: 'score',
    args: ['multiple-choice', mc({ scoringStrategy: 'partial' }), pick('a')],
  },
  {
    id: 'score/mc/partial/exact-selection',
    fn: 'score',
    args: ['multiple-choice', mc({ scoringStrategy: 'partial' }), pick('a', 'c')],
  },
  {
    id: 'score/mc/partial/right-plus-wrong-cancels',
    fn: 'score',
    args: ['multiple-choice', mc({ scoringStrategy: 'partial' }), pick('a', 'b')],
  },
  {
    id: 'score/mc/partial/floors-at-zero',
    fn: 'score',
    args: ['multiple-choice', mc({ scoringStrategy: 'partial' }), pick('b', 'd')],
    note: 'Partial credit never goes negative. A score outside [0,1] would break a range consumers enforce in storage.',
  },
  {
    id: 'score/mc/partial/no-wrong-options-no-penalty',
    fn: 'score',
    args: [
      'multiple-choice',
      mc({
        scoringStrategy: 'partial',
        options: [
          { id: 'a', text: 'Lisbon', isCorrect: true },
          { id: 'c', text: 'Madrid', isCorrect: true },
        ],
      }),
      pick('a'),
    ],
  },
  {
    id: 'score/mc/partial/off-paper-option-id',
    fn: 'score',
    args: ['multiple-choice', mc({ scoringStrategy: 'partial' }), pick('a', 'zz-not-an-option')],
    note: 'A selected id that is not on the paper. Its treatment decides a score.',
  },

  // Pass threshold and feedback selection ride on the score.
  {
    id: 'score/mc/pass-threshold/authored-lenient',
    fn: 'score',
    args: ['multiple-choice', mc({ scoringStrategy: 'partial', passThreshold: 0.4 }), pick('a')],
  },
  {
    id: 'score/mc/pass-threshold/authored-strict',
    fn: 'score',
    args: ['multiple-choice', mc({ scoringStrategy: 'partial', passThreshold: 0.9 }), pick('a')],
  },
  {
    id: 'score/mc/feedback/selected-when-passed',
    fn: 'score',
    args: [
      'multiple-choice',
      mc({ feedback: { correct: 'Well done.', incorrect: 'Review capitals.' } }),
      pick('a', 'c'),
    ],
  },
  {
    id: 'score/mc/feedback/selected-when-failed',
    fn: 'score',
    args: [
      'multiple-choice',
      mc({ feedback: { correct: 'Well done.', incorrect: 'Review capitals.' } }),
      pick('b'),
    ],
  },

  // Fill in the blanks -- strategies and defaults.
  {
    id: 'score/fib/partial/two-of-three',
    fn: 'score',
    args: ['fill-in-the-blanks', fib(), fill({ b1: 'a', b2: 'the', b3: 'wrong' })],
    note: 'A non-terminating ratio (2/3), pinned exactly rather than approximately.',
  },
  {
    id: 'score/fib/all-or-nothing/two-of-three',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      fib({ scoringStrategy: 'all-or-nothing' }),
      fill({ b1: 'a', b2: 'the', b3: 'wrong' }),
    ],
  },
  {
    id: 'score/fib/default/trims-and-case-folds',
    fn: 'score',
    args: ['fill-in-the-blanks', fib(), fill({ b1: '  A  ', b2: 'THE', b3: 'The' })],
  },
  {
    id: 'score/fib/default/missing-answer',
    fn: 'score',
    args: ['fill-in-the-blanks', fib(), fill({ b1: 'a', b2: 'the' })],
  },
  {
    id: 'score/fib/default/does-not-fold-diacritics',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank([ESTA]), fill({ b1: 'esta' })],
    note: 'Strict by default. If a release made folding the default, every past accented answer would re-grade.',
  },
  {
    id: 'score/fib/default/accented-exact',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank([ESTA]), fill({ b1: ESTA })],
  },
  {
    id: 'score/fib/default/nfd-input-against-nfc-key',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      oneBlank([`caf${COMPOSED_E}`]),
      fill({ b1: `caf${DECOMPOSED_E}` }),
    ],
    note: 'A dead-key accent (NFD) against a composed key. No normalisation unless one is authored.',
  },
  {
    id: 'score/fib/default/curly-apostrophe',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank(["don't"]), fill({ b1: `don${CURLY_APOSTROPHE}t` })],
    note: 'A curly apostrophe does not match a straight one by default.',
  },
  {
    id: 'score/fib/default/multiple-accepted',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank(['colour', 'color']), fill({ b1: 'color' })],
  },

  // Fill in the blanks -- authored policies.
  {
    id: 'score/fib/policy/nfc-collapse/doubled-space',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank(['has got'], NFC_COLLAPSE), fill({ b1: 'has  got' })],
  },
  {
    id: 'score/fib/policy/nfc-collapse/non-breaking-space',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      oneBlank(['has got'], NFC_COLLAPSE),
      fill({ b1: `has${NBSP}got` }),
    ],
  },
  {
    id: 'score/fib/policy/nfc-collapse/nfd-accent',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      oneBlank([`caf${COMPOSED_E}`], NFC_COLLAPSE),
      fill({ b1: `caf${DECOMPOSED_E}` }),
    ],
  },
  {
    id: 'score/fib/policy/nfc-collapse/still-no-folding',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      oneBlank([`caf${COMPOSED_E}`], NFC_COLLAPSE),
      fill({ b1: 'cafe' }),
    ],
  },
  {
    id: 'score/fib/policy/fold-diacritics',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank([ESTA], { foldDiacritics: true }), fill({ b1: 'esta' })],
  },
  {
    id: 'score/fib/policy/ignore-punctuation',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      oneBlank(["don't"], { ignorePunctuation: true }),
      fill({ b1: 'dont' }),
    ],
  },
  {
    id: 'score/fib/policy/case-sensitive',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      oneBlank(['Paris'], { caseSensitive: true }),
      fill({ b1: 'paris' }),
    ],
  },
  {
    id: 'score/fib/policy/levenshtein-one-typo',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank(['receive'], { levenshtein: 1 }), fill({ b1: 'receve' })],
  },
  {
    id: 'score/fib/policy/levenshtein-empty-blank-is-not-an-answer',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank(['a'], { levenshtein: 1 }), fill({ b1: '' })],
    note: 'Fixed in 0.8.0: an unanswered blank used to fuzzy-match a one-letter answer. The one deliberate grade change on record.',
  },
  {
    id: 'score/fib/policy/levenshtein-whitespace-blank-is-not-an-answer',
    fn: 'score',
    args: ['fill-in-the-blanks', oneBlank(['a'], { levenshtein: 1 }), fill({ b1: '   ' })],
  },

  // Fill in the blanks -- legacy per-blank flags. Content authored before `match`
  // existed still carries them, and re-scoring it must not move.
  {
    id: 'score/fib/legacy/case-sensitive-flag',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      legacyBlank(['Paris'], { caseSensitive: true }),
      fill({ b1: 'paris' }),
    ],
    note: 'Legacy blank.caseSensitive, set on the blank rather than inside match. Items that never migrated still depend on it.',
  },
  {
    id: 'score/fib/legacy/case-sensitive-flag-exact-case',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      legacyBlank(['Paris'], { caseSensitive: true }),
      fill({ b1: 'Paris' }),
    ],
  },
  {
    id: 'score/fib/legacy/case-sensitive-false-explicit',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      legacyBlank(['Paris'], { caseSensitive: false }),
      fill({ b1: 'PARIS' }),
    ],
  },
  {
    id: 'score/fib/legacy/trim-disabled-flag',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      legacyBlank(['the'], { trimWhitespace: false }),
      fill({ b1: '  the' }),
    ],
    note: 'Legacy blank.trimWhitespace: false. Surrounding spaces then count against the learner.',
  },
  {
    id: 'score/fib/legacy/trim-enabled-explicit',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      legacyBlank(['the'], { trimWhitespace: true }),
      fill({ b1: '  the  ' }),
    ],
  },
  {
    id: 'score/fib/legacy/match-overrides-case-sensitive-flag',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      legacyBlank(['Paris'], { caseSensitive: true }, { caseSensitive: false }),
      fill({ b1: 'paris' }),
    ],
    note: 'When a blank has both, match wins over the legacy flag.',
  },
  {
    id: 'score/fib/legacy/match-overrides-trim-flag',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      legacyBlank(['the'], { trimWhitespace: false }, { trim: true }),
      fill({ b1: '  the' }),
    ],
    note: 'When a blank has both, match wins over the legacy flag.',
  },
  {
    id: 'score/fib/legacy/flag-survives-an-unrelated-match-key',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      legacyBlank([ESTA], { caseSensitive: true }, { foldDiacritics: true }),
      fill({ b1: 'Esta' }),
    ],
    note: 'A match object that does not mention caseSensitive leaves the legacy flag in force: the two merge key by key.',
  },

  // matchText directly -- `via` is what a graded-tolerance policy reads.
  { id: 'matchText/default/exact-after-trim-and-case', fn: 'matchText', args: ['  CaT  ', 'cat'] },
  { id: 'matchText/default/array-of-accepted', fn: 'matchText', args: ['two', ['one', 'two']] },
  { id: 'matchText/default/no-match', fn: 'matchText', args: ['three', ['one', 'two']] },
  {
    id: 'matchText/default/trim-disabled',
    fn: 'matchText',
    args: ['  cat', 'cat', { trim: false }],
  },
  { id: 'matchText/default/turkish-i-without-locale', fn: 'matchText', args: ['I', DOTLESS_I] },
  {
    id: 'matchText/policy/turkish-i-with-locale-tr',
    fn: 'matchText',
    args: ['I', DOTLESS_I, { locale: 'tr' }],
  },
  {
    id: 'matchText/policy/nfc',
    fn: 'matchText',
    args: [`caf${DECOMPOSED_E}`, `caf${COMPOSED_E}`, { normalize: 'NFC' }],
  },
  {
    id: 'matchText/policy/nfkc-expands-ligature',
    fn: 'matchText',
    args: [`${FI_LIGATURE}sh`, 'fish', { normalize: 'NFKC' }],
  },
  {
    id: 'matchText/policy/nfc-does-not-expand-ligature',
    fn: 'matchText',
    args: [`${FI_LIGATURE}sh`, 'fish', { normalize: 'NFC' }],
  },
  {
    id: 'matchText/policy/fold-diacritics',
    fn: 'matchText',
    args: ['esta', ESTA, { foldDiacritics: true }],
  },
  {
    id: 'matchText/policy/collapse-inner-whitespace',
    fn: 'matchText',
    args: ['hello \t  world', 'hello world', { collapseInnerWhitespace: true }],
  },
  {
    id: 'matchText/policy/ignore-punctuation',
    fn: 'matchText',
    args: ["it's", ['other', 'its'], { ignorePunctuation: true }],
  },
  {
    id: 'matchText/policy/levenshtein-1-match',
    fn: 'matchText',
    args: ['kat', 'cat', { levenshtein: 1 }],
  },
  {
    id: 'matchText/policy/levenshtein-2-transposition',
    fn: 'matchText',
    args: ['recieve', 'receive', { levenshtein: 2 }],
  },
  {
    id: 'matchText/policy/levenshtein-1-transposition',
    fn: 'matchText',
    args: ['recieve', 'receive', { levenshtein: 1 }],
  },
  {
    id: 'matchText/policy/levenshtein-0',
    fn: 'matchText',
    args: ['kat', 'cat', { levenshtein: 0 }],
  },
  {
    id: 'matchText/policy/levenshtein-empty-input-never-fuzzy',
    fn: 'matchText',
    args: ['', ['a'], { levenshtein: 1 }],
    note: 'Empty input never reaches the fuzzy stage (0.8.0).',
  },
  {
    id: 'matchText/policy/empty-string-authored-as-answer',
    fn: 'matchText',
    args: ['', [''], { levenshtein: 1 }],
    note: 'An author who deliberately lists "" still gets it, at the exact stage.',
  },
  {
    id: 'matchText/policy/levenshtein-1-single-character-hazard',
    fn: 'matchText',
    args: ['b', 'a', { levenshtein: 1 }],
    note: 'Deliberate and documented: distance 1 against a one-character answer accepts ANY single character.',
  },

  { id: 'levenshteinDistance/classic', fn: 'levenshteinDistance', args: ['kitten', 'sitting', 10] },
  { id: 'levenshteinDistance/identical', fn: 'levenshteinDistance', args: ['abc', 'abc', 5] },
  {
    id: 'levenshteinDistance/capped-below-distance',
    fn: 'levenshteinDistance',
    args: ['kitten', 'sitting', 1],
  },

  // evaluate -- the outcome union. A deferred essay is never a zero.
  { id: 'evaluate/mc/scored', fn: 'evaluate', args: [mc(), pick('a', 'c')] },
  {
    id: 'evaluate/fib/scored',
    fn: 'evaluate',
    args: [fib(), fill({ b1: 'a', b2: 'the', b3: 'wrong' })],
  },
  {
    id: 'evaluate/wr/deferred-within-bounds',
    fn: 'evaluate',
    args: [wr(), write('We walked by the river and ate lunch')],
  },
  { id: 'evaluate/wr/deferred-below-minimum', fn: 'evaluate', args: [wr(), write('Too short')] },
  { id: 'evaluate/wr/deferred-empty-response', fn: 'evaluate', args: [wr(), write('')] },

  // The count that gates essay bounds is recomputed from the text. The client's
  // count is never trusted, so these responses disagree with their text on purpose.
  {
    id: 'evaluate/wr/client-word-count-inflated',
    fn: 'evaluate',
    args: [wr(), { type: 'written-response', text: 'Too short', wordCount: 100 }],
    note: 'The client claims 100 words for a two-word text. The recount must win, so the essay is out of bounds.',
  },
  {
    id: 'evaluate/wr/client-word-count-deflated',
    fn: 'evaluate',
    args: [wr(), { type: 'written-response', text: words(8), wordCount: 1 }],
    note: 'The client claims 1 word for an eight-word text. The recount must win, so the essay is within bounds.',
  },
  {
    id: 'evaluate/wr/client-word-count-absent',
    fn: 'evaluate',
    args: [wr(), { type: 'written-response', text: words(6) }],
  },
  { id: 'evaluate/wr/bounds/one-below-minimum', fn: 'evaluate', args: [wr(), write(words(4))] },
  {
    id: 'evaluate/wr/bounds/exactly-minimum',
    fn: 'evaluate',
    args: [wr(), write(words(5))],
    note: 'minWords is inclusive.',
  },
  {
    id: 'evaluate/wr/bounds/exactly-maximum',
    fn: 'evaluate',
    args: [wr(), write(words(12))],
    note: 'maxWords is inclusive.',
  },
  { id: 'evaluate/wr/bounds/one-above-maximum', fn: 'evaluate', args: [wr(), write(words(13))] },
  {
    id: 'evaluate/wr/bounds/zero-minimum-empty-text',
    fn: 'evaluate',
    args: [wr({ minWords: 0 }), write('')],
    note: 'With minWords 0, an empty submission is within bounds on the count alone.',
  },
  { id: 'evaluate/wr/no-response-at-all', fn: 'evaluate', args: [wr(), undefined] },
  {
    id: 'evaluate/unknown-type/unscorable',
    fn: 'evaluate',
    args: [{ type: 'no-such-type' }, pick('a')],
    ignore: ['reason'],
  },
  {
    id: 'score/wr/throws-rather-than-zero',
    fn: 'score',
    args: ['written-response', wr(), write('We walked by the river and ate lunch')],
    note: 'score() refuses to invent a number for work a grader has not seen.',
  },
  { id: 'score/unknown-type/throws', fn: 'score', args: ['no-such-type', mc(), pick('a')] },

  // Thresholds.
  { id: 'const/DEFAULT_PASS_THRESHOLD', const: 'DEFAULT_PASS_THRESHOLD' },
  { id: 'computePassThreshold/raw/at-threshold', fn: 'computePassThreshold', args: [{}, 0.7] },
  {
    id: 'computePassThreshold/raw/just-below',
    fn: 'computePassThreshold',
    args: [{}, 0.6999999999],
    note: 'Without a rounding policy the comparison is raw.',
  },
  {
    id: 'computePassThreshold/raw/authored-threshold',
    fn: 'computePassThreshold',
    args: [{ passThreshold: 0.5 }, 0.5],
  },
  { id: 'computePassThreshold/raw/69.6-fails', fn: 'computePassThreshold', args: [{}, 0.696] },
  {
    id: 'computePassThreshold/rounded/half-up-rescues-69.6',
    fn: 'computePassThreshold',
    args: [{}, 0.696, HALF_UP_2],
  },
  {
    id: 'computePassThreshold/rounded/floor-does-not-rescue',
    fn: 'computePassThreshold',
    args: [{}, 0.699, { mode: 'floor', dp: 2 }],
  },

  // Rounding -- every mode, float edges, and the negative-zero rule.
  ...[
    [0.694, 'half-up', 2],
    [0.696, 'half-up', 2],
    [0.5, 'half-up', 0],
    [2.4, 'half-up', 0],
    [-0.125, 'half-up', 2],
    [-0.5, 'half-up', 0],
    [-2.5, 'half-up', 0],
    [-0.694, 'half-up', 2],
    [1.005, 'half-up', 2],
    [8.575, 'half-up', 2],
    [1.015, 'half-up', 2],
    [69.5, 'half-up', 0],
    [0.125, 'half-even', 2],
    [0.135, 'half-even', 2],
    [2.5, 'half-even', 0],
    [3.5, 'half-even', 0],
    [1.005, 'half-even', 2],
    [1.239, 'floor', 2],
    [2.7, 'floor', 0],
    [-1.234, 'floor', 2],
    [-2.1, 'floor', 0],
    [1.231, 'ceil', 2],
    [2.1, 'ceil', 0],
    [-1.234, 'ceil', 2],
    [-2.9, 'ceil', 0],
    [0.7, 'ceil', 2],
    [1.23, 'ceil', 2],
  ].map(([value, mode, dp]) => ({
    id: `roundGrade/${mode}/dp${dp}/${value}`,
    fn: 'roundGrade',
    args: [value, { mode, dp }],
  })),
  {
    id: 'roundGrade/negative-zero/ceil-of-minus-half',
    fn: 'roundGrade',
    args: [-0.5, { mode: 'ceil', dp: 0 }],
    note: 'A negative value that rounds to zero returns 0, never -0.',
  },
  {
    id: 'roundGrade/negative-zero/half-up-tiny-negative',
    fn: 'roundGrade',
    args: [-0.004, HALF_UP_2],
  },
  {
    id: 'roundGrade/negative-zero/floor-of-minus-zero',
    fn: 'roundGrade',
    args: [-0, { mode: 'floor', dp: 2 }],
  },
  {
    id: 'roundGrade/non-finite/nan-passes-through',
    fn: 'roundGrade',
    args: [Number.NaN, HALF_UP_2],
    note: 'Non-finite input is returned unchanged, not coerced to 0.',
  },
  {
    id: 'roundGrade/non-finite/infinity-passes-through',
    fn: 'roundGrade',
    args: [Number.POSITIVE_INFINITY, HALF_UP_2],
  },

  { id: 'gte/half-up/69.6-reaches-70', fn: 'gte', args: [0.696, 0.7, HALF_UP_2] },
  { id: 'gte/half-up/69.4-does-not', fn: 'gte', args: [0.694, 0.7, HALF_UP_2] },
  { id: 'gte/floor/69.9-does-not', fn: 'gte', args: [0.699, 0.7, { mode: 'floor', dp: 2 }] },
  {
    id: 'gte/half-up/dp0/69.5-reaches-70',
    fn: 'gte',
    args: [69.5, 70, { mode: 'half-up', dp: 0 }],
  },
  {
    id: 'gte/half-even/dp0/69.5-reaches-70',
    fn: 'gte',
    args: [69.5, 70, { mode: 'half-even', dp: 0 }],
  },
  { id: 'gte/half-up/float-noise-below', fn: 'gte', args: [0.6999999999, 0.7, HALF_UP_2] },

  // Bands floor, with a float tolerance. A score that is mathematically on a
  // boundary but computed a hair below it is NOT demoted; a genuine shortfall
  // is. The A-minus-1e-10 / A-minus-1e-8 pair straddles that tolerance.
  ...[
    ['mid-B', 0.85],
    ['exactly-A', 0.9],
    [
      'A-minus-1e-8',
      0.9 - 1e-8,
      'Just outside the float tolerance: a real shortfall, so it is NOT promoted to A.',
    ],
    [
      'A-minus-1e-10',
      0.9 - 1e-10,
      'Inside the float tolerance: noise on a score that is mathematically 0.9, so it lands in A.',
    ],
    ['A-minus-1e-13', 0.9 - 1e-13],
    ['exactly-C', 0.7],
    ['zero', 0],
    ['top', 1],
    ['below-every-band', -0.1],
  ].map(([name, value, note]) => ({
    id: `classifyBand/floor/${name}`,
    fn: 'classifyBand',
    args: [value, BANDS],
    ...(note ? { note } : {}),
  })),
  {
    id: 'classifyBand/unsorted-bands',
    fn: 'classifyBand',
    args: [0.85, [BANDS[3], BANDS[0], BANDS[2], BANDS[1]]],
  },

  // Word counts -- the number that gates essay bounds and prices length penalties.
  ...[
    ['empty', ''],
    ['spaces-only', '   '],
    ['mixed-whitespace-only', '\t\n  \r\n'],
    ['one-word', 'hello'],
    ['runs-of-spaces', 'one    two     three'],
    ['tabs-and-newlines', 'one\ttwo\nthree\r\nfour'],
    ['hyphenated', 'well-known'],
    ['hyphenated-in-sentence', 'a well-known fact'],
    ['padded', '  hello world  '],
    ['non-breaking-space', `has${NBSP}got`],
    ['ideographic-space', `a${IDEOGRAPHIC_SPACE}b`],
    ['cjk-without-spaces', CJK_WORD],
    ['accented', `caf${COMPOSED_E} cr${E_GRAVE}me`],
    ['curly-apostrophe', `I don${CURLY_APOSTROPHE}t know`],
    ['spaced-em-dash', `yes ${EM_DASH} no`],
  ].map(([name, text]) => ({ id: `countWords/${name}`, fn: 'countWords', args: [text] })),
  {
    id: 'countWords/non-string/number',
    fn: 'countWords',
    args: [42],
    note: 'A malformed client payload counts 0 rather than throwing mid-grading.',
  },
  { id: 'countWords/non-string/null', fn: 'countWords', args: [null] },

  // Seeded order -- the record of what a learner saw.
  ...[1, 2].flatMap((version) => [
    {
      id: `seededShuffle/v${version}/letters-seed-1`,
      fn: 'seededShuffle',
      args: [LETTERS, 'seed-1:mc-1', { version }],
    },
    {
      id: `seededShuffle/v${version}/letters-attempt-42`,
      fn: 'seededShuffle',
      args: [LETTERS, 'attempt-42:group-1', { version }],
    },
    {
      id: `seededShuffle/v${version}/four-options`,
      fn: 'seededShuffle',
      args: [['opt-a', 'opt-b', 'opt-c', 'opt-d'], 'attempt-9f3c:q-12', { version }],
    },
    {
      id: `seededShuffle/v${version}/numbers`,
      fn: 'seededShuffle',
      args: [[0, 1, 2, 3], 's1', { version }],
    },
  ]),
  { id: 'seededShuffle/default-is-v1', fn: 'seededShuffle', args: [LETTERS, 'seed-1:mc-1'] },
  { id: 'seededShuffle/empty', fn: 'seededShuffle', args: [[], 'x'] },
  { id: 'seededShuffle/single', fn: 'seededShuffle', args: [['only'], 'x'] },

  // Rubric grades -- the arithmetic behind every returned essay grade.
  {
    id: 'gradeFromRubric/equal-weights',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.8 },
        { name: 'Grammar', score: 0.6 },
      ],
    ],
    note: 'With no activity and no passThreshold option, the pass decision compares against a literal 0.7 in grading.ts, not DEFAULT_PASS_THRESHOLD. Identical today; changing the default would not move this vector.',
  },
  {
    id: 'gradeFromRubric/weighted',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.8, weight: 3 },
        { name: 'Grammar', score: 0.4, weight: 1 },
      ],
    ],
  },
  {
    id: 'gradeFromRubric/max-score-scaling',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 4, maxScore: 5 },
        { name: 'Grammar', score: 60, maxScore: 100 },
      ],
    ],
  },
  {
    id: 'gradeFromRubric/not-applicable-excluded',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.9 },
        { name: 'Grammar', score: 0, notApplicable: true },
      ],
    ],
  },
  {
    id: 'gradeFromRubric/band-only-excluded',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.8 },
        { name: 'Style', band: 'B2' },
      ],
    ],
  },
  {
    id: 'gradeFromRubric/weights-come-from-criteria-not-activity',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.8 },
        { name: 'Grammar', score: 0.4 },
      ],
      wr({
        rubric: {
          criteria: [
            { name: 'Task', weight: 3 },
            { name: 'Grammar', weight: 1 },
          ],
        },
      }),
    ],
    note: 'Documented sharp edge: weights are read from each CriterionScore only. Weights on the activity rubric are not joined, so this is the unweighted mean.',
  },
  {
    id: 'gradeFromRubric/option-pass-threshold',
    fn: 'gradeFromRubric',
    args: [[{ name: 'Task', score: 0.55 }], undefined, { passThreshold: 0.5 }],
  },
  {
    id: 'gradeFromRubric/activity-pass-threshold',
    fn: 'gradeFromRubric',
    args: [[{ name: 'Task', score: 0.85 }], wr({ passThreshold: 0.9 })],
  },
  {
    id: 'gradeFromRubric/float-noise-clamped',
    fn: 'gradeFromRubric',
    args: [[{ name: 'Task', score: 1 + 1e-12 }]],
  },
  ...[
    ['raw-points-without-max', [{ name: 'Task', score: 4 }]],
    ['non-finite-score', [{ name: 'Task', score: Number.NaN }]],
    ['zero-max-score', [{ name: 'Task', score: 0, maxScore: 0 }]],
    ['nothing-scoreable', [{ name: 'Style', band: 'B2' }]],
    ['weights-sum-to-zero', [{ name: 'Task', score: 0.5, weight: 0 }]],
  ].map(([name, criteria]) => ({
    id: `gradeFromRubric/unscorable/${name}`,
    fn: 'gradeFromRubric',
    args: [criteria],
    ignore: ['reason'],
  })),
  {
    id: 'outcomeFromGrade/lifts-a-grade',
    fn: 'outcomeFromGrade',
    args: [{ score: 0.82, maxScore: 1, passed: true, feedback: 'Clear and well organised.' }],
  },

  // Whole-assessment composition.
  {
    id: 'composeAssessmentScore/weights/2-and-3',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 2, [item('a1', 1, scoredOutcome(1))]),
        section('b', 3, [item('b1', 1, scoredOutcome(0.5))]),
      ],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/weights/0.4-and-0.6',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 0.4, [item('a1', 1, scoredOutcome(1))]),
        section('b', 0.6, [item('b1', 1, scoredOutcome(0.5))]),
      ],
      policy(),
    ],
    note: 'Must equal weights/2-and-3: weights normalise by their sum.',
  },
  {
    id: 'composeAssessmentScore/points/within-a-section',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 1, scoredOutcome(1)), item('a2', 3, scoredOutcome(0))])],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/unscaled-item-max-score',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 2, scoredOutcome(1, 2)), item('a2', 2, scoredOutcome(0.5, 1))])],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/deferred-item-is-provisional',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 1, scoredOutcome(1)), item('a2', 1, deferredOutcome())])],
      policy(),
    ],
    note: 'An essay awaiting a grade makes the result provisional. It is never counted as zero.',
  },
  {
    id: 'composeAssessmentScore/unscorable-item',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 1, scoredOutcome(1)), item('a2', 1, unscorableOutcome())])],
      policy(),
    ],
    note: 'Sharp edge, pinned deliberately: an unscorable item leaves the denominator and the result is still final, so the paper passes on what remains. The slot is reported in unscorableSlotIds for the caller to act on.',
  },
  {
    id: 'composeAssessmentScore/graded-item-participates',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 1, scoredOutcome(0.6)), item('a2', 1, gradedOutcome(0.9))])],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/section-threshold/one-section-below',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 1, [item('a1', 1, scoredOutcome(1))]),
        section('b', 1, [item('b1', 1, scoredOutcome(0.5))]),
      ],
      policy({ sectionThreshold: 0.6 }),
    ],
  },
  {
    id: 'composeAssessmentScore/section-threshold/both-below',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 1, [item('a1', 1, scoredOutcome(0.5))]),
        section('b', 1, [item('b1', 1, scoredOutcome(0.4))]),
      ],
      policy({ sectionThreshold: 0.6 }),
    ],
  },
  {
    id: 'composeAssessmentScore/section-threshold/per-section-override',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 1, [item('a1', 1, scoredOutcome(0.75))], { passThresholdOverride: 0.8 }),
        section('b', 1, [item('b1', 1, scoredOutcome(1))]),
      ],
      policy({ sectionThreshold: 0.6 }),
    ],
  },
  {
    id: 'composeAssessmentScore/zero-weight-section',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 0, [item('a1', 1, scoredOutcome(0))]),
        section('b', 1, [item('b1', 1, scoredOutcome(1))]),
      ],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/section-entirely-deferred',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('writing', 1, [item('w1', 1, deferredOutcome())]),
        section('reading', 3, [item('r1', 1, scoredOutcome(0.8))]),
      ],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/rounding/half-up-at-the-boundary',
    fn: 'composeAssessmentScore',
    args: [[section('a', 1, [item('a1', 1000, scoredOutcome(0.6955))])], policy()],
  },

  // Plans into scored items -- where a stored paper's denominator comes from.
  {
    id: 'scoredItemsFromPlan/missing-default-is-deferred',
    fn: 'scoredItemsFromPlan',
    args: [THREE_SLOTS, { 1: scoredOutcome(1) }],
    note: 'A slot with no outcome defaults to deferred, which keeps a composed result provisional. A default of unscorable once turned a one-answer paper into a final, passing 100%.',
  },
  {
    id: 'scoredItemsFromPlan/missing-explicit-deferred',
    fn: 'scoredItemsFromPlan',
    args: [THREE_SLOTS, { 1: scoredOutcome(1) }, { missing: 'deferred' }],
  },
  {
    id: 'scoredItemsFromPlan/missing-zero',
    fn: 'scoredItemsFromPlan',
    args: [THREE_SLOTS, { 1: scoredOutcome(1) }, { missing: 'zero' }],
    note: 'For a submitted attempt whose blanks are genuine blanks: real zeros, so the result can be final.',
  },
  {
    id: 'scoredItemsFromPlan/every-slot-recorded',
    fn: 'scoredItemsFromPlan',
    args: [THREE_SLOTS, { 1: scoredOutcome(1), 2: scoredOutcome(0.5), 3: deferredOutcome() }],
  },
  {
    id: 'scoredItemsFromPlan/unknown-outcome-keys-ignored',
    fn: 'scoredItemsFromPlan',
    args: [THREE_SLOTS, { 1: scoredOutcome(1), 99: scoredOutcome(1) }],
    note: 'The plan is the authority on what the attempt contained.',
  },
  {
    id: 'scoredItemsFromPlan/prototype-named-slot-ids',
    fn: 'scoredItemsFromPlan',
    args: [plan([{ slotId: 'constructor' }, { slotId: 'toString' }]), {}],
    note: 'Authored slot keys can collide with Object.prototype. They must read as missing, never resolve to a function.',
  },
  {
    id: 'scoredItemsFromPlan/prototype-named-slot-id-recorded',
    fn: 'scoredItemsFromPlan',
    args: [plan([{ slotId: 'constructor' }]), { constructor: scoredOutcome(1) }],
  },
  {
    id: 'composeAssessmentScore/from-plan/one-answer-of-three-missing-deferred',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('paper', 1, [
          item('1', 1, scoredOutcome(1)),
          item('2', 2, noResponseOutcome()),
          item('3', 1, noResponseOutcome()),
        ]),
      ],
      policy(),
    ],
    note: 'What scoredItemsFromPlan returns for a one-answer paper under the default. It must stay provisional, never a final grade on one answer.',
  },
  {
    id: 'composeAssessmentScore/from-plan/one-answer-of-three-missing-zero',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('paper', 1, [
          item('1', 1, scoredOutcome(1)),
          item('2', 2, zeroOutcome()),
          item('3', 1, zeroOutcome()),
        ]),
      ],
      policy(),
    ],
    note: 'The same paper under missing zero: one point of four, final, and not passed.',
  },

  // -- Found by mutation testing ------------------------------------------------
  // Each case below exists because a deliberate change to a grade path left
  // every earlier vector green. Its note names what it now catches.
  {
    id: 'score/mc/partial/fractional-penalty',
    fn: 'score',
    args: [
      'multiple-choice',
      mc({
        scoringStrategy: 'partial',
        options: [
          { id: 'a', text: 'Lisbon', isCorrect: true },
          { id: 'b', text: 'Porto', isCorrect: false },
          { id: 'c', text: 'Madrid', isCorrect: true },
          { id: 'd', text: 'Seville', isCorrect: false },
          { id: 'e', text: 'Rome', isCorrect: true },
          { id: 'f', text: 'Milan', isCorrect: false },
        ],
      }),
      pick('a', 'c', 'b'),
    ],
    note: 'Two of three right and one of three wrong: 2/3 - 1/3. Every earlier penalty vector floored at zero, which left the penalty arithmetic itself unpinned.',
  },
  {
    id: 'score/mc/pass-threshold/authored-zero',
    fn: 'score',
    args: ['multiple-choice', mc({ scoringStrategy: 'partial', passThreshold: 0 }), pick('b', 'd')],
    note: 'An authored passThreshold of 0 passes everything. Reading it with || instead of ?? would silently restore the 0.7 default.',
  },
  {
    id: 'computePassThreshold/raw/authored-zero-threshold',
    fn: 'computePassThreshold',
    args: [{ passThreshold: 0 }, 0],
  },
  {
    id: 'score/mc/redacted-data-throws',
    fn: 'score',
    args: ['multiple-choice', { ...mc(), redacted: true }, pick('a')],
    note: 'A redact() projection carries no answer key. Scoring one must refuse rather than compute a number.',
  },
  {
    id: 'evaluate/mc/redacted-data',
    fn: 'evaluate',
    args: [{ ...mc(), redacted: true }, pick('a')],
    ignore: ['reason'],
  },
  {
    id: 'score/mc/no-correct-option-partial',
    fn: 'score',
    args: [
      'multiple-choice',
      mc({ scoringStrategy: 'partial', options: [{ id: 'b', text: 'Porto', isCorrect: false }] }),
      pick('b'),
    ],
    note: 'An answer key with no correct option. Pinned so a non-finite score can never reach a grade column.',
  },
  {
    id: 'evaluate/mc/no-correct-option-partial',
    fn: 'evaluate',
    args: [
      mc({ scoringStrategy: 'partial', options: [{ id: 'b', text: 'Porto', isCorrect: false }] }),
      pick('b'),
    ],
    ignore: ['reason'],
  },
  {
    id: 'roundGrade/half-even/dp2/0.126',
    fn: 'roundGrade',
    args: [0.126, { mode: 'half-even', dp: 2 }],
    note: 'Half-even on a value that is not a tie. Every earlier half-even vector was an exact tie, which left the non-tie path unpinned.',
  },
  {
    id: 'roundGrade/half-even/near-tie-is-not-a-tie',
    fn: 'roundGrade',
    args: [0.125005, { mode: 'half-even', dp: 2 }],
    note: 'Half a thousandth past a tie rounds away, not to even: the tie tolerance is far tighter than this.',
  },
  {
    id: 'classifyBand/duplicate-minimum-first-wins',
    fn: 'classifyBand',
    args: [
      0.6,
      [
        { name: 'first', min: 0.5 },
        { name: 'second', min: 0.5 },
      ],
    ],
    note: 'Two bands share a minimum. The first one listed wins.',
  },
  {
    id: 'matchText/policy/trim-false-survives-collapse',
    fn: 'matchText',
    args: ['  hello  world', 'hello world', { trim: false, collapseInnerWhitespace: true }],
    note: 'collapseInnerWhitespace must not quietly trim the ends when trim is false.',
  },
  {
    id: 'matchText/policy/fold-diacritics-accent-on-input',
    fn: 'matchText',
    args: [ESTA, 'esta', { foldDiacritics: true }],
    note: 'The accent is typed by the learner rather than stored in the key. Both sides must be folded.',
  },
  {
    id: 'levenshteinDistance/length-gap-exceeds-bound',
    fn: 'levenshteinDistance',
    args: ['a', 'abcdef', 2],
  },
  {
    id: 'matchText/policy/levenshtein-length-gap-never-fuzzy',
    fn: 'matchText',
    args: ['a', 'abcdef', { levenshtein: 2 }],
    note: 'The lengths differ by five against a bound of two. The early exit must report the distance as too large, never as small enough to accept.',
  },
  {
    id: 'matchText/policy/levenshtein-whitespace-input-under-trim-false',
    fn: 'matchText',
    args: ['  ', ['a'], { trim: false, levenshtein: 2 }],
    note: 'A whitespace-only answer is still no answer when trim is off, and must not reach the fuzzy stage.',
  },
  {
    id: 'gradeFromRubric/not-applicable-corrupt-score-ignored',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.8 },
        { name: 'Grammar', score: Number.NaN, notApplicable: true },
      ],
    ],
    note: 'A criterion marked not applicable is excluded before its score is inspected, so a corrupt value there cannot void the grade.',
  },
  {
    id: 'gradeFromRubric/not-applicable-bad-max-ignored',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.8 },
        { name: 'Grammar', score: 0, maxScore: 0, notApplicable: true },
      ],
    ],
  },
  {
    id: 'gradeFromRubric/zero-weight-criterion-among-others',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.9, weight: 1 },
        { name: 'Grammar', score: 0.1, weight: 0 },
      ],
    ],
    note: 'A weight of 0 means the criterion counts for nothing. Reading it with || would give it the default weight of 1.',
  },
  {
    id: 'gradeFromRubric/option-pass-threshold-inclusive',
    fn: 'gradeFromRubric',
    args: [[{ name: 'Task', score: 0.5 }], undefined, { passThreshold: 0.5 }],
    note: 'A score exactly at the passThreshold option passes.',
  },
  {
    id: 'gradeFromRubric/unscorable/just-above-one',
    fn: 'gradeFromRubric',
    args: [[{ name: 'Task', score: 1.0005 }]],
    ignore: ['reason'],
    note: 'Five ten-thousandths over the scale is a grader out of contract, not float noise, so it is refused rather than clamped.',
  },
  ...[
    ['infinite-max-score', [{ name: 'Task', score: 1, maxScore: Number.POSITIVE_INFINITY }]],
    ['infinite-weight', [{ name: 'Task', score: 0.5, weight: Number.POSITIVE_INFINITY }]],
  ].map(([name, criteria]) => ({
    id: `gradeFromRubric/unscorable/${name}`,
    fn: 'gradeFromRubric',
    args: [criteria],
    ignore: ['reason'],
  })),
  {
    id: 'composeAssessmentScore/item-max-score-zero',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 2, scoredOutcome(0.5, 0)), item('a2', 2, scoredOutcome(1))])],
      policy(),
    ],
    note: 'An outcome claiming maxScore 0 is read against 1 rather than divided by zero.',
  },
  {
    id: 'composeAssessmentScore/nothing-graded-yet',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('writing', 1, [item('w1', 1, deferredOutcome())]),
        section('speaking', 3, [item('s1', 1, deferredOutcome())]),
      ],
      policy(),
    ],
    note: 'Every section still ungraded. No weight may be divided by a contributing total of zero.',
  },
  {
    id: 'composeAssessmentScore/section-threshold/ungraded-section-is-not-failed',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('writing', 1, [item('w1', 1, deferredOutcome())]),
        section('reading', 3, [item('r1', 1, scoredOutcome(0.8))]),
      ],
      policy({ sectionThreshold: 0.6 }),
    ],
    note: 'A section with nothing graded cannot be said to have failed its threshold.',
  },
  {
    id: 'evaluate/wr/response-without-text',
    fn: 'evaluate',
    args: [wr(), { type: 'written-response' }],
  },
  {
    id: 'matchText/policy/ignore-punctuation-leaves-a-trailing-space',
    fn: 'matchText',
    args: ['hola !', 'hola', { ignorePunctuation: true }],
    note: 'Sharp edge, pinned rather than fixed: removing the punctuation leaves the space before it, and nothing trims that space, so this does not match. Adding collapseInnerWhitespace is what makes it match (next vector).',
  },
  {
    id: 'matchText/policy/ignore-punctuation-with-collapse-trims-the-space',
    fn: 'matchText',
    args: ['hola !', 'hola', { ignorePunctuation: true, collapseInnerWhitespace: true }],
    note: 'The trim after collapsing is not redundant: removing punctuation can leave a trailing space that only this trim removes.',
  },
  {
    id: 'composeAssessmentScore/every-graded-section-weightless',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 0, [item('a1', 1, scoredOutcome(1))]),
        section('b', 0, [item('b1', 1, scoredOutcome(0.5))]),
      ],
      policy(),
    ],
    note: 'Sharp edge, pinned rather than fixed: when every graded section weighs 0 the paper records a final 0 and a fail, not a provisional or unscorable result. No weight is ever divided by the zero total.',
  },
];
