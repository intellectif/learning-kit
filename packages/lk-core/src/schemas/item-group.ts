import { z } from 'zod/v4';
import { getActivityTypeDescriptor } from '../registry/index.js';
import type { ActivityData, ValidationError, ValidationResult } from '../types/activity.js';
import type { ItemGroup, StimulusKind } from '../types/item-group.js';
import { MediaSchema } from './media.js';

function hasBody(stimulus: { body?: string | undefined }): boolean {
  return typeof stimulus.body === 'string' && stimulus.body.trim().length > 0;
}

/** Which media types can carry a stimulus of each kind. `text`/`mixed` accept any. */
function mediaFits(kind: StimulusKind, mediaType: string | undefined): boolean {
  switch (kind) {
    case 'audio':
      return mediaType === 'audio';
    case 'video':
      return mediaType === 'video' || mediaType === 'embed';
    case 'image':
      return mediaType === 'image';
    default:
      return true;
  }
}

/**
 * Zod schema for a {@link Stimulus}. Loose: unknown keys preserved.
 *
 * The semantic guards exist because a stimulus that does not carry what its
 * `kind` promises is an authoring error that must not reach an exam: an
 * "audio" stimulus with no recording renders as a blank panel above six
 * listening questions. Unrepresentable in JSON Schema; dropped from
 * `stimulusJsonSchema` by design.
 */
export const StimulusSchema = z
  .looseObject({
    id: z.string().min(1),
    kind: z.enum(['text', 'audio', 'video', 'image', 'mixed']),
    title: z.string().optional(),
    body: z.string().optional(),
    bodyHtml: z.string().optional(),
    media: MediaSchema.optional(),
    transcript: z.string().optional(),
    locale: z.string().optional(),
    attribution: z.string().optional(),
  })
  .refine((stimulus) => stimulus.bodyHtml === undefined || hasBody(stimulus), {
    error:
      'bodyHtml requires a plain-text body: it is the accessible fallback rendered when no sanitiser is supplied.',
    path: ['body'],
  })
  .refine(
    (stimulus) => (stimulus.kind !== 'text' && stimulus.kind !== 'mixed') || hasBody(stimulus),
    {
      error: 'A text or mixed stimulus needs a non-empty body.',
      path: ['body'],
    },
  )
  .refine((stimulus) => stimulus.kind === 'text' || stimulus.media !== undefined, {
    error: 'An audio, video, image or mixed stimulus needs media.',
    path: ['media'],
  })
  .refine(
    (stimulus) => stimulus.media === undefined || mediaFits(stimulus.kind, stimulus.media.type),
    {
      error:
        'media.type does not fit the stimulus kind: audio needs audio; video needs video or embed; image needs image.',
      path: ['media', 'type'],
    },
  );

/**
 * The structural minimum of an item as seen by the CONTAINER schema. Each
 * item's own contract is checked against its registered schema by
 * {@link validateItemGroup} — a zod schema cannot dispatch on a registry
 * that consumers extend at runtime.
 */
const ItemShapeSchema = z.looseObject({
  type: z.string().min(1),
  id: z.string().min(1),
});

/**
 * Zod schema for an {@link ItemGroup} CONTAINER. Loose: unknown keys
 * preserved. Validates the group's own fields and the stimulus in full, and
 * each item only structurally (`type` and `id`); use {@link validateItemGroup}
 * to validate the items against their registered schemas as well.
 */
export const ItemGroupSchema = z
  .looseObject({
    schemaVersion: z.literal('1.0'),
    type: z.literal('item-group'),
    id: z.string().min(1),
    title: z.string().optional(),
    stimulus: StimulusSchema,
    items: z.array(ItemShapeSchema).min(1),
    shuffle: z.enum(['none', 'within-group']).optional(),
  })
  .refine((group) => group.items.every((item) => item.type !== 'item-group'), {
    error: 'Item groups do not nest: every item must be an activity.',
    path: ['items'],
  })
  .refine((group) => new Set(group.items.map((item) => item.id)).size === group.items.length, {
    error: 'Item ids must be unique within a group.',
    path: ['items'],
  });

/** Strict learner-safe stimulus: everything but the author-only `transcript`. */
export const RedactedStimulusSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['text', 'audio', 'video', 'image', 'mixed']),
  title: z.string().optional(),
  body: z.string().optional(),
  bodyHtml: z.string().optional(),
  media: MediaSchema.optional(),
  locale: z.string().optional(),
  attribution: z.string().optional(),
});

/**
 * Strict learner-safe item group. Items are left opaque here — each is proven
 * learner-safe by `assertRedacted` against its OWN type's redacted schema,
 * which is the only place that knowledge lives.
 */
export const RedactedItemGroupSchema = z.strictObject({
  redacted: z.literal(true),
  schemaVersion: z.literal('1.0'),
  type: z.literal('item-group'),
  id: z.string().min(1),
  title: z.string().optional(),
  stimulus: RedactedStimulusSchema,
  items: z.array(z.unknown()).min(1),
  shuffle: z.enum(['none', 'within-group']).optional(),
});

function toValidationErrors(
  issues: readonly { path: PropertyKey[]; message: string; code: string }[],
  prefix: string[],
): ValidationError[] {
  return issues.map((issue) => ({
    path: [...prefix, ...issue.path.map(String)],
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validates an item group in full: the container and stimulus against
 * {@link ItemGroupSchema}, then every item against the schema registered for
 * its `type`. Errors from items are reported at `items.<index>.…`.
 *
 * Unlike `validateActivity`, an item whose type is not registered is REPORTED
 * (code `unknown_activity_type`) rather than thrown: a group is validated as
 * a whole, and an author fixing a six-item group wants every problem listed,
 * not the first one that happened to throw.
 */
export function validateItemGroup(data: unknown): ValidationResult<ItemGroup> {
  const container = ItemGroupSchema.safeParse(data);
  if (!container.success) {
    return { success: false, errors: toValidationErrors(container.error.issues, []) };
  }

  const errors: ValidationError[] = [];
  const items: ActivityData[] = [];
  container.data.items.forEach((item, index) => {
    const descriptor = getActivityTypeDescriptor(item.type);
    if (descriptor === undefined) {
      errors.push({
        path: ['items', String(index), 'type'],
        message: `Activity type "${item.type}" is not registered`,
        code: 'unknown_activity_type',
      });
      return;
    }
    const parsed = descriptor.schema.safeParse(item);
    if (!parsed.success) {
      errors.push(...toValidationErrors(parsed.error.issues, ['items', String(index)]));
      return;
    }
    items.push(parsed.data as ActivityData);
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }
  // zod4 optional outputs are `T | undefined`; the wire type uses exact
  // optionals. Structurally identical at runtime — the cast is type-level.
  return { success: true, data: { ...container.data, items } as unknown as ItemGroup };
}
