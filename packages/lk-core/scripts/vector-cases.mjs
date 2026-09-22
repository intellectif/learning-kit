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

const gs = (over = {}) => ({
  schemaVersion: '1.0',
  type: 'gap-select',
  id: 'gs-prepositions',
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
    { id: 'a', bankId: 'prep', correctChoiceId: 'from' },
    { id: 'b', bankId: 'prep', correctChoiceId: 'from' },
  ],
  scoringStrategy: 'partial',
  ...over,
});

const choose = (selections) => ({ type: 'gap-select', selections });

const oneBlank = (acceptedAnswers, match) =>
  fib({
    passage: 'Answer: {{b1}}.',
    blanks: [{ id: 'b1', acceptedAnswers, ...(match ? { match } : {}) }],
  });

const fill = (answers) => ({ type: 'fill-in-the-blanks', answers });

// -- Dictation ---------------------------------------------------------------

const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const ACUTE_ACCENT = String.fromCodePoint(0xb4); // used as an apostrophe by some keyboards
const UNICODE_HYPHEN = String.fromCodePoint(0x2010);
const DOTTED_CAPITAL_I = String.fromCodePoint(0x130); // LATIN CAPITAL LETTER I WITH DOT ABOVE
const GRINNING_FACE = String.fromCodePoint(0x1f600); // one code point, two UTF-16 units
const SMILING_FACE = String.fromCodePoint(0x1f603);
const LONE_SURROGATE = String.fromCharCode(0xd800);
const J_WITH_CARON = String.fromCodePoint(0x1f0); // the NFC form of j + COMBINING CARON
const CAPITAL_J_CARON = `J${String.fromCodePoint(0x30c)}`; // lowercases to j + caron, which NFC composes
const CAFE_SPLIT = `cafe${ZERO_WIDTH_SPACE}${String.fromCodePoint(0x301)}`; // a format character between e and its accent
const NULL_CHARACTER = String.fromCodePoint(0x0); // a control character
const BELL = String.fromCodePoint(0x7); // a control character
const NEXT_LINE = String.fromCodePoint(0x85); // a control character that is a line break
const AATH = String.fromCodePoint(0x906, 0x920); // Devanagari "eight"
const AATHON = String.fromCodePoint(0x906, 0x920, 0x94b, 0x902); // "all eight": AATH, then a vowel sign and a nasal mark
const DIN = String.fromCodePoint(0x926, 0x93f, 0x928); // Devanagari "day"
const AATE = String.fromCodePoint(0x906, 0x924, 0x947); // ends in a vowel sign, a combining mark
const JAATE = String.fromCodePoint(0x91c, 0x93e, 0x924, 0x947);
const HEAVY_HEART = String.fromCodePoint(0x2764);
const EMOJI_PRESENTATION = String.fromCodePoint(0xfe0f); // VARIATION SELECTOR-16
const GRAPHEME_JOINER = String.fromCodePoint(0x34f); // COMBINING GRAPHEME JOINER, default-ignorable
const HANGUL_FILLER = String.fromCodePoint(0x3164); // a letter, and default-ignorable
const ZWNJ = String.fromCodePoint(0x200c); // ZERO WIDTH NON-JOINER
const ZWJ = String.fromCodePoint(0x200d); // ZERO WIDTH JOINER
const MI = String.fromCodePoint(0x645, 0x6cc); // the Persian verb prefix mi-
const KHAHAM = String.fromCodePoint(0x62e, 0x648, 0x627, 0x647, 0x645); // "(I) want"
const KSHA_WITH_JOINER = String.fromCodePoint(0x915, 0x94d, 0x200d, 0x937); // Devanagari k + virama + ZWJ + ss
const KSHA = String.fromCodePoint(0x915, 0x94d, 0x937); // the same letters, conjunct
const NOM = String.fromCodePoint(0x1828, 0x1823, 0x182e); // Mongolian "nom"
const MONGOLIAN_VOWEL_SEPARATOR = String.fromCodePoint(0x180e);
const MONGOLIAN_A = String.fromCodePoint(0x1820);
const MONGOLIAN_GA = String.fromCodePoint(0x182d);
const FVS1 = String.fromCodePoint(0x180b); // MONGOLIAN FREE VARIATION SELECTOR ONE
const FVS2 = String.fromCodePoint(0x180c);
const tagged = (letters) =>
  String.fromCodePoint(
    0x1f3f4,
    ...[...letters].map((letter) => 0xe0000 + letter.charCodeAt(0)),
    0xe007f,
  );
const FLAG_SCOTLAND = tagged('gbsct');
const FLAG_ENGLAND = tagged('gbeng');
const TAG_LATIN_B = String.fromCodePoint(0xe0062);
const KEYCAP_HASH = String.fromCodePoint(0x23, 0xfe0f, 0x20e3);
const KEYCAP_ASTERISK = String.fromCodePoint(0x2a, 0xfe0f, 0x20e3);
const MIDDLE_DOT = String.fromCodePoint(0xb7);
const HEBREW_CHIPS_GERESH = String.fromCodePoint(0x5e6, 0x5f3, 0x5d9, 0x5e4, 0x5e1); // with a geresh
const HEBREW_CHIPS_APOSTROPHE = String.fromCodePoint(0x5e6, 0x27, 0x5d9, 0x5e4, 0x5e1);
const HEBREW_SCHOOL_MAQAF = String.fromCodePoint(0x5d1, 0x5d9, 0x5ea, 0x5be, 0x5e1, 0x5e4, 0x5e8);
const HEBREW_SCHOOL_HYPHEN = String.fromCodePoint(0x5d1, 0x5d9, 0x5ea, 0x2d, 0x5e1, 0x5e4, 0x5e8);
const ARMENIAN_HYPHENATED = String.fromCodePoint(
  0x57d,
  0x565,
  0x582,
  0x58a,
  0x57d,
  0x57a,
  0x56b,
  0x57f,
  0x561,
  0x56f,
);
const ARMENIAN_ASCII_HYPHEN = String.fromCodePoint(
  0x57d,
  0x565,
  0x582,
  0x2d,
  0x57d,
  0x57a,
  0x56b,
  0x57f,
  0x561,
  0x56f,
);
const TIBETAN_TASHI = String.fromCodePoint(0xf56, 0xf40, 0xfb2, 0xf0b, 0xf64, 0xf72, 0xf66); // two syllables, a tsheg between
const TIBETAN_TASHI_UNBROKEN = String.fromCodePoint(
  0xf56,
  0xf40,
  0xfb2,
  0xf0c,
  0xf64,
  0xf72,
  0xf66,
); // the non-breaking tsheg
const TIBETAN_TASHI_RUN_ON = String.fromCodePoint(0xf56, 0xf40, 0xfb2, 0xf64, 0xf72, 0xf66);
const MARHABA = String.fromCodePoint(0x645, 0x631, 0x62d, 0x628, 0x627); // Arabic "hello"
const MARHABA_STRETCHED = String.fromCodePoint(
  0x645,
  0x631,
  0x62d,
  0x640,
  0x640,
  0x640,
  0x628,
  0x627,
); // with three tatweels
const FULLWIDTH_PERCENT = String.fromCodePoint(0xff05);
const KATAKANA_PERCENT = String.fromCodePoint(0x30d1, 0x30fc, 0x30bb, 0x30f3, 0x30c8); // "paasento"
const LINEAR_B_A = String.fromCodePoint(0x10000); // a letter; the first surrogate pair, D800 DC00
const BOLD_A = String.fromCodePoint(0x1d400); // MATHEMATICAL BOLD CAPITAL A: a letter with no lowercase
const BOLD_A_HIGH = String.fromCharCode(0xd835); // the high half of BOLD_A
const BOLD_A_LOW = String.fromCharCode(0xdc00); // the low half of BOLD_A
const PLANE_16_LAST = String.fromCodePoint(0x10ffff); // the last surrogate pair, DBFF DFFF
const HIGH_FIRST = String.fromCharCode(0xd800);
const HIGH_LAST = String.fromCharCode(0xdbff);
const LOW_FIRST = String.fromCharCode(0xdc00);
const LOW_LAST = String.fromCharCode(0xdfff);
const CYRILLIC_A = String.fromCodePoint(0x430);
const CYRILLIC_BE = String.fromCodePoint(0x431);
const CYRILLIC_VE = String.fromCodePoint(0x432);
const CYRILLIC_I = String.fromCodePoint(0x438); // "and"
const MODIFIER_APOSTROPHE = String.fromCodePoint(0x2bc);
const NOT_SLASH = String.fromCodePoint(0x338); // COMBINING LONG SOLIDUS OVERLAY: = + it composes to U+2260
const COMBINING_ACUTE = String.fromCodePoint(0x301);
const ROOZHA = String.fromCodePoint(0x631, 0x648, 0x632, 0x647, 0x627); // Persian "days", after a right-joining letter
const ROOZHA_HALF_SPACE = String.fromCodePoint(0x631, 0x648, 0x632, 0x200c, 0x647, 0x627);
const SRI = String.fromCodePoint(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd3); // Sinhala Sri, a conjunct through a joiner
const SRI_EXPLICIT = String.fromCodePoint(0xdc1, 0xdca, 0xdbb, 0xdd3);
const ARABIC_HEH_TEH_JOINED = String.fromCodePoint(0x647, 0x200d, 0x62a);
const MALAYALAM_PAL_LEGACY = String.fromCodePoint(0xd2a, 0xd3e, 0xd32, 0xd4d, 0x200d); // chillu l as consonant, virama, joiner
const MALAYALAM_PAL = String.fromCodePoint(0xd2a, 0xd3e, 0xd7d); // with the atomic chillu
const BENGALI_UTSAB_LEGACY = String.fromCodePoint(0x989, 0x9a4, 0x9cd, 0x200d, 0x9b8, 0x9ac);
const BENGALI_UTSAB = String.fromCodePoint(0x989, 0x9ce, 0x9b8, 0x9ac); // with the khanda ta
const MARATHI_EYELASH_RA = String.fromCodePoint(0x935, 0x93e, 0x930, 0x94d, 0x200d, 0x92f);
const MARATHI_EYELASH_RRA = String.fromCodePoint(0x935, 0x93e, 0x931, 0x94d, 0x92f);
const THAI_NAM_SPLIT = String.fromCodePoint(0xe19, 0xe49, 0xe4d, 0xe32); // water, SARA AM typed as two parts
const THAI_NAM = String.fromCodePoint(0xe19, 0xe49, 0xe33);
const FULLWIDTH_2024 = String.fromCodePoint(0xff12, 0xff10, 0xff12, 0xff14, 0x5e74);
const LIGATURE_FI = String.fromCodePoint(0xfb01);
const KANGXI_MAN = String.fromCodePoint(0x2f08);
const HAN_MAN = String.fromCodePoint(0x4eba);
const FATHATAN_ISOLATED = String.fromCodePoint(0xfe70);
const TWO_BOOKS = String.fromCodePoint(0x6211, 0x6709, 0x4e24, 0x672c, 0x4e66); // "I have two books"
const HAN_TWO = String.fromCodePoint(0x4e24);
const THAI_MI = String.fromCodePoint(0xe21, 0xe35); // ma + sara ii
const THAI_MA = String.fromCodePoint(0xe21);
const TUESDAY = String.fromCodePoint(0x633, 0x647, 0x200c, 0x634, 0x646, 0x628, 0x647); // Persian, with its half-space
const SE = String.fromCodePoint(0x633, 0x647); // "three"
const PERSIAN_THREE = String.fromCodePoint(0x6f3);
const HAN_MIDDLE = String.fromCodePoint(0x4e2d);
const COFFEE_AND_CAKE = String.fromCodePoint(
  0x30b3,
  0x30fc,
  0x30d2,
  0x30fc,
  0x26,
  0x30b1,
  0x30fc,
  0x30ad,
);
/** `count` copies of `word`, one space apart. */
const repeatedWord = (word, count) => Array.from({ length: count }, () => word).join(' ');

invariant(
  /\p{Cc}/u.test(NEXT_LINE) && !/\s/.test(NEXT_LINE),
  'NEXT LINE is not a control character outside \\s',
);
invariant(
  AATHON.startsWith(AATH) && /^\p{M}+$/u.test(AATHON.slice(AATH.length)),
  'AATHON is not AATH followed by combining marks',
);
invariant(/\p{M}$/u.test(AATE), 'AATE does not end in a combining mark');
invariant(
  J_WITH_CARON !== CAPITAL_J_CARON.toLowerCase(),
  'the j-caron forms were already the same',
);
invariant(
  CAPITAL_J_CARON.toLowerCase().normalize('NFC') === J_WITH_CARON,
  'lowercase j + caron does not compose to U+01F0',
);
invariant(GRINNING_FACE.length === 2, 'the emoji is not an astral character');

const dc = (over = {}) => ({
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc-lisbon',
  title: 'Listen and type the sentence',
  transcript: "It isn't raining in Lisbon today.",
  media: { type: 'audio', url: 'https://cdn.example/lisbon.mp3', alt: 'Recording' },
  ...over,
});

const typed = (text, hintsRevealed) => ({
  type: 'dictation',
  text,
  ...(hintsRevealed === undefined ? {} : { hintsRevealed }),
});

const rules = (...pairs) => ({ equivalences: pairs.map(([from, to]) => ({ from, to })) });

/** 2000 characters against 2003 with 601 substitutions: raw 0.69995…, "70%" once rounded. */
const TIE_TRANSCRIPT = 'a'.repeat(2000);
const TIE_ATTEMPT = `${'a'.repeat(1402)}${'b'.repeat(601)}`;

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

/**
 * A returned grade on a scale that is not 0..1 and not a whole number, built as
 * the verbatim mirror `outcomeFromGrade` stored before 0.18, so it can also
 * carry numbers that are not a grade at all.
 *
 * `earned()` divides by `outcome.maxScore`, and every other graded vector uses a
 * maxScore of exactly 1 — so a mutant reading the score against 1 changed
 * nothing the corpus could see, while a grader reporting 0.4 out of 0.5 would
 * have been re-scaled against the wrong denominator.
 */
const gradedOutOf = (score, maxScore) => ({
  status: 'graded',
  grade: { score, maxScore, passed: score / maxScore >= 0.7, feedback: null },
  score,
  maxScore,
  passed: score / maxScore >= 0.7,
  feedback: null,
});

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

// -- Read aloud --------------------------------------------------------------

/** The text every read-aloud fixture asks for: six words, with "the" read twice. */
const READ_SENTENCE = 'the cat sat on the mat';
/** The storage key of the recording the fixtures submit. */
const TAKE_KEY = 'take-1';

const ra = (over = {}) => ({
  schemaVersion: '1.0',
  type: 'read-aloud',
  id: 'ra-sentence',
  title: 'Read the sentence aloud',
  referenceText: READ_SENTENCE,
  locale: 'en-US',
  recording: { maxSeconds: 30 },
  scoring: {
    dimensions: [
      { name: 'accuracy', weight: 2 },
      { name: 'fluency', weight: 1 },
    ],
  },
  ...over,
});

/** A response carrying a stored recording. */
const recorded = (key = TAKE_KEY) => ({
  type: 'read-aloud',
  recording: { key, mimeType: 'audio/wav' },
});
/** A response the learner submitted without recording. */
const BLANK_TAKE = { type: 'read-aloud', recording: null };

/** One assessor word: read as written, and not measured, unless said otherwise. */
const heard = (text, over = {}) => ({ text, error: 'none', ...over });
/** The sentence read as written, every word measured. */
const readWords = () => READ_SENTENCE.split(' ').map((text) => heard(text, { accuracy: 90 }));

const assessed = (over = {}) => ({
  assessmentVersion: '1.0',
  status: 'assessed',
  task: 'scripted',
  locale: 'en-US',
  referenceText: READ_SENTENCE,
  recordingKey: TAKE_KEY,
  assessor: { kind: 'auto', id: 'pronunciation-engine' },
  scale: 100,
  scores: { accuracy: 80, fluency: 70 },
  recognizedText: READ_SENTENCE,
  miscue: 'assessor',
  words: readWords(),
  ...over,
});

/** A scripted assessment of `text`, with the words an assessor reported for it. */
const assessedAs = (text, spokenWords, over = {}) =>
  assessed({ referenceText: text, recognizedText: text, words: spokenWords, ...over });

/**
 * Grading options. The measurement and the plausibility policy are ordinary
 * round numbers and are not a recommendation: an application measures its own
 * microphones and sets its own floor.
 */
