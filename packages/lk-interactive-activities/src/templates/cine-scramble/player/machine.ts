import type { CineScrambleClip } from '../schema.js';
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
  return [...clips]
    .sort((a, b) => a.id - b.id)
    .map((clip) => clip.caption.trim())
    .join(' ');
}
