import * as z from 'zod/v4';
import { ORDERING_MAX_ITEMS } from '../ordering.js';
import { AiPermissionsSchema } from './ai.js';
import { FeedbackSchema } from './feedback.js';
import { MediaSchema } from './media.js';

/** Zod schema for one item to put in order. Loose: a consumer sidecar survives validation. */
export const OrderingItemSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().min(1),
  feedback: z.string().optional(),
});

/**
 * An item's text as a learner tells two items apart: spaces collapsed, and
 * composed and decomposed accents alike.
 */
export function orderingTextKey(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/**
 * Zod schema validating the full Ordering data contract.
 *
 * Beyond the shape, three guards, each reported at the item it is about:
 *
 * 1. **Between 2 and 30 items.** One item has nothing to order.
 * 2. **Item ids are unique** — a response names items by id, so a shared id
 *    makes two items one.
 * 3. **No two items read the same.** Two items the learner cannot tell apart
 *    have no right order between them, and swapping them would score as an
 *    error.
 */
export const OrderingDataSchema = z
  .looseObject({
    schemaVersion: z.literal('1.0'),
    type: z.literal('ordering'),
    id: z.string().min(1),
    title: z.string().min(1),
    instructions: z.string().optional(),
    items: z.array(OrderingItemSchema).min(2).max(ORDERING_MAX_ITEMS),
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
    const ids = new Set<string>();
    const texts = new Set<string>();
    data.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'id'],
          message: 'Item ids must be unique.',
        });
      }
      ids.add(item.id);
      const key = orderingTextKey(item.text);
      if (texts.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'text'],
          message: 'Two items read the same, so no order between them is right.',
        });
      }
      texts.add(key);
    });
  });
