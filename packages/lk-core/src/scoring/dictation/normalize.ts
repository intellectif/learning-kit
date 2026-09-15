import { scopeCache } from '../../validation-scope.js';

/**
 * The tolerance as the normaliser reads it — the wire `DictationTolerance`, the
 * shape zod infers for it (optional fields typed `| undefined`), or stale data
 * of any shape, which is read defensively rather than thrown on.
 */
export type ToleranceLike =
  | {
      readonly equivalences?: readonly { readonly from: string; readonly to: string }[] | undefined;
    }
  | undefined;

/**
 * The longest transcript a dictation accepts, in code points, before and after
 * its equivalences are applied — and its rules may not grow it past twice
 * `DICTATION_MAX_TEXT_LENGTH` on the way. A dictation is a sentence or two; the
 * cap keeps the scorer's quadratic step bounded on the server that grades an
 * exam.
 */
export const DICTATION_MAX_TRANSCRIPT_LENGTH = 2000;
/**
 * The longest learner text the scorer compares, in code points. Text beyond it
 * is cut off — before normalisation, and again after it, because a rewrite rule
 * or a folded character can lengthen text — and the alignment says so.
 */
export const DICTATION_MAX_TEXT_LENGTH = 8000;
/** The longest `from` and `to` of an equivalence rule, in code points. */
export const DICTATION_MAX_EQUIVALENCE_LENGTH = 200;
/**
 * The most equivalence rules a dictation carries. The scorer reads no rule
 * past this many, so stale data with more cannot slow a grading run.
 */
export const DICTATION_MAX_EQUIVALENCES = 100;
/**
 * The most accepted transcripts a dictation carries. The scorer reads no more
 * than this many, for the same reason.
 */
export const DICTATION_MAX_ACCEPTED_TRANSCRIPTS = 10;

/**
 * How long text may grow while equivalence rules run, in code points: twice
 * the attempt cap. Every rule rewrites every occurrence of a word, and each
 * runs on the output of the last, so a few rules could otherwise grow one
 * typed letter past what a process can hold. Text the rules grow past this is
 * cut here, as part of its normalisation: the schema refuses a transcript, a
 * title or a recording description that needs the cut, and `alignDictation`
 * reports an attempt that needs it as truncated. No claim is made that the cut
 * text normalises to a prefix of what unbounded rules would give — a later rule
 * that shrinks text can bring back into range what the cut removed, and no
 * bounded computation can reproduce that in general.
 */
export const WORKING_LENGTH = 2 * DICTATION_MAX_TEXT_LENGTH;

/**
 * The fewest characters of scripts written without spaces, not counting
 * combining marks or digits, a transcript needs before the reveal check looks
 * for it where its edges cannot be seen. Two or three such characters often spell part
 * of another word — ตา ("eye") inside ตาม ("follow") — and a title may not be
 * refused for that; four in a row are the transcript wherever they stand.
 */
const UNSPACED_REVEAL_MIN_CHARACTERS = 4;

/**
 * Code points are built from their numbers so the source stays ASCII: the
 * formatter rewrites a `\u` escape in a string into the raw character, and a
 * hyphen and a Unicode hyphen are indistinguishable on screen.
 */
const cp = (...points: number[]): string => String.fromCodePoint(...points);

const NEXT_LINE = cp(0x85);
const MIDDLE_DOT = cp(0xb7);
const TIBETAN_TSHEG = cp(0x0f0b);
const COMBINING_KEYCAP = cp(0x20e3);
const WAVING_BLACK_FLAG = 0x1f3f4;
const ZWNJ = 0x200c;
const ZWJ = 0x200d;
const MONGOLIAN_VOWEL_SEPARATOR = 0x180e;
/** ZERO WIDTH NON-JOINER, ZERO WIDTH JOINER, MONGOLIAN VOWEL SEPARATOR. */
const JOINERS = cp(ZWNJ, ZWJ, MONGOLIAN_VOWEL_SEPARATOR);
/** The Mongolian free variation selectors. */
const MONGOLIAN_SELECTORS = cp(0x180b, 0x180c, 0x180d, 0x180f);
/** The tag characters, U+E0020 to U+E007F, as a character-class range. */
const TAGS = `${cp(0xe0020)}-${cp(0xe007f)}`;
/** ARABIC TATWEEL and NKO LAJANYALAN: letters that only stretch a word. */
const STRETCHERS = cp(0x0640, 0x07fa);

/**
 * Compatibility characters, compared as the characters they stand for (their
 * NFKC form): fullwidth and halfwidth forms, which an input method for
 * Chinese, Japanese or Korean types by default; the Latin ligatures and
 * digraphs (ĳ, ŀ, ŉ, ǆ, ǉ, ǌ, ǳ) and the presentation forms and ligatures that
 * text copied from a PDF carries; Kangxi radicals, which look like the
 * ideographs they are drawn from; letterlike symbols such as ℃; Roman
 * numerals; vulgar fractions; enclosed, parenthesized, superscript and
 * subscript digits, letters and signs, the circled numbers to 50 included; the
 * micro sign; and the ordinal indicators º and ª. Not the spacing diacritics,
 * which decompose to a space and a combining mark, nor the fullwidth tilde,
 * which {@link FOLDED} reads as the wave dash it is typed for. A presentation
 * form of a combining mark is read by {@link foldCompatibility}.
 */
const COMPATIBILITY_RE = new RegExp(
  `[${[
    cp(0xaa),
    cp(0xb2, 0xb3, 0xb5, 0xb9, 0xba),
    `${cp(0xbc)}-${cp(0xbe)}`,
    `${cp(0x132)}-${cp(0x133)}`,
    `${cp(0x13f)}-${cp(0x140)}`,
    cp(0x149),
    `${cp(0x1c4)}-${cp(0x1cc)}`,
    `${cp(0x1f1)}-${cp(0x1f3)}`,
    `${cp(0x2070)}-${cp(0x209f)}`,
    `${cp(0x2100)}-${cp(0x218f)}`,
    `${cp(0x2460)}-${cp(0x24ff)}`,
    `${cp(0x2e80)}-${cp(0x2fdf)}`,
    `${cp(0x3251)}-${cp(0x325f)}`,
    `${cp(0x32b1)}-${cp(0x32bf)}`,
    `${cp(0xfb00)}-${cp(0xfdff)}`,
    `${cp(0xfe10)}-${cp(0xfe19)}`,
    `${cp(0xfe30)}-${cp(0xfe6f)}`,
    `${cp(0xfe70)}-${cp(0xfefe)}`,
    `${cp(0xff01)}-${cp(0xff5d)}`,
    `${cp(0xff5f)}-${cp(0xffe2)}`,
    `${cp(0xffe4)}-${cp(0xffee)}`,
  ].join('')}]`,
  'gu',
);

/**
 * The compatibility jamo (U+3131–U+318E) a Korean keyboard types, by the
 * conjoining jamo they share an NFKC form with: a halfwidth jamo stands for the
 * compatibility jamo of the same name, and its NFKC form alone is a conjoining
 * jamo, which composes with the next into a syllable it was never typed as.
 */
const COMPATIBILITY_JAMO = new Map(
  Array.from({ length: 0x318e - 0x3131 + 1 }, (_, index) => {
    const jamo = cp(0x3131 + index);
    return [jamo.normalize('NFKC'), jamo] as const;
  }),
);

/**
 * Sequences written two ways that mean one thing, folded to the one Unicode
 * recommends: the Malayalam chillu letters in their pre-Unicode-5.1 spelling
 * (consonant, virama, joiner), the Bengali khanda ta likewise, the Malayalam
 * nta written with NA rather than chillu N, and the Marathi eyelash ra spelled
 * with RA rather than RRA, or with RRA and a joiner it does not need.
 */
