import { z } from 'zod/v4';
import { MediaSchema } from './media.js';

/** Matches `{{ blank_id }}` placeholders in a passage, capturing the trimmed id. */
const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Zod schema for a single fill-in-the-blank slot configuration. */
export const BlankConfigSchema = z.object({
  id: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  caseSensitive: z.boolean().optional(),
  trimWhitespace: z.boolean().optional(),
  hint: z.string().optional(),
});

/**
 * Zod schema validating the full Fill-in-the-Blanks activity data contract.
 *
 * The refinement enforces a bijection between `{{id}}` placeholders in the
 * passage and `blanks[].id`; otherwise a blank could never be rendered, or a
 * placeholder could have no scoring config, yielding undefined behaviour.
 */
export const FillInTheBlanksDataSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    type: z.literal('fill-in-the-blanks'),
    id: z.string().min(1),
    title: z.string().min(1),
    passage: z.string().min(1),
    blanks: z.array(BlankConfigSchema).min(1),
    scoringStrategy: z.enum(['all-or-nothing', 'partial']),
    media: MediaSchema.optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    locale: z.string().optional(),
    learningObjectives: z.array(z.string()).optional(),
    difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
  })
  .refine(
    (data) => {
      const placeholderIds = new Set(
        [...data.passage.matchAll(PLACEHOLDER_RE)].map((match) => match[1]),
      );
      const blankIds = new Set(data.blanks.map((blank) => blank.id));
      if (placeholderIds.size !== blankIds.size) {
        return false;
      }
      for (const id of blankIds) {
        if (!placeholderIds.has(id)) {
          return false;
        }
      }
      return true;
    },
    {
      error:
        'Each blank id must have exactly one matching {{id}} placeholder in the passage, and vice versa.',
      path: ['passage'],
    },
  );
