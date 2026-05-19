import { z } from 'zod/v4';

/**
 * Optional authored "overall feedback" shown after submission, selected by
 * whether the learner passed (h5p-style overall feedback). Both fields are
 * optional; non-empty when present.
 */
export const FeedbackSchema = z.object({
  correct: z.string().min(1).optional(),
  incorrect: z.string().min(1).optional(),
});
