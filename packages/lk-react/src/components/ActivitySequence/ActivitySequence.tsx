'use client';

import {
  type ActivityResult,
  flattenSequence,
  type InteractionEvent,
  isItemGroup,
  type LearnerResponse,
  type SequenceEntry,
  type SequenceSlot,
  type SequenceSlotGroup,
  type ThemeTokens,
} from '@intellectif/lk-core';
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import { randomSessionId } from '../_internal.js';
import { FillInTheBlanks } from '../FillInTheBlanks/index.js';
import { MultipleChoice } from '../MultipleChoice/index.js';
import { StimulusPanel } from '../StimulusPanel/index.js';
import type { ActivityProps, HtmlSanitizer, RenderableActivity, RenderMode } from '../types.js';
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
      /** Presented position. */
      index: number;
      /** Slot identity from `flattenSequence` — stable under shuffling; the `slotId` to score with. */
      slotId: string;
      activityId: string;
      result: ActivityResult;
    }
  | {
      kind: 'submitted';
      index: number;
      slotId: string;
      activityId: string;
      /** Ungraded submission; the grade arrives asynchronously. */
      submission: WrittenResponseSubmission;
    }
  | {
      kind: 'responded';
      index: number;
      slotId: string;
      activityId: string;
      /**
       * The raw answer, with no grade of any kind. This is what an `exam` slot
       * produces: the client is forbidden to score, so a response is all there
       * is until the server grades it.
       */
      response: LearnerResponse;
    };

/**
 * A component that can render one activity inside a sequence. Register one per
 * activity `type` to put a consumer-defined type on screen — the React half of
 * the activity-type registry, matching `registerActivityType` in lk-core.
 */
export type ActivityRenderer = ComponentType<ActivityProps>;

export interface ActivitySequenceProps {
  /**
   * The ordered set of entries to present, one question at a time: loose
   * activities, and item groups — a shared passage, recording or image with
   * the questions that refer to it. A group's stimulus stays on screen
   * alongside each of its questions.
   *
   * Accepts `redact()` projections. For data straight off a server, pass it
   * through `asRenderableSequence()` — see that helper for why a cast is
   * unavoidable there — and set `renderMode="exam"`.
   */
  activities: readonly SequenceEntry<RenderableActivity>[];
  /**
   * Renderers for activity types beyond the built-ins, keyed by `data.type`.
   * A key matching a built-in overrides it, so a consumer can replace the
   * bundled renderer without forking the sequencer.
   */
  renderers?: Readonly<Record<string, ActivityRenderer>>;
  /**
   * Called whenever an individual activity is scored at submit time — the
   * incremental persist hook.
   *
   * `slotId` is the identity to store the result against, NOT `index`.
   * `index` is where the question was PRESENTED, which is not stable: it moves
   * under shuffling, and it already differs from the slot identity whenever a
   * group is present (the second entry of a sequence is presented at index 1
   * but is slot `"1.0"` if it is a group's first question). `composeAssessmentScore`
   * scores by `slotId`, so persisting `index` cannot be reconciled with it.
   */
  onActivityComplete?: (result: ActivityResult, index: number, slotId: string) => void;
  /**
   * Called on every submit with the learner's raw response and the identity of
   * the slot that produced it — before any grading, in every render mode.
   *
   * **This is the only response channel an `exam` sequence has.** In `exam`
   * mode the components never grade, so `onActivityComplete` cannot fire and
   * `onComplete` never will; without this prop nothing a learner submitted
   * would reach the consumer at all. Persist `response` against `slotId`.
   */
  onSubmit?: (
    response: LearnerResponse,
    slot: { slotId: string; index: number; activityId: string },
  ) => void;
  /**
   * Called once every activity has been completed, with the scored results.
   *
   * Fires only when EVERY item produced a score. A set containing a
   * deferred-graded activity (a written response) can never satisfy that, so
   * use `onFinished` for mixed sets — it is the general completion signal and
   * reports both kinds of outcome. It also carries `slotId` per item, which
   * this callback's bare array cannot.
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
  /**
   * `entries` shuffles the top-level entries; a group moves as one block, and
   * the order INSIDE a group follows the group's own `shuffle` setting.
   * Default `none`: authored order.
   */
  shuffle?: 'none' | 'entries';
  /**
   * Seed for every shuffle in this sequence (`shuffle: 'entries'` and any
   * group with `shuffle: 'within-group'`). Supply the attempt id, so the
   * server's `flattenSequence(entries, { seed })` derives the same order this
   * pager shows.
   *
   * **Required in `exam` and `review` mode** — omitting it throws. An order
   * nobody can reproduce cannot be reconciled with a recorded attempt, and
   * failing at render is the only way that mistake surfaces before a learner
   * sits the paper. In `practice` mode it stays optional: a random per-mount
   * seed is used, which is stable within the mount and deliberately not
   * reproducible. That fallback is also not SSR-safe (server and client would
   * invent different orders and hydration would mismatch), so supply a seed
   * for any server-rendered sequence regardless of mode.
   */
  shuffleSeed?: string;
  /** Renders author-supplied rich text; forwarded to the stimulus panel and every activity. */
  sanitizeHtml?: HtmlSanitizer;
  theme?: Partial<ThemeTokens>;
  locale?: string;
  disabled?: boolean;
}

