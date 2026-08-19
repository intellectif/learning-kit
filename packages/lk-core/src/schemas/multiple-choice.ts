import { z } from 'zod/v4';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema } from './media.js';

/**
 * Zod schema for a single Multiple Choice option. Loose: unknown keys are
 * preserved through validation (forward-compat / consumer sidecars — B7).
 */
export const MultipleChoiceOptionSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  feedback: z.string().optional(),
});

/**
 * Zod schema validating the full Multiple Choice activity data contract.
 * Loose at every level: unknown keys are preserved, never stripped, so a
 * v0.3 runtime reading a future payload (or a consumer sidecar field) does
 * not silently delete data.
 *
 * Semantic guards: (1) at least one option must be correct, otherwise the
 * activity can never be answered correctly; (2) `mode: 'single'` must have
 * exactly one correct option — multiple correct options under single-select
 * make `showCorrectAnswers` and the xAPI correct-response ambiguous and mask
 * authoring errors; (3) option ids must be unique — the scorer looks options
 * up by id, so a duplicate id makes one option unscoreable. All are
 * unrepresentable in JSON Schema and are dropped from `toJSONSchema` output
 * by design.
 */
export const MultipleChoiceDataSchema = z
  .looseObject({
    schemaVersion: z.literal('1.0'),
    type: z.literal('multiple-choice'),
    id: z.string().min(1),
    title: z.string().min(1),
    question: z.string().min(1),
    mode: z.enum(['single', 'multi']),
    options: z.array(MultipleChoiceOptionSchema).min(2).max(26),
    scoringStrategy: z.enum(['all-or-nothing', 'partial']),
    media: MediaSchema.optional(),
    feedback: FeedbackSchema.optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    shuffle: z.boolean().optional(),
    locale: z.string().optional(),
    learningObjectives: z.array(z.string()).optional(),
    difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
  })
  .refine((data) => data.options.some((option) => option.isCorrect), {
    error: 'At least one option must be marked correct.',
    path: ['options'],
  })
  .refine(
    (data) =>
      data.mode !== 'single' || data.options.filter((option) => option.isCorrect).length === 1,
    {
      error: 'Single-select activities (mode: "single") must have exactly one correct option.',
      path: ['options'],
    },
  )
  .refine((data) => new Set(data.options.map((option) => option.id)).size === data.options.length, {
    error: 'Option ids must be unique within the activity.',
    path: ['options'],
  });
