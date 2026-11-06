/**
 * The passage cut into paragraphs and sentences, by rules of the SDK's own.
 *
 * `Intl.Segmenter` would be shorter, and wrong here: engines segment
 * differently and change between versions, and a learner's "found the
 * evidence" must not depend on their browser. These rules are plain code, so
 * a server and every browser cut the same passage the same way, and a trace's
 * sentence numbers mean one thing. They change only with
 * {@link ROUTE_SEGMENTER}.
 */

import type {
  PassageLayout,
  PassageParagraph,
  PassageSection,
  PassageSentence,
  RouteSection,
  TextRange,
} from '../types/reading-route.js';

/** Names the segmentation rules below. A change to them is a new name. */
export const ROUTE_SEGMENTER = 'lk-sentences@1';

const TERMINALS = new Set(['.', '!', '?', '…', '‼', '⁇', '⁈', '⁉']);
/** Terminals of scripts written without spaces: a sentence ends at them outright. */
const CLOSED_TERMINALS = new Set(['。', '！', '？', '｡']);
const CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '}', '»', '›', '」', '』', '）']);

/**
 * Words a full stop follows without ending a sentence. Lower case, without
 * their dots. `etc` is not one: it ends sentences as often as not, and a
 * capital after it says which.
 */
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'mt',
  'vs',
  'fig',
  'figs',
  'vol',
  'approx',
  'ca',
  'cf',
  'eg',
  'ie',
  'inc',
  'ltd',
  'co',
  'corp',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
  'gen',
  'gov',
  'rev',
  'ed',
  'eds',
  'pp',
  'no',
]);

const isSpace = (char: string | undefined): boolean => char !== undefined && /\s/u.test(char);
const isLower = (char: string | undefined): boolean => char !== undefined && /\p{Ll}/u.test(char);

/** The word before a full stop at `dot`, letters and inner dots only ("e.g", "U.S"). */
function wordBefore(text: string, dot: number): string {
  let start = dot;
  while (start > 0 && /[\p{L}.]/u.test(text[start - 1] as string)) {
    start -= 1;
  }
  return text.slice(start, dot);
}

/** Whether the full stop at `dot` follows an abbreviation or an initial ("J. K.", "U.S."). */
function abbreviated(text: string, dot: number): boolean {
  const word = wordBefore(text, dot);
  if (word === '') {
    return false;
  }
  const last = word.split('.').at(-1) as string;
  if (last.length === 1 && /\p{Lu}/u.test(last)) {
    return true;
  }
  return ABBREVIATIONS.has(word.replaceAll('.', '').toLowerCase());
}

/** `range` with whitespace trimmed off both ends; `null` when nothing is left. */
function trimmed(text: string, start: number, end: number): TextRange | null {
  let from = start;
  let to = end;
  while (from < to && isSpace(text[from])) {
    from += 1;
  }
  while (to > from && isSpace(text[to - 1])) {
    to -= 1;
  }
  return from < to ? { start: from, end: to } : null;
}

/** The sentences of `text.slice(start, end)`: one paragraph. A line break always ends one. */
function sentencesIn(text: string, start: number, end: number): TextRange[] {
  const found: TextRange[] = [];
  let from = start;
  const close = (to: number, next: number): void => {
    const range = trimmed(text, from, to);
    if (range !== null) {
      found.push(range);
    }
    from = next;
  };
  let index = start;
  while (index < end) {
    const char = text[index] as string;
    if (char === '\n') {
      close(index, index + 1);
      index += 1;
      continue;
    }
    if (CLOSED_TERMINALS.has(char)) {
      let after = index + 1;
      while (after < end && CLOSERS.has(text[after] as string)) {
        after += 1;
      }
      close(after, after);
      index = after;
      continue;
    }
    if (!TERMINALS.has(char)) {
      index += 1;
      continue;
    }
    let after = index + 1;
    while (after < end && TERMINALS.has(text[after] as string)) {
      after += 1;
    }
    while (after < end && CLOSERS.has(text[after] as string)) {
      after += 1;
    }
    if (after >= end) {
      close(end, end);
      index = end;
      continue;
    }
    if (!isSpace(text[after])) {
      // "3.5", "e.g.,", "www.example.org": no space, no sentence end.
      index = after;
      continue;
    }
    let next = after;
    while (next < end && text[next] !== '\n' && isSpace(text[next])) {
      next += 1;
    }
    const continues =
      isLower(text[next]) || (char === '.' && after === index + 1 && abbreviated(text, index));
    if (!continues) {
      close(after, after);
    }
    index = after;
  }
  close(end, end);
  return found;
}

/** The paragraphs of `body`: runs of text between blank lines. */
function paragraphRanges(body: string): TextRange[] {
  const ranges: TextRange[] = [];
  const blank = /\n[^\S\n]*\n\s*/gu;
  let from = 0;
  for (const match of body.matchAll(blank)) {
    const range = trimmed(body, from, match.index);
    if (range !== null) {
      ranges.push(range);
    }
    from = match.index + match[0].length;
  }
  const last = trimmed(body, from, body.length);
  if (last !== null) {
    ranges.push(last);
  }
  return ranges;
}

/** How many paragraphs `body` has, by the rules {@link passageLayout} uses. */
export function countParagraphs(body: string): number {
  return paragraphRanges(body).length;
}

/**
 * The passage cut into paragraphs and sentences. Paragraph labels and sections
 * are applied when they fit; the checks report when they do not.
 */
export function passageLayout(
  body: string,
  route?: { paragraphLabels?: readonly string[]; sections?: readonly RouteSection[] },
): PassageLayout {
  const ranges = paragraphRanges(body);
  const labels = route?.paragraphLabels;
  const sectionList = route?.sections ?? [];
  const sections: PassageSection[] = [];
  const sectionOf: number[] = [];
  const fits =
    sectionList.reduce((total, section) => total + section.paragraphs, 0) === ranges.length;
  if (fits) {
    let first = 0;
    sectionList.forEach((section, index) => {
      const last = first + section.paragraphs - 1;
      sections.push({
        label: section.label,
        ...(section.title !== undefined ? { title: section.title } : {}),
        first,
        last,
      });
      for (let paragraph = first; paragraph <= last; paragraph += 1) {
        sectionOf[paragraph] = index;
      }
      first = last + 1;
    });
  }
  const labelled = labels !== undefined && labels.length === ranges.length;
  const paragraphs: PassageParagraph[] = [];
  const sentences: PassageSentence[] = [];
  ranges.forEach((range, index) => {
    const label = labelled ? (labels[index] as string) : '';
    const section = sectionOf[index];
    paragraphs.push({
      index,
      start: range.start,
      end: range.end,
      ...(label !== '' ? { label } : {}),
      ...(section !== undefined ? { section } : {}),
    });
    for (const sentence of sentencesIn(body, range.start, range.end)) {
      sentences.push({ index: sentences.length, paragraph: index, ...sentence });
    }
  });
  return { paragraphs, sentences, sections };
}

/** Whether two ranges share at least one character. */
export function overlaps(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** The sentences a range touches, in order. */
export function sentencesTouching(layout: PassageLayout, range: TextRange): number[] {
  return layout.sentences.filter((sentence) => overlaps(sentence, range)).map((s) => s.index);
}