const measuredTake = (over = {}) => ({
  measured: { durationMs: 4000, voicedMs: 2500 },
  plausibility: { maxWordsPerSecond: 6, minVoicedMs: 500 },
  ...over,
});

/** One refusal: what `gradeReadAloud` does with evidence it cannot tie to the take. */
const refusal = (code, over = {}, note) => ({
  id: `gradeReadAloud/ra/unscorable/${code}`,
  fn: 'gradeReadAloud',
  args: [
    over.data ?? ra(),
    over.response ?? recorded(),
    over.assessment ?? assessed(),
    over.options ?? measuredTake(),
  ],
  ignore: ['reason'],
  ...(note ? { note } : {}),
});

/**
 * `count` assessor words of `length` characters each, read as written.
 *
 * The text is one letter repeated because these fixtures are about how much
 * text an assessment carries, not what it says: a word that spelled anything
 * would invite a reader to look for meaning in a pairing that has none.
 */
const spelled = (count, length) =>
  Array.from({ length: count }, () => heard('p'.repeat(length), { accuracy: 90 }));

/** A text of `count` words, each one distinct, so a mark names the word it landed on. */
const reading = (count) =>
  Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');

/** One character that stands for four words: it NFKC expands to 18 characters. */
const MANY_WORDS = String.fromCodePoint(0xfdfa);
invariant(
  MANY_WORDS.length === 1 && MANY_WORDS.normalize('NFKC').length === 18,
  'U+FDFA no longer expands to eighteen characters',
);

/** `count` assessor words of `length` characters, each of which stands for several. */
const expanding = (count, length) =>
  Array.from({ length: count }, () => heard(MANY_WORDS.repeat(length), { accuracy: 90 }));

/** The same words, tagged as text the assessor heard that the item never asked for. */
const insertions = (words) => words.map((word) => ({ ...word, error: 'insertion' }));

/** `count` words written as `letters` letters and `dots` full stops, which marking drops. */
const punctuated = (count, letters, dots) =>
  Array.from({ length: count }, () =>
    heard(`${'p'.repeat(letters)}${'.'.repeat(dots)}`, { accuracy: 90 }),
  );

// -- WAV bytes ---------------------------------------------------------------
//
// Recordings small enough to read in the diff: 8 kHz, at most 25 ms, and every
// sample written here rather than sampled from a file. The waveform is a square
// wave of whole numbers, so no vector depends on an engine's `Math.sin`.

const asciiBytes = (text) => [...text].map((character) => character.charCodeAt(0));
const u16 = (value) => [value & 0xff, (value >>> 8) & 0xff];
const u32 = (value) => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];
const i16 = (value) => u16(value < 0 ? value + 0x10000 : value);

/** The two `fmt ` body sizes a reader recognises, and the tag that asks for the longer one. */
const FMT_BYTES = 16;
const EXTENSIBLE_BYTES = 40;
const FORMAT_EXTENSIBLE = 0xfffe;

/** A chunk: its id, the size of its body, the body, and the pad byte an odd size carries. */
const chunk = (id, body, declared = body.length) => [
  ...asciiBytes(id),
  ...u32(declared),
  ...body,
  ...(body.length % 2 === 1 ? [0] : []),
];

/** The `RIFF`/`WAVE` wrapper around already-built chunks. */
const riff = (chunks) =>
  new Uint8Array([
    ...asciiBytes('RIFF'),
    ...u32(chunks.length + 4),
    ...asciiBytes('WAVE'),
    ...chunks,
  ]);

/** A `fmt ` body, with the WAVE_FORMAT_EXTENSIBLE tail when it is asked for. */
const fmtBody = ({
  audioFormat = 1,
  channels = 1,
  sampleRate = 8000,
  bitsPerSample = 16,
  blockAlign = (channels * bitsPerSample) / 8,
  subFormat = 1,
  extensible = false,
} = {}) => {
  const body = [
    ...u16(audioFormat),
    ...u16(channels),
    ...u32(sampleRate),
    ...u32(sampleRate * blockAlign),
    ...u16(blockAlign),
    ...u16(bitsPerSample),
  ];
  return extensible
    ? [
        ...body,
        ...u16(22),
        ...u16(bitsPerSample),
        ...u32(channels === 1 ? 0x4 : 0x3),
        ...u16(subFormat),
        // The rest of the SubFormat GUID: the fixed KSDATAFORMAT_SUBTYPE tail.
        ...u16(0),
        ...u32(0x00100000),
        ...u32(0xaa000080),
        ...u32(0x719b3800),
      ]
    : body;
};

/** A whole WAV of `samples`, interleaved. `declared` overrides the size the data chunk claims. */
const wav = (samples, options = {}, declared) =>
  riff([...chunk('fmt ', fmtBody(options)), ...chunk('data', samples.flatMap(i16), declared)]);

/** `count` samples all of the same value. */
const level = (count, value) => Array.from({ length: count }, () => value);

/** `count` samples of digital silence. */
const quiet = (count) => level(count, 0);

/** A square wave: every sample is the amplitude or its negative, so a window has a level. */
const tone = (frames, { period = 20, amplitude = 8192 } = {}) =>
  Array.from({ length: frames }, (_, frame) =>
    frame % period < period / 2 ? amplitude : -amplitude,
  );

/** One 20 ms window at 8 kHz, and the silence floor the cases measure against. */
const INSPECTION = { silenceDbfs: -50, frameMs: 20 };
const WINDOW_FRAMES = 160;

/** A `fmt ` chunk declaring 16 bytes with only 4 of them present. */
const FMT_CUT_SHORT = new Uint8Array([
  ...asciiBytes('RIFF'),
  ...u32(16),
  ...asciiBytes('WAVE'),
  ...asciiBytes('fmt '),
  ...u32(FMT_BYTES),
  ...u16(1),
  ...u16(1),
]);

/** A `fmt ` chunk declaring the extensible 40 bytes with only the plain 16 present. */
const EXTENSIBLE_CUT_SHORT = new Uint8Array([
  ...asciiBytes('RIFF'),
  ...u32(28),
  ...asciiBytes('WAVE'),
  ...asciiBytes('fmt '),
  ...u32(EXTENSIBLE_BYTES),
  ...fmtBody({ audioFormat: FORMAT_EXTENSIBLE }),
]);

/** Half a window of silence, then half a window of tone, in both channels. */
const STEREO_LATE_TONE = [...quiet(80), ...tone(40).flatMap((sample) => [sample, sample])];

/**
 * Stereo, 160 frames: 100 of silence and 60 of tone. Measured in 10 ms windows
 * it is two windows, and the tone is in the second one alone.
 */