/** One stimulus panel to keep mounted: the group, and the presented span of its questions. */
interface StimulusMount {
  /** Authored entry position — unique per group in the sequence even if two groups share an id. */
  entryKey: string;
  group: SequenceSlotGroup;
  first: number;
  last: number;
}

/** The authored-entry prefix of a slot id: `"3"` for `"3"` and for `"3.1"`. */
function entryKeyOf(slot: SequenceSlot<RenderableActivity>): string {
  return slot.slotId.split('.')[0] ?? slot.slotId;
}

/**
 * A pane that is kept MOUNTED but shown only when it is the current one, and
 * that stops any media it contains on the way out.
 *
 * `hidden` alone is not enough. It resolves to `display: none`, and CSS does
 * not touch playback: an `<audio>` or `<video>` inside a hidden subtree keeps
 * playing to the end. (The HTML spec pauses a media element when it is
 * REMOVED from the document — a different thing, and the thing this pager
 * deliberately does not do, because unmounting is what used to destroy the
 * learner's answers.) So a recording started for one question would carry on
 * underneath the next, which for a listening paper means the passage plays
 * while the learner is somewhere else entirely.
 *
 * Pausing preserves `currentTime`: coming back to a group resumes where the
 * learner left off. Nothing auto-plays on the way in — starting audio the
 * learner did not ask for is its own defect.
 *
 * `embed` media (a provider iframe) cannot be paused this way: controlling a
 * third-party player needs its own JS API, which the SDK has no reliable
 * access to because the author supplies the embed URL. Use `audio`/`video`
 * media for anything that must stop when the learner navigates.
 */
function SequencePane({
  className,
  hidden,
  children,
}: {
  className: string;
  hidden: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hidden) {
      return;
    }
    const node = ref.current;
    if (node === null) {
      return;
    }
    for (const media of node.querySelectorAll('audio, video')) {
      const element = media as HTMLMediaElement;
      if (!element.paused) {
        element.pause();
      }
    }
  }, [hidden]);

  return (
    <div className={className} hidden={hidden} ref={ref}>
      {children}
    </div>
  );
}

/**
 * Presents a set of activities as an in-place pager: one question visible at a
 * time, navigated with Prev/Next (no page scrolling). Linear free navigation —
 * the learner may move back and forth; activities keep their own submit and
 * scoring. On navigation, focus moves to the question region and the position
 * is announced via an aria-live region.
 *
 * Item groups are flattened into consecutive questions; the group's stimulus
 * is mounted ONCE, beside the question region rather than inside it, and shown
 * alongside every question in the group — so a passage stays put, and a
 * recording keeps its position, as the learner moves between its questions.
 */
