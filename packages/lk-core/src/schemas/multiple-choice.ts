import * as z from 'zod/v4';
import { AiPermissionsSchema } from './ai.js';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema, MediaUrlSchema } from './media.js';

/**
 * Zod schema for a single Multiple Choice option. Loose: unknown keys are
 * preserved through validation (forward-compat / consumer sidecars — B7).
 */
/**
 * A picture or recording carried by one option.
 *
 * LOOSE, like `MediaSchema` and every other content schema: a consumer's own
 * fields — an asset id, a CDN key — ride along and survive validation (B7).
 * Making it strict to catch a typo would reject exactly the sidecars the SDK
 * promises to preserve, and an invariant test guards that promise by counting
 * the closed objects in the exported JSON Schema.
 *
 * The two things that must NOT be swallowed are named explicitly instead. The
 * `type` enum refuses the kinds that cannot be an option, and a refinement
 * refuses `playback`, which would otherwise sit there looking like an enforced
 * budget while nothing read it.
 *
 * The URL goes through `MediaUrlSchema`, the same security-reviewed allow-list
 * activity media uses — `javascript:`, `file:` and `ftp:` are stored-XSS
 * vectors wherever the value lands in a `src`, and that list is not forked.
 */
export const MultipleChoiceOptionMediaSchema = z
  .looseObject({
    // No `embed`: an iframe swallows the click that selects the option, so the
    // learner could not choose it. No `video`: a native control bar inside the
    // option's label eats the same click.
    type: z.enum(['image', 'audio']),
    url: MediaUrlSchema,
    alt: z.string().min(1).optional(),
    captionsUrl: MediaUrlSchema.optional(),
  })
  // The same rule MediaSchema applies, so there is one rule to learn: a picture
  // needs a text alternative (WCAG 1.1.1), a recording's label is optional.
  .refine((media) => media.type !== 'image' || (media.alt !== undefined && media.alt !== ''), {
    error: 'An image option requires a non-empty `alt`.',
    path: ['alt'],
  })
  // Named rather than ignored. `maxPlays` binds per slot through a
  // MediaBudgetBinding, and nothing decides yet whether four recordings in one
  // question share a budget or hold one each — so a policy written here would
  // be a promise no renderer keeps, on a listening exam that believed it had
  // one.
  .refine((media) => !('playback' in media), {
    error:
      'An option carries no playback policy. maxPlays, seek and rate are enforced only on the media above the question.',
    path: ['playback'],
  });

export const MultipleChoiceOptionSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  feedback: z.string().optional(),
  media: MultipleChoiceOptionMediaSchema.optional(),
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
    questionHtml: z.string().optional(),
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
    ai: AiPermissionsSchema.optional(),
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
