import { z } from 'zod/v4';
import { MediaUrlSchema, RedactedMediaSchema } from './media.js';
import { RedactedWrittenResponseRubricSchema } from './written-response.js';

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
  media: RedactedMediaSchema.optional(),
  passThreshold: z.number().min(0).max(1).optional(),
  locale: z.string().optional(),
  learningObjectives: z.array(z.string()).optional(),
  difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
};

/** A redacted Multiple Choice option: id and display text only — no `isCorrect`, no feedback. */
export const RedactedMultipleChoiceOptionMediaSchema = z.strictObject({
  type: z.enum(['image', 'audio']),
  url: z.string().min(1),
  alt: z.string().min(1).optional(),
  captionsUrl: z.string().min(1).optional(),
});

/**
 * A redacted Multiple Choice option: id, display text and its picture or
 * recording — no `isCorrect`, no feedback.
 *
 * The media survives intact for the reason a gap-select choice does: it is the
 * option the learner is being asked to pick, and an exam that stripped it would
 * show a row of blanks. Nothing in it is an answer key — the key is `isCorrect`,
 * which is gone.
 */
export const RedactedMultipleChoiceOptionSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
  media: RedactedMultipleChoiceOptionMediaSchema.optional(),
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

/** A redacted choice: exactly what it always was. Which one is correct was never stored here. */
export const RedactedGapSelectChoiceSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
});

/** A redacted word bank: every choice survives, because the learner picks from them. */
export const RedactedGapSelectBankSchema = z.strictObject({
  id: z.string().min(1),
  choices: z.array(RedactedGapSelectChoiceSchema).min(2),
});

/** A redacted gap: its choice source survives; `correctChoiceId` and feedback do not. */
export const RedactedGapSelectGapSchema = z.strictObject({
  id: z.string().min(1),
  choices: z.array(RedactedGapSelectChoiceSchema).min(2).optional(),
  bankId: z.string().min(1).optional(),
});

/**
 * Redacted Gap Select data — the type where redaction **inverts** the
 * Fill-in-the-Blanks rule, and the reason this is a separate schema rather than
 * a variant of it.
 *
 * In Fill-in-the-Blanks the candidate answers ARE the key, so `acceptedAnswers`
 * is stripped. Here the learner cannot answer at all without seeing every
 * choice, so `choices` and `banks` must survive in full and `correctChoiceId`
 * is the only field withheld. A policy that treated "the list of candidate
 * answers" as answer-key for both types would ship an unanswerable exam.
 *
 * `scoringStrategy` stays answer-key for the same reason it does on the other
 * two: knowing whether marking is partial tells a learner whether guessing at a
 * gap is free.
 */
export const RedactedGapSelectDataSchema = z.strictObject({
  ...redactedBase,
  type: z.literal('gap-select'),
  passage: z.string().min(1),
  passageHtml: z.string().optional(),
  gaps: z.array(RedactedGapSelectGapSchema).min(1),
  banks: z.array(RedactedGapSelectBankSchema).optional(),
  presentation: z.literal('dropdown').optional(),
  shuffleChoices: z.boolean().optional(),
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
  rubric: RedactedWrittenResponseRubricSchema.optional(),
  languageTarget: z.string().optional(),
});

/** A redacted slow recording: unchanged — it is public, and it never carried captions or a policy. */
export const RedactedDictationSlowMediaSchema = z.strictObject({
  type: z.literal('audio'),
  url: MediaUrlSchema,
  alt: z.string().min(1).optional(),
});

/**
 * Redacted Dictation data: the recording(s) and the hint mode survive; the
 * transcript, the accepted alternatives and the tolerance — the whole answer
 * key — do not. A `progressive-words` hint mode reveals nothing by itself: the
 * words it would reveal are the transcript, and that is gone.
 *
 * Three rules of the content schema are repeated here, because a projection
 * built by hand never passed through it: captions on the recording ARE the
 * answer, so a payload carrying them is not learner-safe; a slow recording
 * beside a play budget is an unbudgeted copy of the budgeted content; and so is
 * a slow recording with no recording beside it, which in a group sits beside a
 * stimulus recording that may be budgeted.
 */
export const RedactedDictationDataSchema = z
  .strictObject({
    ...redactedBase,
    type: z.literal('dictation'),
    slowMedia: RedactedDictationSlowMediaSchema.optional(),
    hints: z.strictObject({ mode: z.literal('progressive-words') }).optional(),
  })
  .check((ctx) => {
    const data = ctx.value;
    if (data.media?.captionsUrl !== undefined) {
      ctx.issues.push({
        code: 'custom',
        input: data.media.captionsUrl,
        message:
          'A dictation recording cannot carry captions: the captions are the answer, so this payload is not learner-safe.',
        path: ['media', 'captionsUrl'],
      });
    }
    if (data.slowMedia !== undefined && data.media?.playback?.maxPlays !== undefined) {
      ctx.issues.push({
        code: 'custom',
        input: data.slowMedia,
        message:
          'A play budget on `media` cannot coexist with an unbudgeted slow recording of the same content.',
        path: ['slowMedia'],
      });
    }
    if (data.slowMedia !== undefined && data.media === undefined) {
      ctx.issues.push({
        code: 'custom',
        input: data.slowMedia,
        message: 'A slow recording accompanies a recording: this payload has no `media`.',
        path: ['media'],
      });
    }
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
/** An option's picture or recording, unchanged by redaction — it is what the learner picks. */
export type RedactedMultipleChoiceOptionMedia = z.infer<
  typeof RedactedMultipleChoiceOptionMediaSchema
>;
/** A Multiple Choice item with the answer key, feedback and strategy removed. */
export type RedactedMultipleChoiceData = z.infer<typeof RedactedMultipleChoiceDataSchema>;
/** A blank with its accepted answers and matching rules removed; the hint survives. */
export type RedactedBlankConfig = z.infer<typeof RedactedBlankConfigSchema>;
/** A Fill-in-the-Blanks item with every accepted answer removed. */
export type RedactedFillInTheBlanksData = z.infer<typeof RedactedFillInTheBlanksDataSchema>;
/** A Written Response item; the rubric survives, because it tells the learner what is assessed. */
export type RedactedWrittenResponseData = z.infer<typeof RedactedWrittenResponseDataSchema>;
/** A selectable choice, unchanged by redaction. */
export type RedactedGapSelectChoice = z.infer<typeof RedactedGapSelectChoiceSchema>;
/** A word bank, unchanged by redaction — the learner picks from it. */
export type RedactedGapSelectBank = z.infer<typeof RedactedGapSelectBankSchema>;
/** A gap with its `correctChoiceId` removed; every choice it offers survives. */
export type RedactedGapSelectGap = z.infer<typeof RedactedGapSelectGapSchema>;
/** A Gap Select item the learner can still answer: choices intact, answer key gone. */
export type RedactedGapSelectData = z.infer<typeof RedactedGapSelectDataSchema>;
/** The slower recording of a dictation, unchanged by redaction. */
export type RedactedDictationSlowMedia = z.infer<typeof RedactedDictationSlowMediaSchema>;
/** A Dictation item with its transcript, accepted alternatives and tolerances removed. */
export type RedactedDictationData = z.infer<typeof RedactedDictationDataSchema>;

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
  | RedactedWrittenResponseData
  | RedactedGapSelectData
  | RedactedDictationData;