export function ActivitySequence({
  activities,
  renderers,
  onActivityComplete,
  onComplete,
  onFinished,
  onSubmit,
  onInteraction,
  renderMode = 'practice',
  shuffle,
  shuffleSeed,
  sanitizeHtml,
  theme,
  locale,
  disabled,
}: ActivitySequenceProps): React.JSX.Element {
  const sessionIdRef = useRef<string | null>(null);

  // The presented order comes from lk-core, never computed here: the server
  // that records an attempt calls the same function with the same seed.
  const shuffleEntries = shuffle === 'entries';
  const needsSeed =
    shuffleEntries ||
    activities.some((entry) => isItemGroup(entry) && entry.shuffle === 'within-group');

  // An unreproducible order is a practice-only affordance. Under `exam` or
  // `review` the server has to be able to rebuild exactly what the learner
  // saw, so a missing seed is an error rather than something to paper over —
  // the same reason `flattenSequence` refuses to invent one.
  if (needsSeed && shuffleSeed === undefined && renderMode !== 'practice') {
    throw new Error(
      `ActivitySequence: renderMode "${renderMode}" requires a \`shuffleSeed\` when shuffling ` +
        '(shuffle="entries", or a group with shuffle: "within-group"). Pass the attempt id, so ' +
        "the server's flattenSequence(entries, { seed }) reproduces the order the learner saw.",
    );
  }

  // Lazily created only when shuffling in practice without a caller seed (same
  // contract as MultipleChoice.shuffleSeed): a per-mount session seed, stable
  // across re-renders, never reproducible.
  const seed = needsSeed
    ? // biome-ignore lint/suspicious/noAssignInExpressions: sanctioned lazy ref initialization
      (shuffleSeed ?? (sessionIdRef.current ??= randomSessionId()))
    : undefined;
  const slots = useMemo(
    () => flattenSequence(activities, { shuffleEntries, ...(seed !== undefined ? { seed } : {}) }),
    [activities, shuffleEntries, seed],
  );

  const [index, setIndex] = useState(0);
  // Outcomes live in a ref, not state: nothing renders from them, and a ref is
  // written SYNCHRONOUSLY. Reading them from a `useState` closure meant two
  // slots completing in the same tick both saw the pre-update array — the
  // second overwrote the first, so one answer vanished and completion never
  // fired. Every slot is mounted at once here, so same-tick completions are
  // reachable (a custom renderer that completes from a mount effect).
  const outcomesRef = useRef<(SequenceItemOutcome | null)[] | null>(null);
  if (outcomesRef.current === null) {
    outcomesRef.current = slots.map(() => null);
  }
  const regionRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Reset pager position and outcomes when the presented SET changes (B8):
  // without this, results from the previous set leak into the new one and can
  // fire completion with a mixed old/new array. Keyed on the set's CONTENT
  // identity (ordered slot and activity ids), not the array reference — a
  // parent that re-creates a structurally identical array on every render
  // (inline literals, .map() in render) must not wipe in-progress answers.
  // JSON.stringify (not join) so ids containing the separator cannot collide.
  const setKey = JSON.stringify(slots.map((slot) => [slot.slotId, slot.activity.id]));
  const [prevSetKey, setPrevSetKey] = useState(setKey);
  if (prevSetKey !== setKey) {
    setPrevSetKey(setKey);
    setIndex(0);
    outcomesRef.current = slots.map(() => null);
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

  // One panel per group, spanning the presented positions of its questions.
  const stimulusMounts = useMemo<StimulusMount[]>(() => {
    const mounts = new Map<string, StimulusMount>();
    for (const slot of slots) {
      if (slot.group === undefined) {
        continue;
      }
      const entryKey = entryKeyOf(slot);
      const existing = mounts.get(entryKey);
      if (existing === undefined) {
        mounts.set(entryKey, { entryKey, group: slot.group, first: slot.index, last: slot.index });
      } else {
        existing.last = slot.index;
      }
    }
    return [...mounts.values()];
  }, [slots]);

  const total = slots.length;
  const current = slots[index];

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
    const current = outcomesRef.current;
    if (current === null || current[outcome.index] != null) {
      return;
    }
    const next = current.slice();
    next[outcome.index] = outcome;
    // Commit before firing anything: a second record() in the same tick must
    // see this one.
    outcomesRef.current = next;

    if (outcome.kind === 'scored') {
      onActivityComplete?.(outcome.result, outcome.index, outcome.slotId);
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
    renderMode,
    ...(sanitizeHtml ? { sanitizeHtml } : {}),
    ...(theme ? { theme } : {}),
    ...(locale ? { locale } : {}),
    ...(disabled ? { disabled } : {}),
  };

  const renderSlot = (slot: SequenceSlot<RenderableActivity>): React.JSX.Element => {
    const activity = slot.activity;
    const { slotId, index: slotIndex } = slot;
    const activityId = activity.id;
    const childProps = {
      onComplete: (result: ActivityResult) =>
        record({ kind: 'scored', index: slotIndex, slotId, activityId, result }),
      onSubmit: (response: LearnerResponse) => {
        onSubmit?.(response, { slotId, index: slotIndex, activityId });
        // Outside `practice` the components do not grade, so a raw response is
        // the ONLY outcome this slot will ever produce — record it, or the set
        // could never complete and `onFinished` would be dead in exam mode.
        // Written responses are excluded because they report something richer
        // through `onSubmitted` a moment later, and the first outcome wins.
        if (renderMode !== 'practice' && activity.type !== 'written-response') {
          record({ kind: 'responded', index: slotIndex, slotId, activityId, response });
        }
      },
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
            record({ kind: 'submitted', index: slotIndex, slotId, activityId, submission })
          }
          // Explicit rather than spread: WrittenResponse has no `onComplete`
          // (it never grades), so `childProps` does not fit it — but it must
          // still report the raw response like every other slot.
          onSubmit={childProps.onSubmit}
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

  const currentEntryKey = entryKeyOf(current);

  return (
    <div className="lk-seq" lang={locale}>
      <div className="lk-seq-progress" aria-live="polite" role="status">
        Question {index + 1} of {total}
      </div>

      {/*
        Each group's stimulus is mounted ONCE and only hidden while the current
        question is outside its group. That — not re-rendering it per slot — is
        what makes the passage the same DOM node throughout, and what lets a
        recording keep its position between questions of one group.

        It sits BESIDE the question region, not inside it. Inside, every
        navigation dropped focus onto a container whose first content was the
        whole passage: the region promised "Question 3 of 5" and then began
        with the passage, keyboard users tabbed through the stimulus (audio
        controls included) before reaching the question, and the passage was a
        landmark nested inside another landmark. As a sibling it stays a
        landmark the learner can jump back to, while focus lands on the
        question that was actually navigated to.
      */}
      {stimulusMounts.map(({ entryKey, group, first, last }) => (
        <SequencePane
          className="lk-seq-stimulus"
          hidden={entryKey !== currentEntryKey}
          key={`group-${entryKey}`}
        >
          <StimulusPanel
            stimulus={group.stimulus}
            range={{ first: first + 1, last: last + 1 }}
            {...(sanitizeHtml ? { sanitizeHtml } : {})}
            {...(locale ? { locale } : {})}
          />
        </SequencePane>
      ))}

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
        {slots.map((slot) => {
          // The slot id (authored position) plus the activity id: the same
          // activity may legitimately fill two slots, and each must keep its
          // own answer state; and a different activity in the same slot must
          // remount rather than inherit the previous one's state.
          //
          // `setKey` leads, so a set change remounts every child. Without it a
          // pure REORDER changed `setKey` — clearing the outcomes — while each
          // child kept its key and therefore its `completed` state. Those
          // slots could not be answered again and no outcome would ever refill
          // them, so the sequence could never finish. A reset has to reset
          // both halves or neither. A parent re-creating a structurally
          // identical array leaves `setKey` untouched, so answers still
          // survive that.
          const slotKey = `${setKey}::slot-${slot.slotId}-${slot.activity.id}`;
          return (
            <SequencePane className="lk-seq-slot" hidden={slot.index !== index} key={slotKey}>
              {renderSlot(slot)}
            </SequencePane>
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
