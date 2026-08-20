'use client';

import type {
  ActivityData,
  ActivityResult,
  InteractionEvent,
  ThemeTokens,
} from '@intellectif/lk-core';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';
import type { ActivityProps, RenderMode } from '../types.js';
import { WrittenResponse, type WrittenResponseSubmission } from '../WrittenResponse/index.js';

/**
 * What one finished slot in a sequence produced. Two kinds, because two kinds
 * of activity exist: those the SDK scores at submit time, and those a grader
 * scores later. Collapsing them would mean inventing a score for ungraded
 * work — the exact defect the deferred outcome exists to prevent.
 */
export type SequenceItemOutcome =
  | {
      kind: 'scored';
      index: number;
      activityId: string;
      result: ActivityResult;
    }
  | {
      kind: 'submitted';
      index: number;
      activityId: string;
      /** Ungraded submission; the grade arrives asynchronously. */
      submission: WrittenResponseSubmission;
    };

/**
 * A component that can render one activity inside a sequence. Register one per
 * activity `type` to put a consumer-defined type on screen — the React half of
 * the activity-type registry, matching `registerActivityType` in lk-core.
 */
export type ActivityRenderer = ComponentType<ActivityProps>;

export interface ActivitySequenceProps {
  /** The ordered set of activities to present, one at a time. */
  activities: ActivityData[];
  /**
   * Renderers for activity types beyond the built-ins, keyed by `data.type`.
   * A key matching a built-in overrides it, so a consumer can replace the
   * bundled renderer without forking the sequencer.
   */
  renderers?: Readonly<Record<string, ActivityRenderer>>;
  /** Called whenever an individual activity is scored at submit time. */
  onActivityComplete?: (result: ActivityResult, index: number) => void;
  /**
   * Called once every activity has been completed, with the scored results.
   *
   * Fires only when EVERY item produced a score. A set containing a
   * deferred-graded activity (a written response) can never satisfy that, so
   * use `onFinished` for mixed sets — it is the general completion signal and
   * reports both kinds of outcome.
   */
  onComplete?: (results: ActivityResult[]) => void;
  /**
   * Called once every activity has been completed, whether it was scored at
   * submit time or submitted for later grading. Use this for any set that
   * mixes graded and deferred-graded activities.
   */
  onFinished?: (items: SequenceItemOutcome[]) => void;
  /** Forwarded to each activity. */
  onInteraction?: (event: InteractionEvent) => void;
  /** Forwarded to each activity. `exam` and `review` disable local scoring. */
  renderMode?: RenderMode;
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
  renderers,
  onActivityComplete,
  onComplete,
  onFinished,
  onInteraction,
  renderMode,
  theme,
  locale,
  disabled,
}: ActivitySequenceProps): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<(SequenceItemOutcome | null)[]>(() =>
    activities.map(() => null),
  );
  const regionRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Reset pager position and outcomes when the activity SET changes (B8):
  // without this, results from the previous set leak into the new one and can
  // fire completion with a mixed old/new array. Keyed on the set's CONTENT
  // identity (ordered activity ids), not the array reference — a parent that
  // re-creates a structurally identical array on every render (inline
  // literals, .map() in render) must not wipe in-progress answers.
  // JSON.stringify (not join) so ids containing the separator cannot collide.
  const setKey = JSON.stringify(activities.map((activity) => activity.id));
  const [prevSetKey, setPrevSetKey] = useState(setKey);
  if (prevSetKey !== setKey) {
    setPrevSetKey(setKey);
    setIndex(0);
    setOutcomes(activities.map(() => null));
  }

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

  /**
   * Records a finished slot and fires completion callbacks when the set is
   * done. A slot that already holds an outcome is FINAL: re-recording it would
   * fire completion a second time for one attempt, so a consumer persisting on
   * `onFinished` would write the same attempt twice.
   */
  const record = (outcome: SequenceItemOutcome): void => {
    if (outcomes[outcome.index] != null) {
      return;
    }
    const next = outcomes.slice();
    next[outcome.index] = outcome;
    setOutcomes(next);

    if (outcome.kind === 'scored') {
      onActivityComplete?.(outcome.result, outcome.index);
    }

    if (!next.every((item): item is SequenceItemOutcome => item !== null)) {
      return;
    }
    onFinished?.(next);

    // `onComplete` predates deferred grading and promises ActivityResult[].
    // Fire it only when every slot really was scored, rather than inventing a
    // result for work nobody has graded.
    const scored: ActivityResult[] = [];
    for (const item of next) {
      if (item.kind !== 'scored') {
        return;
      }
      scored.push(item.result);
    }
    onComplete?.(scored);
  };

  if (!current) {
    return <div className="lk-seq" />;
  }

  const forwarded = {
    ...(onInteraction ? { onInteraction } : {}),
    ...(renderMode ? { renderMode } : {}),
    ...(theme ? { theme } : {}),
    ...(locale ? { locale } : {}),
    ...(disabled ? { disabled } : {}),
  };

  const renderSlot = (activity: ActivityData, slotIndex: number): React.JSX.Element => {
    const activityId = activity.id;
    const childProps = {
      onComplete: (result: ActivityResult) =>
        record({ kind: 'scored', index: slotIndex, activityId, result }),
      ...forwarded,
    };

    const CustomRenderer = renderers?.[activity.type];
    if (CustomRenderer) {
      return <CustomRenderer data={activity} {...childProps} />;
    }
    if (activity.type === 'multiple-choice') {
      return <MultipleChoice data={activity} {...childProps} />;
    }
    if (activity.type === 'fill-in-the-blanks') {
      return <FillInTheBlanks data={activity} {...childProps} />;
    }
    if (activity.type === 'written-response') {
      return (
        <WrittenResponse
          data={activity}
          onSubmitted={(submission) =>
            record({ kind: 'submitted', index: slotIndex, activityId, submission })
          }
          {...forwarded}
        />
      );
    }
    return (
      <div className="lk-seq-unsupported" role="note">
        This activity type has no renderer. Supply one through the renderers prop.
      </div>
    );
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
        {/*
          Every slot stays MOUNTED; only the current one is visible. Rendering
          just the current activity unmounted the others, so navigating back to
          an answered question showed it blank and re-answerable — the learner
          silently lost their answer and a second submit fired completion
          again. `hidden` removes the inactive slots from the accessibility
          tree and from tab order, so only the current question is reachable.
        */}
        {activities.map((activity, slotIndex) => {
          // Slot POSITION is part of the key on purpose: the same activity may
          // legitimately appear in two slots, and each must keep its own
          // answer state. Computed here rather than inline so the intent is
          // explicit rather than an accidental index-as-key.
          const slotKey = `slot-${slotIndex}-${activity.id}`;
          return (
            <div className="lk-seq-slot" hidden={slotIndex !== index} key={slotKey}>
              {renderSlot(activity, slotIndex)}
            </div>
          );
        })}
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
