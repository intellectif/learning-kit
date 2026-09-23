'use client';

import {
  type ItemScoringPolicy,
  type ItemTriesScore,
  type ItemTry,
  type ResolvedItemScoringPolicy,
  resolveItemScoringPolicy,
  scoreTries,
} from '@intellectif/lk-core';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { LkStrings } from '../../i18n/strings.js';
import { SequenceSlotContext, type TriesState } from './sequence-slot.js';

/**
 * The scoring policy a question is under: the paper's, when the paper around
 * it was given one, else its own.
 *
 * Not combined, as delivery policies are: a cost and a count of tries have no
 * "stricter" to pick. The paper decides, as it decides the mode — so a
 * question drawn inside a set is scored by the set's rules whatever it was
 * handed.
 *
 * A policy `validateItemScoringPolicy` refuses throws here, at render. Every
 * setting in it moves a grade, and there is no safe way to read one wrongly:
 * the question fails loudly rather than grade by a guess.
 */
export function useItemScoringPolicy(
  given: ItemScoringPolicy | null | undefined,
): ResolvedItemScoringPolicy {
  const around = useContext(SequenceSlotContext)?.scoring;
  const key = policyKey(given);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the policy's content is the trigger, not its identity
  const own = useMemo(
    () => (around === undefined ? resolveItemScoringPolicy(given) : null),
    [around, key],
  );
  return around ?? (own as ResolvedItemScoringPolicy);
}

function policyKey(given: unknown): string {
  try {
    return JSON.stringify(given) ?? '';
  } catch {
    return String(given);
  }
}

/** A hint count as a response carries it: anything but a whole number above 0 is none. */
export function hintsOf(response: unknown): number {
  const count = (response as { hintsRevealed?: unknown } | null | undefined)?.hintsRevealed;
  return typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : 0;
}

/** Whether a try earned every mark there was: float noise above the maximum included. */
const fullMarks = (one: ItemTry): boolean => one.score / one.maxScore >= 1 - 1e-9;

/** Whether, after the tries `made`, a question offers another: the rule `open` reads. */
function offersAfter(
  now: {
    policy: ResolvedItemScoringPolicy;
    graded: boolean;
    disabled: boolean;
    channel: { triesClosed: boolean } | null;
  },
  made: readonly ItemTry[],
  shut: boolean,
): boolean {
  const last = made[made.length - 1];
  return (
    now.graded &&
    !now.disabled &&
    !shut &&
    now.channel?.triesClosed !== true &&
    last !== undefined &&
    made.length < 1 + now.policy.retries &&
    !fullMarks(last)
  );
}

export interface TriesInput {
  policy: ResolvedItemScoringPolicy;
  /**
   * Whether the component grades this answer itself and the learner may see
   * how it went: `practice`, with `feedback` on. "Try again" anywhere else
   * would be meaningless, or would say an answer was wrong on a paper that
   * does not say so.
   */
  graded: boolean;
  submitted: boolean;
  disabled: boolean;
}

export interface Tries {
  /** Every graded try so far, in order. */
  tries: readonly ItemTry[];
  /** The question's score under the policy, once a try has been graded. */
  counted: ItemTriesScore | null;
  /**
   * Whether the learner is being offered another try at a graded answer: the
   * last try earned less than full marks, the policy has tries left, and
   * nothing has closed the question. While it is, the question shows no right
   * answer and no explanation — either would hand over the answer the next try
   * is for.
   */
  open: boolean;
  /** Tries still to come after the last graded one. */
  left: number;
  /** Records a graded try and returns the question's score under the policy. */
  record: (graded: ItemTry) => ItemTriesScore;
  /** Ends the question's tries: "Show answer". */
  close: () => void;
  /** Forgets every try: a different question. */
  reset: () => void;
}

/**
 * The tries a question has had and whether it offers another: the SDK's own
 * components' rules for "Try again", in one place.
 *
 * Reports whether a try is on offer to the paper around the question, which
 * waits for it before reporting the set while the question is on screen — and
 * closes every question's tries once it has reported.
 */
