import { seededShuffle } from './shuffle.js';
import type { ItemGroup, SequenceEntry, SequenceSlot } from './types/item-group.js';

/** Narrows a sequence entry to an item group. */
export function isItemGroup<TItem extends { type: string }>(
  entry: SequenceEntry<TItem>,
): entry is ItemGroup<TItem> {
  return entry.type === 'item-group';
}

/** Options for {@link flattenSequence}. */
export interface FlattenSequenceOptions {
  /**
   * Shuffle the top-level entries. A group moves as ONE block — its items are
   * never interleaved with other entries — which is the reason a group exists
   * as a container rather than as a flag on each item.
   */
  shuffleEntries?: boolean;
  /**
   * Seed for every shuffle in this call: the entries, and each group whose
   * `shuffle` is `within-group`. REQUIRED whenever anything shuffles. The SDK
   * never invents one, because the server that stores an attempt and the
   * client that renders it must derive the SAME order, and only a shared seed
   * makes that true. The attempt id is the natural choice.
   */
  seed?: string;
}

/**
 * Turns a sequence definition — loose activities and item groups, in authored
 * order — into the ordered list of slots to present. Pure and deterministic:
 * call it on the server to record an attempt's order, and on the client to
 * render it, and the two agree.
 *
 * Shuffling is opt-in and seeded. Groups are shuffle-atomic: with
 * `shuffleEntries` a group changes position but stays one contiguous block,
 * and only a group that declares `shuffle: 'within-group'` has its items
 * reordered. Every slot carries a `slotId` derived from the authored
 * position, so identities survive shuffling.
 *
 * @throws Error when a shuffle is requested without a `seed`.
 */
export function flattenSequence<TItem extends { id: string; type: string }>(
  entries: readonly SequenceEntry<TItem>[],
  options: FlattenSequenceOptions = {},
): SequenceSlot<TItem>[] {
  const shuffleEntries = options.shuffleEntries === true;
  const needsSeed =
    shuffleEntries ||
    entries.some((entry) => isItemGroup(entry) && entry.shuffle === 'within-group');
  if (needsSeed && options.seed === undefined) {
    throw new Error(
      'flattenSequence: a seed is required when shuffling (shuffleEntries, or a group with ' +
        'shuffle: "within-group"). Pass the attempt id so the server and the client derive the same order.',
    );
  }
  const seed = options.seed ?? '';

  // Carry the AUTHORED index through the shuffle: slot identity comes from
  // where an entry was written, never from where it happens to be shown.
  const authored = entries.map((entry, entryIndex) => ({ entry, entryIndex }));
  const ordered = shuffleEntries ? seededShuffle(authored, `${seed}:entries`) : authored;

  const slots: SequenceSlot<TItem>[] = [];
  for (const { entry, entryIndex } of ordered) {
    if (!isItemGroup(entry)) {
      slots.push({ slotId: String(entryIndex), index: slots.length, activity: entry });
      continue;
    }
    // An empty group contributes no slots, so it would DISAPPEAR — stimulus,
    // questions and all — from a sequence that still looks well-formed. A
    // listening section filtered to nothing upstream would leave an 18-slot
    // paper presented as 12 slots, and `composeAssessmentScore` would then
    // report a `final` grade over the survivors with nothing pending. The
    // type already declares `items` non-empty; this makes that enforceable at
    // the point where the omission would otherwise become invisible.
    if (entry.items.length === 0) {
      throw new Error(
        `flattenSequence: item group "${entry.id}" has no items. An empty group would silently ` +
          'remove its stimulus and its questions from the presented sequence.',
      );
    }
    const items = entry.items.map((item, itemIndex) => ({ item, itemIndex }));
    const presented =
      entry.shuffle === 'within-group' ? seededShuffle(items, `${seed}:group:${entry.id}`) : items;
    const size = presented.length;
    presented.forEach(({ item, itemIndex }, position) => {
      slots.push({
        slotId: `${entryIndex}.${itemIndex}`,
        index: slots.length,
        activity: item,
        group: {
          id: entry.id,
          ...(entry.title !== undefined ? { title: entry.title } : {}),
          stimulus: entry.stimulus,
          position,
          size,
        },
      });
    });
  }
  return slots;
}
