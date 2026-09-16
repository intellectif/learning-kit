'use client';

/**
 * Microphone captures that must stop when the region holding them goes away,
 * keyed by group name.
 *
 * Module-level for the reason `playback-group.ts` is: the thing that knows a
 * pane was hidden — the sequence — is not the thing holding the microphone,
 * and a context would have to be threaded through every activity component to
 * reach one. The caller mints the group name per region; a sequence uses the
 * slot's, so hiding one slot stops that slot's capture and no other's. The name
 * reaches a recorder only through `SequenceSlotContext`, never as a prop, so no
 * consumer string can join another region's group.
 *
 * This **supplements** a recorder's own teardown and never replaces it. The
 * sequence's pane effect runs only on a `hidden` transition, not on unmount,
 * and neither a preview nor a standalone render has panes at all — so a
 * component that records still releases the microphone from its own cleanup,
 * and this registry only covers the case where the component is left mounted
 * and merely hidden.
 *
 * No `useCaptureGroup` hook, unlike playback: that one re-registers after every
 * commit because the element behind a ref can be replaced while the ref object
 * is not, whereas a recorder's `stop` keeps one identity for the life of the
 * hook and a plain effect registers it exactly once.
 */
const groups = new Map<string, Set<() => void>>();

/** Adds a capture's stop to a group; returns the matching removal. */
export function joinCaptureGroup(group: string, stop: () => void): () => void {
  let members = groups.get(group);
  if (members === undefined) {
    members = new Set();
    groups.set(group, members);
  }
  members.add(stop);
  return () => {
    const current = groups.get(group);
    if (current === undefined) {
      return;
    }
    current.delete(stop);
    if (current.size === 0) {
      groups.delete(group);
    }
  };
}

/**
 * Stops every capture in the group.
 *
 * The members are copied before they are called. Each `stop` is expected to
 * run its own removal, and a component that answers one by starting again
 * would otherwise be stopped by the sweep that its own stop provoked.
 */
export function stopCaptureGroup(group: string): void {
  const members = groups.get(group);
  if (members === undefined) {
    return;
  }
  for (const stop of [...members]) {
    stop();
  }
}
