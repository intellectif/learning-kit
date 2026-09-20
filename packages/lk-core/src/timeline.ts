import { entryKeyOf } from './media-budget.js';
import {
  type AssessmentScore,
  type CompositionPolicy,
  composeAssessmentScore,
  type ScoredItem,
} from './scoring/compose.js';
import type { MediaProgress } from './types/item-group.js';

/**
 * Reads a stored {@link MediaProgress}. Never throws: anything that is not one
 * — a string, a stale shape, an object whose getters throw — answers `null`,
 * and the player starts from the beginning.
 *
 * What it keeps, it clamps. A stored position is host storage, which is input
 * from a stranger by the time it is read back: a negative `at`, a `furthest`
 * behind `at`, or a position past the end of a video that has since been
 * re-cut must not put the playhead somewhere it cannot be. Give `duration`
 * once the video's metadata is known, and both positions are held inside it.
 */
export function readMediaProgress(value: unknown, duration?: number): MediaProgress | null {
  let version: unknown;
  let at: unknown;
  let furthest: unknown;
  try {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    // Each field read once: an accessor that answered the check one value and
    // the clamp another would put back exactly what the check refused.
    ({ progressVersion: version, at, furthest } = value as Record<string, unknown>);
  } catch {
    return null;
  }
  if (version !== '1.0' || typeof at !== 'number' || !Number.isFinite(at)) {
    return null;
  }
  const end =
    typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
      ? duration
      : Number.POSITIVE_INFINITY;
  const clampedAt = Math.min(Math.max(0, at), end);
  const reached = typeof furthest === 'number' && Number.isFinite(furthest) ? furthest : clampedAt;
  return {
    progressVersion: '1.0',
    at: clampedAt,
    furthest: Math.min(Math.max(clampedAt, reached), end),
  };
}

/**
 * One interactive video's composed result: the scored items whose slot belongs
 * to the entry, composed as one section of weight 1. A slot belongs when
 * `entryKeyOf(item.slotId) === entryKey`, so a host can pass a whole attempt's
 * items and get the video's share of it.
 *
 * `entryKey` is the group's `slotKey` when it has one — which every published
 * video should — or its position in the sequence otherwise. A group object
 * alone cannot know its position, which is why this takes the key.
 *
 * @throws Error when no item belongs to the entry. A mistyped key would
 *         otherwise compose nothing into a `final` result, and a refusal must
 *         never read as a grade.
 */
export function composeTimelineScore(
  entryKey: string,
  items: readonly ScoredItem[],
  policy: CompositionPolicy,
): AssessmentScore {
  const own = items.filter((item) => entryKeyOf(item.slotId) === entryKey);
  if (own.length === 0) {
    throw new Error(
      `composeTimelineScore: no scored item belongs to entry "${entryKey}". Pass the video's ` +
        'slotKey (or its position in the sequence), and the items of the attempt that holds it.',
    );
  }
  return composeAssessmentScore([{ id: entryKey, weight: 1, items: own }], policy);
}
