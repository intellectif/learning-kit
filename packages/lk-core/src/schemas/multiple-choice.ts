import { z } from 'zod/v4';

/** Zod schema for a single Multiple Choice option. */
export const MultipleChoiceOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  feedback: z.string().optional(),
});

/**
 * Zod schema validating the full Multiple Choice activity data contract.
 *
 * The refinement guarantees at least one option is marked correct; without it
 * a schema-valid activity could be impossible to ever answer correctly,
 * producing undefined scoring-engine behaviour.
 */
export const MultipleChoiceDataSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    type: z.literal('multiple-choice'),
    id: z.string().min(1),
    title: z.string().min(1),
    question: z.string().min(1),
    mode: z.enum(['single', 'multi']),
    options: z.array(MultipleChoiceOptionSchema).min(2).max(10),
    scoringStrategy: z.enum(['all-or-nothing', 'partial']),
    passThreshold: z.number().min(0).max(1).optional(),
    shuffle: z.boolean().optional(),
    locale: z.string().optional(),
    learningObjectives: z.array(z.string()).optional(),
    difficultyLevel: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
      .optional(),
  })
  .refine((data) => data.options.some((option) => option.isCorrect), {
    error: 'At least one option must be marked correct.',
    path: ['options'],
  });
