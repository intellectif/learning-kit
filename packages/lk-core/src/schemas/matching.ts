import * as z from 'zod/v4';
import { AiPermissionsSchema } from './ai.js';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema } from './media.js';

/** Zod schema for one option of the shared list. Loose: a consumer sidecar survives validation. */
export const MatchingOptionSchema = z.looseObject({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  text: z.string().min(1),
});

/** Zod schema for one prompt. Whether its `correctOptionId` exists is checked on the activity. */
export const MatchingPromptSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().min(1),
  correctOptionId: z.string().min(1),
  feedback: z.string().optional(),
});

/** Labels compared as a learner reads them: `"A"`, `" a "` and `"a"` are one key. */
export function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

/** Whether every element of `values` is distinct. */
const distinct = (values: readonly string[]): boolean => new Set(values).size === values.length;

/**
 * Zod schema validating the full Matching data contract.
 *
 * Five semantic guards, each an authoring error that would otherwise reach a
 * learner:
 *
 * 1. **Prompt ids are unique** — the scorer looks a match up by prompt id, so a
 *    duplicate makes one prompt unscoreable.
 * 2. **Option ids are unique** — an answer key naming an id two options share
 *    means two right answers nobody wrote.
 * 3. **Option labels are unique**, ignoring case and surrounding space — two
 *    options both labelled "C" cannot be told apart by the key the learner
 *    answers with.
 * 4. **Every `correctOptionId` names an option.** An answer key pointing at an
 *    option nobody can pick is a prompt that cannot be passed.
 * 5. **Under `optionUse: 'once'`, no option answers two prompts.** Otherwise
 *    the item says each option is used once while its own key uses one twice.
 */
export const MatchingDataSchema = z
  .looseObject({
    schemaVersion: z.literal('1.0'),
    type: z.literal('matching'),
    id: z.string().min(1),
    title: z.string().min(1),
    instructions: z.string().optional(),
    optionsTitle: z.string().optional(),
    prompts: z.array(MatchingPromptSchema).min(1),
    options: z.array(MatchingOptionSchema).min(2),
    optionUse: z.enum(['once', 'many']).optional(),
    scoringStrategy: z.enum(['all-or-nothing', 'partial']),
    shuffleOptions: z.boolean().optional(),
    media: MediaSchema.optional(),
    feedback: FeedbackSchema.optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    locale: z.string().optional(),
    learningObjectives: z.array(z.string()).optional(),
    difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
    ai: AiPermissionsSchema.optional(),
  })
  .refine((data) => distinct(data.prompts.map((prompt) => prompt.id)), {
    error: 'Prompt ids must be unique.',
    path: ['prompts'],
  })
  .refine((data) => distinct(data.options.map((option) => option.id)), {
    error: 'Option ids must be unique.',
    path: ['options'],
  })
  .refine(
    (data) =>
      distinct(
        data.options
          .map((option) => option.label)
          .filter((label): label is string => label !== undefined)
          .map(labelKey),
      ),
    { error: 'Option labels must be unique.', path: ['options'] },
  )
  .refine(
    (data) => {
      const ids = new Set(data.options.map((option) => option.id));
      return data.prompts.every((prompt) => ids.has(prompt.correctOptionId));
    },
    {
      error: 'Each prompt needs a `correctOptionId` that is one of the options.',
      path: ['prompts'],
    },
  )
  .refine(
    (data) =>
      data.optionUse !== 'once' || distinct(data.prompts.map((prompt) => prompt.correctOptionId)),
    {
      error: 'With `optionUse: "once"`, no option may be the answer to more than one prompt.',
      path: ['prompts'],
    },
  );