export function useTries({ policy, graded, submitted, disabled }: TriesInput): Tries {
  const channel = useContext(SequenceSlotContext);
  const [tries, setTries] = useState<readonly ItemTry[]>([]);
  const [closed, setClosed] = useState(false);
  // Written synchronously, so a submit that records a try and reports it reads
  // every try before it, whatever React has rendered.
  const triesRef = useRef<readonly ItemTry[]>([]);
  const closedRef = useRef(false);
  const latest = useRef({ policy, graded, disabled, channel });
  latest.current = { policy, graded, disabled, channel };

  const record = useCallback((one: ItemTry): ItemTriesScore => {
    const next = [...triesRef.current, one];
    triesRef.current = next;
    setTries(next);
    // An offer of another try is reported before the grade is handed on, not
    // after the next render: the paper reports its set when a grade fills its
    // last slot, and must already know to wait. The end of the tries is not:
    // said now, it would let the paper report the grade this try is replacing.
    // The effect below says it once this grade has landed.
    if (offersAfter(latest.current, next, closedRef.current)) {
      latest.current.channel?.triesState('offered');
    }
    return scoreTries(next, latest.current.policy);
  }, []);
  const close = useCallback(() => {
    closedRef.current = true;
    setClosed(true);
  }, []);
  const reset = useCallback(() => {
    triesRef.current = [];
    closedRef.current = false;
    setTries([]);
    setClosed(false);
  }, []);

  const allowed = 1 + policy.retries;
  const left = Math.max(0, allowed - tries.length);
  const open = submitted && offersAfter(latest.current, tries, closed);
  // A try the learner is making now — after "Try again", before the answer is
  // in again. Reporting the set then would hand on the grade the learner is in
  // the middle of replacing.
  const retrying =
    !submitted &&
    tries.length > 0 &&
    !closed &&
    graded &&
    !disabled &&
    channel?.triesClosed !== true;
  const state: TriesState = open ? 'offered' : retrying ? 'retrying' : 'none';

  const report = channel?.triesState;
  useEffect(() => {
    report?.(state);
  }, [report, state]);
  // A question that goes away offers nothing: the paper must not wait for it.
  useEffect(() => () => report?.('none'), [report]);

  const counted = useMemo(
    () => (tries.length === 0 ? null : scoreTries(tries, policy)),
    [tries, policy],
  );
  return { tries, counted, open, left, record, close, reset };
}

/** A fraction of the marks as the whole percentage a learner reads. */
export const percentOf = (fraction: number): number => Math.round(fraction * 100);

/**
 * The sentences after the score, on a question whose policy changed it: which
 * try counts when it is not the one just made, what this answer scored before
 * its costs, and how many tries are left.
 */
export function triesSummary(
  s: LkStrings,
  policy: ResolvedItemScoringPolicy,
  counted: ItemTriesScore,
  offered: boolean,
): string {
  const parts: string[] = [];
  const latest = counted.tries.length - 1;
  const mine = counted.tries[latest];
  if (mine !== undefined) {
    if (counted.counted !== latest) {
      parts.push(
        s.countedTry(
          policy.counts === 'best' ? 'best' : 'first',
          percentOf(mine.scored / mine.maxScore),
        ),
      );
    } else if (mine.scored !== mine.score) {
      parts.push(s.scoreBeforeCosts(percentOf(mine.score / mine.maxScore)));
    }
  }
  if (offered) {
    parts.push(
      s.triesLeft(policy.retries + 1 - counted.tries.length, percentOf(policy.retryPenalty)),
    );
  }
  return parts.join(' ');
}

/**
 * "Try again" and "Show answer" — or "Keep this answer", on a paper that shows
 * no right answers — after a graded try that did not earn full marks.
 */
export function TryActions({
  tries,
  solutions,
  strings: s,
  onRetry,
  onClose,
}: {
  tries: Tries;
  /** Whether closing the question will show the right answer. */
  solutions: boolean;
  strings: LkStrings;
  onRetry: () => void;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!tries.open) {
    return null;
  }
  return (
    <div className="lk-tries">
      <button type="button" className="lk-tries-again" onClick={onRetry}>
        {s.tryAgain}
      </button>
      <button type="button" className="lk-tries-close" onClick={onClose}>
        {solutions ? s.showAnswer : s.keepAnswer}
      </button>
    </div>
  );
}

/** What a hint costs, said before the learner asks for one. */
export function HintCost({
  policy,
  strings: s,
}: {
  policy: ResolvedItemScoringPolicy;
  strings: LkStrings;
}): React.JSX.Element | null {
  if (policy.hintPenalty <= 0) {
    return null;
  }
  return <p className="lk-hint-cost">{s.hintCost(percentOf(policy.hintPenalty))}</p>;
}
