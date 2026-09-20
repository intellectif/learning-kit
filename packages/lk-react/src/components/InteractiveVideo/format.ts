/** The speeds a learner can choose, slowest first. */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5] as const;

/**
 * A time as a clock: `4:05`, or `1:02:03` past an hour. Whole seconds,
 * rounded down, so the clock never shows a second that has not happened yet.
 */
export function clock(value: number): string {
  const total = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** The next speed in `direction` from `current`, held inside the list. */
export function nudgeSpeed(current: number, direction: 1 | -1): number {
  const at = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  const from = at === -1 ? SPEEDS.indexOf(1) : at;
  return SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, from + direction))] as number;
}
