import { z } from 'zod/v4';
import {
  READ_ALOUD_MAX_DIMENSION_WEIGHT,
  READ_ALOUD_MAX_SECONDS,
  READ_ALOUD_MAX_TAKES,
} from '../scoring/speech/limits.js';
import { CANONICAL_LOCALE_RE } from '../scoring/speech/locale.js';
import { captionFieldsOf } from './dictation.js';
import { MediaUrlSchema, RedactedMediaSchema } from './media.js';
import { READ_ALOUD_DIMENSIONS, ReadAloudSlowMediaSchema } from './read-aloud.js';
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
  ai: z
    .strictObject({ explanations: z.boolean().optional(), hints: z.boolean().optional() })
    .optional(),
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
    for (const captions of captionFieldsOf(data.media)) {
      ctx.issues.push({
        code: 'custom',
        input: data.media?.[captions],
        message:
          'A dictation recording cannot carry captions: the captions are the answer, so this payload is not learner-safe.',
        path: ['media', captions],
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
 * Redacted Read Aloud data: everything survives, because a read-aloud item has
 * no answer key — the learner is shown the very text they are asked to read.
 * What redaction removes is the authored pass/fail feedback, which is written
 * about a grade that does not exist yet.
 *
 * `locale` is REQUIRED here, overriding the optional one on the shared base: it
 * decides the grade (an assessment made for another locale is unscorable), so a
 * projection that dropped it would send an exam client an item no assessor could
 * be asked for. Four rules of the content schema are repeated, because a
 * projection built by hand never passed through it: the recording is audio, a
 * slow recording accompanies a recording, is a different file, and never sits
 * beside a play budget — the last two being how an unbudgeted copy of budgeted
 * content would reach a learner.
 */
export const RedactedReadAloudDataSchema = z
  .strictObject({
    ...redactedBase,
    type: z.literal('read-aloud'),
    locale: z.string().regex(CANONICAL_LOCALE_RE),
    instructions: z.string().optional(),
    referenceText: z.string().min(1),
    slowMedia: ReadAloudSlowMediaSchema.optional(),
    recording: z.strictObject({
      maxSeconds: z.number().gt(0).max(READ_ALOUD_MAX_SECONDS),
      minSeconds: z.number().min(0).optional(),
      maxTakes: z.number().int().min(1).max(READ_ALOUD_MAX_TAKES).optional(),
    }),
    scoring: z.strictObject({
      dimensions: z
        .array(
          z.strictObject({
            name: z.enum(READ_ALOUD_DIMENSIONS),
            weight: z.number().min(0).max(READ_ALOUD_MAX_DIMENSION_WEIGHT),
          }),
        )
        .min(1)
        .max(READ_ALOUD_DIMENSIONS.length),
    }),
  })
  .check((ctx) => {
    const data = ctx.value;
    if (data.media !== undefined && data.media.type !== 'audio') {
      ctx.issues.push({
        code: 'custom',
        input: data.media.type,
        message: 'A read-aloud model recording must be audio, so this payload is not renderable.',
        path: ['media', 'type'],
      });
    }
    if (data.slowMedia !== undefined && data.media === undefined) {
      ctx.issues.push({
        code: 'custom',
        input: data.slowMedia,
        message: 'A slow model recording accompanies a recording: this payload has no `media`.',
        path: ['media'],
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
    if (data.slowMedia !== undefined && data.slowMedia.url === data.media?.url) {
      ctx.issues.push({
        code: 'custom',
        input: data.slowMedia.url,
        message: 'The slow model recording must be a different file from the recording.',
        path: ['slowMedia', 'url'],
      });
    }
  });
