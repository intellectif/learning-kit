import { UnknownActivityTypeError } from '../errors.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import { GROUP_CAPTIONS_REVEAL_DICTATION, groupCaptionsField } from '../schemas/dictation.js';
import { ItemGroupSchema, validateItemGroup } from '../schemas/item-group.js';
import { INTERACTIVE_VIDEO_ITEM_TYPES, isInteractiveVideoItemType } from '../timeline-limits.js';
import type { ActivityType } from '../types/activity.js';
import type { DraftContext, DraftIssue, DraftValidationResult } from '../types/authoring.js';
import type { ItemGroup } from '../types/item-group.js';
import { withValidationScope } from '../validation-scope.js';
import { validateDraft } from './index.js';
import {
  checkMedia,
  covers,
  type DraftFields,
  isMissingId,
  isRecord,
  issue,
  isUnset,
  isUnwritten,
  refusesEmpty,
} from './issues.js';

/**
 * A new, empty reading or listening testlet for an editor to start from.
 *
 * The stimulus starts as `text`, the only kind that needs no media file to be
 * a valid draft — an author who is writing a passage can begin typing, and one
 * who is building a listening item changes `kind` before uploading. `items`
 * starts empty, exactly as a new fill-in-the-blanks draft starts with no
 * blanks: the group is `incomplete` until somebody writes a question into it.
 *
 * @throws Error when `newId` returns an empty or repeated id.
 */
export function createItemGroupDraft(context: DraftContext): ItemGroup {
  const issued = new Set<string>();
  const newId = (): string => {
    const id: unknown = context.newId();
    if (typeof id !== 'string' || id === '') {
      throw new Error('createItemGroupDraft: newId() must return a non-empty string.');
    }
    if (issued.has(id)) {
      throw new Error(
        `createItemGroupDraft: newId() returned "${id}" twice. Ids within one draft must differ.`,
      );
    }
    issued.add(id);
    return id;
  };
  return {
    schemaVersion: '1.0',
    type: 'item-group',
    id: newId(),
    stimulus: { id: newId(), kind: 'text', body: '' },
    items: [],
  };
}

/**
 * A new, empty interactive video for an editor to start from: an item group
 * whose stimulus is a video with no file yet, no questions, and a timeline with
 * no quizzes.
 *
 * It is an ordinary item group — {@link validateItemGroupDraft} checks it, and
 * everything that reads groups reads it — because that is what keeps each
 * question its own slot. Like every new draft it is `incomplete`: an untouched
 * draft must never read as finished.
 *
 * @throws Error when `newId` returns an empty or repeated id.
 */
export function createInteractiveVideoDraft(context: DraftContext): ItemGroup {
  const draft = createItemGroupDraft(context);
  return {
    ...draft,
    stimulus: { id: draft.stimulus.id, kind: 'video', media: { type: 'video', url: '' } },
    timeline: { cues: [] },
  };
}

/**
 * Tells an unfinished testlet from a broken one — {@link validateDraft} for the
 * container that holds several questions around one passage or recording.
 *
 * It is a **separate entry point rather than a `'item-group'` type**, because
 * `validateDraft('item-group', …)` throws by design: `item-group` is reserved
 * in the registry precisely so it can never be registered as an activity, and
 * that guard is what keeps `isItemGroup` and `flattenSequence` able to trust
 * their own container. Widening `validateDraft` to accept it would have meant
 * weakening that.
 *
 * Each item is checked by `validateDraft` for its own type and its issues are
 * re-pathed under `items.N.…`, so an editor gets one list for the whole group
 * and every code in it is the code that type already documents. An item whose
 * type nobody registered is REPORTED, never thrown — an author fixing a
 * six-item group wants all six problems, not the first one that blew up.
 *
 * The group is `complete` only when the container passes, every item passes its
 * own schema, and every item is itself `complete`.
 *
 * @throws the error a registered item type's `checkDraft` or schema throws, as
 *   `validateDraft` does for that item on its own. Only an unregistered type is
 *   turned into an issue: a fault in a type's own code is not a problem with the
 *   draft, and reporting it as an unknown type would hide it.
 */