const SEQUENCE_FOLDS = new Map<string, string>([
  [cp(0x0d23, 0x0d4d, ZWJ), cp(0x0d7a)],
  [cp(0x0d28, 0x0d4d, ZWJ), cp(0x0d7b)],
  [cp(0x0d30, 0x0d4d, ZWJ), cp(0x0d7c)],
  [cp(0x0d32, 0x0d4d, ZWJ), cp(0x0d7d)],
  [cp(0x0d33, 0x0d4d, ZWJ), cp(0x0d7e)],
  [cp(0x0d15, 0x0d4d, ZWJ), cp(0x0d7f)],
  [cp(0x0d2e, 0x0d4d, ZWJ), cp(0x0d54)],
  [cp(0x0d2f, 0x0d4d, ZWJ), cp(0x0d55)],
  [cp(0x0d34, 0x0d4d, ZWJ), cp(0x0d56)],
  [cp(0x09a4, 0x09cd, ZWJ), cp(0x09ce)],
  [cp(0x0d28, 0x0d4d, 0x0d31), cp(0x0d7b, 0x0d4d, 0x0d31)],
  [cp(0x0930, 0x094d, ZWJ), cp(0x0931, 0x094d)],
  [cp(0x0931, 0x094d, ZWJ), cp(0x0931, 0x094d)],
]);
const SEQUENCE_FOLDS_RE = new RegExp([...SEQUENCE_FOLDS.keys()].join('|'), 'gu');
/**
 * The Thai and Lao SARA AM typed as its two parts, NIKHAHIT and SARA AA, with
 * any tone marks typed between them — the order that draws like the vowel —
 * or before them: the tone marks, then the vowel.
 */
const THAI_SARA_AM_PARTS_RE = new RegExp(
  `${cp(0x0e4d)}([${cp(0x0e48)}-${cp(0x0e4b)}]*)${cp(0x0e32)}`,
  'gu',
);
const LAO_SARA_AM_PARTS_RE = new RegExp(
  `${cp(0x0ecd)}([${cp(0x0ec8)}-${cp(0x0ecb)}]*)${cp(0x0eb2)}`,
  'gu',
);

function foldSequences(text: string): string {
  return text
    .replace(SEQUENCE_FOLDS_RE, (sequence) => SEQUENCE_FOLDS.get(sequence) as string)
    .replace(THAI_SARA_AM_PARTS_RE, `$1${cp(0x0e33)}`)
    .replace(LAO_SARA_AM_PARTS_RE, `$1${cp(0x0eb3)}`);
}

/**
 * Typographic quotation marks folded to the ASCII apostrophe or quote, and the
 * hyphens of other scripts folded to `-`. A phone keyboard types U+2019 for the
 * apostrophe in "don't"; without the fold that apostrophe costs an edit against
 * a transcript typed with U+0027. The acute and grave accents (U+00B4, U+0060)
 * are symbols, not punctuation, so they would survive the punctuation strip
 * unless folded here. The Hebrew geresh and maqaf are what an ASCII apostrophe
 * and hyphen stand in for on most keyboards, and the Tibetan non-breaking tsheg
 * is the tsheg.
 */
const FOLDED = new Map<string, string>(
  (
    [
      [0x2018, "'"], // LEFT SINGLE QUOTATION MARK
      [0x2019, "'"], // RIGHT SINGLE QUOTATION MARK (the smart apostrophe)
      [0x201a, "'"], // SINGLE LOW-9 QUOTATION MARK
      [0x201b, "'"], // SINGLE HIGH-REVERSED-9 QUOTATION MARK
      [0x2032, "'"], // PRIME
      [0x02bc, "'"], // MODIFIER LETTER APOSTROPHE
      [0x00b4, "'"], // ACUTE ACCENT, used as an apostrophe
      [0x0060, "'"], // GRAVE ACCENT, used as an apostrophe
      [0x05f3, "'"], // HEBREW PUNCTUATION GERESH
      [0x201c, '"'], // LEFT DOUBLE QUOTATION MARK
      [0x201d, '"'], // RIGHT DOUBLE QUOTATION MARK
      [0x201e, '"'], // DOUBLE LOW-9 QUOTATION MARK
      [0x2033, '"'], // DOUBLE PRIME
      [0x05f4, '"'], // HEBREW PUNCTUATION GERSHAYIM
      [0x2010, '-'], // HYPHEN
      [0x2011, '-'], // NON-BREAKING HYPHEN
      [0x05be, '-'], // HEBREW PUNCTUATION MAQAF
      [0x058a, '-'], // ARMENIAN HYPHEN
      [0x0f0c, TIBETAN_TSHEG], // TIBETAN MARK DELIMITER TSHEG BSTAR
      [0xff5e, cp(0x301c)], // FULLWIDTH TILDE, which a Japanese keyboard types for the WAVE DASH
    ] as const
  ).map(([point, folded]) => [cp(point), folded]),
);
const FOLDED_RE = new RegExp(`[${[...FOLDED.keys()].join('')}]`, 'gu');
/**
 * Format characters that are drawn: the Arabic number signs and end of ayah,
 * the Syriac abbreviation mark and the Kaithi number signs (Unicode's
 * Prepended_Concatenation_Mark), each a visible sign over the digits after it.
 */
const DRAWN_FORMAT_CHARACTERS = `${cp(0x0600)}-${cp(0x0605)}${cp(0x06dd, 0x070f, 0x0890, 0x0891, 0x08e2, 0x110bd, 0x110cd)}`;
/**
 * Characters nobody types as spelling: control characters other than the ones
 * that are spacing (tab, line feed, vertical tab, form feed, carriage return,
 * next line), format characters that are not drawn (zero-width space,
 * byte-order mark, soft hyphen), the rest of Unicode's default-ignorable code
 * points — variation selectors, so an emoji typed with or without U+FE0F is the
 * same emoji, and the Hangul fillers — and the Arabic tatweel and N'Ko
 * lajanyalan, which only stretch a word across the line.
 *
 * Left for {@link keepsInContext} to decide: the joiners, the Mongolian
 * selectors and the tag characters, each of which is spelling in one place.
 */
const INVISIBLE_RE = new RegExp(
  `(?![\\t\\n\\v\\f\\r${NEXT_LINE}${JOINERS}${MONGOLIAN_SELECTORS}${TAGS}${DRAWN_FORMAT_CHARACTERS}])[\\p{Cc}\\p{Cf}\\p{Default_Ignorable_Code_Point}${STRETCHERS}]`,
  'gu',
);
/** Two or more of the same joiner in a row, which draw as one. */
const REPEATED_JOINER_RE = new RegExp(`([${JOINERS}])\\1+`, 'gu');
/**
 * A lone surrogate, which is no character: read as U+FFFD, so that no removal
 * later in the normalisation can pair two of them into a character it would
 * have removed or lowercased.
 */
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const REPLACEMENT_CHARACTER = cp(0xfffd);
const CONTEXTUAL_RE = new RegExp(`[${JOINERS}${MONGOLIAN_SELECTORS}${TAGS}]`, 'u');
const WHITESPACE_RE = new RegExp(`[\\s${NEXT_LINE}]+`, 'gu');
/**
 * The scripts written without spaces between words, by script extension, so
 * the Japanese long-vowel mark and the kana voicing marks count as the kana
 * they belong to.
 */
const UNSPACED_CLASS =
  '\\p{Script_Extensions=Han}\\p{Script_Extensions=Hiragana}\\p{Script_Extensions=Katakana}\\p{Script_Extensions=Thai}\\p{Script_Extensions=Lao}\\p{Script_Extensions=Khmer}\\p{Script_Extensions=Myanmar}';
