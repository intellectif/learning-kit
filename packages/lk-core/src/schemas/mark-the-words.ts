import * as z from 'zod/v4';
import {
  MARK_THE_WORDS_MAX_WORDS,
  type MarkTargetProblem,
  markableWords,
  resolveMarkTarget,
} from '../mark-the-words.js';
import { AiPermissionsSchema } from './ai.js';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema } from './media.js';

/** Zod schema for one target. Loose: a consumer sidecar survives validation. */
export const MarkTheWordsTargetSchema = z.looseObject({
  text: z.string().min(1),
  occurrence: z.number().int().min(1).optional(),
  feedback: z.string().optional(),
});

/** What the schema says when a target falls on no words of the text. */
export const MARK_TARGET_MESSAGES: Readonly<Record<MarkTargetProblem, string>> = {
  'no-words': 'A target must contain a word: punctuation alone cannot be marked.',
  'not-found':
    'A target must be whole words of the text, in order, written as the text writes them.',
  ambiguous:
    'These words appear more than once in the text: say which appearance with `occurrence`.',
  'no-such-occurrence': 'The text does not have that many appearances of these words.',
};

/**
 * Zod schema validating the full Mark the Words data contract.
 *
 * Beyond the shape, three guards, each reported at the field it is about:
 *
 * 1. **The text has a word to mark**, and at most 1500 of them.
 * 2. **Every target falls on whole words of the text** — once, or at the
 *    appearance its `occurrence` names. A target that could be either of two
 *    places is refused: which one is marked right would be a guess.
 * 3. **No two targets share a word.** A word marked once cannot count twice.
 */
export const MarkTheWordsDataSchema = z
  .looseObject({
    schemaVersion: z.literal('1.0'),
    type: z.literal('mark-the-words'),
    id: z.string().min(1),
    title: z.string().min(1),
    instructions: z.string().optional(),
    text: z.string().min(1),
    targets: z.array(MarkTheWordsTargetSchema).min(1),
    scoringStrategy: z.enum(['all-or-nothing', 'partial']),
    media: MediaSchema.optional(),
    feedback: FeedbackSchema.optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    locale: z.string().optional(),
    learningObjectives: z.array(z.string()).optional(),
    difficultyLevel: z.literal([1, 2, 3, 4, 5]).optional(),
    ai: AiPermissionsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const words = markableWords(data.text);
    if (words.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'The text has no word to mark.' });
      return;
    }
    if (words.length > MARK_THE_WORDS_MAX_WORDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: `The text may have at most ${MARK_THE_WORDS_MAX_WORDS} words; it has ${words.length}.`,
      });
      return;
    }
    const owner = new Map<number, number>();
    data.targets.forEach((target, index) => {
      const found = resolveMarkTarget(words, target);
      if (!found.ok) {
        ctx.addIssue({
          code: 'custom',
          path: ['targets', index, found.problem === 'no-such-occurrence' ? 'occurrence' : 'text'],
          message: MARK_TARGET_MESSAGES[found.problem],
        });
        return;
      }
      if (found.indices.some((word) => owner.has(word))) {
        ctx.addIssue({
          code: 'custom',
          path: ['targets', index],
          message: 'Two targets share a word: each word belongs to one target at most.',
        });
        return;
      }
      for (const word of found.indices) {
        owner.set(word, index);
      }
    });
  });
