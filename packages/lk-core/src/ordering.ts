/**
 * Ordering: where the items of an ordering activity start, before the learner
 * moves any.
 *
 * An ordering item is authored in its right order, which is its answer key, so
 * it can never be shown as authored. Every presentation starts from
 * {@link orderingStart} instead: the practice component, the exam component,
 * and `redact()`, which lists a learner's copy in this order so the key does
 * not travel in the payload either.
 *
 * STABILITY: the start order is part of the wire contract, like
 * `seededShuffle`. A stored attempt holds the learner's final order, so a
 * change here moves no grade; it would change what a learner sees first.
 */

import { seededShuffle } from './shuffle.js';

/** The most items an ordering activity may hold. */
export const ORDERING_MAX_ITEMS = 30;

/** How many seeded shuffles are tried before the reversed order is used. */
const SHUFFLE_ATTEMPTS = 64;

/** The fields of an ordering activity {@link orderingStart} reads. */
export interface OrderingStartInput<TItem extends { id: string }> {
  /** The activity's id: the seed, so every runtime starts the same item the same way. */
  id: string;
  /** The items, in their right order. */
  items: readonly TItem[];
}

/**
 * Whether `order` gives the learner any credit for nothing: an item already
 * first that should be first, or an item already right after the one it
 * follows.
 */
function givesCredit<TItem extends { id: string }>(
  order: readonly TItem[],
  before: ReadonlyMap<string, string | null>,
): boolean {
  return order.some((item, index) => before.get(item.id) === (order[index - 1]?.id ?? null));
}

/**
 * The order an ordering activity's items start in, before the learner moves
 * any: the same on every runtime for the same `id` and items.
 *
 * It never scores. No item starts first that should be first, and none starts
 * right after the item it should follow, so a learner who submits without
 * moving anything scores 0, under either scoring strategy. The order is a
 * shuffle seeded by the activity's id (`seededShuffle`, version 2), tried
 * again with a new seed until it gives nothing away; reversing the right order
 * also gives nothing away, and is the fallback after 64 tries. One item has
 * only one order, which is returned as it is.
 *
 * Returns a new array; the input is never mutated.
 */
export function orderingStart<TItem extends { id: string }>(
  data: OrderingStartInput<TItem>,
): TItem[] {
  const items = [...data.items];
  if (items.length < 2) {
    return items;
  }
  const before = new Map<string, string | null>(
    items.map((item, index) => [item.id, items[index - 1]?.id ?? null]),
  );
  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt += 1) {
    const seed = attempt === 0 ? `ordering:${data.id}` : `ordering:${data.id}#${attempt}`;
    const order = seededShuffle(items, seed, { version: 2 });
    if (!givesCredit(order, before)) {
      return order;
    }
  }
  return items.reverse();
}