/**
 * A character of a script written without spaces — but not a digit: a number is
 * a word in every script, so a Thai or a Burmese number has edges as a Latin
 * one has.
 */
const UNSPACED_CHARACTER = `(?!\\p{Nd})[${UNSPACED_CLASS}]`;
/**
 * The punctuation that is spelling inside a word: the apostrophe (`cat's`), the
 * hyphen (`well-known`, and a hyphen after a Devanagari vowel sign), the middle
 * dot of the Catalan `l·l`, and the Tibetan tsheg between syllables.
 */
const IN_WORD_PUNCTUATION = `'\\-${MIDDLE_DOT}${TIBETAN_TSHEG}`;
/**
 * Every punctuation code point, except in-word punctuation with a letter, a
 * combining mark or a digit on both sides, and the `#` or `*` of a keycap.
 * A middle dot beside a character of a script written without spaces is
 * punctuation — the dot between the parts of a name in Chinese, which Japanese
 * writes as U+30FB. Symbols (`\p{S}`: `$`, `+`, the euro sign, the minus
 * sign) are never removed; `&`, `%`, `/`, `@` and `#` are punctuation and are.
 * Each alternative starts with the character it removes, so a look-behind is
 * read only where that character stands.
 */
const PUNCTUATION_RE = new RegExp(
  [
    `[${IN_WORD_PUNCTUATION}](?<![\\p{L}\\p{M}\\p{N}][${IN_WORD_PUNCTUATION}])`,
    `[${IN_WORD_PUNCTUATION}](?![\\p{L}\\p{M}\\p{N}])`,
    `${MIDDLE_DOT}(?<=${UNSPACED_CHARACTER}${MIDDLE_DOT})`,
    `${MIDDLE_DOT}(?=${UNSPACED_CHARACTER})`,
    `(?![#*]${COMBINING_KEYCAP})[^\\P{P}${IN_WORD_PUNCTUATION}]`,
  ].join('|'),
  'gu',
);
/** Every punctuation mark but a keycap's `#` or `*`, in-word punctuation included. */
const ALL_PUNCTUATION_RE = new RegExp(`(?![#*]${COMBINING_KEYCAP})\\p{P}`, 'gu');
/** A full stop, comma, apostrophe or Arabic separator inside a number: `1,100`, `3.5`. */
const DIGIT_SEPARATOR_RE = new RegExp(`(?<=\\p{N})[.,'${cp(0x066b, 0x066c)}](?=\\p{N})`, 'gu');

/** The characters a candidate's length in scripts without spaces counts: not its marks, not its digits. */
const UNSPACED_LETTERS_RE = new RegExp(`(?![\\p{M}\\p{Nd}])[${UNSPACED_CLASS}]`, 'gu');
/**
 * A space beside a character of a script written without spaces, with a letter,
 * mark or digit on its other side — `我 爱 北京`, and `我有 3 本书` for `我有3本书`.
 */
const SPACE_BESIDE_UNSPACED_RE = new RegExp(
  `(?<=${UNSPACED_CHARACTER}) (?=[\\p{L}\\p{M}\\p{N}])|(?<=[\\p{L}\\p{M}\\p{N}]) (?=${UNSPACED_CHARACTER})`,
  'gu',
);
/**
 * A word is a run of letters, combining marks and digits, and the joiners kept
 * inside one: a mark belongs to the letter before it, so a rule for the Hindi
 * word for "eight" does not rewrite the start of the word for "all eight", and
 * a Persian half-space is part of its word.
 */
const WORD_RE = new RegExp(`^[\\p{L}\\p{M}\\p{N}${JOINERS}]$`, 'u');
const UNSPACED_CHARACTER_RE = new RegExp(`^${UNSPACED_CHARACTER}$`, 'u');
/** What is drawn onto the character before it: a match never ends just before one. */
const EXTENDING_RE = new RegExp(`^[\\p{M}${JOINERS}${TAGS}]$`, 'u');

const WORD = 1;
const UNSPACED = 2;
const EXTENDING = 4;
const KNOWN = 8;
/**
 * What each character is, as the bits above, worked out once per character:
 * the rules ask it of the character beside every occurrence they test, and a
 * regular expression per question made a rule that fails its boundary at every
 * letter of a long text take seconds. One table of 64 KB per Unicode plane,
 * made the first time a character of that plane is asked about, so the cache
 * never holds more than the planes a process has read.
 */
const FLAGS: (Uint8Array | undefined)[] = [];

function flagsOfCharacter(character: string): number {
  return (
    KNOWN |
    (WORD_RE.test(character) ? WORD : 0) |
    (UNSPACED_CHARACTER_RE.test(character) ? UNSPACED : 0) |
    (EXTENDING_RE.test(character) ? EXTENDING : 0)
  );
}

/** The flags of the code point that starts at UTF-16 index `index` of `text`. */
function flagsAt(text: string, index: number): number {
  const point = text.codePointAt(index) as number;
  let plane = FLAGS[point >> 16];
  if (plane === undefined) {
    plane = new Uint8Array(0x10000);
    FLAGS[point >> 16] = plane;
  }
  const offset = point & 0xffff;
  let flags = plane[offset] as number;
  if (flags === 0) {
    flags = flagsOfCharacter(String.fromCodePoint(point));
    plane[offset] = flags;
  }
  return flags;
}

/**
 * The viramas — every character of Canonical_Combining_Class 9 in Unicode 16.0
 * (DerivedCombiningClass.txt): a joiner beside one chooses how a consonant
 * cluster is drawn.
 */
const VIRAMAS = new Set([
  0x94d, 0x9cd, 0xa4d, 0xacd, 0xb4d, 0xbcd, 0xc4d, 0xccd, 0xd3b, 0xd3c, 0xd4d, 0xdca, 0xe3a, 0xeba,
  0xf84, 0x1039, 0x103a, 0x1714, 0x1715, 0x1734, 0x17d2, 0x1a60, 0x1b44, 0x1baa, 0x1bab, 0x1bf2,
  0x1bf3, 0x2d7f, 0xa806, 0xa82c, 0xa8c4, 0xa953, 0xa9c0, 0xaaf6, 0xabed, 0x10a3f, 0x11046, 0x11070,
  0x1107f, 0x110b9, 0x11133, 0x11134, 0x111c0, 0x11235, 0x112ea, 0x1134d, 0x113ce, 0x113cf, 0x113d0,
  0x11442, 0x114c2, 0x115bf, 0x1163f, 0x116b6, 0x1172b, 0x11839, 0x1193d, 0x1193e, 0x119e0, 0x11a34,
  0x11a47, 0x11a99, 0x11c3f, 0x11d44, 0x11d45, 0x11d97, 0x11f41, 0x11f42, 0x1612f,
]);
/**
 * The letters that join the letter after them — Joining_Type D or L in Unicode
 * 16.0 (DerivedJoiningType.txt) — as inclusive ranges: Arabic, Syriac, N'Ko,
 * Mandaic, Mongolian, Phags-pa, Manichaean, Psalter Pahlavi, Hanifi Rohingya,
 * Sogdian, Old Uyghur, Chorasmian and Adlam.
 */
