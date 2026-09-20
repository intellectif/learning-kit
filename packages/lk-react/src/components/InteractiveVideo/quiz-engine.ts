import type { MediaTimeline, TimelineCue } from '@intellectif/lk-core';

/**
 * The quiz playback has just reached, or undefined: the EARLIEST quiz with
 * `previous < at ≤ now` that has not been handled in this pass.
 *
 * Crossing, never equality: at 2.5× speed about 0.6 s of video passes between
 * two `timeupdate` events, so a quiz checked for `now === at` is missed. And
 * the earliest wins, so when a janky frame carries playback past two quizzes
 * at once, the player opens the first, stops there, and meets the second as
 * playback continues — no quiz is ever skipped by speed.
 */
export function crossedQuiz(
  cues: readonly TimelineCue[],
  previous: number,
  now: number,
  handled: ReadonlySet<string>,
): TimelineCue | undefined {
  let earliest: TimelineCue | undefined;
  for (const cue of cues) {
    if (handled.has(cue.id) || !(previous < cue.at && cue.at <= now)) {
      continue;
    }
    if (earliest === undefined || cue.at < earliest.at) {
      earliest = cue;
    }
  }
  return earliest;
}

/** The quizzes that open when the video ends: every one at or past its duration. */
export function quizzesAtEnd(
  cues: readonly TimelineCue[],
  duration: number,
  handled: ReadonlySet<string>,
): TimelineCue[] {
  return cues
    .filter((cue) => !handled.has(cue.id) && cue.at >= duration - 0.05)
    .sort((a, b) => a.at - b.at);
}

/** Why a seek was held short of where it was asked to go. */
export type SeekHold =
  | { kind: 'required'; cue: TimelineCue }
  | { kind: 'no-skip-ahead'; furthest: number };

/**
 * Where a seek from `from` to `to` may actually land.
 *
 * Backward is always free. Forward stops at the first `required` quiz whose
 * questions are not all answered — landing ON it, so it opens — and, under
 * `no-skip-ahead`, at the furthest point the learner has reached. The earlier
 * of the two limits wins, and the answer says which, so the player can tell
 * the learner why the seek stopped short.
 */
export function limitSeek(
  timeline: MediaTimeline,
  from: number,
  to: number,
  furthest: number,
  finished: (cueId: string) => boolean,
): { at: number; hold?: SeekHold } {
  if (to <= from) {
    return { at: to };
  }
  let at = to;
  let hold: SeekHold | undefined;
  if (timeline.navigation === 'no-skip-ahead' && to > furthest) {
    at = Math.max(from, furthest);
    hold = { kind: 'no-skip-ahead', furthest };
  }
  const blocking = timeline.cues
    .filter((cue) => cue.required === true && cue.at > from && cue.at <= to && !finished(cue.id))
    .sort((a, b) => a.at - b.at)[0];
  if (blocking !== undefined && blocking.at <= at) {
    return { at: blocking.at, hold: { kind: 'required', cue: blocking } };
  }
  return hold === undefined ? { at } : { at, hold };
}

/**
 * The earliest point a resumed learner may start from: never past the first
 * `required` quiz with a question still unanswered, whatever the stored
 * position says — a resume is never a way past a required quiz.
 */
export function limitResume(
  timeline: MediaTimeline,
  at: number,
  finished: (cueId: string) => boolean,
): number {
  const blocking = timeline.cues
    .filter((cue) => cue.required === true && cue.at < at && !finished(cue.id))
    .sort((a, b) => a.at - b.at)[0];
  // Just before the quiz, so pressing play crosses it and it opens.
  return blocking === undefined ? at : Math.max(0, blocking.at - 0.25);
}
