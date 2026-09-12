import { z } from 'zod/v4';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema } from './media.js';

/**
 * Matches `{{ blank_id }}` placeholders in a passage, capturing the trimmed id.
 * Exported for the draft checks in `authoring/`, which must read a passage
 * exactly as this schema does. It is not re-exported from the package.
 */
export const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Zod schema for a `TextMatchPolicy` — the opt-in matching tolerances a blank
 * may declare. Every default reproduces the v1 trim + case-fold semantics.
 */
export const TextMatchPolicySchema = z.looseObject({
  caseSensitive: z.boolean().optional(),
  trim: z.boolean().optional(),
  normalize: z.enum(['none', 'NFC', 'NFKC']).optional(),
  foldDiacritics: z.boolean().optional(),
  collapseInnerWhitespace: z.boolean().optional(),
  ignorePunctuation: z.boolean().optional(),
  levenshtein: z.number().int().min(0).optional(),
  locale: z.string().optional(),
});

/**
 * Zod schema for a single fill-in-the-blank slot configuration. Loose:
 * unknown keys are preserved through validation. Accepted answers must
 * contain non-whitespace characters — a whitespace-only accepted answer
 * normalizes to the empty string and would mark an empty response correct.
 */
export const BlankConfigSchema = z.looseObject({
  id: z.string().min(1),
  acceptedAnswers: z
    .array(
      z
        .string()
        .min(1)
        .refine((answer) => answer.trim().length > 0, {
          error: 'Accepted answers must contain non-whitespace characters.',
        }),
    )
    .min(1),
  caseSensitive: z.boolean().optional(),
  trimWhitespace: z.boolean().optional(),
  match: TextMatchPolicySchema.optional(),
  hint: z.string().optional(),
  feedback: z.string().optional(),
});

/**
 * Zod schema validating the full Fill-in-the-Blanks activity data contract.
 * Loose at every level: unknown keys are preserved, never stripped (B7).
 *
 * The refinement enforces a true one-to-one correspondence between `{{id}}`
 * placeholders and `blanks[].id`: every blank id appears EXACTLY ONCE in the
 * passage and exactly once in `blanks[]`. (The previous set-based check let
 * duplicate placeholders and duplicate blank configs through, corrupting the
 * partial-score denominator and per-item details.)
 */
export const FillInTheBlanksDataSchema = z
  .looseObject({
    schemaVersion: z.literal('1.0'),
    type: z.literal('fill-in-the-blanks'),
    id: z.string().min(1),
    title: z.string().min(1),
    passage: z.string().min(1),
    passageHtml: z.string().optional(),
    blanks: z.array(BlankConfigSchema).min(1),
    scoringStrategy: z.enum(['all-or-nothing', 'partial']),
    media: MediaSchema.optional(),
    feedback: FeedbackSchema.optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    locale: z.string().optional(),
    learningObjectives: z.array(z.string()).optional(),
    difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
  })
  .refine(
    (data) => {
      const placeholderCounts = new Map<string, number>();
      for (const match of data.passage.matchAll(PLACEHOLDER_RE)) {
        const id = match[1] as string;
        placeholderCounts.set(id, (placeholderCounts.get(id) ?? 0) + 1);
      }
      const blankIds = data.blanks.map((blank) => blank.id);
      if (new Set(blankIds).size !== blankIds.length) {
        return false;
      }
      if (placeholderCounts.size !== blankIds.length) {
        return false;
      }
      return blankIds.every((id) => placeholderCounts.get(id) === 1);
    },
    {
      error:
        'Each blank id must appear exactly once in blanks[] and have exactly one matching {{id}} placeholder in the passage, and vice versa.',
      path: ['passage'],
    },
  );