const JOINS_FORWARD: readonly (readonly [number, number])[] = [
  [0x620, 0x620],
  [0x626, 0x626],
  [0x628, 0x628],
  [0x62a, 0x62e],
  [0x633, 0x63f],
  [0x641, 0x647],
  [0x649, 0x64a],
  [0x66e, 0x66f],
  [0x678, 0x687],
  [0x69a, 0x6bf],
  [0x6c1, 0x6c2],
  [0x6cc, 0x6cc],
  [0x6ce, 0x6ce],
  [0x6d0, 0x6d1],
  [0x6fa, 0x6fc],
  [0x6ff, 0x6ff],
  [0x712, 0x714],
  [0x71a, 0x71d],
  [0x71f, 0x727],
  [0x729, 0x729],
  [0x72b, 0x72b],
  [0x72d, 0x72e],
  [0x74e, 0x758],
  [0x75c, 0x76a],
  [0x76d, 0x770],
  [0x772, 0x772],
  [0x775, 0x777],
  [0x77a, 0x77f],
  [0x7ca, 0x7ea],
  [0x841, 0x845],
  [0x848, 0x848],
  [0x84a, 0x853],
  [0x855, 0x855],
  [0x860, 0x860],
  [0x862, 0x865],
  [0x868, 0x868],
  [0x886, 0x886],
  [0x889, 0x88d],
  [0x8a0, 0x8a9],
  [0x8af, 0x8b0],
  [0x8b3, 0x8b8],
  [0x8ba, 0x8c8],
  [0x1807, 0x1807],
  [0x1820, 0x1878],
  [0x1887, 0x18a8],
  [0x18aa, 0x18aa],
  [0xa840, 0xa872],
  [0x10ac0, 0x10ac4],
  [0x10acd, 0x10acd],
  [0x10ad3, 0x10adc],
  [0x10ade, 0x10ae0],
  [0x10aeb, 0x10aee],
  [0x10b80, 0x10b80],
  [0x10b82, 0x10b82],
  [0x10b86, 0x10b88],
  [0x10b8a, 0x10b8b],
  [0x10b8d, 0x10b8d],
  [0x10b90, 0x10b90],
  [0x10bad, 0x10bae],
  [0x10d00, 0x10d21],
  [0x10d23, 0x10d23],
  [0x10ec3, 0x10ec4],
  [0x10f30, 0x10f32],
  [0x10f34, 0x10f44],
  [0x10f51, 0x10f53],
  [0x10f70, 0x10f73],
  [0x10f76, 0x10f81],
  [0x10fb0, 0x10fb0],
  [0x10fb2, 0x10fb3],
  [0x10fb8, 0x10fb8],
  [0x10fbb, 0x10fbc],
  [0x10fbe, 0x10fbf],
  [0x10fc1, 0x10fc1],
  [0x10fc4, 0x10fc4],
  [0x10fca, 0x10fcb],
  [0x1e900, 0x1e943],
];
/** The letters that join the letter before them — Joining_Type D or R — as inclusive ranges. */
const JOINS_BACKWARD: readonly (readonly [number, number])[] = [
  [0x620, 0x620],
  [0x622, 0x63f],
  [0x641, 0x64a],
  [0x66e, 0x66f],
  [0x671, 0x673],
  [0x675, 0x6d3],
  [0x6d5, 0x6d5],
  [0x6ee, 0x6ef],
  [0x6fa, 0x6fc],
  [0x6ff, 0x6ff],
  [0x710, 0x710],
  [0x712, 0x72f],
  [0x74d, 0x77f],
  [0x7ca, 0x7ea],
  [0x840, 0x858],
  [0x860, 0x860],
  [0x862, 0x865],
  [0x867, 0x86a],
  [0x870, 0x882],
  [0x886, 0x886],
  [0x889, 0x88e],
  [0x8a0, 0x8ac],
  [0x8ae, 0x8c8],
  [0x1807, 0x1807],
  [0x1820, 0x1878],
  [0x1887, 0x18a8],
  [0x18aa, 0x18aa],
  [0xa840, 0xa871],
  [0x10ac0, 0x10ac5],
  [0x10ac7, 0x10ac7],
  [0x10ac9, 0x10aca],
  [0x10ace, 0x10ad6],
  [0x10ad8, 0x10ae1],
  [0x10ae4, 0x10ae4],
  [0x10aeb, 0x10aef],
  [0x10b80, 0x10b91],
  [0x10ba9, 0x10bae],
  [0x10d01, 0x10d23],
  [0x10ec2, 0x10ec4],
  [0x10f30, 0x10f44],
  [0x10f51, 0x10f54],
  [0x10f70, 0x10f81],
  [0x10fb0, 0x10fb0],
  [0x10fb2, 0x10fb6],
  [0x10fb8, 0x10fbf],
  [0x10fc1, 0x10fc4],
  [0x10fc9, 0x10fca],
  [0x1e900, 0x1e943],
];
/**
 * What a joining letter joins through (Joining_Type T): combining marks, the
 * Adlam nasalization mark, and the tag characters, which are still in the text
 * when a joiner's context is read.
 */
const TRANSPARENT_RE = new RegExp(`^[\\p{Mn}\\p{Me}${cp(0x1e94b)}${TAGS}]$`, 'u');

function collapseWhitespace(text: string): string {
  return text.replace(WHITESPACE_RE, ' ').trim();
}

/** The number of code points in `text`. */
export function codePointLength(text: string): number {
  let length = 0;
  for (const _ of text) {
    length += 1;
  }
  return length;
}

/**
 * The first `max` code points of `text`; `text` itself when it is no longer
 * than that. Walks only as far as the cut, so a text of any size costs no more
 * than `max` code points.
 */
export function truncateCodePoints(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  let points = 0;
  let units = 0;
  for (const character of text) {
    if (points === max) {
      return text.slice(0, units);
    }
    points += 1;
    units += character.length;
  }
  return text;
}

/** Whether `text` is longer than `max` code points, without counting past the answer. */
export function isLongerThan(text: string, max: number): boolean {
  if (text.length <= max) {
    return false;
  }
  return text.length > 2 * max || truncateCodePoints(text, max).length < text.length;
}

function inRanges(point: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([first, last]) => point >= first && point <= last);
}

/** A Mongolian letter or mark: the block's letters from U+1820 on (its few unassigned code points read the same). */
function isMongolianLetterOrMark(point: number | undefined): boolean {
  return point !== undefined && point >= 0x1820 && point <= 0x18aa;
}

/** A Mongolian free variation selector. */
function isMongolianSelector(point: number | undefined): boolean {
  return point !== undefined && ((point >= 0x180b && point <= 0x180d) || point === 0x180f);
}

/** The nearest code point before `index` in `points` that is not a nonspacing or enclosing mark. */
function letterBefore(points: readonly string[], index: number): number | undefined {
  for (let at = index - 1; at >= 0; at -= 1) {
    const point = points[at] as string;
    if (!TRANSPARENT_RE.test(point)) {
      return point.codePointAt(0);
    }
  }
  return undefined;
}

function letterAfter(points: readonly string[], index: number): number | undefined {
  for (let at = index + 1; at < points.length; at += 1) {
    const point = points[at] as string;
    if (!TRANSPARENT_RE.test(point)) {
      return point.codePointAt(0);
    }
  }
  return undefined;
}

const LETTER_OR_MARK_RE = /^[\p{L}\p{M}]$/u;

/**
 * Whether the joiner or Mongolian selector at `index` is kept: where it changes
 * what is written, as the rules for joiners in internationalised domain names
 * (RFC 5892, CONTEXTJ) and Unicode's own script chapters and Mongolian
 * specification read.
 *
 * - A zero-width joiner directly after a virama — a half form, a Sinhala
 *   conjunct, an eyelash ra — or between a letter and the virama after it, where
 *   Unicode uses it for another written form of the cluster: the Bengali
 *   ya-phalaa after RA, a Sinhala touching conjunct, a RA without its reph.
 * - A zero-width non-joiner directly after a virama; or between a letter that
 *   joins the one after it and a letter that joins the one before it
 *   (transparent characters between them skipped), where it breaks a join — the
 *   Persian half-space of می‌خواهم, but not the invisible one after ز in روز‌ها.
 * - The Mongolian vowel separator between a Mongolian letter, mark or free
 *   variation selector and a Mongolian letter or mark.
 * - A Mongolian free variation selector directly after a Mongolian letter or
 *   mark.
 *
 * A repeated joiner has been read as one before this is asked, and the tag
 * characters are {@link settle}'s to decide.
 */
