/**
 * Finding a route's quotes in the passage. A quote is the words themselves,
 * so it survives an edit elsewhere in the passage; it is matched ignoring
 * runs of whitespace and the difference between curly and straight quotation
 * marks — what copying words out of a document changes — and nothing else.
 */

import type { RouteQuote, TextRange } from '../types/reading-route.js';

const FOLDED: Readonly<Record<string, string>> = {
  '‘': "'",
  '’': "'",
  '‛': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '″': '"',
};

/** A text folded for matching, and for each folded character the index it came from. */
interface Folded {
  text: string;
  origin: number[];
}

function fold(text: string): Folded {
  let folded = '';
  const origin: number[] = [];
  let space = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (/\s/u.test(char)) {
      if (!space && folded !== '') {
        folded += ' ';
        origin.push(index);
      }
      space = true;
      continue;
    }
    space = false;
    folded += FOLDED[char] ?? char;
    origin.push(index);
  }
  if (folded.endsWith(' ')) {
    folded = folded.slice(0, -1);
    origin.pop();
  }
  return { text: folded, origin };
}

/** The text of a quote, whichever form it takes. Non-strings read as empty. */
export function quoteText(quote: RouteQuote | unknown): string {
  if (typeof quote === 'string') {
    return quote;
  }
  if (
    typeof quote === 'object' &&
    quote !== null &&
    typeof (quote as { text?: unknown }).text === 'string'
  ) {
    return (quote as { text: string }).text;
  }
  return '';
}

function occurrenceOf(quote: RouteQuote | unknown): number | undefined {
  if (typeof quote !== 'object' || quote === null) {
    return undefined;
  }
  const occurrence = (quote as { occurrence?: unknown }).occurrence;
  return typeof occurrence === 'number' ? occurrence : undefined;
}

/** What finding a quote came to. */
export type QuoteMatch =
  | { found: true; range: TextRange }
  | { found: false; reason: 'empty' | 'missing' | 'ambiguous' | 'occurrence'; count: number };

/**
 * Where `quote` is in `body`. Every occurrence is counted, overlapping ones
 * included, so "a a" in "a a a" is ambiguous rather than silently the first.
 */
export function findQuote(body: string, quote: RouteQuote | unknown): QuoteMatch {
  const needle = fold(quoteText(quote)).text;
  if (needle === '') {
    return { found: false, reason: 'empty', count: 0 };
  }
  const hay = fold(body);
  const starts: number[] = [];
  let at = hay.text.indexOf(needle);
  while (at !== -1) {
    starts.push(at);
    at = hay.text.indexOf(needle, at + 1);
  }
  if (starts.length === 0) {
    return { found: false, reason: 'missing', count: 0 };
  }
  const occurrence = occurrenceOf(quote);
  if (occurrence === undefined && starts.length > 1) {
    return { found: false, reason: 'ambiguous', count: starts.length };
  }
  const chosen = starts[(occurrence ?? 1) - 1];
  if (chosen === undefined) {
    return { found: false, reason: 'occurrence', count: starts.length };
  }
  const start = hay.origin[chosen] as number;
  const end = (hay.origin[chosen + needle.length - 1] as number) + 1;
  return { found: true, range: { start, end } };
}

/** Whether `phrase` occurs in `text`, by the same folding as quotes, ignoring case. */
export function containsPhrase(text: string, phrase: string): boolean {
  const needle = fold(phrase).text.toLowerCase();
  return needle !== '' && fold(text).text.toLowerCase().includes(needle);
}
