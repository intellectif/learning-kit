import { z } from 'zod';

/** Zod schema for a single Multiple Choice option. */
export const MultipleChoiceOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  feedback: z.string().optional(),
});

/** Zod schema validating the full Multiple Choice activity data contract. */
export const MultipleChoiceDataSchema = z.object({
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
});