function keepsInContext(points: readonly string[], index: number): boolean {
  const point = (points[index] as string).codePointAt(0) as number;
  const previous = points[index - 1];
  const afterVirama = previous !== undefined && VIRAMAS.has(previous.codePointAt(0) as number);
  if (point === ZWJ) {
    const next = points[index + 1];
    return (
      afterVirama ||
      (previous !== undefined &&
        LETTER_OR_MARK_RE.test(previous) &&
        next !== undefined &&
        VIRAMAS.has(next.codePointAt(0) as number))
    );
  }
  if (point === ZWNJ) {
    if (afterVirama) {
      return true;
    }
    const before = letterBefore(points, index);
    const after = letterAfter(points, index);
    return (
      before !== undefined &&
      after !== undefined &&
      inRanges(before, JOINS_FORWARD) &&
      inRanges(after, JOINS_BACKWARD)
    );
  }
  const previousPoint = previous?.codePointAt(0);
  if (point === MONGOLIAN_VOWEL_SEPARATOR) {
    return (
      (isMongolianLetterOrMark(previousPoint) || isMongolianSelector(previousPoint)) &&
      isMongolianLetterOrMark(points[index + 1]?.codePointAt(0))
    );
  }
  return isMongolianLetterOrMark(previousPoint);
}

/**
 * `text` with its sequences folded, a repeated joiner read as one, and its
 * joiners, Mongolian selectors and tag characters removed wherever they are not
 * in context — a tag character is kept in a run of them directly after U+1F3F4,
 * a subdivision flag — spacing collapsed and NFC applied; repeated until
 * nothing changes, because each removal can bring together characters that
 * compose, or take away the context of another.
 */
function settle(text: string): string {
  let current = text;
  for (;;) {
    let next = foldSequences(current);
    if (CONTEXTUAL_RE.test(next)) {
      const points = Array.from(next.replace(REPEATED_JOINER_RE, '$1'));
      // Decided in one pass: whether the characters so far are U+1F3F4 and a run of tags after it.
      let inFlag = false;
      next = points
        .filter((character, index) => {
          const point = character.codePointAt(0) as number;
          if (point >= 0xe0020 && point <= 0xe007f) {
            return inFlag;
          }
          inFlag = point === WAVING_BLACK_FLAG;
          return !CONTEXTUAL_RE.test(character) || keepsInContext(points, index);
        })
        .join('');
    }
    next = collapseWhitespace(next).normalize('NFC');
    if (next === current) {
      return current;
    }
    current = next;
  }
}

/** A compatibility form that is a combining mark, alone or on the space or tatweel that carries it in isolation. */
const CARRIED_MARKS_RE = new RegExp(`^[ ${cp(0x0640)}]?(\\p{M}+)$`, 'u');
const SPACING_CHARACTER_RE = new RegExp(`[\\s${NEXT_LINE}]`, 'u');
const PUNCTUATION_CHARACTER_RE = /^\p{P}$/u;

/**
 * A compatibility character's NFKC form, read in its place in `text`:
 *
 * - A halfwidth jamo is the compatibility jamo it stands for, not the
 *   conjoining jamo of its NFKC form.
 * - A presentation form of a combining mark — the halfwidth voiced and
 *   semi-voiced sound marks, an Arabic vowel mark's isolated or medial form —
 *   is that mark when a character precedes it to carry it, so `ｶﾞ` is `ガ`;
 *   at the start of the text or after a space it keeps its own form rather
 *   than put a mark on nothing.
 * - A punctuation mark whose NFKC form is a mark on a space, the dashed
 *   overlines, keeps its own form, and is removed as punctuation.
 */
function foldCompatibility(character: string, offset: number, text: string): string {
  const folded = character.normalize('NFKC');
  const carried = CARRIED_MARKS_RE.exec(folded);
  if (carried === null) {
    return COMPATIBILITY_JAMO.get(folded) ?? folded;
  }
  return PUNCTUATION_CHARACTER_RE.test(character) ||
    offset === 0 ||
    SPACING_CHARACTER_RE.test(text.charAt(offset - 1))
    ? character
    : (carried[1] as string);
}

/**
 * Steps 1–6 of the normalisation: lone surrogates read as U+FFFD, NFC,
 * compatibility characters folded, invisible characters removed, quotes and
 * hyphens folded, lowercased, whitespace collapsed, NFC again, then the
 * sequence folds and the joiner context settled. What an equivalence rule's `from` is matched as, and what it
 * is matched against: a symbol such as `&` survives, so a rule may name it
 * before the punctuation strip would remove it.
 */
export function preStripNormalize(text: string): string {
  return settle(
    collapseWhitespace(
      text
        .replace(LONE_SURROGATE_RE, REPLACEMENT_CHARACTER)
        .normalize('NFC')
        .replace(COMPATIBILITY_RE, foldCompatibility)
        .replace(INVISIBLE_RE, '')
        .replace(FOLDED_RE, (character) => FOLDED.get(character) as string)
        .toLowerCase(),
    ).normalize('NFC'),
  );
}

/** `text` with `pattern` replaced by `replacement` and settled, until nothing changes. */
function settleWithout(text: string, pattern: RegExp, replacement: string): string {
  let current = text;
  for (;;) {
    const next = settle(current.replace(pattern, replacement));
    if (next === current) {
      return current;
    }
    current = next;
  }
}

/** Steps 8–10: punctuation removed except inside a word, then settled again. */
function stripPunctuation(text: string): string {
  return settleWithout(text, PUNCTUATION_RE, '');
}

/**
 * The working text with every punctuation mark read as a space — in-word ones
 * too, but not a separator inside a number — for the reveal search, so a
 * transcript quoted as `Listen:hello` or `听写：你好` is found although the
 * strip joins it to the word before, and `rock n roll` inside `rock'n'roll`.
 */
function spacePunctuation(text: string): string {
  return settleWithout(text.replace(DIGIT_SEPARATOR_RE, ''), ALL_PUNCTUATION_RE, ' ');
}

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

/** The UTF-16 index where the code point ending at `index` (past the start of `text`) starts. */
function startOfCodePointBefore(text: string, index: number): number {
  return index >= 2 &&
    isLowSurrogate(text.charCodeAt(index - 1)) &&
    isHighSurrogate(text.charCodeAt(index - 2))
    ? index - 2
    : index - 1;
}

/**
 * The last code point of a string that ended with `previous` (`''` when it was
 * empty) once `appended` is added. The text is well formed — a lone surrogate
 * was read as U+FFFD — so no pair is ever split between the two.
 */
function lastCodePointAfter(previous: string, appended: string): string {
  return appended === ''
    ? previous
    : appended.slice(startOfCodePointBefore(appended, appended.length));
}

/**
 * An ASCII digit or lowercase letter: the ASCII word characters of text that
 * has been lowercased, as everything matched here has. Answered without a
 * regular expression because the rules ask once per occurrence they rewrite.
 */
function isAsciiWordUnit(unit: number): boolean {
  return (unit >= 0x30 && unit <= 0x39) || (unit >= 0x61 && unit <= 0x7a);
}

function isWordAt(text: string, index: number): boolean {
  const unit = text.charCodeAt(index);
  return unit < 0x80 ? isAsciiWordUnit(unit) : (flagsAt(text, index) & WORD) !== 0;
}

/** A word character of a script that separates its words with spaces. */
function isSpacedWordAt(text: string, index: number): boolean {
  const unit = text.charCodeAt(index);
  return unit < 0x80 ? isAsciiWordUnit(unit) : (flagsAt(text, index) & (WORD | UNSPACED)) === WORD;
}

