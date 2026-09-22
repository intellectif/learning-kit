import { z } from 'zod/v4';
import { getActivityTypeDescriptor } from '../registry/index.js';
import {
  INTERACTIVE_VIDEO_ITEM_TYPES,
  isInteractiveVideoItemType,
  TIMELINE_MAX_CHAPTERS,
  TIMELINE_MAX_ITEMS,
  TIMELINE_MAX_QUIZZES,
  TIMELINE_MAX_TITLE_LENGTH,
} from '../timeline-limits.js';
import type { ActivityData, ValidationError, ValidationResult } from '../types/activity.js';
import type { ItemGroup, StimulusKind } from '../types/item-group.js';
import { GROUP_CAPTIONS_REVEAL_DICTATION, groupCaptionsField } from './dictation.js';
import { MediaSchema, RedactedMediaSchema } from './media.js';

/**
 * An authored slot key.
 *
 * A `.` is rejected here, not at render time: `flattenSequence` uses the first
 * `.` to separate a group from its item, so a key containing one would produce
 * an ambiguous slot id. `keyOf` already threw on it — this moves the rejection
 * to `validateItemGroup`, where an author finds it, instead of leaving it to
 * surface when a learner opens the paper. Content that would newly fail
 * validation already threw at flatten time, so it can never have been sat.
 */
const SlotKeySchema = z
  .string()
  .min(1)
  .refine((key) => !key.includes('.'), {
    error:
      'slotKey must not contain "." — that character separates a group from its item in a slot id, so a key containing one would make the slot ambiguous.',
  });

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

const TimelineTitleSchema = z
  .string()
  .max(TIMELINE_MAX_TITLE_LENGTH)
  .refine((title) => title.trim().length > 0, { error: 'A title must not be empty.' });

/** Seconds from the start of the video. zod rejects NaN and ±Infinity itself. */
const TimelineTimeSchema = z.number().min(0, { error: 'A time is 0 seconds or more.' });

/**
 * A quiz. STRICT, like every part of a timeline: a misspelt `requried` would
 * otherwise be kept and the quiz silently optional on a paper that believed it
 * was required.
 */
export const TimelineCueSchema = z.strictObject({
  id: z.string().min(1).max(64),
  at: TimelineTimeSchema,
  itemIds: z.array(z.string().min(1)).min(1).max(TIMELINE_MAX_ITEMS),
  title: TimelineTitleSchema.optional(),
  required: z.boolean().optional(),
});

export const TimelineChapterSchema = z.strictObject({
  at: TimelineTimeSchema,
  title: TimelineTitleSchema,
});

/**
 * A timeline on its own: its quizzes, chapters and navigation. The rules that
 * need the group — every item in exactly one quiz, a video stimulus, the five
 * item types — are {@link timelineIssues}, which both group schemas run.
 */
export const MediaTimelineSchema = z
  .strictObject({
    cues: z.array(TimelineCueSchema).max(TIMELINE_MAX_QUIZZES),
    chapters: z.array(TimelineChapterSchema).max(TIMELINE_MAX_CHAPTERS).optional(),
    navigation: z.enum(['free', 'no-skip-ahead']).optional(),
  })
  .check((ctx) => {
    const seen = new Set<string>();
    ctx.value.cues.forEach((cue, index) => {
      if (seen.has(cue.id)) {
        ctx.issues.push({
          code: 'custom',
          input: cue.id,
          message: `Quiz id "${cue.id}" is used twice: events, drafts and the contents panel name a quiz by its id.`,
          path: ['cues', index, 'id'],
        });
      }
      seen.add(cue.id);
    });
    // Strictly increasing, not merely sorted: two chapters starting at one
    // moment leave the first with no length, and the scrubber no room to draw it.
    const chapters = ctx.value.chapters ?? [];
    chapters.forEach((chapter, index) => {
      const previous = chapters[index - 1];
      if (previous !== undefined && chapter.at <= previous.at) {
        ctx.issues.push({
          code: 'custom',
          input: chapter.at,
          message: 'Chapter times must be strictly increasing.',
          path: ['chapters', index, 'at'],
        });
      }
    });
  });

