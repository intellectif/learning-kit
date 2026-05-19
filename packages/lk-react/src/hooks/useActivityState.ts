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
  /** → idle and clears timing. Call when the activity `data` prop changes. */
  reset: () => void;
  /** Elapsed ms since `start()`; 0 when not started (or after `reset()`). */
  getTimeSpent: () => number;
}

/**
 * Tracks an activity's lifecycle state and elapsed time. Timing is held in a
 * ref (no re-render) and `getTimeSpent()` is read imperatively at submission.
 */
export function useActivityState(): UseActivityStateResult {
  const [state, setState] = useState<ActivityState>('idle');
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

  const reset = useCallback(() => {
    startTimeRef.current = null;
    setState('idle');
  }, []);

  const getTimeSpent = useCallback(
    () => (startTimeRef.current === null ? 0 : Date.now() - startTimeRef.current),
    [],
  );

  return { state, start, complete, review, reset, getTimeSpent };
}
