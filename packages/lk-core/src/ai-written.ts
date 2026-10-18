import { cleanText, folded, needle } from './ai-text.js';
import type { AiRefusal } from './types/ai.js';
import type { InlineCorrection } from './types/grading.js';

/**
 * What the AI features about a written response share: reading a model's text
 * fields, and finding each correction's quote in the learner's text.
 *
 * Internal. `ai-writing.ts` (feedback on a draft) and `ai-grading.ts` (a
 * grade) are their public faces, and hold every correction to the same
 * anchoring.
 */

/** The most corrections one piece of writing feedback may carry. More is refused, not cut. */
export const AI_WRITING_MAX_CORRECTIONS = 20;

/** The longest quote, correction, explanation or criterion comment, in code points. */
export const AI_WRITING_MAX_FIELD_LENGTH = 500;

/** The longest `category` or `band`: a tag, not a sentence. */
export const MAX_TAG_LENGTH = 40;

// ── Finding a quote in the draft ───────────────────────────────────────

/**
 * Where `quote` sits in the draft: at `claimed`, when the model named a range —
 * which must then hold the quote — or else at its first occurrence not already
 * taken by an identical quote, so a mistake made twice is anchored twice. A
 * quote corrected more often than it occurs takes its first occurrence again.
 * `null` when the draft does not contain it where claimed, or at all.
 */
function anchor(
  draft: { text: string; chars: string; from: number[] },
  quote: string,
  claimed: { start: number; end: number } | undefined,
  taken: Set<string>,
): { start: number; end: number } | null {
  const sought = needle(quote);
  if (sought === '') {
    return null;
  }
  if (claimed !== undefined) {
    const { start, end } = claimed;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end > draft.text.length ||
      start >= end
    ) {
      return null;
    }
    const span = draft.text.slice(start, end);
    if (needle(span) !== sought) {
      return null;
    }
    // The span, without whitespace the model's range took in at either end.
    const lead = span.length - span.trimStart().length;
    const trail = span.length - span.trimEnd().length;
    return { start: start + lead, end: end - trail };
  }
  let first: { start: number; end: number } | null = null;
  for (let at = draft.chars.indexOf(sought); at !== -1; at = draft.chars.indexOf(sought, at + 1)) {
    const start = draft.from[at] as number;
    const end = (draft.from[at + sought.length - 1] as number) + 1;
    const found = { start, end };
    first ??= found;
    const key = `${start}:${end}`;
    if (!taken.has(key)) {
      taken.add(key);
      return found;
    }
  }
  return first;
}

// ── Checking what comes back ───────────────────────────────────────────

/** A field that must be a string, at most `max` code points once cleaned; `undefined` when absent. */
export function textField(
  value: unknown,
  max: number,
): { ok: true; value: string | undefined } | { ok: false; refusal: AiRefusal } {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, refusal: 'malformed' };
  }
  const cleaned = cleanText(value);
  if ([...cleaned].length > max) {
    return { ok: false, refusal: 'too-long' };
  }
  return { ok: true, value: cleaned === '' ? undefined : cleaned };
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The corrections, each anchored in the draft, or why the reply is refused. */
export function checkCorrections(
  raw: unknown,
  text: string,
): { ok: true; corrections: InlineCorrection[] } | { ok: false; refusal: AiRefusal } {
  if (raw === undefined || raw === null) {
    return { ok: true, corrections: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, refusal: 'malformed' };
  }
  if (raw.length > AI_WRITING_MAX_CORRECTIONS) {
    return { ok: false, refusal: 'too-long' };
  }
  const draft = { text, ...folded(text) };
  const taken = new Set<string>();
  const corrections: InlineCorrection[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.original !== 'string') {
      return { ok: false, refusal: 'malformed' };
    }
    if (typeof entry.corrected !== 'string') {
      return { ok: false, refusal: 'malformed' };
    }
    if (
      [...entry.original].length > AI_WRITING_MAX_FIELD_LENGTH ||
      [...entry.corrected].length > AI_WRITING_MAX_FIELD_LENGTH
    ) {
      return { ok: false, refusal: 'too-long' };
    }
    // A correction that changes nothing corrects nothing.
    if (needle(entry.original) === needle(entry.corrected)) {
      return { ok: false, refusal: 'malformed' };
    }
    const explanation = textField(entry.explanation, AI_WRITING_MAX_FIELD_LENGTH);
    const category = textField(entry.category, MAX_TAG_LENGTH);
    if (!explanation.ok) {
      return explanation;
    }
    if (!category.ok) {
      return category;
    }
    let claimed: { start: number; end: number } | undefined;
    if (entry.range !== undefined && entry.range !== null) {
      if (!isRecord(entry.range)) {
        return { ok: false, refusal: 'malformed' };
      }
      claimed = { start: entry.range.start as number, end: entry.range.end as number };
    }
    const at = anchor(draft, entry.original, claimed, taken);
    if (at === null) {
      return { ok: false, refusal: 'misquotes-answer' };
    }
    corrections.push({
      original: text.slice(at.start, at.end),
      corrected: cleanText(entry.corrected),
      ...(explanation.value !== undefined ? { explanation: explanation.value } : {}),
      ...(category.value !== undefined ? { category: category.value } : {}),
      range: at,
    });
  }
  return { ok: true, corrections };
}
