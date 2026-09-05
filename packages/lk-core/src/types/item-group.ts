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