/** A URL only this document can resolve, or one that inlines the bytes. */
function isLocalOnlyUrl(url: unknown): boolean {
  return typeof url === 'string' && /^(data|blob):/i.test(url);
}

/**
 * The rules of an interactive video that span the timeline, the stimulus and
 * the items. Run by the content schema and, for everything but the two
 * authoring-only rules, by the strict redacted schema — a projection built by
 * hand never passed through the content schema.
 *
 * Items are read defensively: the redacted schema leaves them opaque, and each
 * is proven against its own type's schema elsewhere.
 */
function timelineIssues(
  group: {
    stimulus: {
      kind: string;
      media?:
        | {
            type: string;
            url: string;
            poster?: string | undefined;
            tracks?: readonly { src: string }[] | undefined;
          }
        | undefined;
    };
    items: readonly unknown[];
    shuffle?: string | undefined;
    timeline?: { cues: readonly { itemIds: readonly string[] }[] } | undefined;
  },
  scope: 'content' | 'redacted',
): { path: (string | number)[]; message: string; input: unknown }[] {
  const timeline = group.timeline;
  if (timeline === undefined) {
    return [];
  }
  const issues: { path: (string | number)[]; message: string; input: unknown }[] = [];
  const media = group.stimulus.media;

  // Reported at the field that is wrong, so an editor's own check at that path
  // can stand in for it without hiding anything else about the stimulus.
  if (group.stimulus.kind !== 'video') {
    issues.push({
      path: ['stimulus', 'kind'],
      input: group.stimulus.kind,
      message:
        'An interactive video needs a video stimulus: quizzes open at moments of a video, and nothing else has them.',
    });
  } else if (media !== undefined && media.type !== 'video') {
    issues.push({
      path: ['stimulus', 'media', 'type'],
      input: media.type,
      message:
        'An interactive video needs a video file. An embedded provider player cannot be paused at the moment a quiz opens.',
    });
  }
  if (group.shuffle === 'within-group') {
    issues.push({
      path: ['shuffle'],
      input: group.shuffle,
      message:
        'An interactive video presents its questions in the order its quizzes open; shuffle: "within-group" cannot apply to it.',
    });
  }
  if (group.items.length > TIMELINE_MAX_ITEMS) {
    issues.push({
      path: ['items'],
      input: group.items.length,
      message: `An interactive video holds at most ${TIMELINE_MAX_ITEMS} questions.`,
    });
  }

  const itemIds = new Map<string, number>();
  group.items.forEach((item, index) => {
    const {
      id,
      type,
      media: itemMedia,
    } = (item ?? {}) as { id?: unknown; type?: unknown; media?: unknown };
    if (typeof id === 'string') {
      itemIds.set(id, index);
    }
    if (!isInteractiveVideoItemType(type)) {
      issues.push({
        path: ['items', index, 'type'],
        input: type,
        message: `An interactive video may hold only ${INTERACTIVE_VIDEO_ITEM_TYPES.join(', ')} questions.`,
      });
    }
    // The "play the stimulus" fallback a dictation has in a listening group
    // means nothing halfway through a video.
    if (scope === 'content' && type === 'dictation' && itemMedia === undefined) {
      issues.push({
        path: ['items', index, 'media'],
        input: itemMedia,
        message: 'A dictation inside an interactive video needs its own recording.',
      });
    }
  });

  const placed = new Set<string>();
  timeline.cues.forEach((cue, cueIndex) => {
    cue.itemIds.forEach((itemId, position) => {
      const path = ['timeline', 'cues', cueIndex, 'itemIds', position];
      if (!itemIds.has(itemId)) {
        issues.push({
          path,
          input: itemId,
          message: `No item in this group has the id "${itemId}".`,
        });
      } else if (placed.has(itemId)) {
        issues.push({
          path,
          input: itemId,
          message: `Item "${itemId}" is placed twice: every question belongs to exactly one quiz.`,
        });
      }
      placed.add(itemId);
    });
  });
  for (const [itemId, index] of itemIds) {
    if (!placed.has(itemId)) {
      issues.push({
        path: ['items', index],
        input: itemId,
        message: `Item "${itemId}" is in no quiz, so the video would never show it.`,
      });
    }
  }

  // A `data:` video swells the payload and every fingerprint over it; a stored
  // `blob:` URL means nothing in another document.
  if (scope === 'content' && media !== undefined) {
    const urls: [unknown, (string | number)[]][] = [
      [media.url, ['stimulus', 'media', 'url']],
      [media.poster, ['stimulus', 'media', 'poster']],
      ...(media.tracks ?? []).map((track, index): [unknown, (string | number)[]] => [
        track.src,
        ['stimulus', 'media', 'tracks', index, 'src'],
      ]),
    ];
    for (const [url, path] of urls) {
      if (isLocalOnlyUrl(url)) {
        issues.push({
          path,
          input: url,
          message:
            'An interactive video is stored and served: its URLs cannot be data: or blob: URLs.',
        });
      }
    }
  }
  return issues;
}

