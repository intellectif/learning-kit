import { seededShuffle } from './shuffle.js';
import type { ItemGroup, SequenceEntry, SequenceSlot } from './types/item-group.js';

/** Narrows a sequence entry to an item group. */
export function isItemGroup<TItem extends { type: string }>(
  entry: SequenceEntry<TItem>,
): entry is ItemGroup<TItem> {
  return entry.type === 'item-group';
}

/**
 * An entry's declared `slotKey`, if it has one. Read structurally rather than
 * from the type, because a plain activity may carry one too — `slotKey` is a
 * property of an item's PLACE in a paper, so any entry can declare it without
 * every activity schema having to know about assessment assembly.
 *
 * A key containing `.` is rejected: `.` separates a group from its item in a
 * slot id, so `"a.b"` as a group key would be indistinguishable from item `b`
 * of group `a`.
 */
function keyOf(entry: unknown): string | undefined {
  const key = (entry as { slotKey?: unknown }).slotKey;
  if (key === undefined) {
    return undefined;
  }
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(
      `flattenSequence: slotKey must be a non-empty string, received ${String(key)}.`,
    );
  }
  if (key.includes('.')) {
    throw new Error(
      `flattenSequence: slotKey "${key}" contains a "." , which separates a group from its item ` +
        'in a slot id. Choose a key without it, or the two become indistinguishable.',
    );
  }
  return key;
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
    // An authored `slotKey` wins over the positional path. A positional id is
    // only valid against ONE version of the entries array; a declared key
    // survives insertion, deletion and re-ordering, which is what makes a
    // stored slot id safe to re-grade against later.
    const entryKey = keyOf(entry) ?? String(entryIndex);
    if (!isItemGroup(entry)) {
      slots.push({ slotId: entryKey, index: slots.length, activity: entry });
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
        slotId: `${entryKey}.${keyOf(item) ?? String(itemIndex)}`,
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

  // Positional ids are unique by construction; authored keys are not. Two
  // entries sharing a key would collapse into one identity, so every response
  // stored against it would overwrite the other's — and `composeAssessmentScore`
  // would score one question twice and the other never.
  const seenSlotIds = new Set<string>();
  // ENTRY keys are checked separately, because a loose entry keyed "reading"
  // and a group keyed "reading" produce slot ids "reading" and "reading.0"
  // that never collide — while everything reading the entry prefix (the
  // pager's stimulus grouping, for one) treats them as the same entry, and
  // shows the group's passage above the unrelated loose question. Positional
  // ids could not express this: an index is a loose item or a group, never
  // both.
  const seenEntryKeys = new Set<string>();
  for (const slot of slots) {
    if (seenSlotIds.has(slot.slotId)) {
      throw new Error(
        `flattenSequence: duplicate slot id "${slot.slotId}". Two entries declare the same ` +
          'slotKey, so responses stored against them could not be told apart.',
      );
    }
    seenSlotIds.add(slot.slotId);
  }
  for (const { entry, entryIndex } of ordered) {
    const entryKey = keyOf(entry) ?? String(entryIndex);
    if (seenEntryKeys.has(entryKey)) {
      throw new Error(
        `flattenSequence: duplicate entry key "${entryKey}". A loose activity and an item group ` +
          'cannot share a slotKey — their slot ids would not collide, but everything that reads ' +
          'the entry they belong to would treat them as one entry.',
      );
    }
    seenEntryKeys.add(entryKey);
  }
  return slots;
}