function isExtendingAt(text: string, index: number): boolean {
  return text.charCodeAt(index) >= 0x80 && (flagsAt(text, index) & EXTENDING) !== 0;
}

/**
 * How a match's edge meets the text beside it.
 *
 * - `none` — no boundary: the edge is a symbol or a punctuation mark (`&` fires
 *   in `rock&roll`), or a letter of a script written without spaces, where a
 *   rule's word has no visible edge to require.
 * - `spaced` — the edge is a word character of a spaced script, and a word
 *   character of a spaced script beside it means the match is inside a longer
 *   word (`cat` never fires in `category`). A letter of another script beside
 *   it is a visible edge.
 * - `visible` — the edge is a letter of a script written without spaces, and
 *   any word character beside it hides where the match's word ends: the reveal
 *   check's reading of a short transcript.
 */
type Edge = 'none' | 'spaced' | 'visible';

/** Text searched for, with how each of its edges meets its neighbours. */
interface Phrase {
  text: string;
  before: Edge;
  after: Edge;
}

function edgeOf(text: string, index: number, unspaced: 'none' | 'visible'): Edge {
  if (!isWordAt(text, index)) {
    return 'none';
  }
  return isSpacedWordAt(text, index) ? 'spaced' : unspaced;
}

function phraseOf(text: string, unspaced: 'none' | 'visible'): Phrase {
  return {
    text,
    before: edgeOf(text, 0, unspaced),
    after: edgeOf(text, startOfCodePointBefore(text, text.length), unspaced),
  };
}

function blocks(edge: Edge, text: string, neighbour: number): boolean {
  if (edge === 'none') {
    return false;
  }
  return edge === 'spaced' ? isSpacedWordAt(text, neighbour) : isWordAt(text, neighbour);
}

/**
 * Whether an occurrence of `phrase` at UTF-16 index `at` of `text` is a match:
 * its edges meet their neighbours as {@link Edge} says, and nothing that draws
 * onto a character follows it. Both strings are well formed — a lone surrogate
 * was read as U+FFFD — so an occurrence always starts and ends on code-point
 * boundaries.
 */
function isMatchAt(text: string, phrase: Phrase, at: number): boolean {
  const end = at + phrase.text.length;
  if (end < text.length && (isExtendingAt(text, end) || blocks(phrase.after, text, end))) {
    return false;
  }
  return !(at > 0 && blocks(phrase.before, text, startOfCodePointBefore(text, at)));
}

/**
 * The UTF-16 index of the first match of `phrase` in `text` at or after
 * `start`, or `-1`. An occurrence refused because a word character of a
 * spaced script comes before it is inside a word, and so is every occurrence
 * that starts later in that word: the search goes on after it, so a rule that
 * finds its letter at every position of a long word costs that word once.
 */
function indexOfPhrase(text: string, phrase: Phrase, start: number): number {
  const needle = phrase.text;
  let at = text.indexOf(needle, start);
  while (at !== -1) {
    if (
      phrase.before === 'spaced' &&
      at > 0 &&
      isSpacedWordAt(text, startOfCodePointBefore(text, at))
    ) {
      let next = at;
      while (next < text.length && isSpacedWordAt(text, next)) {
        next +=
          isHighSurrogate(text.charCodeAt(next)) && isLowSurrogate(text.charCodeAt(next + 1))
            ? 2
            : 1;
      }
      at = text.indexOf(needle, next);
      continue;
    }
    if (isMatchAt(text, phrase, at)) {
      return at;
    }
    at = text.indexOf(needle, at + 1);
  }
  return -1;
}

/**
 * Whether `text` holds a match of `phrase`, found in time linear in both
 * lengths (Knuth–Morris–Pratt over UTF-16 units): a search that restarts after
 * each rejected occurrence costs the phrase's length per character on text
 * that repeats it.
 */
function containsPhrase(text: string, phrase: Phrase): boolean {
  const needle = phrase.text;
  const length = needle.length;
  if (length === 0 || length > text.length) {
    return false;
  }
  const fallback = new Int32Array(length);
  for (let index = 1, matched = 0; index < length; index += 1) {
    while (matched > 0 && needle.charCodeAt(index) !== needle.charCodeAt(matched)) {
      matched = fallback[matched - 1] as number;
    }
    if (needle.charCodeAt(index) === needle.charCodeAt(matched)) {
      matched += 1;
    }
    fallback[index] = matched;
  }
  for (let index = 0, matched = 0; index < text.length; index += 1) {
    while (matched > 0 && text.charCodeAt(index) !== needle.charCodeAt(matched)) {
      matched = fallback[matched - 1] as number;
    }
    if (text.charCodeAt(index) === needle.charCodeAt(matched)) {
      matched += 1;
    }
    if (matched === length) {
      if (isMatchAt(text, phrase, index - length + 1)) {
        return true;
      }
      matched = fallback[matched - 1] as number;
    }
  }
  return false;
}

interface Rule {
  from: Phrase;
  to: string;
  /**
   * Whether `to` starts, or ends, with a word character of a spaced script: a
   * space then sets it apart from such a character it would otherwise touch.
   */
  spaceBefore: boolean;
  spaceAfter: boolean;
}

/** A tolerance's rules, and the text that identifies them for a memo. */
interface CompiledRules {
  rules: readonly Rule[];
  signature: string;
}

/**
 * The rules of a tolerance, each as the pre-strip text it matches and the
 * words it inserts. `to` is inserted already normalised — its punctuation
 * removed — because the comparison ignores that punctuation anyway, and text
 * that only looks longer must not bring the working text closer to its cut.
 *
 * Only the first `DICTATION_MAX_EQUIVALENCES` entries are read, and each half of
 * a rule once. A rule that is not two strings, whose `from` or `to` is longer
 * than `DICTATION_MAX_EQUIVALENCE_LENGTH`, whose `from` folds to nothing, or
 * whose `to` normalises to nothing (it would delete a word) is skipped — stale
 * data only, since the schema refuses all of them — rather than thrown on.
 */
function compileRules(tolerance: ToleranceLike): CompiledRules {
  const equivalences = tolerance?.equivalences;
  if (!Array.isArray(equivalences)) {
    return { rules: [], signature: '[]' };
  }
  const rules: Rule[] = [];
  for (const rule of equivalences.slice(0, DICTATION_MAX_EQUIVALENCES)) {
    const rawFrom: unknown = rule?.from;
    const rawTo: unknown = rule?.to;
    if (
      typeof rawFrom !== 'string' ||
      typeof rawTo !== 'string' ||
      isLongerThan(rawFrom, DICTATION_MAX_EQUIVALENCE_LENGTH) ||
      isLongerThan(rawTo, DICTATION_MAX_EQUIVALENCE_LENGTH)
    ) {
      continue;
    }
    const from = preStripNormalize(rawFrom);
    const to = stripPunctuation(preStripNormalize(rawTo));
    if (from === '' || to === '') {
      continue;
    }
    rules.push({
      from: phraseOf(from, 'none'),
      to,
      spaceBefore: isSpacedWordAt(to, 0),
      spaceAfter: isSpacedWordAt(to, startOfCodePointBefore(to, to.length)),
    });
  }
  return {
    rules,
    signature: JSON.stringify(rules.map((rule) => [rule.from.text, rule.to])),
  };
}

/** Normalised text, and whether the working text was cut at `WORKING_LENGTH` on the way. */
export interface NormalizedText {
  text: string;
  cut: boolean;
}

