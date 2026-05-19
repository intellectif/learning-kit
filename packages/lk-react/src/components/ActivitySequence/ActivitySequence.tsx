'use client';

import type {
  ActivityData,
  ActivityResult,
  InteractionEvent,
  ThemeTokens,
} from '@intellectif/lk-core';
import { useEffect, useRef, useState } from 'react';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';

export interface ActivitySequenceProps {
  /** The ordered set of activities to present, one at a time. */
  activities: ActivityData[];
  /** Called whenever an individual activity is completed. */
  onActivityComplete?: (result: ActivityResult, index: number) => void;
  /** Called once every activity in the set has been completed. */
  onComplete?: (results: ActivityResult[]) => void;
  /** Forwarded to each activity. */
  onInteraction?: (event: InteractionEvent) => void;
  theme?: Partial<ThemeTokens>;
  locale?: string;
  disabled?: boolean;
}

/**
 * Presents a set of activities as an in-place pager: one question visible at a
 * time, navigated with Prev/Next (no page scrolling). Linear free navigation —
 * the learner may move back and forth; activities keep their own submit and
 * scoring. On navigation, focus moves to the question region and the position
 * is announced via an aria-live region.
 */
export function ActivitySequence({
  activities,
  onActivityComplete,
  onComplete,
  onInteraction,
  theme,
  locale,
  disabled,
}: ActivitySequenceProps): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<(ActivityResult | null)[]>(() =>
    activities.map(() => null),
  );
  const regionRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // After a navigation (not the initial mount) move focus to the question
  // region so screen-reader / keyboard users land on the new question.
  // biome-ignore lint/correctness/useExhaustiveDependencies: index is the intended trigger
  useEffect(() => {
    if (mountedRef.current) {
      regionRef.current?.focus();
    } else {
      mountedRef.current = true;
    }
  }, [index]);

  const total = activities.length;
  const current = activities[index];

  const go = (next: number): void => {
    setIndex(next);
  };

  const handleComplete = (result: ActivityResult): void => {
    const nextResults = results.slice();
    nextResults[index] = result;
    setResults(nextResults);
    onActivityComplete?.(result, index);
    if (nextResults.every((r): r is ActivityResult => r !== null)) {
      onComplete?.(nextResults);
    }
  };

  if (!current) {
    return <div className="lk-seq" />;
  }

  const childProps = {
    onComplete: handleComplete,
    ...(onInteraction ? { onInteraction } : {}),
    ...(theme ? { theme } : {}),
    ...(locale ? { locale } : {}),
    ...(disabled ? { disabled } : {}),
  };

  return (
    <div className="lk-seq" lang={locale}>
      <div className="lk-seq-progress" aria-live="polite" role="status">
        Question {index + 1} of {total}
      </div>

      <section
        className="lk-seq-question"
        ref={regionRef}
        tabIndex={-1}
        aria-label={`Question ${index + 1} of ${total}`}
      >
        {current.type === 'multiple-choice' ? (
          <MultipleChoice data={current} {...childProps} />
        ) : (
          <FillInTheBlanks data={current} {...childProps} />
        )}
      </section>

      <div className="lk-seq-nav">
        <button
          type="button"
          className="lk-seq-prev"
          onClick={() => go(index - 1)}
          disabled={index === 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="lk-seq-next"
          onClick={() => go(index + 1)}
          disabled={index === total - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