/**
 * The structural minimum of an item as seen by the CONTAINER schema. Each
 * item's own contract is checked against its registered schema by
 * {@link validateItemGroup} — a zod schema cannot dispatch on a registry
 * that consumers extend at runtime.
 */
const ItemShapeSchema = z.looseObject({
  type: z.string().min(1),
  id: z.string().min(1),
  slotKey: SlotKeySchema.optional(),
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
    slotKey: SlotKeySchema.optional(),
    stimulus: StimulusSchema,
    items: z.array(ItemShapeSchema).min(1),
    shuffle: z.enum(['none', 'within-group']).optional(),
    timeline: MediaTimelineSchema.optional(),
  })
  .refine((group) => group.items.every((item) => item.type !== 'item-group'), {
    error: 'Item groups do not nest: every item must be an activity.',
    path: ['items'],
  })
  .refine((group) => new Set(group.items.map((item) => item.id)).size === group.items.length, {
    error: 'Item ids must be unique within a group.',
    path: ['items'],
  })
  .check((ctx) => {
    for (const issue of timelineIssues(ctx.value, 'content')) {
      ctx.issues.push({ code: 'custom', ...issue });
    }
  });

/** The learner-safe shape of a stimulus, derived from the strict schema below. */
export type RedactedStimulus = z.infer<typeof RedactedStimulusSchema>;

/** Strict learner-safe stimulus: everything but the author-only `transcript`. */
export const RedactedStimulusSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['text', 'audio', 'video', 'image', 'mixed']),
  title: z.string().optional(),
  body: z.string().optional(),
  bodyHtml: z.string().optional(),
  media: RedactedMediaSchema.optional(),
  locale: z.string().optional(),
  attribution: z.string().optional(),
});

/**
 * Strict learner-safe item group. Items are left opaque here — each is proven
 * learner-safe by `assertRedacted` against its OWN type's redacted schema,
 * which is the only place that knowledge lives. The one exception is the one
 * rule that spans the container and an item: a captioned stimulus recording
 * played to a dictation is not learner-safe, because the captions are the
 * dictation's answer.
 */
export const RedactedItemGroupSchema = z
  .strictObject({
    redacted: z.literal(true),
    schemaVersion: z.literal('1.0'),
    type: z.literal('item-group'),
    id: z.string().min(1),
    title: z.string().optional(),
    slotKey: SlotKeySchema.optional(),
    stimulus: RedactedStimulusSchema,
    items: z.array(z.unknown()).min(1),
    shuffle: z.enum(['none', 'within-group']).optional(),
    timeline: MediaTimelineSchema.optional(),
  })
  .check((ctx) => {
    for (const issue of timelineIssues(ctx.value, 'redacted')) {
      ctx.issues.push({ code: 'custom', ...issue });
    }
    const captions = groupCaptionsField(ctx.value);
    if (captions !== undefined) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value.stimulus.media?.[captions],
        message: GROUP_CAPTIONS_REVEAL_DICTATION,
        path: ['stimulus', 'media', captions],
      });
    }
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
  const captions = groupCaptionsField(container.data);
  if (captions !== undefined) {
    errors.push({
      path: ['stimulus', 'media', captions],
      message: GROUP_CAPTIONS_REVEAL_DICTATION,
      code: 'custom',
    });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }
  // zod4 optional outputs are `T | undefined`; the wire type uses exact
  // optionals. Structurally identical at runtime — the cast is type-level.
  return { success: true, data: { ...container.data, items } as unknown as ItemGroup };
}
