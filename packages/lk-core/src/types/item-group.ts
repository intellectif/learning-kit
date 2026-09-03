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
  stimulus: Stimulus;
  /** The items, in authored order. Non-empty; ids unique within the group; no nested groups. */
  items: TItem[];
  /**
   * `none` (default) keeps authored order; `within-group` shuffles the items
   * among themselves under the sequence seed. Either way the group stays one
   * contiguous block.
   */
  shuffle?: 'none' | 'within-group';
}

/** What a sequence is made of: loose activities and item groups, in authored order. */
export type SequenceEntry<TItem = ActivityData> = TItem | ItemGroup<TItem>;

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
   * under shuffling. Derived from the AUTHORED position (`"2"` for the third
   * top-level entry; `"2.1"` for the second item of that entry when it is a
   * group), so the same activity can appear in two entries and still be two
   * slots. Feed it to `composeAssessmentScore` as `slotId`.
   */
  slotId: string;
  /** 0-based PRESENTED position, after shuffling. */
  index: number;
  activity: TItem;
  /** Present when the slot comes from an item group. */
  group?: SequenceSlotGroup;
}