/** `text` cut at `WORKING_LENGTH` code points, when it is longer. */
function bounded(text: string): NormalizedText {
  return isLongerThan(text, WORKING_LENGTH)
    ? { text: truncateCodePoints(text, WORKING_LENGTH), cut: true }
    : { text, cut: false };
}

/**
 * `text` with every match of `rule` rewritten, left to right and without
 * overlaps, except that it stops as soon as the output is longer than
 * `WORKING_LENGTH` code points and returns it cut there — the cut output is a
 * prefix of the full one, so nothing past the cut is computed.
 *
 * Where the rewrite would touch a word character of a spaced script in the
 * output, and its own edge there is one too (`50%` with `% → percent`), it is
 * set apart by a space. Both sides are decided on the output: after a rewrite,
 * by the text that follows it there — which, for a match right after it, is
 * that match's rewrite.
 */
function rewrite(text: string, rule: Rule): NormalizedText {
  let output = '';
  let consumed = 0;
  // The last code point of `output`, carried along rather than read back:
  // reading a string that is being built by appending makes the engine copy it
  // whole, and every rewrite would cost the length of everything before it.
  let last = '';
  for (
    let at = indexOfPhrase(text, rule.from, 0);
    at !== -1;
    at = indexOfPhrase(text, rule.from, consumed)
  ) {
    const between = text.slice(consumed, at);
    // The space after the last rewrite, when text follows it before this one;
    // with none between, this rewrite's own space before decides.
    if (rule.spaceAfter && consumed > 0 && between !== '' && isSpacedWordAt(between, 0)) {
      output += ' ';
    }
    output += between;
    last = lastCodePointAfter(last, between);
    if (rule.spaceBefore && last !== '' && isSpacedWordAt(last, 0)) {
      output += ' ';
      last = ' ';
    }
    output += rule.to;
    last = lastCodePointAfter(last, rule.to);
    consumed = at + rule.from.text.length;
    // More UTF-16 units than twice the limit is more code points than the limit.
    if (output.length > 2 * WORKING_LENGTH) {
      return { text: truncateCodePoints(output, WORKING_LENGTH), cut: true };
    }
  }
  const rest = text.slice(consumed);
  const apart = rule.spaceAfter && consumed > 0 && rest !== '' && isSpacedWordAt(rest, 0);
  return bounded(apart ? `${output} ${rest}` : output + rest);
}

const WORKING_TEXTS = Symbol('dictation working texts');
const MEASURED_TRANSCRIPTS = Symbol('dictation measured transcripts');
const SHOWN_TEXTS = Symbol('dictation shown texts');
const REVEALS = Symbol('dictation reveal answers');

/** A map for one tolerance's results, kept for the open validation scope — or a fresh one outside it. */
function scopedMap<V>(key: symbol, signature: string): Map<string, V> {
  const bySignature = scopeCache(key, () => new Map<string, Map<string, V>>());
  if (bySignature === undefined) {
    return new Map();
  }
  let map = bySignature.get(signature);
  if (map === undefined) {
    map = new Map();
    bySignature.set(signature, map);
  }
  return map;
}
const PRE_STRIP_TEXTS = Symbol('dictation pre-strip texts');

/** `bounded(preStripNormalize(text))`, remembered for the rest of an open validation scope. */
function boundedPreStrip(text: string): NormalizedText {
  const memo = scopeCache(PRE_STRIP_TEXTS, () => new Map<string, NormalizedText>());
  let result = memo?.get(text);
  if (result === undefined) {
    result = bounded(preStripNormalize(text));
    memo?.set(text, result);
  }
  return result;
}

/**
 * Whether nothing of `text` is left once its invisible characters, spacing and
 * folds are read — before any rule or the punctuation strip — normalised through
 * the same memo as the working text, so a draft's "not written yet" check and
 * the rules read one normalisation.
 */
export function isBlankBeforeRules(text: string): boolean {
  return boundedPreStrip(text).text === '';
}

/**
 * The pre-strip working text after every rule, cut at `WORKING_LENGTH`
 * whenever it grows past it. Remembered for the rest of an open validation
 * scope, by the rules' text and the input's.
 */
function workingText(
  text: string,
  compiled: CompiledRules,
  preStripped: NormalizedText = boundedPreStrip(text),
): NormalizedText {
  if (compiled.rules.length === 0) {
    return preStripped;
  }
  const memo = scopeCache(WORKING_TEXTS, () => new Map<string, Map<string, NormalizedText>>());
  let known = memo?.get(compiled.signature);
  const remembered = known?.get(text);
  if (remembered !== undefined) {
    return remembered;
  }
  let working = preStripped;
  let cut = working.cut;
  for (const rule of compiled.rules) {
    working = rewrite(working.text, rule);
    cut ||= working.cut;
  }
  const result = { text: working.text, cut };
  if (memo !== undefined) {
    if (known === undefined) {
      known = new Map();
      memo.set(compiled.signature, known);
    }
    known.set(text, result);
  }
  return result;
}

/**
 * `normalizeDictationText`, with whether the working text was cut on the way:
 * what `alignDictation` reports as `truncated` even when the result is short.
 */
export function normalizeDictationTextBounded(
  text: string,
  tolerance?: ToleranceLike,
): NormalizedText {
  const working = workingText(text, compileRules(tolerance));
  return { text: stripPunctuation(working.text), cut: working.cut };
}

/**
 * What a dictation compares: `text` with everything that is not spelling
 * removed, applied identically to the transcript and to the attempt.
 *
 * In order: a lone surrogate read as U+FFFD; NFC; compatibility characters
 * folded to what they stand for, in place (see `COMPATIBILITY_RE` and
 * `foldCompatibility`); invisible characters removed — control characters other
 * than spacing, format characters that are not drawn, default-ignorable code
 * points, the Arabic tatweel and N'Ko lajanyalan — except the joiners,
 * Mongolian selectors and tag characters left to the context check; quotes and
 * hyphens folded (see `FOLDED`); locale-insensitive lowercase; whitespace
 * (including NEXT LINE) collapsed to one space; NFC; sequences written two ways
 * folded (see `SEQUENCE_FOLDS`), a repeated joiner read as one, and each
 * joiner, selector or tag removed unless its context keeps it (see
 * `keepsInContext` and `settle`), until nothing changes; each equivalence rule
 * applied once, in listed order, to every match — a word being a run of
 * letters, combining marks, digits and kept joiners, so an apostrophe or a
 * hyphen ends one; a `from` edge that is a symbol, or a letter (not a digit) of
 * a script written without spaces, needs no boundary; and no match ends before
 * a combining mark — inserting `to` as its words, without its punctuation, and
 * set apart by a space from a word character of a spaced script it would touch
 * in the output; the
 * rules run after the collapse, so a multi-word `from` matches across a tab or
 * a newline, and before the punctuation strip, so a rule may name a symbol or a
 * punctuation mark; then punctuation removed except an apostrophe, hyphen,
 * middle dot or tsheg inside a word — a middle dot beside a character of a
 * script written without spaces is punctuation — and the `#` or `*` of a
 * keycap, and the folds and the context check applied again, until nothing
 * changes.
 *
 * Idempotent without a tolerance. With one, the rules are a fixed, ordered,
 * single pass, not a rewriting system: `[a → b, b → c]` sends `a` to `c`,
 * `[b → c, a → b]` sends `a` to `b`, and no rule can loop. `to` is inserted
 * literally — `$&` inserts a dollar sign, which is a symbol, and an ampersand,
 * which is punctuation and is removed — and no rule can turn a word into
 * nothing.
 *
 * Bounded for any input: while the rules run, the working text is cut at
 * twice `DICTATION_MAX_TEXT_LENGTH` code points, before the first rule and
 * after each one.
 */
export function normalizeDictationText(text: string, tolerance?: ToleranceLike): string {
  return normalizeDictationTextBounded(text, tolerance).text;
}

