import type { AiProvenance } from './types/ai.js';
import type { GraderUsage } from './types/grading.js';

/**
 * How the SDK reads text a model wrote, before a learner does. Internal: shared
 * by the AI checks, and exported by none of the package's entry points.
 */

/**
 * Plain text as the learner will read it: line endings unified, control
 * characters other than line breaks and tabs removed, runs of blank lines
 * collapsed, the ends trimmed.
 */
export function cleanText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** A provenance field a host may send, kept only when it is a short string. */
export function provenanceOf(raw: unknown): AiProvenance | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const kept: AiProvenance = {};
  for (const key of ['model', 'promptHash', 'generatedAt'] as const) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) {
      kept[key] = value;
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * What the call cost, as a port reported it. Read on the same terms as the
 * provenance: a number that is not finite and zero or more says nothing about
 * a cost, so it is dropped rather than carried into a host's totals.
 */
export function usageOf(raw: unknown): GraderUsage | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const kept: GraderUsage = {};
  for (const key of ['promptTokens', 'completionTokens', 'costUsd'] as const) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      kept[key] = value;
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** Typographic quotes a model writes for the plain ones a learner typed, and back. */
const QUOTE_FOLD: Readonly<Record<string, string>> = {
  '‘': "'",
  '’': "'",
  '‛': "'",
  '′': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '″': '"',
};

/**
 * Text as a quote is matched against it: typographic quotes folded to plain
 * ones and every run of whitespace one space — the two liberties a model takes
 * when it copies words out — with, for each folded character, where it came
 * from, so a match maps back to the learner's own text. Case is kept: a
 * correction of "i" to "I" is about case.
 */
export function folded(text: string): { chars: string; from: number[] } {
  let chars = '';
  const from: number[] = [];
  let space = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string;
    if (/\s/u.test(char)) {
      if (!space) {
        chars += ' ';
        from.push(at);
        space = true;
      }
      continue;
    }
    space = false;
    chars += QUOTE_FOLD[char] ?? char;
    from.push(at);
  }
  return { chars, from };
}

/** A quote as it is searched for: folded, and without the spaces around it. */
export const needle = (quote: string): string => folded(quote).chars.trim();
