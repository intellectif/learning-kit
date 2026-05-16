import { z } from 'zod';

/** Zod schema for a single fill-in-the-blank slot configuration. */
export const BlankConfigSchema = z.object({
  id: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  caseSensitive: z.boolean().optional(),
  trimWhitespace: z.boolean().optional(),
  hint: z.string().optional(),
});

/** Zod schema validating the full Fill-in-the-Blanks activity data contract. */
export const FillInTheBlanksDataSchema = z.object({
  schemaVersion: z.literal('1.0'),
  type: z.literal('fill-in-the-blanks'),
  id: z.string().min(1),
  title: z.string().min(1),
  passage: z.string().min(1),
  blanks: z.array(BlankConfigSchema).min(1),
  scoringStrategy: z.enum(['all-or-nothing', 'partial']),
  passThreshold: z.number().min(0).max(1).optional(),
  locale: z.string().optional(),
  learningObjectives: z.array(z.string()).optional(),
  difficultyLevel: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
});
