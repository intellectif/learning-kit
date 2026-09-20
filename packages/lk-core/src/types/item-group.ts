import type { ActivityData, ActivityMedia } from './activity.js';

/** What a stimulus primarily is. Drives validation and layout, never scoring. */
export type StimulusKind = 'text' | 'audio' | 'video' | 'image' | 'mixed';

/**
 * Shared material that several items refer to: a reading passage, a
 * recording, a chart. Modelled as CONTENT — it lives inside the item group
 * that carries it — so it works in a lesson quiz, a sequence and an exam
 * section alike, and needs no blueprint to exist.
 *
 * Learner-visible by definition: the point of a stimulus is that the learner
 * reads or hears it. The one exception is `transcript`, an author asset that
 * `redactItemGroup` removes.
 */
export interface Stimulus {
  id: string;
  kind: StimulusKind;
  /** Optional heading (a passage title). */
  title?: string;
  /**
   * Plain-text body: the passage itself, or short instructions above media.
   * Required for `text` and `mixed`.
   */
  body?: string;
  /**
   * Optional sanitised rich-HTML sidecar of `body`. Requires `body`, which is
   * the accessible fallback rendered when no sanitiser is supplied.
   */
  bodyHtml?: string;
  /** The recording, video or image. Required for `audio`, `video`, `image` and `mixed`. */
  media?: ActivityMedia;
  /**
   * Author-only transcript of `media` — for item generation and grading,
   * never shown to the learner. Removed by `redactItemGroup`.
   */
  transcript?: string;
  /** BCP 47 language tag of the material, when it differs from the items'. */
  locale?: string;
  /** Source credit, shown to the learner after the material. */
  attribution?: string;
}

/**
 * A quiz inside an interactive video: one moment of the video, and the
 * questions shown there. The video pauses when playback reaches `at`, and the
 * questions are shown one at a time, in `itemIds` order.
 */
export interface TimelineCue {
  /** Unique within the timeline. Names the quiz in events, the contents panel and drafts. */
  id: string;
  /**
   * Seconds from the start of the video: finite and 0 or more. The SDK never
   * reads the video, so it cannot check this against the duration: a quiz at
   * or past the end opens when the video ends.
   */
  at: number;
  /**
   * `id`s of items in this group, in the order the quiz shows them. Non-empty.
   * Every item of the group belongs to exactly one quiz.
   */
  itemIds: string[];
  /** Optional heading shown above the questions. At most 120 characters. */
  title?: string;
  /**
   * Every question must be answered (practice) or submitted (exam) before
   * playback may pass `at`. Default false.
   */
  required?: boolean;
}

/** A titled section of the video. */
export interface TimelineChapter {
  /** Seconds from the start: finite, 0 or more, strictly increasing across the list. */
  at: number;
  /** Non-empty after trimming; at most 120 characters. */
  title: string;
}

/**
 * The arrangement that turns an item group with a video stimulus into an
 * interactive video: when each quiz opens, the video's chapters, and how far
 * ahead a learner may seek.
 *
 * It lives on the container rather than inside `stimulus` because it describes
 * how THESE questions are arranged over the material, not the material itself.
 */
export interface MediaTimeline {
  cues: TimelineCue[];
  chapters?: TimelineChapter[];
  /**
   * `free` (default): seek anywhere. `no-skip-ahead`: rewind freely, never past
   * the furthest point reached. Either way, playback never passes a `required`
   * quiz that is not finished.
   */
  navigation?: 'free' | 'no-skip-ahead';
}

/**
 * Where a learner stands in an interactive video, stored by the host so the
 * video can resume. Kept apart from `AttemptState`, which holds answers by slot
 * and drops fields it does not know. Read it back through
 * `readMediaProgress`, never directly.
 */
export interface MediaProgress {
  progressVersion: '1.0';
  /** Seconds: where playback last stood. */
  at: number;
  /**
   * Seconds: the furthest point reached. Decides how far `no-skip-ahead` lets
   * the learner seek, and how much of the transcript it shows.
   */
  furthest: number;
}