export function validateItemGroupDraft(draft: unknown): DraftValidationResult<ItemGroup> {
  // Every item is checked as a draft and then again as part of the group: one
  // scope lets the expensive normalisation behind both run once.
  return withValidationScope(() => validateItemGroupDraftInScope(draft));
}

function validateItemGroupDraftInScope(draft: unknown): DraftValidationResult<ItemGroup> {
  const issues: DraftIssue[] = [];
  if (!isRecord(draft)) {
    issues.push(
      issue('ig_not_an_object', [], 'A group must be an object with a stimulus and its items.'),
    );
    return { status: 'invalid', issues };
  }

  issues.push(...checkGroupIdentity(draft));
  if (isRecord(draft.stimulus)) {
    issues.push(...checkStimulus(draft.stimulus));
  } else if (isUnset(draft.stimulus)) {
    issues.push(
      issue(
        'ig_stimulus_required',
        ['stimulus'],
        'Add the passage, recording or image the questions are about.',
      ),
    );
  }
  issues.push(...checkItems(draft));
  if (draft.timeline !== undefined && draft.timeline !== null) {
    issues.push(...checkTimeline(draft));
  }
  const captions = groupCaptionsField(draft, (captionsUrl) => !isUnwritten(captionsUrl));
  if (captions !== undefined) {
    issues.push(
      issue(
        'dc_captions_not_allowed',
        ['stimulus', 'media', captions],
        GROUP_CAPTIONS_REVEAL_DICTATION,
      ),
    );
  }

  // Every container failure the checks above did not already account for, added
  // as `invalid` — the same rule `validateDraft` follows, so a rule nobody
  // named still reaches the author instead of passing silently.
  const parsed = ItemGroupSchema.safeParse(draft, { reportInput: true });
  if (!parsed.success) {
    for (const schemaIssue of parsed.error.issues) {
      const path = schemaIssue.path.map(String);
      if (issues.some((known) => covers(known.path, path))) {
        continue;
      }
      if (path.length > 0 && refusesEmpty(draft, schemaIssue)) {
        issues.push(
          issue(
            'null_not_allowed',
            path,
            'This field cannot be null. Leave it out if it is optional, or give it a value.',
          ),
        );
        continue;
      }
      issues.push({
        path,
        message: schemaIssue.message,
        code: schemaIssue.code,
        severity: 'invalid',
      });
    }
  }

  const stored = validateItemGroup(draft);
  if (issues.length === 0 && stored.success) {
    return { status: 'complete', data: stored.data, issues };
  }
  if (issues.length === 0) {
    // The container and every item satisfy their own checks, yet the group is
    // not storable. Nothing here can name the cause, so hand over the
    // validator's own errors rather than claim the draft is finished.
    for (const error of stored.success ? [] : stored.errors) {
      issues.push({ ...error, severity: 'invalid' });
    }
  }
  const invalid = issues.some((found) => found.severity !== 'incomplete');
  return { status: invalid ? 'invalid' : 'incomplete', issues };
}

/**
 * An interactive video: every question in exactly one quiz, quizzes at real
 * moments, a video to hang them on, and only the five question types a video
 * may hold. Each check stands aside where another already names the problem —
 * an unset item type is `ig_item_type_required`, an unregistered one
 * `ig_item_type_unknown` — so an author sees one issue per mistake.
 */
