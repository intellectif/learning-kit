import { z } from 'zod/v4';
import { MediaSchema } from './media.js';
import { WrittenResponseRubricSchema } from './written-response.js';

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
  /** Slot identity, carried through redaction so the client and the plan agree. */
  slotKey: z.string().min(1).optional(),
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
  questionHtml: z.string().optional(),
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
  passageHtml: z.string().optional(),
  blanks: z.array(RedactedBlankConfigSchema).min(1),
});

/**
 * Redacted Written Response data: the prompt, word bounds and rubric are
 * learner-visible (a rubric tells the learner what they are graded on);
 * authored pass/fail feedback is removed until the grade exists.
 */
export const RedactedWrittenResponseDataSchema = z.strictObject({
  ...redactedBase,
  type: z.literal('written-response'),
  prompt: z.string(),
  promptHtml: z.string().optional(),
  minWords: z.number().int().min(0),
  maxWords: z.number().int().min(1),
  rubric: WrittenResponseRubricSchema.optional(),
  languageTarget: z.string().optional(),
});

/**
 * The learner-safe SHAPE of each built-in type, derived from the strict schema
 * above rather than hand-written beside it.
 *
 * `redact()` returns {@link RedactedActivityData}, which proves a payload is
 * learner-safe but is index-signature typed — it deliberately says nothing
 * about what the payload still CONTAINS. That is right for the assertion and
 * useless for anything that has to render or transport the result, so every
 * integrator ends up re-declaring these interfaces by hand and they drift the
 * moment a schema changes. Deriving them with `z.infer` means the type and the
 * validator can never disagree.
 *
 * Use them for the payload a server sends an exam client, and for the props of
 * a renderer that must never see an answer key.
 */
export type RedactedMultipleChoiceOption = z.infer<typeof RedactedMultipleChoiceOptionSchema>;
/** A Multiple Choice item with the answer key, feedback and strategy removed. */
export type RedactedMultipleChoiceData = z.infer<typeof RedactedMultipleChoiceDataSchema>;
/** A blank with its accepted answers and matching rules removed; the hint survives. */
export type RedactedBlankConfig = z.infer<typeof RedactedBlankConfigSchema>;
/** A Fill-in-the-Blanks item with every accepted answer removed. */
export type RedactedFillInTheBlanksData = z.infer<typeof RedactedFillInTheBlanksDataSchema>;
/** A Written Response item; the rubric survives, because it tells the learner what is assessed. */
export type RedactedWrittenResponseData = z.infer<typeof RedactedWrittenResponseDataSchema>;

/**
 * Discriminated union of every built-in redacted activity. Narrow it on
 * `type`, exactly as you would {@link ActivityData}:
 *
 * ```ts
 * function render(item: RedactedActivity) {
 *   if (item.type === 'multiple-choice') {
 *     return item.options.map((option) => option.text); // no `isCorrect` to leak
 *   }
 * }
 * ```
 */
export type RedactedActivity =
  | RedactedMultipleChoiceData
  | RedactedFillInTheBlanksData
  | RedactedWrittenResponseData;
