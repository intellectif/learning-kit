import { z } from 'zod/v4';
import { MediaSchema } from './media.js';

/**
 * Schemas for REDACTED activity data — the learner-safe projection `redact()`
 * produces (R7). Deliberately STRICT (`z.strictObject`), the opposite of the
 * loose content schemas: a redacted payload must prove the ABSENCE of every
 * answer-key and author-only field, so any unknown key is a validation
 * failure, not a passthrough. `assertRedacted` validates against these.
 */

/** Shared fields every redacted activity carries. */
const redactedBase = {
  /** Marker distinguishing a redacted projection from full activity data. */
  redacted: z.literal(true),
  schemaVersion: z.literal('1.0'),
  id: z.string().min(1),
  title: z.string().min(1),
  media: MediaSchema.optional(),
  passThreshold: z.number().min(0).max(1).optional(),
  locale: z.string().optional(),
  learningObjectives: z.array(z.string()).optional(),
  difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
};

/** A redacted Multiple Choice option: id and display text only — no `isCorrect`, no feedback. */
export const RedactedMultipleChoiceOptionSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
});

/**
 * Redacted Multiple Choice data: renderable (question, mode, options to pick
 * from) with the answer key, per-option feedback, overall feedback, and the
 * scoring strategy removed. `scoringStrategy` is answer-key by design: MC
 * `partial` carries a wrong-selection penalty `all-or-nothing` does not, so
 * knowing the strategy tells a learner whether guessing is free.
 */
export const RedactedMultipleChoiceDataSchema = z.strictObject({
  ...redactedBase,
  type: z.literal('multiple-choice'),
  question: z.string().min(1),
  mode: z.enum(['single', 'multi']),
  options: z.array(RedactedMultipleChoiceOptionSchema).min(2).max(26),
  shuffle: z.boolean().optional(),
});

/** A redacted blank: id and hint only — no accepted answers, no matching rules, no feedback. */
export const RedactedBlankConfigSchema = z.strictObject({
  id: z.string().min(1),
  hint: z.string().optional(),
});

/** Redacted Fill-in-the-Blanks data: passage and blank slots, key removed. */
export const RedactedFillInTheBlanksDataSchema = z.strictObject({
  ...redactedBase,
  type: z.literal('fill-in-the-blanks'),
  passage: z.string().min(1),
  blanks: z.array(RedactedBlankConfigSchema).min(1),
});

/**
 * Redacted Written Response data: the prompt and word bounds are public;
 * the rubric (author/grader asset) and authored feedback are removed.
 */
export const RedactedWrittenResponseDataSchema = z.strictObject({
  ...redactedBase,
  type: z.literal('written-response'),
  prompt: z.string(),
  promptHtml: z.string().optional(),
  minWords: z.number().int().min(0),
  maxWords: z.number().int().min(1),
  languageTarget: z.string().optional(),
});
