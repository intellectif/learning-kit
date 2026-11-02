/**
 * The rolling log hash (design §9): `hash_0 = fnv1a64('')` and
 * `hash_n = fnv1a64(hash_(n-1) + canonicalJson(entry_n))`, in `seq` order.
 */

import { canonicalJson } from './canonical.js';
import { fnv1a64 } from './fnv.js';

/** The hash of an empty log. */
export const EMPTY_LOG_HASH: string = fnv1a64('');

/** The log hash after appending `entry` to a log whose hash is `hash`. */
export function logHashStep(hash: string, entry: unknown): string {
  return fnv1a64(hash + canonicalJson(entry));
}