export type { Edge };

/** How the reveal search reads a candidate transcript. */
export interface RevealReading {
  /**
   * The texts looked for, as written and with its rules applied, each with its
   * punctuation removed and with every punctuation mark read as a space — a
   * separator inside a number removed in both — and, for a long candidate,
   * with each space beside a character of a script without spaces removed.
   */
  forms: readonly string[];
  /**
   * Four or more characters of scripts written without spaces, not counting
   * combining marks or digits, in the transcript as written.
   */
  long: boolean;
  /**
   * How its first and last characters, as written, meet the text beside them —
   * the same for every form, so a rule that changes the script at its edge
   * (`两 → 2`) does not change how it is found.
   */
  before: Edge;
  after: Edge;
}

/** A candidate transcript as the length, emptiness and reveal rules read it. */
export interface MeasuredTranscript {
  /**
   * Longer than `DICTATION_MAX_TRANSCRIPT_LENGTH` before or after its rules are
   * applied, or grown past the working bound while they ran.
   */
  tooLong: boolean;
  /** Its normalised text; `null` when it was already too long to normalise. */
  normalized: string | null;
  /** How the reveal search reads it: nothing to look for when it was too long to normalise. */
  reveal: RevealReading;
}

/** A title or a recording description as the reveal rule reads it. */
export interface ShownText {
  /**
   * Longer than the working bound raw, or grown past it by the rules: too long
   * to be searched for a transcript in full.
   */
  tooLong: boolean;
  /**
   * The forms searched: the text with its punctuation removed and with every
   * punctuation mark read as a space — a separator inside a number removed in
   * both — with its rules applied and without them. Empty when `tooLong`.
   */
  forms: readonly string[];
}

const NOTHING_TO_REVEAL: RevealReading = { forms: [], long: false, before: 'none', after: 'none' };

/** `text` with its punctuation removed, a separator inside a number included: `1'100` is one number. */
function stripForReveal(text: string): string {
  return stripPunctuation(text.replace(DIGIT_SEPARATOR_RE, ''));
}

/**
 * The reveal reading of a candidate whose pre-strip text is `written` and whose
 * working text, its rules applied, is `working`. The transcript as written
 * decides whether it is long and how its edges are found; one that is only
 * punctuation until its rules rewrite it is read as rewritten.
 */
function readingOf(written: string, working: string): RevealReading {
  const writtenStripped = stripForReveal(written);
  const workingStripped = stripForReveal(working);
  const source = writtenStripped === '' ? workingStripped : writtenStripped;
  if (source === '') {
    return NOTHING_TO_REVEAL;
  }
  const long = (source.match(UNSPACED_LETTERS_RE)?.length ?? 0) >= UNSPACED_REVEAL_MIN_CHARACTERS;
  const { before, after } = phraseOf(source, long ? 'none' : 'visible');
  const forms = [
    writtenStripped,
    spacePunctuation(written),
    workingStripped,
    spacePunctuation(working),
  ].map((form) => (long ? form.replace(SPACE_BESIDE_UNSPACED_RE, '') : form));
  return { forms: [...new Set(forms)].filter((form) => form !== ''), long, before, after };
}

/** The texts of one dictation, normalised under its tolerance. */
export interface DictationNormalizer {
  measure(text: string): MeasuredTranscript;
  shown(text: string): ShownText;
}

/**
 * A normaliser for one dictation's candidate transcripts and shown texts,
 * compiling its rules once and remembering each string it has read, so the
 * several rules that read a transcript — its emptiness, its length, its
 * duplicates, whether a title reveals it — normalise it once. A raw string over
 * its cap is not normalised at all.
 */
export function dictationNormalizer(tolerance: ToleranceLike): DictationNormalizer {
  const compiled = compileRules(tolerance);
  // Shared for the rest of an open validation scope, by the rules' text, so a
  // draft's checks and its schema read the very same results — which is what
  // lets the reveal search remember its answers too.
  const measured = scopedMap<MeasuredTranscript>(MEASURED_TRANSCRIPTS, compiled.signature);
  const shownTexts = scopedMap<ShownText>(SHOWN_TEXTS, compiled.signature);
  return {
    measure(text) {
      let result = measured.get(text);
      if (result === undefined) {
        if (isLongerThan(text, DICTATION_MAX_TRANSCRIPT_LENGTH)) {
          result = { tooLong: true, normalized: null, reveal: NOTHING_TO_REVEAL };
        } else {
          const written = boundedPreStrip(text);
          const working = workingText(text, compiled, written);
          const normalized = stripPunctuation(working.text);
          result = {
            tooLong: working.cut || isLongerThan(normalized, DICTATION_MAX_TRANSCRIPT_LENGTH),
            normalized,
            reveal: readingOf(written.text, working.text),
          };
        }
        measured.set(text, result);
      }
      return result;
    },
    shown(text) {
      let result = shownTexts.get(text);
      if (result === undefined) {
        // The text as written, without its rules, is searched too: a rule may
        // rewrite the title's copy of the transcript while leaving the
        // transcript alone.
        const plainText = isLongerThan(text, WORKING_LENGTH) ? null : boundedPreStrip(text);
        const working = plainText === null ? null : workingText(text, compiled, plainText);
        if (plainText === null || working === null || working.cut) {
          result = { tooLong: true, forms: [] };
        } else {
          const plain = plainText.text;
          result = {
            tooLong: false,
            forms: [
              ...new Set([
                stripForReveal(working.text),
                spacePunctuation(working.text),
                stripForReveal(plain),
                spacePunctuation(plain),
              ]),
            ],
          };
        }
        shownTexts.set(text, result);
      }
      return result;
    },
  };
}

/**
 * Whether `forms` (a {@link ShownText}'s) contain `candidate`, a measured
 * transcript, in any of its {@link RevealReading} forms.
 *
 * A candidate with fewer than `UNSPACED_REVEAL_MIN_CHARACTERS` characters of
 * scripts written without spaces is found only where its edges show: a letter
 * of such a script at its edge needs something other than a letter, mark or
 * digit beside it. One with at least that many is found wherever its
 * characters stand, with each space beside a character of such a script
 * ignored on both sides. A letter or digit of a spaced script at its edge needs
 * its boundary either way. A candidate too long for the schema, or one that
 * normalised to nothing, reveals nothing.
 */
export function revealsCandidate(forms: readonly string[], candidate: MeasuredTranscript): boolean {
  const memo = scopeCache(REVEALS, () => new WeakMap<object, WeakMap<object, boolean>>());
  const known = memo?.get(forms)?.get(candidate);
  if (known !== undefined) {
    return known;
  }
  const answer = searchReveal(forms, candidate);
  if (memo !== undefined) {
    const byCandidate = memo.get(forms) ?? new WeakMap<object, boolean>();
    byCandidate.set(candidate, answer);
    memo.set(forms, byCandidate);
  }
  return answer;
}

/** A shown text's forms with each space beside a character of a script without spaces removed, made once per forms. */
const COMPACTED_FORMS = new WeakMap<readonly string[], readonly string[]>();

function searchReveal(forms: readonly string[], candidate: MeasuredTranscript): boolean {
  const { reveal } = candidate;
  if (candidate.tooLong) {
    return false;
  }
  let fields = forms;
  if (reveal.long) {
    fields =
      COMPACTED_FORMS.get(forms) ?? forms.map((form) => form.replace(SPACE_BESIDE_UNSPACED_RE, ''));
    COMPACTED_FORMS.set(forms, fields);
  }
  return reveal.forms.some((text) => {
    const phrase: Phrase = { text, before: reveal.before, after: reveal.after };
    return fields.some((field) => containsPhrase(field, phrase));
  });
}