function checkTimeline(draft: DraftFields): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const timeline = draft.timeline;
  if (!isRecord(timeline)) {
    return issues;
  }
  const stimulus = isRecord(draft.stimulus) ? draft.stimulus : undefined;
  if (stimulus !== undefined && !isUnwritten(stimulus.kind) && stimulus.kind !== 'video') {
    issues.push(
      issue(
        'ig_timeline_stimulus_kind',
        ['stimulus', 'kind'],
        'An interactive video needs a video: quizzes open at moments of it.',
      ),
    );
  } else if (
    stimulus !== undefined &&
    isRecord(stimulus.media) &&
    !isUnwritten(stimulus.media.type) &&
    stimulus.media.type !== 'video'
  ) {
    issues.push(
      issue(
        'ig_timeline_stimulus_kind',
        ['stimulus', 'media', 'type'],
        'Upload a video file. An embedded player from another site cannot be paused when a quiz opens.',
      ),
    );
  }
  if (draft.shuffle === 'within-group') {
    issues.push(
      issue(
        'ig_timeline_shuffle',
        ['shuffle'],
        'The questions of an interactive video appear in the order their quizzes open, so they cannot be shuffled.',
      ),
    );
  }

  const items = Array.isArray(draft.items) ? draft.items : [];
  const itemIndexById = new Map<string, number>();
  items.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    if (typeof item.id === 'string' && item.id !== '') {
      itemIndexById.set(item.id, index);
    }
    const type = item.type;
    // Registered but not one of the five: the unset and unregistered cases are
    // already `checkItems`'s to report.
    if (
      typeof type === 'string' &&
      type !== '' &&
      type !== 'item-group' &&
      !isInteractiveVideoItemType(type) &&
      getActivityTypeDescriptor(type) !== undefined
    ) {
      issues.push(
        issue(
          'ig_timeline_item_type',
          ['items', index, 'type'],
          `An interactive video can hold ${INTERACTIVE_VIDEO_ITEM_TYPES.join(', ')} questions only.`,
        ),
      );
    }
    if (type === 'dictation' && isUnset(item.media)) {
      issues.push(
        issue(
          'ig_timeline_dictation_media',
          ['items', index, 'media'],
          'Add the recording this dictation plays: inside a video it cannot play the video.',
        ),
      );
    }
  });

  const cues = Array.isArray(timeline.cues) ? timeline.cues : [];
  const quizIds = new Set<string>();
  const placed = new Set<string>();
  cues.forEach((cue, cueIndex) => {
    if (!isRecord(cue)) {
      return;
    }
    const at = (field: string, ...rest: (string | number)[]): (string | number)[] => [
      'timeline',
      'cues',
      cueIndex,
      field,
      ...rest,
    ];
    if (isMissingId(cue.id)) {
      issues.push(issue('ig_timeline_quiz_id_required', at('id'), 'This quiz has no id.'));
    } else if (typeof cue.id === 'string') {
      if (quizIds.has(cue.id)) {
        issues.push(
          issue('ig_timeline_quiz_id_duplicate', at('id'), `Two quizzes share the id "${cue.id}".`),
        );
      }
      quizIds.add(cue.id);
    }
    if (isUnset(cue.at)) {
      issues.push(
        issue(
          'ig_timeline_quiz_time_required',
          at('at'),
          'Choose when in the video this quiz opens.',
        ),
      );
    } else if (typeof cue.at !== 'number' || !Number.isFinite(cue.at) || cue.at < 0) {
      issues.push(
        issue(
          'ig_timeline_quiz_time_invalid',
          at('at'),
          'A quiz opens at a number of seconds, 0 or more.',
        ),
      );
    }
    if (isUnset(cue.itemIds) || (Array.isArray(cue.itemIds) && cue.itemIds.length === 0)) {
      issues.push(
        issue('ig_timeline_quiz_empty', at('itemIds'), 'Add at least one question to this quiz.'),
      );
      return;
    }
    if (!Array.isArray(cue.itemIds)) {
      return;
    }
    cue.itemIds.forEach((itemId: unknown, position: number) => {
      if (typeof itemId !== 'string') {
        return;
      }
      if (!itemIndexById.has(itemId)) {
        issues.push(
          issue(
            'ig_timeline_quiz_unknown_item',
            at('itemIds', position),
            `This quiz names a question that is not in the video ("${itemId}").`,
          ),
        );
      } else if (placed.has(itemId)) {
        issues.push(
          issue(
            'ig_timeline_item_duplicate',
            at('itemIds', position),
            'This question is already in a quiz: each question belongs to one quiz.',
          ),
        );
      }
      placed.add(itemId);
    });
  });
  for (const [itemId, index] of itemIndexById) {
    if (!placed.has(itemId)) {
      issues.push(
        issue(
          'ig_timeline_item_unplaced',
          ['items', index],
          'Add this question to a quiz, or the video never shows it.',
        ),
      );
    }
  }

  const chapters = Array.isArray(timeline.chapters) ? timeline.chapters : [];
  let previousAt: number | undefined;
  chapters.forEach((chapter, index) => {
    if (!isRecord(chapter)) {
      return;
    }
    if (isUnwritten(chapter.title)) {
      issues.push(
        issue(
          'ig_timeline_chapter_title',
          ['timeline', 'chapters', index, 'title'],
          'Give this chapter a title.',
        ),
      );
    }
    if (typeof chapter.at === 'number' && Number.isFinite(chapter.at)) {
      if (previousAt !== undefined && chapter.at <= previousAt) {
        issues.push(
          issue(
            'ig_timeline_chapter_order',
            ['timeline', 'chapters', index, 'at'],
            'Chapters must start in order, each after the one before it.',
          ),
        );
      }
      previousAt = chapter.at;
    }
  });
  return issues;
}