const STEREO_TWO_WINDOWS = [...quiet(200), ...tone(60).flatMap((sample) => [sample, sample])];

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
    // The shared allOrNothingStrategy returning 1. Every other all-or-nothing
    // vector scoring full marks is multiple-choice, which inlines its own
    // logic and never reaches the strategy — so the mutation harness could
    // turn `? 1 : 0` into `? 0 : 0`, silently zeroing every fill-in-the-blanks
    // and gap-select paper marked that way, and all 231 vectors still passed.
    id: 'score/fib/all-or-nothing/every-blank-right',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      fib({ scoringStrategy: 'all-or-nothing' }),
      fill({ b1: 'a', b2: 'the', b3: 'the' }),
    ],
  },
  {
    id: 'score/fib/all-or-nothing/empty-blank-list',
    fn: 'score',
    args: [
      'fill-in-the-blanks',
      fib({ scoringStrategy: 'all-or-nothing', passage: 'Nothing to fill.', blanks: [] }),
      fill({}),
    ],
  },
  // -- Gap select. Registered in 0.10.0 and frozen here for the first time: a
  //    type that decides grades had no vector of any kind, so nothing stopped
  //    a change to scoreGapSelect from re-marking stored papers.
  {
    id: 'score/gs/partial/both-right',
    fn: 'score',
    args: ['gap-select', gs(), choose({ a: 'from', b: 'from' })],
  },
  {
    id: 'score/gs/partial/one-right',
    fn: 'score',
    args: ['gap-select', gs(), choose({ a: 'from', b: 'to' })],
  },
  {
    id: 'score/gs/partial/unanswered-gap',
    fn: 'score',
    args: ['gap-select', gs(), choose({ a: 'from' })],
  },
  {
    id: 'score/gs/partial/empty-string-is-unanswered',
    fn: 'score',
    args: ['gap-select', gs(), choose({ a: 'from', b: '' })],
  },
  {
    id: 'score/gs/partial/choice-never-offered',
    fn: 'score',
    args: ['gap-select', gs(), choose({ a: 'smuggled', b: 'from' })],
  },
  {
    id: 'score/gs/all-or-nothing/both-right',
    fn: 'score',
    args: [
      'gap-select',
      gs({ scoringStrategy: 'all-or-nothing' }),
      choose({ a: 'from', b: 'from' }),
    ],
  },
  {
    id: 'score/gs/all-or-nothing/one-wrong',
    fn: 'score',
    args: ['gap-select', gs({ scoringStrategy: 'all-or-nothing' }), choose({ a: 'from', b: 'to' })],
  },
  {
    id: 'score/gs/own-choices-not-a-bank',
    fn: 'score',
    args: [
      'gap-select',
      gs({
        passage: 'The sky is {{a}}.',
        banks: undefined,
        gaps: [
          {
            id: 'a',
            choices: [
              { id: 'blue', text: 'blue' },
              { id: 'red', text: 'red' },
            ],
            correctChoiceId: 'blue',
          },
        ],
      }),
      choose({ a: 'blue' }),
    ],
  },
  {
    id: 'score/gs/missing-bank-scores-zero',
    fn: 'score',
    args: ['gap-select', gs({ banks: [] }), choose({ a: 'from', b: 'from' })],
  },
  {
    id: 'evaluate/gs/scored',
    fn: 'evaluate',
    args: [gs(), choose({ a: 'from', b: 'from' })],
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

  // The two early exits, and the loop's first row. Every other levenshtein
  // vector compares strings of 3 characters or more, so `a.length === 0` could
  // become `=== 1`, `b.length === 0` the same, and the row counter could start
  // at 0 instead of 1, with the whole corpus still green.
  { id: 'levenshteinDistance/one-char-vs-longer', fn: 'levenshteinDistance', args: ['a', 'ab', 2] },
  { id: 'levenshteinDistance/longer-vs-one-char', fn: 'levenshteinDistance', args: ['ab', 'a', 2] },
  { id: 'levenshteinDistance/one-char-each', fn: 'levenshteinDistance', args: ['a', 'b', 2] },
  { id: 'levenshteinDistance/empty-vs-one-char', fn: 'levenshteinDistance', args: ['', 'a', 2] },
  { id: 'levenshteinDistance/one-char-vs-empty', fn: 'levenshteinDistance', args: ['a', '', 2] },
  {
    id: 'matchText/levenshtein/one-char-typo',
    fn: 'matchText',
    args: ['a', ['b'], { levenshtein: 1 }],
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
    // A section that HAS a title. Every other compose vector leaves it out, so
    // the conditional spread that carries it could be inverted — dropping an
    // authored section title from the result — with nothing to notice.
    id: 'composeAssessmentScore/section-with-title',
    fn: 'composeAssessmentScore',
    args: [[section('a', 1, [item('a1', 1, scoredOutcome(1))], { title: 'Reading' })], policy()],
  },
  {
    // A grader reporting a grade out of 0.5, not out of 1 or 100.
    id: 'composeAssessmentScore/graded/max-score-below-one',
    fn: 'composeAssessmentScore',
    args: [[section('a', 1, [item('a1', 1, gradedOutOf(0.4, 0.5))])], policy()],
  },
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
    // Only the weight SUM used to be checked. A negative weight beside larger
    // positive ones leaves it positive and carries the total out of [0,1],
    // where the float-noise clamp made it a real 0 or a perfect 1.
    [
      'negative-weight-pulls-total-down',
      [
        { name: 'A', score: 0, weight: 2 },
        { name: 'B', score: 1, weight: -1 },
      ],
    ],
    [
      'negative-weight-pushes-total-up',
      [
        { name: 'A', score: 1, weight: 2 },
        { name: 'B', score: 0, weight: -1 },
      ],
    ],
    // Finite weights whose sum is Infinity: every criterion divided into 0.
    [
      'weight-sum-overflows',
      [
        { name: 'A', score: 1, weight: 1e308 },
        { name: 'B', score: 0, weight: 1e308 },
      ],
    ],
  ].map(([name, criteria]) => ({
    id: `gradeFromRubric/unscorable/${name}`,
    fn: 'gradeFromRubric',
    args: [criteria],
    ignore: ['reason'],
  })),
  {
    id: 'gradeFromRubric/negative-weight-outside-the-arithmetic-ignored',
    fn: 'gradeFromRubric',
    args: [
      [
        { name: 'Task', score: 0.8, weight: 1 },
        { name: 'Grammar', score: 0.1, weight: -1, notApplicable: true },
        { name: 'Style', band: 'B2', weight: -1 },
      ],
    ],
    note: 'A weight is read only where it enters the arithmetic, as score and maxScore are: not applicable and band-only criteria keep being ignored.',
  },
  {
    id: 'composeAssessmentScore/item-max-score-zero',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 2, scoredOutcome(0.5, 0)), item('a2', 2, scoredOutcome(1))])],
      policy(),
    ],
    note: 'An outcome claiming maxScore 0 is not a grade. Until 0.18 it was read against 1 (0.5 counted as 0.5 and the result went final); it is now held provisional and reported in rejectedSlotIds. Re-frozen deliberately: the one existing vector the change moves.',
  },

  // A returned grade whose numbers cannot be one. `outcomeFromGrade` used to
  // mirror any record, and `composeAssessmentScore` then divided by it, so NaN
  // composed to a final NaN and 85 "out of 1" to a final pass. `gradedOutOf`
  // builds the outcome those releases STORED (a verbatim mirror), because that
  // is what a database already holds and what a re-grade will compose.
  ...[
    ['nan-score', Number.NaN, 1],
    ['infinite-score', Number.POSITIVE_INFINITY, 1],
    ['zero-max-score', 0, 0],
    ['negative-score', -0.5, 1],
    ['raw-points-85-of-1', 85, 1],
    ['just-past-float-noise', 1 + 2e-9, 1],
    ['a-hair-below-zero', -1e-10, 1],
    ['numeric-string-score', '0.85', 1],
    ['negative-max-score', 0.5, -1],
    ['nan-max-score', 0.5, Number.NaN],
    ['infinite-max-score', 0.5, Number.POSITIVE_INFINITY],
  ].map(([name, score, maxScore]) => ({
    id: `outcomeFromGrade/rejected/${name}`,
    fn: 'outcomeFromGrade',
    args: [{ score, maxScore, passed: true, feedback: 'Excellent.' }],
    note: 'Not a grade: returned as deferred with reason grade_rejected and the record kept verbatim on rejectedGrade, never mirrored as graded.',
  })),
  ...[
    ['exactly-zero', 0, 1],
    ['float-noise-above-one', 1 + 1e-10, 1],
    ['exact-edge-of-float-noise', 1e9 + 1, 1e9],
  ].map(([name, score, maxScore]) => ({
    id: `outcomeFromGrade/accepted/${name}`,
    fn: 'outcomeFromGrade',
    args: [{ score, maxScore, passed: true, feedback: 'Excellent.' }],
    note: 'In range, so mirrored exactly as before, unclamped. Float noise is up to one part in a billion above maxScore; 1 past 1e9 is that edge exactly.',
  })),
  {
    id: 'composeAssessmentScore/rejected/nan-grade',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 1, [
          item('a1', 1, scoredOutcome(1)),
          item('a2', 1, gradedOutOf(Number.NaN, 1)),
        ]),
      ],
      policy(),
    ],
    note: 'Was final with a NaN score (null in JSON) and a passing section scored null. Now provisional, passed null, the slot pending and rejected.',
  },
  {
    id: 'composeAssessmentScore/rejected/infinite-grade',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 1, [
          item('a1', 1, scoredOutcome(1)),
          item('a2', 1, gradedOutOf(Number.POSITIVE_INFINITY, 1)),
        ]),
      ],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/rejected/raw-points-85-of-1',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 1, scoredOutcome(1)), item('a2', 1, gradedOutOf(85, 1))])],
      policy({ sectionThreshold: 0.6 }),
    ],
    note: 'Was final, score 43, passed. A grader returning raw points against maxScore 1 is out of contract.',
  },
  {
    id: 'composeAssessmentScore/rejected/negative-grade',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 1, scoredOutcome(1)), item('a2', 1, gradedOutOf(-0.5, 1))])],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/rejected/failing-grade-out-of-zero',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 1, scoredOutcome(1)), item('a2', 1, gradedOutOf(0.3, 0))])],
      policy(),
    ],
    note: 'Why rejected is not unscorable: dropping this failing grade would record the attempt as a final pass on the other item alone.',
  },
  {
    id: 'composeAssessmentScore/rejected/zero-out-of-zero',
    fn: 'composeAssessmentScore',
    args: [
      [section('a', 1, [item('a1', 1, scoredOutcome(1)), item('a2', 1, scoredOutcome(0, 0))])],
      policy(),
    ],
    note: 'Nothing out of nothing is still out of 0: maxScore must be above 0, not merely at least 0.',
  },
  {
    id: 'composeAssessmentScore/rejected/outcome-from-grade-refusal',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 1, [
          item('a1', 1, scoredOutcome(1)),
          item('a2', 1, {
            status: 'deferred',
            reason: 'grade_rejected',
            maxScore: 1,
            rejectedGrade: { score: 85, maxScore: 1, passed: true, feedback: null },
          }),
          item('a3', 1, deferredOutcome()),
        ]),
      ],
      policy(),
    ],
    note: 'The outcome outcomeFromGrade now returns for a refused record: pending AND rejected. An ordinary deferred slot is pending only.',
  },
  {
    id: 'composeAssessmentScore/rejected/named-on-its-own-section',
    fn: 'composeAssessmentScore',
    args: [
      [
        section('a', 1, [item('a1', 1, scoredOutcome(0.5))]),
        section('b', 1, [item('b1', 1, gradedOutOf(85, 1)), item('b2', 1, scoredOutcome(1))]),
      ],
      policy(),
    ],
  },
  {
    id: 'composeAssessmentScore/accepted/float-noise-above-one',
    fn: 'composeAssessmentScore',
    args: [[section('a', 1, [item('a1', 1, gradedOutOf(1 + 1e-10, 1))])], policy()],
    note: 'A hair over 1 is float noise: counted, final, and its earned points unclamped, exactly as before.',
  },
  {
    id: 'composeAssessmentScore/accepted/exact-edge-of-float-noise',
    fn: 'composeAssessmentScore',
    args: [[section('a', 1, [item('a1', 1, gradedOutOf(1e9 + 1, 1e9))])], policy()],
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

  // -- Dictation: character similarity over the whole sentence -------------
  // Every default a later release could "improve" — the punctuation rule, the
  // quote fold, NFC, code points, the single-division similarity, both
  // alignment tie orders, the caps — is a frozen grade.
  {
    id: 'score/dc/exact',
    fn: 'score',
    args: ['dictation', dc(), typed("It isn't raining in Lisbon today.")],
  },
  {
    id: 'score/dc/case-and-sentence-punctuation',
    fn: 'score',
    args: ['dictation', dc(), typed("it isn't raining in lisbon today")],
  },
  { id: 'score/dc/empty-attempt', fn: 'score', args: ['dictation', dc(), typed('')] },
  {
    id: 'score/dc/whitespace-only-attempt',
    fn: 'score',
    args: ['dictation', dc(), typed(`  \t${NBSP}\n`)],
  },
  {
    id: 'score/dc/punctuation-only-attempt',
    fn: 'score',
    args: ['dictation', dc(), typed('... ?!')],
  },
  {
    id: 'score/dc/inner-whitespace-collapsed',
    fn: 'score',
    args: ['dictation', dc(), typed(`It  isn't\training\nin${NBSP}Lisbon today.`)],
    note: 'Extra spaces, tabs, newlines and a no-break space are not spelling. The reference implementation charged an edit for each.',
  },
  {
    id: 'score/dc/nfd-attempt-equals-nfc',
    fn: 'score',
    args: ['dictation', dc({ transcript: `caf${COMPOSED_E}` }), typed(`caf${DECOMPOSED_E}`)],
    note: 'The same letter typed as a base plus a combining accent is the same letter.',
  },
  {
    id: 'score/dc/nfc-after-strip',
    fn: 'score',
    args: ['dictation', dc({ transcript: `caf${COMPOSED_E}` }), typed(CAFE_SPLIT)],
    note: 'A format character between a base letter and its accent is removed, and the two then compose: NFC runs last as well as first.',
  },
  {
    id: 'score/dc/lowercase-then-compose',
    fn: 'score',
    args: ['dictation', dc({ transcript: J_WITH_CARON }), typed(CAPITAL_J_CARON)],
    note: 'Lowercasing J + caron gives j + caron, which NFC composes to one code point; the transcript already holds that code point.',
  },
  {
    id: 'score/dc/curly-apostrophe-folded',
    fn: 'score',
    args: ['dictation', dc(), typed(`It isn${CURLY_APOSTROPHE}t raining in Lisbon today.`)],
  },
  {
    id: 'score/dc/acute-accent-as-apostrophe-folded',
    fn: 'score',
    args: ['dictation', dc(), typed(`It isn${ACUTE_ACCENT}t raining in Lisbon today.`)],
    note: 'U+00B4 is a symbol, not punctuation, so it would survive the strip; it is folded to the apostrophe instead.',
  },
  {
    id: 'score/dc/format-char-stripped',
    fn: 'score',
    args: ['dictation', dc(), typed(`It${ZERO_WIDTH_SPACE} isn't raining in Lisbon today.`)],
  },
  {
    id: 'score/dc/one-letter-typo',
    fn: 'score',
    args: ['dictation', dc(), typed("It isn't raining in Lisbom today.")],
  },
  {
    id: 'score/dc/missing-word',
    fn: 'score',
    args: ['dictation', dc(), typed("It isn't raining in today.")],
  },
  {
    id: 'score/dc/extra-word',
    fn: 'score',
    args: ['dictation', dc(), typed("It isn't really raining in Lisbon today.")],
  },
  {
    id: 'score/dc/transposed-words',
    fn: 'score',
    args: ['dictation', dc(), typed("It isn't raining today in Lisbon.")],
  },
  {
    id: 'score/dc/accent-dropped-partial-credit',
    fn: 'score',
    args: ['dictation', dc({ transcript: `${ESTA} bien` }), typed('esta bien')],
    note: 'A missing accent is one edit, not a wrong word: character similarity is forgiving of it by design, and documented as such.',
  },
  {
    id: 'score/dc/intra-word-hyphen-kept',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'a well-known author' }), typed('a wellknown author')],
  },
  {
    id: 'score/dc/unicode-hyphen-folded',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'a well-known author' }),
      typed(`a well${UNICODE_HYPHEN}known author`),
    ],
  },
  {
    id: 'score/dc/hyphen-vs-space',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'a well-known author' }), typed('a well known author')],
  },
  {
    id: 'score/dc/trailing-apostrophe-stripped',
    fn: 'score',
    args: ['dictation', dc({ transcript: "the students' books" }), typed('the students books')],
    note: 'An apostrophe with no letter after it is punctuation, not spelling.',
  },
  {
    id: 'score/dc/slash-joins-words',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'answer yes/no' }), typed('answer yes no')],
    note: 'A slash is punctuation and is removed without leaving a space, so "yes/no" is one word: pinned as the sharp edge it is.',
  },
  {
    id: 'score/dc/ampersand-is-punctuation',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'rock and roll' }), typed('rock & roll')],
    note: '"&" is Unicode punctuation and is removed; without an equivalence naming it, this attempt is one word short of three.',
  },
  {
    id: 'score/dc/dollar-is-symbol-kept',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'it costs $5' }), typed('it costs 5')],
    note: 'A currency sign is a symbol, never removed, so leaving it out is an edit.',
  },
  {
    id: 'score/dc/number-punctuation-removed',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'pi is 3.14' }), typed('pi is 314')],
  },
  {
    id: 'score/dc/equivalence/contraction-both-sides',
    fn: 'score',
    args: [
      'dictation',
      dc({ tolerance: rules(["isn't", 'is not']) }),
      typed('It is not raining in Lisbon today.'),
    ],
  },
  {
    id: 'score/dc/equivalence/word-boundary-does-not-fire-inside-word',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: "Roche's office is closed.", tolerance: rules(["he's", 'he is']) }),
      typed('Roche is office is closed.'),
    ],
    note: 'A rule rewrites whole words only. The reference implementation rewrote inside words and awarded full credit here.',
  },
  {
    id: 'score/dc/equivalence/symbol-before-punctuation',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'rock and roll', tolerance: rules(['&', 'and']) }),
      typed('rock & roll'),
    ],
  },
  {
    id: 'score/dc/equivalence/multi-word-from-across-double-space',
    fn: 'score',
    args: [
      'dictation',
      dc({ tolerance: rules(['is not', "isn't"]) }),
      typed('It is  not raining in Lisbon today.'),
    ],
  },
  {
    id: 'score/dc/equivalence/multi-word-from-across-newline',
    fn: 'score',
    args: [
      'dictation',
      dc({ tolerance: rules(['is not', "isn't"]) }),
      typed('It is\nnot raining in Lisbon today.'),
    ],
    note: 'Rules run after whitespace is collapsed, so a two-word `from` matches across any whitespace.',
  },
  {
    id: 'score/dc/equivalence/to-is-literal',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'the $$', tolerance: rules(['price', '$$']) }),
      typed('the price'),
    ],
    note: '`to` is inserted as text: `$$` is two dollar signs, not a replacement pattern.',
  },
  {
    id: 'score/dc/equivalence/dollar-ampersand-is-text',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'the $', tolerance: rules(['price', '$&']) }),
      typed('the price'),
    ],
    note: '`$&` inserts a dollar sign, a symbol, and an ampersand, which is punctuation and removed like any other.',
  },
  {
    id: 'score/dc/equivalence/order-matters',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'c', tolerance: rules(['a', 'b'], ['b', 'c']) }),
      typed('a'),
    ],
    note: 'Rules apply in listed order, each to the output of the one before: a -> b -> c.',
  },
  {
    id: 'score/dc/equivalence/applied-once',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'c', tolerance: rules(['b', 'c'], ['a', 'b']) }),
      typed('a'),
    ],
    note: 'The same rules in the other order: a -> b, and the rule before it never sees the result.',
  },
  {
    id: 'score/dc/accepted-transcript/best-of',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'The colour of the sky.', acceptedTranscripts: ['The color of the sky.'] }),
      typed('the color of the sky'),
    ],
  },
  {
    id: 'score/dc/accepted-transcript/tie-picks-transcript',
    fn: 'alignDictation',
    args: [{ transcript: 'ab', acceptedTranscripts: ['ac'] }, 'ax'],
    note: 'One edit from each candidate: the transcript wins the tie, so candidateIndex is 0.',
  },
  {
    id: 'score/dc/astral-code-point',
    fn: 'score',
    args: ['dictation', dc({ transcript: `I love it ${GRINNING_FACE}` }), typed('I love it')],
    note: 'The emoji is one code point (two UTF-16 units): 11 characters, two of them missing (the space before the emoji, and the emoji).',
  },
  {
    id: 'score/dc/lone-surrogate',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'ab' }), typed(`a${LONE_SURROGATE}b`)],
    note: 'A lone surrogate is read as U+FFFD, the replacement character: one character, never rejected.',
  },
  {
    id: 'score/dc/dotted-capital-i-lowercase',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'istanbul' }), typed(`${DOTTED_CAPITAL_I}stanbul`)],
    note: 'Locale-insensitive toLowerCase, as the reference implementation: the dotted capital I lowercases to i plus a combining dot, one edit.',
  },
  {
    id: 'score/dc/both-empty-after-stale-transcript',
    fn: 'score',
    args: ['dictation', dc({ transcript: '...' }), typed('')],
    note: 'Reachable on stale data only (the schema refuses the transcript): no candidate survives, so the score is 0 and there are no details.',
  },
  {
    id: 'score/dc/stale-transcript-accepted-wins',
    fn: 'alignDictation',
    args: [{ transcript: '...', acceptedTranscripts: ['the cat'] }, 'the cat'],
    note: 'candidateIndex is the ORIGINAL position: 1 names acceptedTranscripts[0].',
  },
  {
    id: 'score/dc/truncated-at-max-text-length',
    fn: 'alignDictation',
    args: [{ transcript: 'a' }, 'a'.repeat(8001)],
  },
  {
    id: 'score/dc/at-max-text-length-not-truncated',
    fn: 'alignDictation',
    args: [{ transcript: 'a' }, 'a'.repeat(8000)],
    note: 'Exactly the cap is not over it: the boundary of the truncation, pinned.',
  },
  {
    id: 'score/dc/stale-rule-without-a-string-is-ignored',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'c',
        tolerance: {
          equivalences: [
            { from: 'a', to: 5 },
            { from: 'b', to: 'c' },
          ],
        },
      },
      'b',
    ],
    note: 'A rule the schema would refuse (stale data) is skipped, never thrown on: the exam scorer must not crash on a stored row.',
  },
  {
    id: 'score/dc/truncated-after-normalisation',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules(['&', 'x'.repeat(39)]) },
      '& '.repeat(3999).concat('&'),
    ],
    note: '7,999 code points that a rule expands past the working bound: the working cut sets the flag, and the attempt, cut at 8,000 on a space, ends before it with no empty word.',
  },
  {
    id: 'score/dc/chained-rules-are-bounded',
    fn: 'score',
    args: [
      'dictation',
      dc({
        transcript: 'd',
        tolerance: rules(
          ['a', repeatedWord('b', 100)],
          ['b', repeatedWord('c', 100)],
          ['c', repeatedWord('d', 100)],
        ),
      }),
      typed('a'),
    ],
    note: 'Three rules that would grow one letter to a million words: the working text is cut at twice the attempt cap after every rule, so the scorer finishes.',
  },
  {
    id: 'alignDictation/dc/working-text-cut-is-reported',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'c',
        tolerance: rules(['a', repeatedWord('b', 100)], [repeatedWord('b', 100), 'c']),
      },
      repeatedWord('a', 4000),
    ],
    note: 'The first rule grows 4,000 words past the working bound, which stops the rewrite early and cuts at 16,000; the second shrinks the 80 groups left to 80 words. The result is short, and truncated is still true, because text was cut.',
  },
  {
    id: 'alignDictation/dc/working-text-at-its-bound-is-not-cut',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'c',
        tolerance: rules(['a', repeatedWord('b', 100)], [repeatedWord('b', 100), 'c']),
      },
      `${'x'.repeat(200)} ${repeatedWord('a', 79)}`,
    ],
    note: 'The first rule grows 358 code points to exactly 16,000, twice the attempt cap: at the bound, not past it, so nothing is cut, the second rule shrinks every group, and truncated stays false.',
  },
  {
    id: 'alignDictation/dc/working-text-one-past-its-bound-is-cut',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'c',
        tolerance: rules(['a', repeatedWord('b', 100)], [repeatedWord('b', 100), 'c']),
      },
      `${'x'.repeat(201)} ${repeatedWord('a', 79)}`,
    ],
    note: 'One code point longer: 16,001 is cut to 16,000, which takes the last letter of the last group, so the second rule leaves that group alone; truncated is true because text was cut.',
  },
  {
    id: 'alignDictation/dc/stale-rules-past-the-hundredth-are-ignored',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'y',
        tolerance: {
          equivalences: [
            ...Array.from({ length: 100 }, (_, index) => ({ from: `q${index}`, to: 'r' })),
            { from: 'x', to: 'y' },
          ],
        },
      },
      'x',
    ],
    note: 'The 101st rule is not read (the schema refuses more than 100): stale data cannot slow a grading run.',
  },
  {
    id: 'alignDictation/dc/the-hundredth-rule-applies',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'y',
        tolerance: {
          equivalences: [
            ...Array.from({ length: 99 }, (_, index) => ({ from: `q${index}`, to: 'r' })),
            { from: 'x', to: 'y' },
          ],
        },
      },
      'x',
    ],
    note: 'The boundary of the rule count, pinned.',
  },
  {
    id: 'alignDictation/dc/stale-rule-with-an-oversized-from-is-ignored',
    fn: 'alignDictation',
    args: [{ transcript: 'y', tolerance: rules(['x'.repeat(201), 'y']) }, 'x'.repeat(201)],
  },
  {
    id: 'alignDictation/dc/rule-with-from-at-the-cap-applies',
    fn: 'alignDictation',
    args: [{ transcript: 'y', tolerance: rules(['x'.repeat(200), 'y']) }, 'x'.repeat(200)],
  },
  {
    id: 'alignDictation/dc/stale-rule-with-an-oversized-to-is-ignored',
    fn: 'alignDictation',
    args: [{ transcript: 'y'.repeat(201), tolerance: rules(['x', 'y'.repeat(201)]) }, 'x'],
  },
  {
    id: 'alignDictation/dc/rule-with-to-at-the-cap-applies',
    fn: 'alignDictation',
    args: [{ transcript: 'y'.repeat(200), tolerance: rules(['x', 'y'.repeat(200)]) }, 'x'],
  },
  {
    id: 'alignDictation/dc/astral-rule-at-the-cap-applies',
    fn: 'alignDictation',
    args: [
      { transcript: GRINNING_FACE.repeat(200), tolerance: rules(['x', GRINNING_FACE.repeat(200)]) },
      'x',
    ],
    note: 'Two hundred emoji are 200 code points and 400 UTF-16 units: at the cap, so the rule applies.',
  },
  {
    id: 'alignDictation/dc/a-one-letter-rule-does-not-rewrite-inside-a-word',
    fn: 'alignDictation',
    args: [{ transcript: 'ba', tolerance: rules(['a', 'c']) }, 'ba'],
    note: 'The boundary before a one-letter rule is required too: "a" inside "ba" is not a word.',
  },
  {
    id: 'score/dc/control-characters-are-removed',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'hello world' }),
      typed(`hel${NULL_CHARACTER}lo${BELL} world`),
    ],
  },
  {
    id: 'score/dc/next-line-is-spacing',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'hello world' }), typed(`hello${NEXT_LINE}world`)],
  },
  {
    id: 'alignDictation/dc/a-rule-does-not-rewrite-a-word-with-combining-marks',
    fn: 'alignDictation',
    args: [{ transcript: `${AATHON} ${DIN}`, tolerance: rules([AATH, '8']) }, `8 ${DIN}`],
    note: 'A combining mark belongs to its word: the rule for "eight" leaves "all eight" alone.',
  },
  {
    id: 'alignDictation/dc/hyphen-after-a-combining-mark-is-spelling',
    fn: 'alignDictation',
    args: [{ transcript: `${AATE}-${JAATE}` }, `${AATE}${JAATE}`],
  },
  {
    id: 'alignDictation/dc/a-rewrite-is-inserted-without-its-punctuation',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['x', 'x!'], ['!', 'bang']) }, 'x'],
    note: 'The first rule inserts its words only, so the second finds no "!" to rewrite: punctuation in a rewrite is ignored, as it is in the comparison.',
  },
  {
    id: 'alignDictation/dc/stale-rule-that-would-delete-a-word-is-skipped',
    fn: 'alignDictation',
    args: [{ transcript: 'a b', tolerance: rules(['a', '...']) }, 'a b'],
    note: 'A rewrite that normalises to nothing would delete a word; the schema refuses it, and the scorer skips it in stale data.',
  },
  {
    id: 'score/dc/variation-selector-is-invisible',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: `i ${HEAVY_HEART} you` }),
      typed(`i ${HEAVY_HEART}${EMOJI_PRESENTATION} you`),
    ],
  },
  {
    id: 'score/dc/default-ignorable-characters-are-invisible',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'hello' }),
      typed(`hel${GRAPHEME_JOINER}lo${HANGUL_FILLER}`),
    ],
  },
  {
    id: 'alignDictation/dc/a-rule-reads-text-composed-after-lowercasing',
    fn: 'alignDictation',
    args: [{ transcript: 'jay', tolerance: rules([J_WITH_CARON, 'jay']) }, CAPITAL_J_CARON],
    note: 'Lowercasing J + COMBINING CARON exposes a pair NFC composes; the rules read the composed letter.',
  },
  {
    id: 'alignDictation/dc/a-symbol-rule-fires-between-letters',
    fn: 'alignDictation',
    args: [{ transcript: 'rock and roll', tolerance: rules(['&', 'and']) }, 'rock&roll'],
    note: 'A boundary is required only at an edge of the rule that is a letter, mark or digit, so "&" fires where it touches letters; its rewrite is set apart from them by spaces, so rock&roll reads as rock and roll.',
  },
  {
    id: 'alignDictation/dc/a-symbol-rewrite-is-set-apart-from-a-digit',
    fn: 'alignDictation',
    args: [{ transcript: 'it is 50 percent', tolerance: rules(['%', 'percent']) }, 'it is 50%'],
  },
  {
    id: 'alignDictation/dc/adjacent-symbol-rewrites-are-set-apart',
    fn: 'alignDictation',
    args: [{ transcript: 'a and and b', tolerance: rules(['&', 'and']) }, 'a&&b'],
    note: 'The space before a rewrite is decided by what the output already ends with, so the second "&" is set apart from the first rewrite.',
  },
  {
    id: 'alignDictation/dc/a-suffix-rule-sets-its-rewrite-apart',
    fn: 'alignDictation',
    args: [{ transcript: 'he is here', tolerance: rules(["'s", 'is']) }, "he's here"],
  },
  {
    id: 'alignDictation/dc/a-rewrite-in-a-script-without-spaces-is-not-set-apart',
    fn: 'alignDictation',
    args: [
      {
        transcript: `50${KATAKANA_PERCENT}`,
        tolerance: rules([FULLWIDTH_PERCENT, KATAKANA_PERCENT]),
      },
      `50${FULLWIDTH_PERCENT}`,
    ],
    note: 'Japanese is written without spaces, so a rewrite that starts in Katakana is not set apart from the digit before it.',
  },
  {
    id: 'alignDictation/dc/a-rewrite-to-a-symbol-is-not-set-apart',
    fn: 'alignDictation',
    args: [{ transcript: 'a+b', tolerance: rules(['&', '+']) }, 'a&b'],
  },
  {
    id: 'alignDictation/dc/a-shorter-rule-first-splits-a-longer-abbreviation',
    fn: 'alignDictation',
    args: [
      { transcript: 'The U.S.A. is big', tolerance: rules(['U.S.', 'United States']) },
      'The USA is big',
    ],
    note: 'A rule whose `from` ends in punctuation needs no boundary after it, so "U.S." fires inside "U.S.A." — list the longer form first.',
  },
  {
    id: 'alignDictation/dc/a-longer-rule-first-keeps-the-abbreviation-whole',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'The U.S.A. is big',
        tolerance: rules(['U.S.A.', 'United States of America'], ['U.S.', 'United States']),
      },
      'The United States of America is big',
    ],
  },
  {
    id: 'alignDictation/dc/persian-half-space-is-spelling',
    fn: 'alignDictation',
    args: [{ transcript: `${MI}${ZWNJ}${KHAHAM}` }, `${MI}${KHAHAM}`],
    note: 'A zero-width non-joiner between a letter that joins the next and one that joins the previous (the Persian half-space) is spelling: leaving it out costs an edit.',
  },
  {
    id: 'alignDictation/dc/persian-half-space-typed-as-a-space',
    fn: 'alignDictation',
    args: [{ transcript: `${MI}${ZWNJ}${KHAHAM}` }, `${MI} ${KHAHAM}`],
  },
  {
    id: 'alignDictation/dc/persian-half-space-matches-itself',
    fn: 'alignDictation',
    args: [{ transcript: `${MI}${ZWNJ}${KHAHAM}` }, `${MI}${ZWNJ}${KHAHAM}`],
  },
  {
    id: 'alignDictation/dc/a-joiner-beside-a-space-is-invisible',
    fn: 'alignDictation',
    args: [{ transcript: 'ab c' }, `ab${ZWNJ} ${ZWJ}c`],
  },
  {
    id: 'alignDictation/dc/a-joiner-inside-an-emoji-sequence-is-invisible',
    fn: 'alignDictation',
    args: [
      { transcript: `${GRINNING_FACE}${SMILING_FACE}` },
      `${GRINNING_FACE}${ZWJ}${SMILING_FACE}`,
    ],
  },
  {
    id: 'alignDictation/dc/an-indic-joiner-is-spelling',
    fn: 'alignDictation',
    args: [{ transcript: KSHA_WITH_JOINER }, KSHA],
    note: 'A joiner after a virama chooses the half form over the conjunct: a different written word.',
  },
  {
    id: 'alignDictation/dc/mongolian-vowel-separator-is-spelling',
    fn: 'alignDictation',
    args: [
      { transcript: `${NOM}${MONGOLIAN_VOWEL_SEPARATOR}${MONGOLIAN_A}` },
      `${NOM}${MONGOLIAN_A}`,
    ],
  },
  {
    id: 'alignDictation/dc/mongolian-free-variation-selectors-differ',
    fn: 'alignDictation',
    args: [{ transcript: `${MONGOLIAN_GA}${FVS1}` }, `${MONGOLIAN_GA}${FVS2}`],
  },
  {
    id: 'alignDictation/dc/a-stray-mongolian-selector-is-invisible',
    fn: 'alignDictation',
    args: [{ transcript: 'a b' }, `a ${FVS1}${FVS2}b`],
    note: 'A selector with no letter before it is removed, and so is a second one after it, so normalising twice changes nothing.',
  },
  {
    id: 'alignDictation/dc/subdivision-flags-differ',
    fn: 'alignDictation',
    args: [{ transcript: FLAG_SCOTLAND }, FLAG_ENGLAND],
    note: 'The tag characters after U+1F3F4 spell which flag it is.',
  },
  {
    id: 'alignDictation/dc/stray-tag-characters-are-invisible',
    fn: 'alignDictation',
    args: [{ transcript: 'ab' }, `a${TAG_LATIN_B}b`],
  },
  {
    id: 'alignDictation/dc/keycaps-keep-their-base',
    fn: 'alignDictation',
    args: [{ transcript: KEYCAP_HASH }, KEYCAP_ASTERISK],
    note: 'The "#" or "*" of a keycap is not removed as punctuation, so two keycaps are not both the bare enclosing mark.',
  },
  {
    id: 'alignDictation/dc/catalan-middle-dot-is-spelling',
    fn: 'alignDictation',
    args: [{ transcript: `col${MIDDLE_DOT}legi` }, 'collegi'],
  },
  {
    id: 'alignDictation/dc/a-middle-dot-between-words-is-punctuation',
    fn: 'alignDictation',
    args: [{ transcript: `a ${MIDDLE_DOT} b` }, 'a b'],
  },
  {
    id: 'alignDictation/dc/hebrew-geresh-is-an-apostrophe',
    fn: 'alignDictation',
    args: [{ transcript: HEBREW_CHIPS_GERESH }, HEBREW_CHIPS_APOSTROPHE],
  },
  {
    id: 'alignDictation/dc/hebrew-maqaf-is-a-hyphen',
    fn: 'alignDictation',
    args: [{ transcript: HEBREW_SCHOOL_MAQAF }, HEBREW_SCHOOL_HYPHEN],
  },
  {
    id: 'alignDictation/dc/armenian-hyphen-is-a-hyphen',
    fn: 'alignDictation',
    args: [{ transcript: ARMENIAN_HYPHENATED }, ARMENIAN_ASCII_HYPHEN],
  },
  {
    id: 'alignDictation/dc/tibetan-tsheg-is-spelling',
    fn: 'alignDictation',
    args: [{ transcript: TIBETAN_TASHI }, TIBETAN_TASHI_RUN_ON],
  },
  {
    id: 'alignDictation/dc/tibetan-non-breaking-tsheg-is-the-tsheg',
    fn: 'alignDictation',
    args: [{ transcript: TIBETAN_TASHI }, TIBETAN_TASHI_UNBROKEN],
  },
  {
    id: 'alignDictation/dc/arabic-tatweel-is-invisible',
    fn: 'alignDictation',
    args: [{ transcript: MARHABA }, MARHABA_STRETCHED],
  },
  {
    id: 'alignDictation/dc/a-letter-of-any-script-before-a-rule-is-a-word-character',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules(['a', 'x']) },
      `${LINEAR_B_A}a ${BOLD_A}a ${E_GRAVE}a 9a za a`,
    ],
    note: 'An astral letter (read as its whole surrogate pair), a letter outside ASCII, and the ASCII edges 9 and z each keep a rule for "a" out of the word they end; only the lone "a" is rewritten.',
  },
  {
    id: 'alignDictation/dc/a-letter-of-any-script-after-a-rule-is-a-word-character',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules(['a', 'x']) },
      `a${LINEAR_B_A} a${BOLD_A} a${E_GRAVE} a9 az a`,
    ],
  },
  {
    id: 'alignDictation/dc/a-rule-passes-over-a-word-of-astral-letters',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['a', 'x']) }, `${BOLD_A}a${BOLD_A}a a`],
    note: 'Refused inside a word, the search goes on after the word, stepping over each surrogate pair whole; only the lone "a" is rewritten.',
  },
  {
    id: 'alignDictation/dc/a-rule-ending-in-an-astral-letter-needs-a-boundary-after-it',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules([`q${BOLD_A}`, 'y']) },
      `q${BOLD_A}b q${BOLD_A}${LINEAR_B_A} q${BOLD_A}`,
    ],
  },
  {
    id: 'alignDictation/dc/a-rewrite-is-set-apart-from-letters-of-another-alphabet',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules(['&', CYRILLIC_I]) },
      `${CYRILLIC_A}&${CYRILLIC_BE}&${CYRILLIC_VE}`,
    ],
    note: 'Cyrillic letters are word characters of a spaced script: each rewrite is set apart from the letters on both sides, including the one between two rewrites.',
  },
  {
    id: 'alignDictation/dc/a-rule-never-matches-half-of-a-surrogate-pair',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'x',
        tolerance: rules([LOW_FIRST, 'x'], [LOW_LAST, 'y'], [HIGH_FIRST, 'z'], [HIGH_LAST, 'w']),
      },
      `${LINEAR_B_A} ${LOW_FIRST} ${PLANE_16_LAST} ${LOW_LAST} ${HIGH_FIRST} ${HIGH_LAST}`,
    ],
    note: 'Every lone surrogate, in a rule and in the text, is U+FFFD: the first rule rewrites all four lone ones, the three after it find nothing left, and neither surrogate pair is touched.',
  },
  {
    id: 'alignDictation/dc/a-lone-surrogate-beside-a-word-is-no-word-character',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules(['a', 'x']) },
      `${HIGH_FIRST}a a${LOW_FIRST} ${LOW_LAST}a`,
    ],
    note: 'A lone surrogate is U+FFFD, a symbol and no word character: it keeps no rule out of the word beside it.',
  },
  {
    id: 'alignDictation/dc/a-surrogate-pair-split-across-a-rewrite-is-two-replacement-characters',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['&', `x${BOLD_A_HIGH}`]) }, `&${BOLD_A_LOW}&`],
    note: 'A rewrite ending in the high half of a pair and text starting with its low half never make the letter: each lone half is U+FFFD, a symbol, so no rewrite is set apart from it.',
  },
  {
    id: 'alignDictation/dc/a-half-space-after-a-right-joining-letter-is-invisible',
    fn: 'alignDictation',
    args: [{ transcript: ROOZHA_HALF_SPACE }, ROOZHA],
    note: 'After a letter that joins nothing after it, a zero-width non-joiner changes nothing drawn: it is removed.',
  },
  {
    id: 'alignDictation/dc/a-joiner-between-latin-letters-is-invisible',
    fn: 'alignDictation',
    args: [{ transcript: 'Auflage' }, `Auf${ZWNJ}lage`],
  },
  {
    id: 'alignDictation/dc/a-joiner-after-a-virama-is-spelling',
    fn: 'alignDictation',
    args: [{ transcript: SRI }, SRI_EXPLICIT],
  },
  {
    id: 'alignDictation/dc/a-joiner-between-arabic-letters-is-invisible',
    fn: 'alignDictation',
    args: [{ transcript: String.fromCodePoint(0x647, 0x62a) }, ARABIC_HEH_TEH_JOINED],
    note: 'A zero-width joiner is kept only after a virama.',
  },
  {
    id: 'alignDictation/dc/a-modifier-apostrophe-is-folded-before-a-joiner-is-judged',
    fn: 'alignDictation',
    args: [{ transcript: "a'b" }, `a${MODIFIER_APOSTROPHE}${ZWJ}b`],
    note: "U+02BC is an apostrophe by then, so the joiner beside it is judged beside an apostrophe and removed; the attempt reads a'b.",
  },
  {
    id: 'alignDictation/dc/a-mark-composed-by-the-strip-is-settled-again',
    fn: 'alignDictation',
    args: [{ transcript: 'x' }, `=.${NOT_SLASH}'${COMBINING_ACUTE}`],
    note: 'Removing the full stop lets = and the overlay compose into U+2260; the apostrophe, now after that symbol and no letter, mark or digit, is removed in the same normalisation.',
  },
  {
    id: 'alignDictation/dc/a-legacy-malayalam-chillu-is-the-atomic-chillu',
    fn: 'alignDictation',
    args: [{ transcript: MALAYALAM_PAL }, MALAYALAM_PAL_LEGACY],
  },
  {
    id: 'alignDictation/dc/a-legacy-bengali-khanda-ta-is-the-khanda-ta',
    fn: 'alignDictation',
    args: [{ transcript: BENGALI_UTSAB }, BENGALI_UTSAB_LEGACY],
  },
  {
    id: 'alignDictation/dc/marathi-eyelash-ra-spelled-with-ra-is-the-one-with-rra',
    fn: 'alignDictation',
    args: [{ transcript: MARATHI_EYELASH_RRA }, MARATHI_EYELASH_RA],
  },
  {
    id: 'alignDictation/dc/thai-sara-am-typed-as-two-parts-is-sara-am',
    fn: 'alignDictation',
    args: [{ transcript: THAI_NAM }, THAI_NAM_SPLIT],
  },
  {
    id: 'alignDictation/dc/fullwidth-digits-compare-as-digits',
    fn: 'alignDictation',
    args: [{ transcript: '2024年' }, FULLWIDTH_2024],
  },
  {
    id: 'alignDictation/dc/a-ligature-compares-as-its-letters',
    fn: 'alignDictation',
    args: [{ transcript: 'fine' }, `${LIGATURE_FI}ne`],
  },
  {
    id: 'alignDictation/dc/a-kangxi-radical-compares-as-its-ideograph',
    fn: 'alignDictation',
    args: [{ transcript: HAN_MAN }, KANGXI_MAN],
  },
  {
    id: 'alignDictation/dc/an-isolated-vowel-mark-form-keeps-its-form',
    fn: 'alignDictation',
    args: [{ transcript: `a ${FATHATAN_ISOLATED}` }, `a ${FATHATAN_ISOLATED}`],
    note: 'Its compatibility form is a space and a combining mark, which would put the mark on nothing.',
  },
  {
    id: 'alignDictation/dc/a-rule-fires-inside-text-written-without-spaces',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules([HAN_TWO, '2']) }, TWO_BOOKS],
    note: 'A rule edge that is a letter of a script written without spaces needs no word boundary.',
  },
  {
    id: 'alignDictation/dc/a-match-never-ends-before-a-combining-mark',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules([THAI_MA, 'x']) }, THAI_MI],
  },
  {
    id: 'alignDictation/dc/a-kept-joiner-is-part-of-its-word',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules([SE, PERSIAN_THREE]) }, TUESDAY],
    note: 'The half-space is inside the word, so a rule for "three" leaves "Tuesday" whole.',
  },
  {
    id: 'alignDictation/dc/a-joiner-left-beside-a-digit-is-removed',
    fn: 'alignDictation',
    args: [
      { transcript: 'x' },
      `${PERSIAN_THREE}${ZWNJ}${String.fromCodePoint(0x634, 0x646, 0x628, 0x647)}`,
    ],
  },
  {
    id: 'alignDictation/dc/a-letter-of-another-script-is-a-visible-edge',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['ok', 'x']) }, `ok${HAN_MIDDLE}`],
  },
  {
    id: 'alignDictation/dc/the-japanese-long-vowel-mark-counts-as-kana',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['&', 'and']) }, COFFEE_AND_CAKE],
    note: 'U+30FC is Common by script but kana by script extension, so the rewrite is set apart on neither side.',
  },
  {
    id: 'alignDictation/dc/halfwidth-katakana-with-voicing-marks-is-katakana',
    fn: 'alignDictation',
    args: [{ transcript: 'ガラス パン' }, 'ｶﾞﾗｽ ﾊﾟﾝ'],
    note: 'A halfwidth voiced or semi-voiced sound mark is the combining mark on the kana before it, which then composes.',
  },
  {
    id: 'alignDictation/dc/a-voicing-mark-form-with-nothing-before-it-keeps-its-form',
    fn: 'alignDictation',
    args: [{ transcript: 'x' }, `${String.fromCodePoint(0xff9e)} x`],
    note: 'At the start of the text there is nothing to carry the mark: the halfwidth form stays as it is.',
  },
  {
    id: 'alignDictation/dc/an-arabic-mark-form-after-a-letter-is-the-mark',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x645, 0x62d, 0x645, 0x64e, 0x651, 0x62f) },
      String.fromCodePoint(0xfee3, 0xfea4, 0xfee4, 0xfc60, 0xfeaa),
    ],
    note: 'Text copied from a PDF: the isolated form of shadda with fatha, after a letter, is those marks on that letter.',
  },
  {
    id: 'alignDictation/dc/halfwidth-hangul-jamo-are-the-letters-a-keyboard-types',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x3131, 0x314f) },
      String.fromCodePoint(0xffa1, 0xffc2),
    ],
    note: 'A halfwidth jamo is the compatibility jamo of its name, not a conjoining jamo that would compose into a syllable.',
  },
  {
    id: 'alignDictation/dc/a-latin-digraph-compares-as-its-letters',
    fn: 'alignDictation',
    args: [
      { transcript: 'ljubav col·legi' },
      `${String.fromCodePoint(0x1c9)}ubav co${String.fromCodePoint(0x140)}legi`,
    ],
  },
  {
    id: 'alignDictation/dc/a-circled-number-past-twenty-compares-as-its-digits',
    fn: 'alignDictation',
    args: [{ transcript: '21 50' }, String.fromCodePoint(0x3251, 0x20, 0x32bf)],
  },
  {
    id: 'alignDictation/dc/the-fullwidth-tilde-is-the-wave-dash',
    fn: 'alignDictation',
    args: [
      { transcript: `10時${String.fromCodePoint(0x301c)}12時` },
      `10時${String.fromCodePoint(0xff5e)}12時`,
    ],
    note: 'Keyboards type either for the same key; both are the wave dash, punctuation, and removed.',
  },
  {
    id: 'alignDictation/dc/an-arabic-number-sign-is-drawn-and-kept',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x600, 0x661, 0x662) },
      String.fromCodePoint(0x661, 0x662),
    ],
    note: 'A prepended concatenation mark is a format character that is drawn: leaving it out costs an edit.',
  },
  {
    id: 'alignDictation/dc/malayalam-nta-with-na-is-nta-with-chillu-n',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0xd0e, 0xd7b, 0xd4d, 0xd31, 0xd46) },
      String.fromCodePoint(0xd0e, 0xd28, 0xd4d, 0xd31, 0xd46),
    ],
  },
  {
    id: 'alignDictation/dc/thai-sara-am-parts-with-a-tone-mark-between-are-sara-am',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0xe19, 0xe49, 0xe33, 0x20, 0xe99, 0xec9, 0xeb3) },
      String.fromCodePoint(0xe19, 0xe4d, 0xe49, 0xe32, 0x20, 0xe99, 0xecd, 0xec9, 0xeb2),
    ],
    note: 'NIKHAHIT, the tone mark, SARA AA — the order that draws like the vowel — in Thai and in Lao.',
  },
  {
    id: 'alignDictation/dc/marathi-eyelash-ra-with-rra-needs-no-joiner',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x926, 0x941, 0x938, 0x931, 0x94d, 0x92f, 0x93e) },
      String.fromCodePoint(0x926, 0x941, 0x938, 0x931, 0x94d, 0x200d, 0x92f, 0x93e),
    ],
  },
  {
    id: 'alignDictation/dc/a-joiner-before-a-virama-is-spelling',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x9b0, 0x200d, 0x9cd, 0x9af, 0x9be, 0x9ac) },
      String.fromCodePoint(0x9b0, 0x9cd, 0x9af, 0x9be, 0x9ac),
    ],
    note: 'The Bengali ya-phalaa after RA, asked for with a joiner before the virama, is not the RA with its reph.',
  },
  {
    id: 'alignDictation/dc/a-repeated-joiner-is-one-joiner',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x645, 0x6cc, 0x200c, 0x62e, 0x648, 0x627, 0x647, 0x645) },
      String.fromCodePoint(0x645, 0x6cc, 0x200c, 0x200c, 0x62e, 0x648, 0x627, 0x647, 0x645),
    ],
  },
  {
    id: 'alignDictation/dc/a-joiner-after-a-myanmar-asat-is-spelling',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x1000, 0x103a, 0x200c, 0x1000) },
      String.fromCodePoint(0x1000, 0x103a, 0x1000),
    ],
    note: 'Every character of canonical combining class 9 is a virama, the Myanmar asat among them.',
  },
  {
    id: 'alignDictation/dc/a-mandaic-half-space-is-spelling',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x841, 0x200c, 0x841) },
      String.fromCodePoint(0x841, 0x841),
    ],
    note: 'Mandaic letters join, as Unicode 16 lists them: a non-joiner between two breaks the join.',
  },
  {
    id: 'alignDictation/dc/a-non-joiner-after-a-small-farsi-yeh-is-invisible',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x628, 0x8c9, 0x628) },
      String.fromCodePoint(0x628, 0x8c9, 0x200c, 0x628),
    ],
    note: 'U+08C9 joins nothing: a non-joiner after it changes nothing drawn.',
  },
  {
    id: 'alignDictation/dc/a-vowel-separator-after-a-variation-selector-is-kept',
    fn: 'alignDictation',
    args: [
      { transcript: String.fromCodePoint(0x182d, 0x1820, 0x1837, 0x180b, 0x180e, 0x1820) },
      String.fromCodePoint(0x182d, 0x1820, 0x1837, 0x180b, 0x1820),
    ],
  },
  {
    id: 'alignDictation/dc/a-middle-dot-in-a-chinese-name-is-punctuation',
    fn: 'alignDictation',
    args: [{ transcript: '约翰·史密斯' }, `约翰${String.fromCodePoint(0x30fb)}史密斯`],
  },
  {
    id: 'alignDictation/dc/a-thai-number-is-a-word',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules([String.fromCodePoint(0xe50), 'x'], ['%', 'percent']) },
      String.fromCodePoint(0xe51, 0xe50, 0xe50, 0x20, 0xe55, 0xe50, 0x25),
    ],
    note: 'A Thai digit is a word character of a spaced script, as an ASCII one is: a rule for zero leaves one hundred alone, and a rewrite is set apart from fifty.',
  },
  {
    id: 'alignDictation/dc/the-space-after-a-rewrite-reads-the-rewrite-after-it',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['USD.', '$us']) }, 'USD.USD.'],
    note: 'After the first rewrite comes the second, which starts with a symbol: nothing is set apart.',
  },
  {
    id: 'alignDictation/dc/a-selector-after-the-last-mongolian-letter-is-kept',
    fn: 'alignDictation',
    args: [{ transcript: 'x' }, String.fromCodePoint(0x18aa, 0x180b)],
    note: 'U+18AA, the last Mongolian letter, carries a free variation selector.',
  },
  {
    id: 'alignDictation/dc/a-vowel-separator-is-kept-after-each-selector-and-not-after-a-latin-letter',
    fn: 'alignDictation',
    args: [
      { transcript: 'x' },
      `${String.fromCodePoint(0x1820, 0x180d, 0x180e, 0x1820)} ${String.fromCodePoint(0x1820, 0x180f, 0x180e, 0x1820)} a${String.fromCodePoint(0x180e, 0x1820)}`,
    ],
    note: 'After the third and fourth free variation selectors the separator is kept; after a Latin letter it is removed.',
  },
  {
    id: 'alignDictation/dc/a-half-space-is-read-across-the-marks-beside-it',
    fn: 'alignDictation',
    args: [{ transcript: 'x' }, String.fromCodePoint(0x645, 0x650, 0x200c, 0x651, 0x647)],
    note: 'The letters on either side are found past the combining marks between them and the non-joiner.',
  },
  {
    id: 'alignDictation/dc/a-non-joiner-before-a-letter-that-joins-nothing-before-it-is-invisible',
    fn: 'alignDictation',
    args: [{ transcript: 'x' }, String.fromCodePoint(0x628, 0x200c, 0x621)],
    note: 'The hamza joins no letter, so the non-joiner before it breaks no join.',
  },
  {
    id: 'alignDictation/dc/a-non-joiner-with-only-marks-after-it-is-invisible',
    fn: 'alignDictation',
    args: [{ transcript: 'x' }, String.fromCodePoint(0x628, 0x200c, 0x650)],
  },
  {
    id: 'alignDictation/dc/a-vowel-separator-before-a-space-is-invisible',
    fn: 'alignDictation',
    args: [
      { transcript: 'x' },
      `${String.fromCodePoint(0x1820, 0x180e)} ${String.fromCodePoint(0x1820)}`,
    ],
  },
  {
    id: 'alignDictation/dc/tag-characters-at-the-start-of-the-text-are-invisible',
    fn: 'alignDictation',
    args: [{ transcript: 'x' }, `${String.fromCodePoint(0xe0067, 0xe0062)}ab`],
  },
  {
    id: 'alignDictation/dc/a-tag-space-after-a-flag-is-kept',
    fn: 'alignDictation',
    args: [{ transcript: 'x' }, String.fromCodePoint(0x1f3f4, 0xe0020, 0xe007f)],
    note: 'U+E0020, the first tag character, is part of the run after U+1F3F4.',
  },
  {
    id: 'alignDictation/dc/a-digit-ending-in-the-last-low-surrogate-keeps-a-rule-out-of-its-word',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules(['a', 'x']) },
      `${String.fromCodePoint(0x1d7ff)}a a`,
    ],
    note: 'U+1D7FF, a digit, is written D835 DFFF: read whole, it is a word character before the first "a".',
  },
  {
    id: 'alignDictation/dc/rewrites-around-a-letter-are-set-apart-from-it',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['&', 'and']) }, '&a&b'],
    note: 'The first rewrite ends at the second character; the letter after it, and the one after the next rewrite, are each set apart.',
  },
  {
    id: 'alignDictation/dc/a-rewrite-at-the-start-is-set-apart-from-the-letter-after-it',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['&', 'and']) }, '&a'],
  },
  {
    id: 'alignDictation/dc/truncated-only-after-normalisation',
    fn: 'alignDictation',
    args: [{ transcript: 'x', tolerance: rules(['&', '$$']) }, '&'.repeat(4001)],
    note: 'The text typed is 4,001 code points and its working text 8,002, inside both bounds; the attempt is cut to 8,000 after normalisation, and that alone sets the flag.',
  },
  {
    id: 'alignDictation/dc/a-lone-high-surrogate-pairs-only-with-a-low-one',
    fn: 'alignDictation',
    args: [
      { transcript: 'x', tolerance: rules(['&', `x${BOLD_A_HIGH}`], ['a', 'y']) },
      `&b& ${HIGH_FIRST}${E_GRAVE}a`,
    ],
    note: 'A lone high surrogate, in a rewrite or in the text, is U+FFFD whatever follows it: a symbol, which sets no rewrite apart and keeps no rule for "a" out of the word after it.',
  },
  {
    id: 'alignDictation/dc/stale-accepted-transcripts-past-the-tenth-are-ignored',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'zzz',
        acceptedTranscripts: [...Array.from({ length: 10 }, (_, index) => `decoy${index}`), 'x'],
      },
      'x',
    ],
  },
  {
    id: 'alignDictation/dc/the-tenth-accepted-transcript-counts',
    fn: 'alignDictation',
    args: [
      {
        transcript: 'zzz',
        acceptedTranscripts: [...Array.from({ length: 9 }, (_, index) => `decoy${index}`), 'x'],
      },
      'x',
    ],
  },
  {
    id: 'alignDictation/dc/stale-transcript-past-the-cap-is-cut-before-normalising',
    fn: 'alignDictation',
    args: [{ transcript: `${'x'.repeat(1999)} a` }, 'x'.repeat(1999)],
    note: 'Cut at 2000 before normalising, the transcript ends at the space and normalises to 1999 letters; cut only afterwards it would keep a trailing space.',
  },
  {
    id: 'score/dc/pass-threshold/exact-70',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'a'.repeat(10) }),
      typed(`${'a'.repeat(7)}${'b'.repeat(3)}`),
    ],
  },
  {
    id: 'score/dc/pass-threshold/authored-exact-tie',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: 'a'.repeat(100), passThreshold: 0.67 }),
      typed(`${'a'.repeat(67)}${'b'.repeat(33)}`),
    ],
    note: 'Similarity is (max - d) / max, one division: 67/100 is exactly 0.67 and passes. 1 - 33/100 would be 0.6699999999999999 and fail.',
  },
  {
    id: 'score/dc/pass-threshold/raw-tie-2003-fails',
    fn: 'score',
    args: ['dictation', dc({ transcript: TIE_TRANSCRIPT }), typed(TIE_ATTEMPT)],
    note: 'Raw 0.69995… is below 0.7: a fail by default, though it displays as 70%.',
  },
  {
    id: 'score/dc/pass-threshold/raw-tie-2003-rounded-passes',
    fn: 'score',
    args: [
      'dictation',
      dc({ transcript: TIE_TRANSCRIPT }),
      typed(TIE_ATTEMPT),
      { rounding: { mode: 'half-up', dp: 2 } },
    ],
    note: 'The same attempt with the opt-in rounding option: compared as displayed, it passes.',
  },
  {
    id: 'score/mc/pass-threshold/rounded-option-does-not-move-a-clear-pass',
    fn: 'score',
    args: ['multiple-choice', mc(), pick('a', 'c'), { rounding: { mode: 'half-up', dp: 2 } }],
    note: 'Control: the options parameter changes nothing where the score is not in the rounding band.',
  },
  {
    id: 'score/dc/pass-threshold/authored',
    fn: 'score',
    args: ['dictation', dc({ passThreshold: 0.95 }), typed("It isn't raining in Lisbom today.")],
  },
  {
    id: 'score/dc/hints-revealed-ignored',
    fn: 'score',
    args: ['dictation', dc(), typed("It isn't raining in Lisbon today.", 6)],
  },
  {
    id: 'score/dc/word-alignment/tail-first-diagonal-tie',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'the cat sat' }), typed('thecat sat')],
    note: 'The pairing is backtracked from the end preferring a pair: "the" is missing and "cat" pairs with "thecat".',
  },
  {
    id: 'score/dc/word-alignment/missing-vs-extra-tie',
    fn: 'score',
    args: ['dictation', dc({ transcript: 'the cat the' }), typed('cat the cat')],
    note: 'A missing transcript word is preferred to an extra typed word when both cost the same: w3 is the omission, the leading "cat" the extra.',
  },
  {
    id: 'score/dc/long-paragraph-three-typos',
    fn: 'score',
    args: [
      'dictation',
      dc({
        transcript:
          'Yesterday the class visited the old harbour, where a guide explained how the tide reshapes the sandbanks twice a day and why the fishing boats leave before dawn.',
      }),
      typed(
        'Yesterday the class visited the old harbor, where a guide explaned how the tide reshapes the sandbanks twice a day and why the fishing boats leaves before dawn.',
      ),
    ],
  },
  {
    id: 'evaluate/dc/scored',
    fn: 'evaluate',
    args: [dc(), typed("It isn't raining in Lisbon today.")],
  },
  {
    id: 'evaluate/dc/redacted-unscorable',
    fn: 'evaluate',
    args: [
      {
        redacted: true,
        schemaVersion: '1.0',
        type: 'dictation',
        id: 'dc-lisbon',
        title: 'Listen and type the sentence',
        media: { type: 'audio', url: 'https://cdn.example/lisbon.mp3', alt: 'Recording' },
      },
      typed('anything'),
    ],
    ignore: ['reason'],
  },
  {
    id: 'alignDictation/dc/extra-word-position',
    fn: 'alignDictation',
    args: [{ transcript: 'the cat sat' }, 'the big cat sat'],
  },
  {
    id: 'alignDictation/dc/missing-and-substituted',
    fn: 'alignDictation',
    args: [{ transcript: 'the cat sat on the mat' }, 'the cat sit on mat'],
  },
  {
    id: 'alignDictation/dc/transcript-absent-yields-empty',
    fn: 'alignDictation',
    args: [{}, 'anything at all'],
    note: 'A redacted projection has no transcript: candidateIndex -1, no words, similarity 0, no throw.',
  },
  {
    id: 'diffDictationChars/dc/char-ops-tie-order',
    fn: 'diffDictationChars',
    args: ['ab', 'ba'],
    note: 'Two substitutions, not a deletion and an insertion: a pair is preferred to a gap.',
  },
  {
    id: 'diffDictationChars/dc/char-ops-missing-vs-extra-tie',
    fn: 'diffDictationChars',
    args: ['aaba', 'abab'],
    note: 'Where a missing and an extra character cost the same, the missing one comes first from the end.',
  },
  {
    id: 'diffDictationChars/dc/astral-one-op',
    fn: 'diffDictationChars',
    args: [GRINNING_FACE, SMILING_FACE],
  },
  {
    id: 'dictationReferenceWords/dc/two-candidates',
    fn: 'dictationReferenceWords',
    args: [
      { transcript: 'The colour of the sky.', acceptedTranscripts: ['The color of the sky.'] },
    ],
  },
  { id: 'const/DICTATION_MAX_TRANSCRIPT_LENGTH', const: 'DICTATION_MAX_TRANSCRIPT_LENGTH' },
  { id: 'const/DICTATION_MAX_TEXT_LENGTH', const: 'DICTATION_MAX_TEXT_LENGTH' },
  { id: 'const/DICTATION_MAX_EQUIVALENCE_LENGTH', const: 'DICTATION_MAX_EQUIVALENCE_LENGTH' },
  { id: 'const/DICTATION_MAX_EQUIVALENCES', const: 'DICTATION_MAX_EQUIVALENCES' },
  {
    id: 'const/DICTATION_MAX_ACCEPTED_TRANSCRIPTS',
    const: 'DICTATION_MAX_ACCEPTED_TRANSCRIPTS',
  },

  // -- Read aloud ------------------------------------------------------------
  //
  // A read-aloud grade is arithmetic over an assessment the application
  // obtained elsewhere. What is pinned here is which evidence is refused and
  // what each refusal is called, how the weighted total is computed, and which
  // reference word each mark lands on -- never the assessor's own numbers.
  {
    id: 'gradeReadAloud/ra/read-as-written',
    fn: 'gradeReadAloud',
    args: [ra(), recorded(), assessed(), measuredTake()],
    note: 'The weighted total of the assessor dimensions: 80 at weight 2 and 70 at weight 1, each out of 100. The per-word marks never feed it.',
  },
  {
    id: 'gradeReadAloud/ra/blank-scores-zero',
    fn: 'gradeReadAloud',
    args: [ra(), BLANK_TAKE, null, measuredTake({ measured: null })],
    note: 'A learner who submitted without recording scores 0, with a mark for every reference word. Neither the assessment nor the measurement is read.',
  },
  {
    id: 'gradeReadAloud/ra/dimension-scored-zero',
    fn: 'gradeReadAloud',
    args: [ra(), recorded(), assessed({ scores: { accuracy: 0, fluency: 70 } }), measuredTake()],
    note: 'A dimension the assessor scored 0 is graded as a 0. The refusal below is for a dimension it did not score at all.',
  },
  {
    id: 'gradeReadAloud/ra/weight-zero-dimension-is-not-required',
    fn: 'gradeReadAloud',
    args: [
      ra({
        scoring: {
          dimensions: [
            { name: 'accuracy', weight: 2 },
            { name: 'fluency', weight: 0 },
          ],
        },
      }),
      recorded(),
      assessed({ scores: { accuracy: 80 } }),
      measuredTake(),
    ],
    note: 'A dimension weighed 0 is neither required of the assessment nor listed in the criteria.',
  },
  {
    id: 'gradeReadAloud/ra/pass-threshold/raw-tie-fails',
    fn: 'gradeReadAloud',
    args: [
      ra({ scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] } }),
      recorded(),
      assessed({ scores: { accuracy: 69.995 } }),
      measuredTake(),
    ],
    note: 'Raw 0.69995 is below 0.7: a fail by default, though it displays as 70%.',
  },
  {
    id: 'gradeReadAloud/ra/pass-threshold/rounded-tie-passes',
    fn: 'gradeReadAloud',
    args: [
      ra({ scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] } }),
      recorded(),
      assessed({ scores: { accuracy: 69.995 } }),
      measuredTake({ rounding: HALF_UP_2 }),
    ],
    note: 'The same take with the opt-in rounding option: compared as displayed, it passes. The score itself stays unrounded.',
  },
  {
    id: 'gradeReadAloud/ra/marks-an-omission-an-insertion-and-a-mispronunciation',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({
        words: [
          heard('the', { accuracy: 95 }),
          heard('big', { error: 'insertion', accuracy: 40 }),
          heard('cat', { accuracy: 88 }),
          heard('sat', { error: 'omission' }),
          heard('on', { accuracy: 71 }),
          heard('the', { accuracy: 64 }),
          heard('hat', { error: 'mispronunciation', accuracy: 33 }),
        ],
      }),
      measuredTake(),
    ],
    note: 'An inserted word carries no itemId and so no mark; an omitted word is marked 0; a mispronounced one keeps the assessor accuracy as its mark.',
  },
  {
    id: 'gradeReadAloud/ra/word-without-accuracy-carries-no-mark',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({
        words: [
          heard('the', { accuracy: 90 }),
          heard('cat', { accuracy: 90 }),
          heard('sat'),
          heard('on', { accuracy: 90 }),
          heard('the', { accuracy: 90 }),
          heard('mat', { accuracy: 90 }),
        ],
      }),
      measuredTake(),
    ],
    note: 'A word the assessor did not measure has no `score` key at all: an unmeasured word is not a word read at 0.',
  },
  {
    id: 'gradeReadAloud/ra/miscue-none-marks-a-recognised-word-that-is-not-the-reference',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({
        miscue: 'none',
        recognizedText: 'the cot sat on the mat',
        words: [
          heard('the', { accuracy: 90 }),
          heard('cot', { accuracy: 44 }),
          heard('sat', { accuracy: 90 }),
          heard('on', { accuracy: 90 }),
          heard('the', { accuracy: 90 }),
          heard('mat', { accuracy: 90 }),
        ],
      }),
      measuredTake(),
    ],
    note: 'An assessor that does not judge miscues reports every word it heard as `none`, so the SDK compares the words itself.',
  },
  {
    id: 'gradeReadAloud/ra/ai-assessor-accepted-when-opted-in',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({ assessor: { kind: 'ai', model: 'example-model-1' } }),
      measuredTake({ allowAiAssessor: true }),
    ],
    note: 'The grader recorded on the grade is a copy of the assessor, so a re-grade years later still says who measured it.',
  },
  {
    id: 'gradeReadAloud/ra/human-assessor-accepted',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({ assessor: { kind: 'human', id: 'grader-7' } }),
      measuredTake(),
    ],
    note: 'A person needs no opt-in: only generative evidence does.',
  },
  refusal(
    'invalid_assessment',
    { assessment: assessed({ scale: 10 }) },
    'Assessor scores are out of 100. A 10-point scale is refused, never read as a tenth of the marks.',
  ),
  refusal('task_mismatch', { assessment: assessed({ task: 'unscripted' }) }),
  refusal('locale_mismatch', { assessment: assessed({ locale: 'en-GB' }) }),
  refusal(
    'reference_mismatch',
    { assessment: assessed({ referenceText: 'the cat sat on the hat' }) },
    'The text compared exactly: an assessment of a different text cannot mark this one.',
  ),
  refusal('recording_mismatch', { response: recorded('take-2') }),
  refusal(
    'assessor_not_accepted',
    { assessment: assessed({ assessor: { kind: 'ai', model: 'example-model-1' } }) },
    'Generative evidence is refused unless the caller opted in with allowAiAssessor.',
  ),
  refusal('no_speech', {
    assessment: assessed({ status: 'no_speech', scores: {}, recognizedText: '', words: [] }),
  }),
  refusal(
    'insufficient_voiced_time',
    { options: measuredTake({ measured: { durationMs: 4000, voicedMs: 100 } }) },
    'Too little voiced time to judge: a learner who was barely heard has not failed.',
  ),
  refusal(
    'implausible_speech_rate',
    { options: measuredTake({ measured: { durationMs: 4000, voicedMs: 600 } }) },
    'Six words in 0.6 s of voiced time is 10 a second, above the 6 the policy allows: the evidence does not describe this recording.',
  ),
  refusal(
    'missing_dimension',
    { assessment: assessed({ scores: { accuracy: 80 } }) },
    'The item weighs fluency and the assessment carries no fluency score. Grading the rest would silently reweight the item.',
  ),
  {
    id: 'gradeReadAloud/ra/refuses-a-plausibility-policy-it-cannot-apply',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      { measured: { durationMs: 4000, voicedMs: 2500 }, plausibility: { minVoicedMs: 500 } },
    ],
    note: 'A policy the server cannot apply is its own bug, not evidence to refuse: it throws rather than marking every take unscorable.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-response-that-is-not-read-aloud',
    fn: 'gradeReadAloud',
    args: [ra(), typed('the cat sat on the mat'), assessed(), measuredTake()],
  },
  {
    id: 'gradeReadAloud/ra/refuses-data-that-is-not-valid',
    fn: 'gradeReadAloud',
    args: [ra({ locale: 'en' }), recorded(), assessed({ locale: 'en' }), measuredTake()],
    note: 'A locale without a region does not say whose pronunciation is assessed; the data is refused before any evidence is read.',
  },
  {
    id: 'alignReadAloud/ra/omission-insertion-and-mispronunciation',
    fn: 'alignReadAloud',
    args: [
      { referenceText: READ_SENTENCE },
      assessed({
        words: [
          heard('the', { accuracy: 95 }),
          heard('big', { error: 'insertion', accuracy: 40 }),
          heard('cat', { accuracy: 88 }),
          heard('sat', { error: 'omission' }),
          heard('on', { accuracy: 71 }),
          heard('the', { accuracy: 64 }),
          heard('hat', { error: 'mispronunciation', accuracy: 33 }),
        ],
      }),
    ],
    note: 'An inserted word is placed after the last token that came from an earlier assessor word.',
  },
  {
    id: 'alignReadAloud/ra/repeated-word-omitted-at-the-tail',
    fn: 'alignReadAloud',
    args: [
      { referenceText: READ_SENTENCE },
      assessed({
        recognizedText: 'the cat sat on mat',
        words: ['the', 'cat', 'sat', 'on', 'mat'].map((text) => heard(text)),
      }),
    ],
    note: 'Both "the"s are the same token: the pairing is backtracked from the end, so it is the second one that is omitted.',
  },
  {
    id: 'alignReadAloud/ra/punctuation-merges-two-words',
    fn: 'alignReadAloud',
    args: [
      { referenceText: 'rock and roll' },
      assessedAs('rock and roll', [heard('rock&roll', { accuracy: 55 })], {
        recognizedText: 'rock&roll',
      }),
    ],
    note: 'Normalisation deletes punctuation rather than spacing it, so one heard token covers two reference words: the first two are omitted and the third pairs.',
  },
  {
    id: 'alignReadAloud/ra/a-word-that-yields-no-token',
    fn: 'alignReadAloud',
    args: [
      { referenceText: 'the cat sat' },
      assessedAs('the cat sat', [heard('the'), heard(EM_DASH), heard('cat'), heard('sat')]),
    ],
    note: 'A word that normalises to nothing contributes no token, and the words after it keep their own wordIndex.',
  },
  {
    id: 'alignReadAloud/ra/a-word-that-yields-two-tokens',
    fn: 'alignReadAloud',
    args: [
      { referenceText: 'the cat sat' },
      assessedAs('the cat sat', [heard('the cat', { accuracy: 61 }), heard('sat')]),
    ],
    note: 'One assessor word can hold two tokens; both marks then carry that word accuracy and its index.',
  },
  {
    id: 'alignReadAloud/ra/miscue-assessor-is-trusted',
    fn: 'alignReadAloud',
    args: [
      { referenceText: 'the cat sat' },
      assessedAs('the cat sat', [heard('the'), heard('cot', { accuracy: 44 }), heard('sat')], {
        miscue: 'assessor',
        recognizedText: 'the cot sat',
      }),
    ],
    note: 'An assessor that judges miscues said this word was read correctly, so the SDK does not overrule it on the spelling.',
  },
  {
    id: 'alignReadAloud/ra/miscue-none-judges-the-word-itself',
    fn: 'alignReadAloud',
    args: [
      { referenceText: 'the cat sat' },
      assessedAs('the cat sat', [heard('the'), heard('cot', { accuracy: 44 }), heard('sat')], {
        miscue: 'none',
        recognizedText: 'the cot sat',
      }),
    ],
    note: 'The same words from an assessor that does not judge miscues: the SDK compares them itself.',
  },
  {
    id: 'alignReadAloud/ra/refuses-something-that-is-not-an-assessment',
    fn: 'alignReadAloud',
    args: [{ referenceText: READ_SENTENCE }, { words: [] }],
  },
  {
    id: 'validateSpeechAssessment/accepts-a-scripted-assessment',
    fn: 'validateSpeechAssessment',
    args: [assessed()],
  },
  ...[
    ['not-an-object', null],
    ['unknown-key', assessed({ words: [{ text: 'the', error: 'none', accuraccy: 90 }] })],
    [
      'scripted-without-its-bindings',
      assessed({ referenceText: undefined, recordingKey: undefined }),
    ],
    [
      'phonemes-without-an-alphabet',
      assessed({
        words: [heard('the', { phonemes: [{ symbol: 'th', accuracy: 70 }] })],
      }),
    ],
    ['score-off-the-scale', assessed({ scores: { accuracy: 101 } })],
    ['negative-timing', assessed({ words: [heard('the', { startMs: -1 })] })],
  ].map(([name, value]) => ({
    id: `validateSpeechAssessment/refuses/${name}`,
    fn: 'validateSpeechAssessment',
    args: [value],
    // The path and the code are the contract an adapter branches on; the
    // message is prose, and zod may reword it in a patch release.
    ignore: ['message'],
  })),
  {
    id: 'outcomeFromUnscorable/lifts-a-refusal',
    fn: 'outcomeFromUnscorable',
    args: [{ code: 'no_speech', reason: 'The assessor heard no speech in this recording.' }],
    note: 'The code survives into the stored outcome, where an application branches on it. `evaluate` never writes one.',
  },
  {
    id: 'evaluate/ra/deferred-with-a-recording',
    fn: 'evaluate',
    args: [ra(), recorded()],
  },
  {
    id: 'evaluate/ra/deferred-for-a-blank',
    fn: 'evaluate',
    args: [ra(), BLANK_TAKE],
    note: 'A submitted blank is still awaiting nothing: the partial says there is no recording to assess.',
  },
  {
    id: 'evaluate/ra/no-response-at-all',
    fn: 'evaluate',
    args: [ra(), undefined],
  },
  {
    id: 'score/ra/throws-rather-than-zero',
    fn: 'score',
    args: ['read-aloud', ra(), recorded()],
    note: 'score() refuses to invent a number for a reading no assessor has measured.',
  },
  {
    id: 'inspectWav/silence-is-not-voiced',
    fn: 'inspectWav',
    args: [wav(quiet(WINDOW_FRAMES)), INSPECTION],
    note: 'Digital silence has no level to report: peakDbfs is -Infinity, where a 0 would read as full scale.',
  },
  {
    id: 'inspectWav/a-tone-is-voiced',
    fn: 'inspectWav',
    args: [wav(tone(WINDOW_FRAMES)), INSPECTION],
  },
  {
    id: 'inspectWav/partial-last-window-is-measured-on-its-own',
    fn: 'inspectWav',
    args: [wav([...tone(WINDOW_FRAMES), ...quiet(40)]), INSPECTION],
    note: 'The last window is as long as what is left of the recording, and it is judged on its own level: 25 ms of audio, 20 ms of it voiced.',
  },
  {
    id: 'inspectWav/stereo-is-measured-across-both-channels',
    fn: 'inspectWav',
    args: [
      wav(
        tone(80).flatMap((sample) => [sample, 0]),
        { channels: 2 },
      ),
      INSPECTION,
    ],
    note: 'A silent second channel lowers the window RMS without shortening the recording: frames, not samples, are its length, and the peak is the loudest sample of any channel.',
  },
  {
    id: 'inspectWav/sample-rate-decides-the-window',
    fn: 'inspectWav',
    args: [wav(tone(WINDOW_FRAMES), { sampleRate: 16000 }), INSPECTION],
    note: 'At 16 kHz a 20 ms window is 320 frames, so these 160 frames are one partial window of 10 ms.',
  },
  {
    id: 'inspectWav/extensible-format-is-read',
    fn: 'inspectWav',
    args: [wav(tone(80), { audioFormat: 0xfffe, extensible: true }), INSPECTION],
    note: 'WAVE_FORMAT_EXTENSIBLE carries the real format in its SubFormat GUID, and a PCM one is read.',
  },
  {
    id: 'inspectWav/odd-chunk-is-padded',
    fn: 'inspectWav',
    args: [
      riff([
        ...chunk('LIST', asciiBytes('INF')),
        ...chunk('fmt ', fmtBody()),
        ...chunk('data', tone(80).flatMap(i16)),
      ]),
      INSPECTION,
    ],
    note: 'A chunk of odd size is followed by a pad byte; a walk that ignored it would read the next id one byte late.',
  },
  {
    id: 'inspectWav/truncated-data-chunk',
    fn: 'inspectWav',
    args: [wav(quiet(8), {}, 1000), INSPECTION],
    note: 'The data chunk claims more bytes than the file holds: measured as far as it goes, it would understate the recording.',
  },
  {
    id: 'inspectWav/not-sixteen-bit',
    fn: 'inspectWav',
    args: [wav(quiet(8), { bitsPerSample: 8, blockAlign: 1 }), INSPECTION],
  },
  {
    id: 'inspectWav/data-before-the-format',
    fn: 'inspectWav',
    args: [
      riff([...chunk('data', quiet(4).flatMap(i16)), ...chunk('fmt ', fmtBody())]),
      INSPECTION,
    ],
    note: 'Samples before the format that describes them: the file cannot be read in one pass.',
  },
  {
    id: 'inspectWav/not-a-wav',
    fn: 'inspectWav',
    args: [new Uint8Array(asciiBytes('nope')), INSPECTION],
  },
  {
    id: 'inspectWav/refuses-bytes-that-are-not-a-byte-array',
    fn: 'inspectWav',
    args: [[82, 73, 70, 70], INSPECTION],
    note: 'An array of numbers is not a recording: the refusal is a TypeError, not a measurement of nothing.',
  },
  {
    id: 'inspectWav/refuses-a-policy-it-cannot-apply',
    fn: 'inspectWav',
    args: [wav(quiet(8)), { silenceDbfs: 6, frameMs: 20 }],
    note: 'Full scale is 0 dBFS: a floor above it would call every window voiced.',
  },
  {
    id: 'gradeFromRubric/rounding/option-threshold-raw-tie-fails',
    fn: 'gradeFromRubric',
    args: [[{ name: 'accuracy', score: 69.995, maxScore: 100 }], undefined, { passThreshold: 0.7 }],
    note: 'The control for the three rounded branches below: without a policy the raw 0.69995 is compared, and it fails.',
  },
  {
    id: 'gradeFromRubric/rounding/option-threshold-rounded-tie-passes',
    fn: 'gradeFromRubric',
    args: [
      [{ name: 'accuracy', score: 69.995, maxScore: 100 }],
      undefined,
      { passThreshold: 0.7, rounding: HALF_UP_2 },
    ],
  },
  {
    id: 'gradeFromRubric/rounding/activity-threshold-rounded-tie-passes',
    fn: 'gradeFromRubric',
    args: [[{ name: 'accuracy', score: 69.995, maxScore: 100 }], ra(), { rounding: HALF_UP_2 }],
    note: 'The branch that reads the item: the activity carries no threshold, so it is the 0.7 default, compared as displayed.',
  },
  {
    id: 'gradeFromRubric/rounding/default-threshold-rounded-tie-passes',
    fn: 'gradeFromRubric',
    args: [
      [{ name: 'accuracy', score: 69.995, maxScore: 100 }],
      undefined,
      { rounding: HALF_UP_2 },
    ],
    note: 'The branch with neither an option nor an item: the literal 0.7, compared as displayed.',
  },
  {
    id: 'gradeFromRubric/rounding/malformed-policy-throws',
    fn: 'gradeFromRubric',
    args: [
      [{ name: 'accuracy', score: 69.995, maxScore: 100 }],
      undefined,
      { rounding: { mode: 'half-up', dp: 2.5 } },
    ],
    note: 'A policy that cannot be applied is the caller configuration, and it throws before anything is graded.',
  },
  // -- Read aloud: the boundaries a mutation sweep found unpinned ------------
  //
  // Each of these tells two builds apart that every other vector agreed on: a
  // policy value at the edge of what can be applied, a measurement that is not
  // a number, a malformed recording, or a window whose samples are not all
  // alike. They are ordinary inputs written at their boundary, not fixtures for
  // the mutants themselves.
  {
    id: 'gradeReadAloud/ra/no-words-and-no-recognised-text',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({ recognizedText: undefined, words: [] }),
      {
        measured: { durationMs: 0, voicedMs: 0 },
        plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
      },
    ],
    note: 'An assessor that reported dimension scores and no words: there is no rate to check, a voiced time of 0 is refused only by a policy that asks for one, and every reference word is marked unread.',
  },
  {
    id: 'gradeReadAloud/ra/speech-rate-at-exactly-the-policy-limit',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ measured: { durationMs: 2000, voicedMs: 1000 } }),
    ],
    note: 'Six words in exactly one second under a policy of six a second: the limit is the last plausible rate, not the first implausible one.',
  },
  {
    id: 'gradeReadAloud/ra/speech-rate-counts-the-recognised-text',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({ words: [] }),
      measuredTake({ measured: { durationMs: 4000, voicedMs: 600 } }),
    ],
    ignore: ['reason'],
    note: 'The rate is counted from the text the assessor recognised whenever it reported any, so a word list it left empty does not make a take plausible.',
  },
  {
    id: 'gradeReadAloud/ra/speech-rate-counts-the-words-that-were-read',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({
        recognizedText: undefined,
        words: [
          heard('the'),
          heard('cat'),
          heard('sat', { error: 'omission' }),
          heard('big', { error: 'insertion' }),
          heard('on'),
          heard('the'),
        ],
      }),
      measuredTake({ measured: { durationMs: 4000, voicedMs: 600 } }),
    ],
    ignore: ['reason'],
    note: 'With nothing recognised the words are counted, minus the one that was not read and the one the text does not contain: four in 0.6 s is above the policy, where either error alone would count one.',
  },
  {
    id: 'gradeReadAloud/ra/speech-rate-ignores-an-omission-and-an-insertion',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({
        recognizedText: undefined,
        words: [
          heard('the'),
          heard('cat'),
          heard('sat', { error: 'omission' }),
          heard('big', { error: 'insertion' }),
          heard('on'),
          heard('the'),
        ],
      }),
      {
        measured: { durationMs: 4000, voicedMs: 600 },
        plausibility: { maxWordsPerSecond: 8, minVoicedMs: 500 },
      },
    ],
    note: 'The same take under a policy of eight words a second: the four that were read are plausible, where counting the omission and the insertion as spoken would refuse it.',
  },
  {
    id: 'gradeReadAloud/ra/a-single-word-can-be-implausible',
    fn: 'gradeReadAloud',
    args: [
      ra({ referenceText: 'hello' }),
      recorded(),
      assessed({
        referenceText: 'hello',
        recognizedText: 'hello',
        words: [heard('hello', { accuracy: 90 })],
      }),
      {
        measured: { durationMs: 100, voicedMs: 100 },
        plausibility: { maxWordsPerSecond: 6, minVoicedMs: 0 },
      },
    ],
    ignore: ['reason'],
    note: 'One word in a tenth of a second is ten a second: a single word is counted like any other.',
  },
  {
    id: 'gradeReadAloud/ra/only-a-voiced-time-of-zero-skips-the-division',
    fn: 'gradeReadAloud',
    args: [
      ra({ referenceText: 'hello' }),
      recorded(),
      assessed({
        referenceText: 'hello',
        recognizedText: 'hello',
        words: [heard('hello', { accuracy: 90 })],
      }),
      {
        measured: { durationMs: 1, voicedMs: 1 },
        plausibility: { maxWordsPerSecond: 2000, minVoicedMs: 0 },
      },
    ],
    note: 'A policy this permissive is not a recommendation: the take pins that only a voiced time of exactly 0 refuses without dividing by it.',
  },
  {
    id: 'gradeReadAloud/ra/a-rate-of-one-word-a-second',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ plausibility: { maxWordsPerSecond: 1, minVoicedMs: 500 } }),
    ],
    ignore: ['reason'],
    note: 'One word a second is a policy that can be applied, however strict: it refuses the take rather than the policy.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-rate-of-zero',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ plausibility: { maxWordsPerSecond: 0, minVoicedMs: 500 } }),
    ],
    note: 'A rate of 0 words a second could never be met, so it is a policy that cannot be applied rather than a take that fails it.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-rate-that-is-not-a-number',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ plausibility: { maxWordsPerSecond: Number.NaN, minVoicedMs: 500 } }),
    ],
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-minimum-voiced-time-that-is-not-a-number',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ plausibility: { maxWordsPerSecond: 6, minVoicedMs: Number.NaN } }),
    ],
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-measurement-that-is-not-a-number',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ measured: { durationMs: Number.NaN, voicedMs: 0 } }),
    ],
    note: 'A measurement that is not a pair of millisecond counts is a bug in the server that grades: it throws rather than grading around a NaN.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-duration-below-zero-by-less-than-the-tolerance',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ measured: { durationMs: -1e-6, voicedMs: 0 } }),
    ],
    note: 'A duration below zero by exactly the slack that lets a voiced time round past it. A recording of negative length is a bug in whatever measured it, and the tolerance exists for the one comparison between the two counts, not as permission for either to go negative: every other negative duration is already caught by that comparison, so this is the only width where the rule has to answer on its own.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-voiced-time-that-is-not-a-number',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ measured: { durationMs: 4000, voicedMs: Number.NaN } }),
    ],
    note: 'A voiced time of NaN compares false against every policy, so it would pass every check it was meant to face.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-voiced-time-longer-than-the-recording',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ measured: { durationMs: 4000, voicedMs: 5000 } }),
    ],
    note: 'More voiced time than there is recording is not a measurement of this recording.',
  },
  {
    id: 'gradeReadAloud/ra/voiced-time-may-stand-a-float-tick-past-the-duration',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed(),
      measuredTake({ measured: { durationMs: 4000, voicedMs: 4000 + 1e-6 } }),
    ],
    note: 'Voiced time is summed window by window, so it can land a hair above the duration it was measured from: exactly one part in a million is inside the recording, and more is not.',
  },
  {
    id: 'gradeReadAloud/ra/needs-an-assessment-for-a-take',
    fn: 'gradeReadAloud',
    args: [ra(), recorded(), null, measuredTake()],
    note: 'No assessment at all is a missing argument, not evidence to refuse on its merits.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-recording-without-a-key',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      { type: 'read-aloud', recording: { key: '', mimeType: 'audio/wav' } },
      assessed(),
      measuredTake(),
    ],
    note: 'An empty key names no stored recording. It is not the blank either: a blank is `recording: null`, a decision the learner made.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-recording-that-is-not-an-object',
    fn: 'gradeReadAloud',
    args: [ra(), { type: 'read-aloud', recording: TAKE_KEY }, assessed(), measuredTake()],
  },
  {
    id: 'gradeReadAloud/ra/refuses-another-type-that-carries-a-recording',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      { type: 'dictation', recording: { key: TAKE_KEY, mimeType: 'audio/wav' } },
      assessed(),
      measuredTake(),
    ],
    note: 'The response type is read, not only the recording: a response of another type is refused even when it carries one.',
  },
  {
    id: 'alignReadAloud/ra/an-insertion-before-every-reference-word',
    fn: 'alignReadAloud',
    args: [
      { referenceText: 'the cat sat' },
      assessedAs('the cat sat', [
        heard('um', { error: 'insertion', accuracy: 20 }),
        heard('the'),
        heard('cat'),
        heard('sat'),
      ]),
    ],
    note: 'A word said before anything the text asks for goes first: there is no earlier entry to place it after.',
  },
  {
    id: 'validateSpeechAssessment/accepts-zero-and-one-at-the-bounds',
    fn: 'validateSpeechAssessment',
    args: [
      assessed({
        scores: { accuracy: 0, fluency: 100 },
        phonemeAlphabet: 'ipa',
        words: [
          {
            text: 'the',
            error: 'none',
            accuracy: 0,
            startMs: 0,
            durationMs: 0,
            breaks: { unexpected: 0, missing: 1 },
            syllables: [{ text: 'the', accuracy: 0, startMs: 0, durationMs: 0 }],
            phonemes: [
              {
                symbol: 'th',
                accuracy: 0,
                startMs: 0,
                durationMs: 0,
                heardAs: [{ symbol: 'f', score: 0 }],
              },
            ],
          },
        ],
        prosody: { monotoneConfidence: 1 },
        signal: { snrDb: 0 },
      }),
    ],
    note: 'Both ends of every scale are inside it: 0 and 100 for a score, 0 and 1 for a confidence, and 0 ms for a time or a length.',
  },
  ...[
    [
      'empty-strings',
      assessed({
        recordingKey: '',
        phonemeAlphabet: 'ipa',
        words: [
          {
            text: '',
            error: 'none',
            syllables: [{ text: '' }],
            phonemes: [{ symbol: '', heardAs: [{ symbol: '', score: 50 }] }],
          },
        ],
      }),
    ],
    [
      'a-phoneme-that-is-not-an-object',
      assessed({ words: [{ text: 'the', error: 'none', phonemes: [null] }] }),
    ],
    [
      'heard-as-without-an-alphabet',
      assessed({
        words: [
          { text: 'the', error: 'none', phonemes: [{ heardAs: [{ symbol: 'f', score: 50 }] }] },
        ],
      }),
    ],
  ].map(([name, value]) => ({
    id: `validateSpeechAssessment/refuses/${name}`,
    fn: 'validateSpeechAssessment',
    args: [value],
    ignore: ['message'],
  })),
  {
    id: 'inspectWav/an-empty-data-chunk',
    fn: 'inspectWav',
    args: [wav([]), INSPECTION],
    note: 'A header and a data chunk that declares nothing: a recording of no length, which is not the same as a file whose samples are missing.',
  },
  {
    id: 'inspectWav/header-without-samples',
    fn: 'inspectWav',
    args: [riff(chunk('fmt ', fmtBody())), INSPECTION],
    note: 'A format and no data chunk at all: the samples are missing, not empty.',
  },
  {
    id: 'inspectWav/no-format-chunk',
    fn: 'inspectWav',
    args: [riff(chunk('LIST', asciiBytes('INFO'))), INSPECTION],
    note: 'A RIFF/WAVE file that never says what its audio is.',
  },
  {
    id: 'inspectWav/format-chunk-cut-short',
    fn: 'inspectWav',
    args: [FMT_CUT_SHORT, INSPECTION],
    note: 'The file ends inside the chunk that describes the audio: the encoding cannot be named, and reading past the end is not the answer.',
  },
  {
    id: 'inspectWav/extensible-chunk-cut-short',
    fn: 'inspectWav',
    args: [EXTENSIBLE_CUT_SHORT, INSPECTION],
    note: 'A chunk that declares the extensible 40 bytes and carries 16: the SubFormat it points at is past the end of the file.',
  },
  {
    id: 'inspectWav/extensible-header-without-samples',
    fn: 'inspectWav',
    args: [
      riff(chunk('fmt ', fmtBody({ audioFormat: FORMAT_EXTENSIBLE, extensible: true }))),
      INSPECTION,
    ],
    note: 'The extensible tail ends exactly at the end of the file, which is enough to read it, and leaves no data chunk.',
  },
  {
    id: 'inspectWav/extensible-format-without-its-tail',
    fn: 'inspectWav',
    args: [wav(level(8, 1), { audioFormat: FORMAT_EXTENSIBLE }), INSPECTION],
    note: 'The extensible tag with only the plain 16-byte body: the SubFormat that would say what the audio really is was never written, so nothing else may stand in for it.',
  },
  {
    id: 'inspectWav/eight-bit-samples-with-a-matching-block-align',
    fn: 'inspectWav',
    args: [wav(quiet(8), { bitsPerSample: 8, blockAlign: 2 }), INSPECTION],
    note: 'Only the sample width is wrong, and it alone is enough: 8-bit samples read as 16-bit would be a measurement of noise.',
  },
  {
    id: 'inspectWav/zero-channels',
    fn: 'inspectWav',
    args: [wav([], { channels: 0, blockAlign: 0 }), INSPECTION],
    note: 'Audio of no channels is not audio, and a block of no bytes has no frames to count.',
  },
  {
    id: 'inspectWav/zero-sample-rate',
    fn: 'inspectWav',
    args: [wav(quiet(4), { sampleRate: 0 }), INSPECTION],
    note: 'Samples at no rate have no duration: a length in seconds needs a rate to divide by.',
  },
  {
    id: 'inspectWav/one-sample-a-second',
    fn: 'inspectWav',
    args: [wav(quiet(4), { sampleRate: 1 }), INSPECTION],
    note: 'A rate of 1 is absurd and readable: four seconds of silence, in windows of one frame, because a 20 ms window rounds to none.',
  },
  {
    id: 'inspectWav/a-data-chunk-longer-than-the-file',
    fn: 'inspectWav',
    args: [wav(quiet(8), {}, 80), INSPECTION],
    note: 'The data chunk declares 80 bytes and 16 are there. Measuring what arrived would report a recording shorter than the one the learner made.',
  },
  {
    id: 'inspectWav/a-single-loud-sample',
    fn: 'inspectWav',
    args: [wav([32767, ...quiet(159)]), INSPECTION],
    note: 'One full-scale sample in an otherwise silent window: the peak is that sample, and the window is voiced on its RMS across every sample it holds.',
  },
  {
    id: 'inspectWav/below-the-silence-floor',
    fn: 'inspectWav',
    args: [wav(level(WINDOW_FRAMES, 1)), INSPECTION],
    note: 'The quietest audible sample there is, at -90 dBFS: read, measured, and not voiced.',
  },
  {
    id: 'inspectWav/a-riff-signature-is-required',
    fn: 'inspectWav',
    args: [Uint8Array.from([...asciiBytes('JUNK'), ...wav(tone(80)).slice(4)]), INSPECTION],
    note: 'Everything after the first four bytes is a readable WAV. Both signatures are checked, so a file that only looks like one from the middle is still not one.',
  },
  {
    id: 'inspectWav/stereo-across-two-windows',
    fn: 'inspectWav',
    args: [wav(STEREO_TWO_WINDOWS, { channels: 2 }), { silenceDbfs: -50, frameMs: 10 }],
    note: 'Two windows of a two-channel recording: the second window starts at its own frame, counted in samples of every channel, and it is the only one with anything in it.',
  },
  {
    id: 'inspectWav/stereo-silence-then-a-tone',
    fn: 'inspectWav',
    args: [wav(STEREO_LATE_TONE, { channels: 2 }), INSPECTION],
    note: 'A window is measured across every sample of every channel it covers: half of this one is silent, and it is still voiced.',
  },
  {
    id: 'inspectWav/a-floor-at-full-scale',
    fn: 'inspectWav',
    args: [wav(level(WINDOW_FRAMES, -32768)), { silenceDbfs: 0, frameMs: 20 }],
    note: 'A floor of 0 dBFS is applicable, if unusable: the loudest audio there is sits exactly on it, and a window at the floor is voiced.',
  },
  {
    id: 'inspectWav/refuses-a-floor-above-full-scale',
    fn: 'inspectWav',
    args: [wav(tone(80)), { silenceDbfs: 1, frameMs: 20 }],
  },
  {
    id: 'inspectWav/refuses-a-floor-that-is-not-a-number',
    fn: 'inspectWav',
    args: [wav(tone(80)), { silenceDbfs: Number.NaN, frameMs: 20 }],
  },
  {
    id: 'inspectWav/a-one-millisecond-window',
    fn: 'inspectWav',
    args: [wav(tone(WINDOW_FRAMES)), { silenceDbfs: -50, frameMs: 1 }],
    note: 'The shortest window these fixtures use: 8 frames at 8 kHz, and every one of them voiced.',
  },
  {
    id: 'inspectWav/refuses-a-window-of-zero',
    fn: 'inspectWav',
    args: [wav(tone(80)), { silenceDbfs: -50, frameMs: 0 }],
  },
  {
    id: 'inspectWav/refuses-a-window-that-is-not-a-number',
    fn: 'inspectWav',
    args: [wav(tone(80)), { silenceDbfs: -50, frameMs: Number.NaN }],
  },
  // -- Read aloud: the bounds on the evidence --------------------------------
  //
  // How much text an assessment may carry between its words, how much that text
  // may spell once it is normalised, where the aligner stops reading it, and
  // what a grade does with evidence past either bound -- then the two items a
  // grade never comes from: a text that would mark no word, and a learner-safe
  // projection with the answer key taken out of it.
  {
    id: 'validateSpeechAssessment/accepts-words-at-the-text-bound',
    fn: 'validateSpeechAssessment',
    args: [assessed({ words: [...spelled(39, 200), heard('p'.repeat(161), { accuracy: 90 })] })],
    note: 'What the words spell is what the aligner reads, so it is what the bound is measured in: 39 words at the 200-character cap and one of 161 spell exactly 8,000 between them, the space that joins each to the one before it counted with it. At the bound, not past it.',
  },
  {
    id: 'validateSpeechAssessment/refuses/words-one-character-past-the-text-bound',
    fn: 'validateSpeechAssessment',
    args: [assessed({ words: [...spelled(40, 200), heard('p', { accuracy: 90 })] })],
    ignore: ['message'],
    note: 'Forty words at the cap and one character more: 8,001 as the words are written, which is refused without normalising a character of them. Reported at `words`, where no single word broke a rule of its own.',
  },
  {
    id: 'validateSpeechAssessment/refuses/words-one-character-past-what-they-spell',
    fn: 'validateSpeechAssessment',
    args: [assessed({ words: [...spelled(39, 200), heard('p'.repeat(162), { accuracy: 90 })] })],
    ignore: ['message'],
    note: 'One character past the bound above, and 7,962 as the words are written: inside the cap on what they carry, past the cap on what they spell. The aligner would read 8,000 of it and mark the rest of the reading as unread, so the evidence is refused rather than aligned.',
  },
  {
    id: 'validateSpeechAssessment/refuses/words-that-spell-more-than-they-are-written-with',
    fn: 'validateSpeechAssessment',
    args: [assessed({ words: expanding(3, 200) })],
    ignore: ['message'],
    note: 'Six hundred characters as written and 10,802 once they are normalised, because one character can stand for four words. Counting only what the words carry would accept this, and the words the learner actually said would be the ones past the aligner bound: marked from the noise before them, and graded.',
  },
  {
    id: 'validateSpeechAssessment/refuses/words-the-assessor-inserted-spell-past-the-text-bound',
    fn: 'validateSpeechAssessment',
    args: [assessed({ words: insertions(expanding(3, 200)) })],
    ignore: ['message'],
    note: 'The same three words, tagged as text the item never asked for. An inserted word is paired with nothing and moves no mark, but the aligner normalises it and carries it into its answer all the same, so what it spells is charged to the same 8,000. Six hundred characters as written is inside every other bound: a total that skipped these would be a bound one field could be set to walk past.',
  },
  {
    id: 'validateSpeechAssessment/refuses/one-word-past-its-cap-and-not-the-total',
    fn: 'validateSpeechAssessment',
    args: [assessed({ words: [...spelled(40, 200), heard('p'.repeat(201), { accuracy: 90 })] })],
    ignore: ['message'],
    note: 'Forty words at the cap and a 41st of 201: 8,201 characters in total, and one word past its own cap. Only the word is reported: an adapter that fixes what it is told about would find the total refused on its next run, where reporting both would say twice that one word is too long.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-an-assessment-past-the-text-bound',
    fn: 'gradeReadAloud',
    args: [
      ra(),
      recorded(),
      assessed({ words: [...spelled(40, 200), heard('p', { accuracy: 90 })] }),
      measuredTake(),
    ],
    ignore: ['reason'],
    note: 'Evidence too large to align is unscorable and never a 0: the learner read something, and a reading nobody can mark has not been failed.',
  },
  {
    id: 'gradeReadAloud/ra/grades-an-assessment-at-the-written-bound',
    fn: 'gradeReadAloud',
    args: [ra(), recorded(), assessed({ words: punctuated(40, 195, 5) }), measuredTake()],
    note: 'The other bound at its own edge, and this one is a grade: forty words of 200 characters, five of them punctuation no mark is made from, carry exactly 8,000 as they are written and spell 7,839. On a bound is inside it: evidence here is graded, and only a character more is refused.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-an-assessment-that-spells-past-the-text-bound',
    fn: 'gradeReadAloud',
    args: [ra(), recorded(), assessed({ words: expanding(3, 200) }), measuredTake()],
    ignore: ['reason'],
    note: 'The same refusal for evidence that is small as written and large once it is read: a grade is never made from the part of a reading that fit.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-an-assessment-whose-insertions-spell-past-the-text-bound',
    fn: 'gradeReadAloud',
    args: [ra(), recorded(), assessed({ words: insertions(expanding(3, 200)) }), measuredTake()],
    ignore: ['reason'],
    note: 'And the refusal is a grade the item never gets, not a 0 it is given: the whole of this reading is text the assessor says the item never asked for, so there is nothing in it that has been judged.',
  },
  {
    id: 'gradeReadAloud/ra/refuses-a-learner-safe-projection',
    fn: 'gradeReadAloud',
    args: [ra({ redacted: true }), recorded(), assessed(), measuredTake()],
    note: 'A read-aloud projection is itself valid read-aloud data, so nothing further down would notice that the authored feedback had been removed rather than never written. It throws, as score() does for every other type.',
  },
  {
    id: 'alignReadAloud/ra/heard-text-at-the-token-budget',
    fn: 'alignReadAloud',
    args: [
      { referenceText: reading(40) },
      assessed({
        referenceText: reading(40),
        recognizedText: undefined,
        words: [...spelled(39, 200), heard('p'.repeat(161), { accuracy: 90 })],
      }),
    ],
    note: 'Tokens are taken in reading order until the text they spell would pass 8,000 code points, the space that joins each to the one before it counted with it: 39 words of 200 characters and one of 161 are exactly that, and every word is read.',
  },
  {
    id: 'alignReadAloud/ra/heard-text-one-code-point-past-the-token-budget',
    fn: 'alignReadAloud',
    args: [
      { referenceText: reading(40) },
      assessed({
        referenceText: reading(40),
        recognizedText: undefined,
        words: [...spelled(39, 200), heard('p'.repeat(162), { accuracy: 90 })],
      }),
    ],
    note: 'One code point more and this is not evidence the aligner reads at all: validateSpeechAssessment bounds what the words spell on the same 8,000, so the public entry point refuses a reading it would otherwise have marked only part of. The budget inside it stays as a backstop for evidence some older build checked.',
  },
  {
    id: 'inspectWav/format-chunk-declaring-more-than-it-carries',
    fn: 'inspectWav',
    args: [
      riff([...chunk('fmt ', fmtBody(), FMT_BYTES + 2), ...chunk('data', quiet(8).flatMap(i16))]),
      INSPECTION,
    ],
    note: 'The format itself is readable, and the size it declares is two bytes longer than the body it carries: the walk steps over those 18 and lands inside the next header, so the samples are never found. A file cut short is truncated, not an encoding nobody can name.',
  },
  {
    id: 'inspectWav/voiced-time-is-never-longer-than-the-recording',
    fn: 'inspectWav',
    args: [wav(tone(198), { sampleRate: 11025 }), { silenceDbfs: -50, frameMs: 6 }],
    note: 'Three windows of 66 frames at a rate where a window is not a whole number of milliseconds. Added up they come to a hair more than the duration the same frames give in one expression, and more voiced time than there is recording is a measurement gradeReadAloud refuses to grade at all.',
  },
  {
    id: 'validateActivity/ra/a-reference-text-that-would-mark-no-word',
    fn: 'validateActivity',
    args: ['read-aloud', ra({ referenceText: '...' })],
    ignore: ['message'],
    note: 'A text of nothing but punctuation normalises to nothing: it would mark no word, so a blank would record no omission and a perfect reading would align as one insertion after another.',
  },
  { id: 'const/READ_ALOUD_MAX_REFERENCE_LENGTH', const: 'READ_ALOUD_MAX_REFERENCE_LENGTH' },
  { id: 'const/READ_ALOUD_MAX_SECONDS', const: 'READ_ALOUD_MAX_SECONDS' },
  { id: 'const/READ_ALOUD_MAX_TAKES', const: 'READ_ALOUD_MAX_TAKES' },
  { id: 'const/READ_ALOUD_MAX_DIMENSION_WEIGHT', const: 'READ_ALOUD_MAX_DIMENSION_WEIGHT' },
  { id: 'const/SPEECH_ASSESSMENT_MAX_WORDS', const: 'SPEECH_ASSESSMENT_MAX_WORDS' },
];
