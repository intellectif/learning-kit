'use client';

import { type RefObject, useEffect } from 'react';

/**
 * Media elements that must not play at the same time, keyed by group name.
 *
 * Module-level on purpose: the two players of a dictation are two separate
 * `<ActivityMedia>` mounts with no common ancestor that owns playback, and a
 * context would have to be threaded through every activity component to reach
 * them. A map keyed by a group name is the smaller mechanism, and it costs
 * nothing to the components that do not name a group. The caller mints the
 * name per mount — never from the activity id, which two renderings of one
 * item share, and never from `useId`, which two separately hydrated roots
 * share.
 */
const groups = new Map<string, Set<HTMLMediaElement>>();

/** Adds an element to a group; returns the matching removal. */
export function joinPlaybackGroup(group: string, element: HTMLMediaElement): () => void {
  let members = groups.get(group);
  if (members === undefined) {
    members = new Set();
    groups.set(group, members);
  }
  members.add(element);
  return () => {
    const current = groups.get(group);
    if (current === undefined) {
      return;
    }
    current.delete(element);
    if (current.size === 0) {
      groups.delete(group);
    }
  };
}

/**
 * Pauses every OTHER member of the group. Called from a player's own `play`
 * event, so whichever recording the learner starts silences the rest.
 *
 * Pausing charges nothing: a budgeted play is charged inside the starting
 * player's own handler, and pausing another player neither refunds nor starts
 * anything — its transport records the position, so a later resume is a
 * resume and not a second play.
 */
export function pausePlaybackGroupOthers(group: string, element: HTMLMediaElement): void {
  const members = groups.get(group);
  if (members === undefined) {
    return;
  }
  for (const member of members) {
    if (member !== element && !member.paused) {
      member.pause();
    }
  }
}

/**
 * Keeps `ref`'s element registered in `group` for as long as both exist.
 *
 * Re-registers after every commit rather than on a dependency list: the
 * element behind a ref can change while the ref object does not — a player
 * that swaps the SDK transport for the native bar when `renderMode` turns to
 * `review` mounts a new `<audio>` — and a list of `[ref, group]` would leave
 * the new element out of the group. Leaving and joining is a set delete and a
 * set add.
 */
export function usePlaybackGroup(
  ref: RefObject<HTMLMediaElement | null>,
  group: string | undefined,
): void {
  useEffect(() => {
    const element = ref.current;
    if (group === undefined || element === null) {
      return;
    }
    return joinPlaybackGroup(group, element);
  });
}
