import { orderingStart } from '@intellectif/lk-core';
import type { CineScrambleClip } from '../types.js';

/** A scene's clips in chronological order (their ids are 0..n-1). */
export function chronological<T extends { id: number }>(clips: readonly T[]): T[] {
  return [...clips].sort((a, b) => a.id - b.id);
}

/**
 * The order a scene's clips start in, in the pool: the same on every screen
 * for the same activity, scene and attempt, so a teacher and a class see the
 * same "Clip 3". It never gives anything away: no clip starts first that
 * comes first, and none starts right after the clip it follows
 * (lk-core's `orderingStart`).
 */
export function startOrder<T extends { id: number }>(
  clips: readonly T[],
  seed: string,
  attempt = 0,
): T[] {
  const ordered = chronological(clips).map((clip) => ({ ...clip, id: String(clip.id) }));
  const start = orderingStart({ id: attempt === 0 ? seed : `${seed}#${attempt}`, items: ordered });
  const byId = new Map(clips.map((clip) => [String(clip.id), clip]));
  return start.map((item) => byId.get(item.id) as T);
}

/**
 * Shuffles with `random` and never returns the chronological order. Kept for
 * hosts that want a fresh order per learner; the player uses {@link startOrder}.
 */
export function shuffleClips<T extends { id: number }>(
  clips: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...clips];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result.length > 1 && result.every((clip, index) => clip.id === index))
    result.push(result.shift() as T);
  return result;
}
export function placeClip(
  slots: readonly (number | null)[],
  clipId: number,
  target: number,
): (number | null)[] {
  if (target < 0 || target >= slots.length) return [...slots];
  const result = slots.map((id) => (id === clipId ? null : id));
  result[target] = clipId;
  return result;
}
export function unplaceClip(slots: readonly (number | null)[], index: number): (number | null)[] {
  return slots.map((id, i) => (i === index ? null : id));
}
export function checkSlots(slots: readonly (number | null)[]): boolean[] {
  return slots.map((id, index) => id === index);
}
export function wrapRows(count: number, columns = 2): number[] {
  const rows: number[] = [];
  for (let remaining = count; remaining > 0; remaining -= Math.max(1, columns))
    rows.push(Math.min(remaining, Math.max(1, columns)));
  return rows;
}
export function stitchCaptions(clips: readonly CineScrambleClip[]): string {
  return chronological(clips)
    .map((clip) => clip.caption.trim())
    .join(' ');
}