/** The group's own envelope. `title` is optional on a group, unlike an activity. */
function checkGroupIdentity(draft: DraftFields): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (draft.schemaVersion !== '1.0') {
    issues.push(
      issue(
        'schema_version_invalid',
        ['schemaVersion'],
        'The draft must have schemaVersion "1.0". A draft from createItemGroupDraft has it.',
      ),
    );
  }
  if (draft.type !== 'item-group') {
    issues.push(issue('type_mismatch', ['type'], 'The draft\'s type must be "item-group".'));
  }
  if (isMissingId(draft.id)) {
    issues.push(issue('id_required', ['id'], 'The group has no id.'));
  }
  if (!isUnset(draft.shuffle) && draft.shuffle !== 'none' && draft.shuffle !== 'within-group') {
    issues.push(
      issue(
        'ig_shuffle_invalid',
        ['shuffle'],
        'Shuffling is either "none" or "within-group". Leave it out to keep the authored order.',
      ),
    );
  }
  return issues;
}

const KINDS = new Set(['text', 'audio', 'video', 'image', 'mixed']);
/** Which media type each stimulus kind accepts — mirrors `StimulusSchema`'s refinement. */
const MEDIA_FOR_KIND: Record<string, readonly string[]> = {
  audio: ['audio'],
  video: ['video', 'embed'],
  image: ['image'],
  mixed: ['audio', 'video', 'image', 'embed'],
};

/**
 * The passage, recording or image. The split this makes is the one the whole
 * draft contract exists for: a kind nobody has chosen and a body nobody has
 * typed are `incomplete`, while a recording attached to an image stimulus is
 * `invalid` — writing more will not reconcile them.
 */
function checkStimulus(stimulus: DraftFields): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const at = (...rest: (string | number)[]) => ['stimulus', ...rest];

  if (isMissingId(stimulus.id)) {
    issues.push(issue('ig_stimulus_id_required', at('id'), 'The stimulus has no id.'));
  }

  const kind = stimulus.kind;
  if (isUnwritten(kind)) {
    issues.push(
      issue(
        'ig_stimulus_kind_required',
        at('kind'),
        'Choose what the questions are about: a text, a recording, a video, an image, or a mix.',
      ),
    );
  } else if (typeof kind !== 'string' || !KINDS.has(kind)) {
    // A value of another type is the schema's to refuse.
    if (typeof kind === 'string') {
      issues.push(
        issue(
          'ig_stimulus_kind_invalid',
          at('kind'),
          `"${kind}" is not a stimulus kind. Use text, audio, video, image or mixed.`,
        ),
      );
    }
    // Only the kind-DEPENDENT rules are skipped. The media still has problems
    // of its own — a refused address, a missing description — and returning
    // here left every one of them to the schema, so an unrecognised kind made
    // zod's raw diagnostics appear beside ours.
    if (isRecord(stimulus.media)) {
      issues.push(...checkMedia(stimulus.media, at('media')));
    }
    return issues;
  }

  const hasBody = typeof stimulus.body === 'string' && stimulus.body.trim() !== '';
  // One rule, one issue, at `body` — where the schema reports both halves of
  // it. Written as two branches, a `text` stimulus carrying rich text and no
  // plain text reported the same path twice; and keying the second branch on
  // whether `bodyHtml` had CONTENT missed the empty string a cleared rich-text
  // editor leaves behind, which the schema still refuses.
  const htmlPresent = !isUnset(stimulus.bodyHtml);
  if (!hasBody && (kind === 'text' || kind === 'mixed' || htmlPresent)) {
    issues.push(
      issue(
        'ig_stimulus_body_required',
        at('body'),
        isUnwritten(stimulus.bodyHtml)
          ? 'Write the passage.'
          : 'Write the passage as plain text too. The rich-text version is shown only where a sanitiser is supplied.',
      ),
    );
  }

  if (kind !== 'text' && isUnset(stimulus.media)) {
    issues.push(
      issue('ig_stimulus_media_required', at('media'), 'Add the recording, video or image.'),
    );
  } else if (isRecord(stimulus.media)) {
    const allowed = MEDIA_FOR_KIND[kind as string];
    const mediaType = stimulus.media.type;
    if (allowed !== undefined && typeof mediaType === 'string' && !allowed.includes(mediaType)) {
      issues.push(
        issue(
          'ig_stimulus_media_kind',
          at('media', 'type'),
          `A "${kind}" stimulus cannot carry ${mediaType} media. Use ${allowed.join(' or ')}.`,
        ),
      );
    }
    issues.push(...checkMedia(stimulus.media, at('media')));
  }
  return issues;
}

