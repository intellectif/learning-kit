'use client';

import { READ_ALOUD_MAX_SECONDS, READ_ALOUD_MAX_TAKES } from '@intellectif/lk-core';

/** The bounds a take is captured under, as the recorder and the sentences use them. */
export interface RecordingBounds {
  /** Above 0, and at most `READ_ALOUD_MAX_SECONDS`. */
  maxSeconds: number;
  /** At least 0 and below `maxSeconds`, or `undefined` for no minimum. */
  minSeconds: number | undefined;
  /** A whole number from 1 to `READ_ALOUD_MAX_TAKES`, or `undefined` for no limit. */
  maxTakes: number | undefined;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The one reading of an item's `recording`: every bound the component captures
 * under, every sentence that names one, and the key that decides whether a new
 * `data` is a new reading all come from here, so no two of them can read the
 * same field differently.
 *
 * `practice` renders unvalidated content in production, so what comes in may
 * be anything a server stored. What comes out is always a set of bounds the
 * schema accepts, and bounds the schema accepts come out unchanged. Three
 * rules decide the rest, and each errs toward a take the learner can finish:
 *
 * - **A present bound that cannot be read is the schema's own ceiling**, never
 *   no bound at all: a `maxSeconds` of `"20"` or `NaN` records up to
 *   `READ_ALOUD_MAX_SECONDS`, and a `maxTakes` of `"1"` allows
 *   `READ_ALOUD_MAX_TAKES`. Unreadable data can make the recorder stricter
 *   than the ceiling, never looser: `maxTakes: "1"` used to mean unlimited
 *   takes. `null` is an absent optional, as it is everywhere a host sends JSON.
 * - **A count is a whole number in range**: `0` and `1.5` read as `1`, `999`
 *   as the ceiling.
 * - **A minimum the maximum cannot reach is no minimum.** A `minSeconds` of 30
 *   under a `maxSeconds` of 20 stopped every take at 20 and then refused it as
 *   too short, so the item could never be answered. The schema refuses that
 *   pair; a reading that honoured it would leave the learner a dead end.
 */
export function readRecordingBounds(recording: unknown): RecordingBounds {
  const bounds =
    typeof recording === 'object' && recording !== null
      ? (recording as Record<string, unknown>)
      : {};
  const maxSeconds =
    isNumber(bounds.maxSeconds) && bounds.maxSeconds > 0
      ? Math.min(bounds.maxSeconds, READ_ALOUD_MAX_SECONDS)
      : READ_ALOUD_MAX_SECONDS;
  const minSeconds =
    isNumber(bounds.minSeconds) && bounds.minSeconds >= 0 && bounds.minSeconds < maxSeconds
      ? bounds.minSeconds
      : undefined;
  const takes = bounds.maxTakes;
  const maxTakes =
    takes === undefined || takes === null
      ? undefined
      : isNumber(takes)
        ? Math.min(Math.max(1, Math.floor(takes)), READ_ALOUD_MAX_TAKES)
        : READ_ALOUD_MAX_TAKES;
  return { maxSeconds, minSeconds, maxTakes };
}

/**
 * A length of audio as the whole seconds a sentence says beside `maxSeconds`,
 * never more than it. A bound may be fractional — the schema allows 2.5 — and
 * rounding a take that ran to it said "3 of 2.5 seconds". Rounded to the
 * nearest second for a finished take, and down for the counter of one still
 * running, which should not reach its bound before the take does.
 */
export function secondsWithin(
  milliseconds: number,
  maxSeconds: number,
  rounding: 'nearest' | 'down',
): number {
  const seconds = milliseconds / 1000;
  const whole = rounding === 'nearest' ? Math.round(seconds) : Math.floor(seconds);
  return Math.min(Math.max(0, whole), maxSeconds);
}
