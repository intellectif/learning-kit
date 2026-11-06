/**
 * The words of a mark-the-words text, and where an author's targets fall
 * among them. A leaf module: the schema, the scorer, the draft checks and the
 * component all read it, and it imports nothing.
 *
 * A learner marks words, never characters, and a response records a word by
 * its position — so how a text is cut into words is part of every stored
 * answer. The cut is the SDK's own (`lk-words@1`), not `Intl.Segmenter`,
 * whose word boundaries change with the ICU a runtime ships: the same text
 * must be the same words in every browser and on every server, now and when
 * the answer is graded again later.
 */

/** The name of the word cut. A change to it is a major: stored answers name words by position. */
export const MARK_THE_WORDS_TOKENIZER = 'lk-words@1';

/** The most words a mark-the-words text may have. */
export const MARK_THE_WORDS_MAX_WORDS = 1500;

/**
 * A word: a run of letters, marks and digits, which may hold an apostrophe or
 * a hyphen between two such runs — "don't", "well-known", "1960s". Punctuation
 * and spaces are never part of one and can never be marked.
 */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’ʼ\-‐][\p{L}\p{M}\p{N}]+)*/gu;

/** One markable word of a text. */
export interface MarkableWord {
  /** 0-based position among the text's words: what a response records. */
  index: number;
  /** The word as written. */
  text: string;
  /** Where it starts and ends in the text, in UTF-16 units. */
  start: number;
  end: number;
}

/** Every markable word of `text`, in order, cut by `lk-words@1`. */
export function markableWords(text: string): MarkableWord[] {
  const words: MarkableWord[] = [];
  for (const match of text.matchAll(WORD)) {
    words.push({
      index: words.length,
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return words;
}

/** A word as compared with a target's: composed, and with one apostrophe and one hyphen. */
export function wordKey(word: string): string {
  return word.normalize('NFC').replace(/[’ʼ]/g, "'").replace(/‐/g, '-');
}

/** One word, or several in a row, that the learner should mark. */
export interface MarkTargetQuote {
  /** The word or words, copied from the text. */
  text: string;
  /** Which appearance, 1-based, where they appear more than once. */
  occurrence?: number;
}

/** Why a target names no words of the text. */
export type MarkTargetProblem = 'no-words' | 'not-found' | 'ambiguous' | 'no-such-occurrence';

/** Where a target falls: the positions of its words, or why it falls nowhere. */
export type MarkTargetResolution =
  | { ok: true; indices: number[] }
  | { ok: false; problem: MarkTargetProblem; found: number };

/** Every place `needle` appears in `words`, as the position of its first word. */
function placesOf(words: readonly string[], needle: readonly string[]): number[] {
  const places: number[] = [];
  for (let at = 0; at + needle.length <= words.length; at += 1) {
    if (needle.every((word, offset) => words[at + offset] === word)) {
      places.push(at);
    }
  }
  return places;
}

/**
 * Where a target falls among `words`. Its text must be whole words of the text,
 * in order — case, accents and punctuation as written, apart from the kind of
 * apostrophe — and must say which appearance it means when there are several.
 */
export function resolveMarkTarget(
  words: readonly MarkableWord[],
  target: { text?: unknown; occurrence?: unknown },
): MarkTargetResolution {
  const text = typeof target.text === 'string' ? target.text : '';
  const needle = markableWords(text).map((word) => wordKey(word.text));
  if (needle.length === 0) {
    return { ok: false, problem: 'no-words', found: 0 };
  }
  const places = placesOf(
    words.map((word) => wordKey(word.text)),
    needle,
  );
  if (places.length === 0) {
    return { ok: false, problem: 'not-found', found: 0 };
  }
  const occurrence = target.occurrence;
  let at: number | undefined;
  if (occurrence === undefined) {
    if (places.length > 1) {
      return { ok: false, problem: 'ambiguous', found: places.length };
    }
    at = places[0];
  } else {
    at =
      typeof occurrence === 'number' && Number.isInteger(occurrence) && occurrence >= 1
        ? places[occurrence - 1]
        : undefined;
    if (at === undefined) {
      return { ok: false, problem: 'no-such-occurrence', found: places.length };
    }
  }
  return { ok: true, indices: needle.map((_, offset) => (at as number) + offset) };
}

/**
 * The word positions of each target of an item, in target order; a target
 * that falls nowhere has none. Read defensively: the scorer is reachable with
 * content an older build stored.
 */
export function markTargetIndices(data: { text?: unknown; targets?: unknown }): number[][] {
  const words = markableWords(typeof data.text === 'string' ? data.text : '');
  const targets = Array.isArray(data.targets) ? data.targets : [];
  return targets.map((target) => {
    if (typeof target !== 'object' || target === null) {
      return [];
    }
    const found = resolveMarkTarget(words, target as MarkTargetQuote);
    return found.ok ? found.indices : [];
  });
}

/**
 * A text and its targets from markup that stars each target, as an H5P "Mark
 * the Words" text does: `I *went* home and *had gone* to bed.` A `\*` is a
 * literal star. Each target names its appearance only where its words appear
 * more than once in the text.
 *
 * @throws Error when a star is left open.
 */
export function markTheWordsFromMarkup(markup: string): {
  text: string;
  targets: MarkTargetQuote[];
} {
  let text = '';
  const spans: { start: number; end: number }[] = [];
  let open: number | null = null;
  for (let at = 0; at < markup.length; at += 1) {
    const char = markup[at] as string;
    if (char === '\\' && markup[at + 1] === '*') {
      text += '*';
      at += 1;
    } else if (char === '*') {
      if (open === null) {
        open = text.length;
      } else {
        spans.push({ start: open, end: text.length });
        open = null;
      }
    } else {
      text += char;
    }
  }
  if (open !== null) {
    throw new Error('markTheWordsFromMarkup: a * is opened and never closed.');
  }
  const words = markableWords(text);
  const keys = words.map((word) => wordKey(word.text));
  const targets: MarkTargetQuote[] = [];
  for (const span of spans) {
    const inside = words.filter((word) => word.start >= span.start && word.end <= span.end);
    const first = inside[0];
    if (first === undefined) {
      continue;
    }
    const quote = text.slice(first.start, (inside.at(-1) as MarkableWord).end);
    const places = placesOf(
      keys,
      inside.map((word) => wordKey(word.text)),
    );
    targets.push(
      places.length > 1
        ? { text: quote, occurrence: places.indexOf(first.index) + 1 }
        : { text: quote },
    );
  }
  return { text, targets };
}
