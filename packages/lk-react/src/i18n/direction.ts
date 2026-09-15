/**
 * The writing direction of authored content. A language tag is read from the
 * tag alone, so a server rendering and the browser that hydrates it agree on
 * it. Text is read by the runtime's Unicode tables, which agree on every
 * character both runtimes' Unicode versions know.
 */

/** ISO 15924 codes of the scripts written right to left. */
const RTL_SCRIPT_CODES = new Set([
  'phlv',
  'adlm',
  'arab',
  'aran',
  'armi',
  'avst',
  'chrs',
  'cprt',
  'elym',
  'gara',
  'hatr',
  'hebr',
  'hung',
  'khar',
  'lydi',
  'mand',
  'mani',
  'mend',
  'merc',
  'mero',
  'narb',
  'nbat',
  'nkoo',
  'orkh',
  'ougr',
  'palm',
  'phli',
  'phlp',
  'phnx',
  'prti',
  'rohg',
  'samr',
  'sarb',
  'sidt',
  'sogd',
  'sogo',
  'syrc',
  'syre',
  'syrj',
  'syrn',
  'thaa',
  'yezi',
]);

/**
 * Languages written right to left in every script they are commonly written
 * in, including the deprecated tags `iw` and `ji` and the Arabic varieties
 * with tags of their own. A language also written left to right — Kurdish,
 * Sindhi, Uyghur — is not listed: its own text decides.
 */
const RTL_LANGUAGES = new Set([
  'acm',
  'aeb',
  'aii',
  'ajp',
  'apc',
  'ar',
  'arc',
  'ars',
  'ary',
  'arz',
  'azb',
  'bqi',
  'ckb',
  'dv',
  'fa',
  'glk',
  'hbo',
  'he',
  'iw',
  'ji',
  'jrb',
  'khw',
  'lrc',
  'mzn',
  'nqo',
  'ota',
  'pnb',
  'prs',
  'ps',
  'sdh',
  'skr',
  'syc',
  'syr',
  'ur',
  'yi',
]);

/**
 * The code-point blocks Unicode reserves for right-to-left scripts (their
 * default bidirectional class is R or AL): Hebrew through Arabic Extended-A,
 * the Hebrew and Arabic presentation forms, the historic right-to-left scripts
 * of the Supplementary Multilingual Plane, and Mende Kikakui through the Arabic
 * mathematical letters. A letter in one of them is written right to left.
 */
const RTL_BLOCKS: readonly (readonly [number, number])[] = [
  [0x0590, 0x08ff],
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfeff],
  [0x10800, 0x10fff],
  [0x1e800, 0x1efff],
];

/** Digits whose bidirectional class is R: N'Ko, Mende Kikakui and Adlam. */
const RTL_DIGITS: readonly (readonly [number, number])[] = [
  [0x07c0, 0x07c9],
  [0x1e8c7, 0x1e8cf],
  [0x1e950, 0x1e959],
];

const LETTER_RE = /^\p{L}$/u;
const NUMBER_RE = /^\p{N}$/u;

function within(point: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([first, last]) => point >= first && point <= last);
}

/**
 * The script subtag of a BCP 47 tag's lowercased subtags, if it names a
 * direction: not in a private-use or grandfathered tag (`x-arab`, `i-klingon`),
 * and not one of the codes for no particular script — Common, Inherited,
 * Unwritten, Unknown and the like (`Z` codes) or private use (`Qaaa`–`Qabx`).
 */
function scriptSubtagOf(subtags: readonly string[]): string | undefined {
  if ((subtags[0] as string).length === 1) {
    return undefined;
  }
  let index = 1;
  // Up to three extended language subtags may come between language and script.
  while (index < subtags.length && index <= 3 && /^[a-z]{3}$/.test(subtags[index] as string)) {
    index += 1;
  }
  const candidate = subtags[index];
  if (candidate === undefined || !/^[a-z]{4}$/.test(candidate)) {
    return undefined;
  }
  return /^z/.test(candidate) || (candidate >= 'qaaa' && candidate <= 'qabx')
    ? undefined
    : candidate;
}

/**
 * The direction a language tag names, or `undefined` when it names none: its
 * script subtag when it has one (`ku-Arab` is right-to-left, `ar-Latn` is not),
 * then the languages above. `-` and `_` both separate subtags. Anything that is
 * not a string names none.
 */
export function localeDirectionOf(locale: unknown): 'ltr' | 'rtl' | undefined {
  if (typeof locale !== 'string') {
    return undefined;
  }
  const subtags = locale.toLowerCase().split(/[-_]/);
  const script = scriptSubtagOf(subtags);
  if (script !== undefined) {
    return RTL_SCRIPT_CODES.has(script) ? 'rtl' : 'ltr';
  }
  return RTL_LANGUAGES.has(subtags[0] as string) ? 'rtl' : undefined;
}

const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);
/** RIGHT-TO-LEFT MARK and ARABIC LETTER MARK. */
const RIGHT_TO_LEFT_MARKS = new Set([String.fromCodePoint(0x200f), String.fromCodePoint(0x61c)]);

/**
 * The direction of `text`'s first letter or directional mark — an author can
 * start a transcript with a right-to-left mark to lay it out right to left — or
 * `undefined` when it has neither. Other characters with a strong direction,
 * such as a Hebrew punctuation mark or an N'Ko digit, are not read, so this is
 * the first strong character the Unicode bidirectional algorithm finds only
 * where the text starts with a letter or a mark. Letters are read by the
 * runtime's Unicode tables: a letter added in a later Unicode version than a
 * server's is not one to that server.
 */
export function textDirectionOf(text: string): 'ltr' | 'rtl' | undefined {
  for (const character of text) {
    if (character === LEFT_TO_RIGHT_MARK) {
      return 'ltr';
    }
    if (RIGHT_TO_LEFT_MARKS.has(character)) {
      return 'rtl';
    }
    if (LETTER_RE.test(character)) {
      return within(character.codePointAt(0) as number, RTL_BLOCKS) ? 'rtl' : 'ltr';
    }
  }
  return undefined;
}

/**
 * The direction a single character is laid out in, for a mark standing in for
 * it: a digit runs left to right unless it is one of the right-to-left digits,
 * a letter runs in its script's direction, and anything else has none of its
 * own.
 */
export function characterDirectionOf(character: string): 'ltr' | 'rtl' | undefined {
  const point = character.codePointAt(0) as number;
  if (NUMBER_RE.test(character)) {
    return within(point, RTL_DIGITS) ? 'rtl' : 'ltr';
  }
  if (LETTER_RE.test(character)) {
    return within(point, RTL_BLOCKS) ? 'rtl' : 'ltr';
  }
  return undefined;
}