/**
 * One stimulus serving several items. Two rules, both taken from observed
 * failures: a group is SHUFFLE-ATOMIC (shuffling a sequence moves the group
 * as one block — interleaving two passages' questions is the defect), and its
 * stimulus is presented persistently alongside every item, never behind a
 * toggle the learner must reopen per question.
 *
 * Generic over the item type so one shape describes a group of full activity
 * data (authoring, server) and a group of `redact()` projections (client)
 * without a cast at every boundary.
 */
export interface ItemGroup<TItem = ActivityData> {
  schemaVersion: '1.0';
  type: 'item-group';
  id: string;
  title?: string;
  /**
   * Stable identity for this entry's slots, independent of where it sits in
   * the array. See {@link SequenceSlot.slotId}: without one, inserting a
   * question above this group re-maps every slot id beneath it, and stored
   * grades quietly start naming different questions.
   */
  slotKey?: string;
  stimulus: Stimulus;
  /**
   * The items, in authored order. Non-empty; ids unique within the group; no
   * nested groups.
   *
   * An item may declare its own `slotKey`, for the same reason an entry can:
   * it pins the item's identity within the group (`"reading.q1"` rather than
   * `"reading.0"`), so inserting a question into a published group does not
   * re-map the ones after it.
   */
  items: (TItem & { slotKey?: string })[];
  /**
   * `none` (default) keeps authored order; `within-group` shuffles the items
   * among themselves under the sequence seed. Either way the group stays one
   * contiguous block.
   */
  shuffle?: 'none' | 'within-group';
  /**
   * Makes the group an interactive video: the stimulus must be a video, every
   * item must be one of `INTERACTIVE_VIDEO_ITEM_TYPES`, and every item belongs
   * to exactly one quiz. Items are then presented in quiz order, never
   * shuffled. An older lk-core that does not know this field presents the same
   * items as an ordinary video testlet, with the same slots and grades.
   */
  timeline?: MediaTimeline;
}

/**
 * What a sequence is made of: loose activities and item groups, in authored
 * order.
 *
 * A plain activity may carry `slotKey` here even though no activity SCHEMA
 * declares one, because a slot key describes an item's PLACE in a paper, not
 * its content — the same question keeps its own id in every paper it appears
 * in. Putting it on the entry rather than on the activity is what lets it be
 * authored without every activity type having to know about assessment
 * assembly. See {@link SequenceSlot.slotId}.
 */
export type SequenceEntry<TItem = ActivityData> = (TItem & { slotKey?: string }) | ItemGroup<TItem>;

/** The group a presented slot belongs to. */
export interface SequenceSlotGroup {
  id: string;
  title?: string;
  stimulus: Stimulus;
  /** 0-based position of this slot within the group's PRESENTED order. */
  position: number;
  /** Number of slots in the group. */
  size: number;
  /** The group's timeline, when the group is an interactive video. */
  timeline?: MediaTimeline;
  /** The quiz this slot's item sits in, when the group is an interactive video. */
  cue?: TimelineCue;
}

/** One presented position in a flattened sequence. */
export interface SequenceSlot<TItem = ActivityData> {
  /**
   * Identity of the slot within the sequence definition — unique, and stable
   * under shuffling. Feed it to `composeAssessmentScore` as `slotId`.
   *
   * By default it is derived from the AUTHORED position (`"2"` for the third
   * top-level entry; `"2.1"` for the second item of that entry when it is a
   * group), so the same activity can appear in two entries and still be two
   * slots.
   *
   * **A positional id is only valid against one version of the entries
   * array.** Insert a question at the top of a published paper and every id
   * below it shifts: rows stored as `"3"` now name what used to be entry 2,
   * and a re-grade or a review render pairs each response with the wrong
   * question — silently, because the ids still look valid. For any content
   * whose slot ids you persist, give the entries an explicit `slotKey`; it is
   * used verbatim here and survives insertion, deletion and re-ordering.
   */
  slotId: string;
  /** 0-based PRESENTED position, after shuffling. */
  index: number;
  activity: TItem;
  /** Present when the slot comes from an item group. */
  group?: SequenceSlotGroup;
}
