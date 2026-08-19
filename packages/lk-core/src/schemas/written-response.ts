import { z } from 'zod/v4';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema } from './media.js';

/** Zod schema for a single rubric criterion. Loose: unknown keys preserved. */
export const WrittenResponseRubricCriterionSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().optional(),
  weight: z.number().min(0),
});

/** Zod schema for a written-response grading rubric. Loose: unknown keys preserved. */
export const WrittenResponseRubricSchema = z.looseObject({
  label: z.string().optional(),
  criteria: z.array(WrittenResponseRubricCriterionSchema).min(1),
});

/**
 * Zod schema validating the Written Response activity data contract (Req 22).
 *
 * Wire-format constraints (Req 22.9): field names are locked for
 * byte-compatibility with consumer-stored rows, and the schema is loose at
 * EVERY level (Req 22.5) — unknown top-level keys, `promptHtml`, `rubric`
 * sidecars and any future fields survive `validateActivity` verbatim.
 */
export const WrittenResponseDataSchema = z
  .looseObject({
    schemaVersion: z.literal('1.0'),
    type: z.literal('written-response'),
    id: z.string().min(1),
    title: z.string().min(1),
    prompt: z.string(),
    promptHtml: z.string().optional(),
    minWords: z.number().int().min(0),
    maxWords: z.number().int().min(1),
    rubric: WrittenResponseRubricSchema.optional(),
    languageTarget: z.string().optional(),
    media: MediaSchema.optional(),
    feedback: FeedbackSchema.optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    locale: z.string().optional(),
    learningObjectives: z.array(z.string()).optional(),
    difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
  })
  .refine((data) => data.maxWords >= data.minWords, {
    error: 'maxWords must be greater than or equal to minWords.',
    path: ['maxWords'],
  });
