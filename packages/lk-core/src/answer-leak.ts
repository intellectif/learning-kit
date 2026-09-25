import { PLACEHOLDER_RE } from './schemas/fill-in-the-blanks.js';

/**
 * Whether a text gives an answer away: the rule an AI hint is held to, and the
 * one the item critic holds an author's own hint, title and passage to.
 *
 * Internal: `hintRevealsAnswer` in `ai.ts` is the public face of it.
 */

/**
 * The ids of a passage's placeholders, in the order they appear. Read with the
 * schema's own expression, so a passage means here what it means to validation.
 */
export function placeholderOrder(passage: string): string[] {
  return [...passage.matchAll(PLACEHOLDER_RE)].map((match) => match[1] as string);
}

/** The passage with each placeholder written as `[n]`, in passage order. */
export function numberedPassage(passage: string): string {
  let position = 0;
  return passage.replace(PLACEHOLDER_RE, () => {
    position += 1;
    return `[${position}]`;
  });
}

/** The passage with every placeholder taken out: the text a learner reads around the gaps. */
export function passageWithoutPlaceholders(passage: string): string {
  return passage.replace(PLACEHOLDER_RE, ' ');
}

/**
 * Text folded for searching: compatibility forms read as what they stand for,
 * accents and other marks removed, lower-cased, and every run of anything but
 * letters and digits turned into one space. "Está," and "esta" fold alike.
 */
export function fold(text: string): string[] {
  const folded = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return folded === '' ? [] : folded.split(' ');
}

/** Whether `needle` appears in `haystack` as a run of whole words. */
export function containsWords(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let match = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        match = false;
        break;
      }
    }
    if (match) {
      return true;
    }
  }
  return false;
}

/**
 * An answer too short to search for on its own: one word of fewer than four
 * characters — "is", "the", "26". A hint may use such a word freely; it
 * reveals the answer only when it writes it where the answer goes.
 */
export const isShort = (words: readonly string[]): boolean =>
  words.length === 1 && [...(words[0] as string)].length < 4;

/**
 * The words either side of the gap numbered `position` in a numbered
 * passage, other gaps left out.
 */
function neighbours(passage: string, position: number): { before?: string; after?: string } {
  const marker = `[${position}]`;
  const at = passage.indexOf(marker);
  if (at === -1) {
    return {};
  }
  const strip = (text: string): string => text.replace(/\[\d+\]/g, ' ');
  const left = fold(strip(passage.slice(0, at)));
  const right = fold(strip(passage.slice(at + marker.length)));
  const before = left[left.length - 1];
  const after = right[0];
  return {
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  };
}

/**
 * Whether `text` writes out `answer`, as whole words, case, accents and
 * punctuation ignored. An answer of one short word counts only where the text
 * writes it beside a neighbour it has in `passage` — a numbered passage, with
 * the answer's gap at `position` — so a text may still use the word on its own.
 */
export function revealsAnswer(
  text: string,
  answer: string,
  passage?: string,
  position?: number,
): boolean {
  const words = fold(text);
  const needle = fold(answer);
  if (needle.length === 0) {
    return false;
  }
  if (!isShort(needle) || passage === undefined || position === undefined) {
    return containsWords(words, needle);
  }
  const { before, after } = neighbours(passage, position);
  if (before === undefined && after === undefined) {
    return containsWords(words, needle);
  }
  return (
    (before !== undefined && containsWords(words, [before, ...needle])) ||
    (after !== undefined && containsWords(words, [...needle, after]))
  );
}