/**
 * Every item, checked by `validateDraft` for its own type.
 *
 * Re-pathing rather than re-implementing is the point: a multiple-choice
 * question inside a testlet reports exactly the codes a standalone one does,
 * so a consumer's translation table covers both and a rule can never drift
 * between them.
 */
function checkItems(draft: DraftFields): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const items = isUnset(draft.items) ? [] : draft.items;
  if (!Array.isArray(items)) {
    return issues;
  }
  if (items.length === 0) {
    issues.push(
      issue('ig_items_required', ['items'], 'Add at least one question about this material.'),
    );
    return issues;
  }

  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) {
      continue;
    }
    const ordinal = index + 1;
    if (isMissingId(item.id)) {
      issues.push(
        issue('ig_item_id_required', ['items', index, 'id'], `Question ${ordinal} has no id.`),
      );
    } else if (typeof item.id === 'string') {
      if (seen.has(item.id)) {
        repeated.add(item.id);
      }
      seen.add(item.id);
    }

    if (item.type === 'item-group') {
      issues.push(
        issue(
          'ig_item_nested_group',
          ['items', index, 'type'],
          'Groups do not nest: every item must be an activity.',
        ),
      );
      continue;
    }
    if (isUnwritten(item.type)) {
      issues.push(
        issue(
          'ig_item_type_required',
          ['items', index, 'type'],
          `Choose what kind of question ${ordinal} is.`,
        ),
      );
      continue;
    }
    if (typeof item.type !== 'string') {
      continue;
    }

    let result: DraftValidationResult<unknown>;
    try {
      result = validateDraft(item.type as ActivityType, item);
    } catch (error) {
      // Only an unregistered type is reported, never thrown — the same choice
      // `validateItemGroup` makes, for the same reason. Anything else is a fault
      // in a registered type's own checks or schema: it is rethrown, as
      // `validateDraft` throws it for the item on its own, because reported here
      // it read as an unknown type and sent the author after a mistake the draft
      // did not have. The error must name this item's type, too: a check that
      // validates a part of the item as some other, unregistered type has not
      // made this item's type unknown.
      if (!(error instanceof UnknownActivityTypeError) || error.activityType !== item.type) {
        throw error;
      }
      issues.push(
        issue(
          'ig_item_type_unknown',
          ['items', index, 'type'],
          `"${item.type}" is not a registered activity type.`,
        ),
      );
      continue;
    }
    for (const found of result.issues) {
      issues.push({ ...found, path: ['items', String(index), ...found.path] });
    }
  }

  for (const id of repeated) {
    issues.push(
      issue('ig_item_id_duplicate', ['items'], `More than one question has the id "${id}".`),
    );
  }
  return issues;
}
