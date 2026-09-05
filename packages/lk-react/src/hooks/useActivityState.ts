'use client';

import { useCallback, useRef, useState } from 'react';

export type ActivityState = 'idle' | 'in-progress' | 'completed' | 'reviewing';

export interface UseActivityStateResult {
  state: ActivityState;
  /** idle → in-progress; records start time once. Idempotent: repeated calls
   *  (e.g. every learner interaction) neither restart timing nor regress state. */
  start: () => void;
  /** → completed. */
  complete: () => void;
  /** → reviewing (e.g. when showing correct answers). */
  review: () => void;
  /**
   * Clears timing and returns to `to`, defaulting to `idle`. Call when the
   * activity `data` prop changes.
   *
   * The target is a parameter because "reset" for a RESTORED item does not
   * mean idle: an item the learner had already submitted must come back
   * submitted, or a data-prop change quietly unlocks committed work.
   */
  reset: (to?: ActivityState) => void;
  /** Elapsed ms since `start()`; 0 when not started (or after `reset()`). */
  getTimeSpent: () => number;
}

/**
 * Tracks an activity's lifecycle state and elapsed time. Timing is held in a
 * ref (no re-render) and `getTimeSpent()` is read imperatively at submission.
 */
export function useActivityState(initialState: ActivityState = 'idle'): UseActivityStateResult {
  // `initialState` seeds the MOUNT only, like any `default*` value. It exists
  // so a resumed attempt can reopen a question the learner had already
  // submitted as submitted — without it, an exam that locks each question on
  // submit silently unlocks every one of them after a crash, and the learner
  // can answer and submit the same question twice.
  const [state, setState] = useState<ActivityState>(initialState);
  const startTimeRef = useRef<number | null>(null);

  const start = useCallback(() => {
    // Ref guard makes timing idempotent without a side effect in the updater
    // (StrictMode double-invokes updaters); the updater itself stays pure.
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    setState((prev) => (prev === 'idle' ? 'in-progress' : prev));
  }, []);

  const complete = useCallback(() => setState('completed'), []);

  const review = useCallback(() => setState('reviewing'), []);

  const reset = useCallback((to: ActivityState = 'idle') => {
    startTimeRef.current = null;
    setState(to);
  }, []);

  const getTimeSpent = useCallback(
    () => (startTimeRef.current === null ? 0 : Date.now() - startTimeRef.current),
    [],
  );

  return { state, start, complete, review, reset, getTimeSpent };
}
