'use client';

import type { ResolvedDeliveryPolicy, ResolvedItemScoringPolicy } from '@intellectif/lk-core';
import { createContext } from 'react';
import type { RenderMode } from '../types.js';

/**
 * How far a take that was handed in has got, as a pager deciding whether its
 * set is finished needs to know it.
 *
 * - `in-flight` — being stored or being judged. The set waits for it.
 * - `retryable` — it failed, and the learner is being offered another try at
 *   the SAME take. The set waits for it while the learner is on that question.
 * - `settled` — nothing more will come of it: a grade, a take with no grade, a
 *   failure nobody can retry, or a take the learner walked away from.
 */
export type TakeState = 'in-flight' | 'retryable' | 'settled';

/**
 * Where a question is with its tries, as a pager deciding whether its set is
 * finished needs to know it.
 *
 * - `offered` — a graded answer short of full marks, with another try on offer.
 *   The set waits for it while the learner is on that question: leaving it is
 *   declining the try.
 * - `retrying` — the learner pressed "Try again" and has not answered again.
 *   The set waits for it wherever the learner is, as it waits for any question
 *   not yet answered: the grade it holds is the one being replaced.
 * - `none` — neither.
 */
export type TriesState = 'none' | 'offered' | 'retrying';

/**
 * What a pager hands the one slot it renders, and only through
 * {@link SequenceSlotContext} — never as a prop, so none of it can appear on a
 * public component's signature. A consumer string in any of it could stop
 * another component's microphone or finish another paper's set.
 */
export interface SequenceSlotChannel {
  /**
   * The capture-registry group whose captures stop when the slot's pane is
   * hidden. Minted per pager and per slot, so no two pagers share one.
   */
  readonly captureGroup: string;
  /**
   * The mode the PAPER around this question is being delivered in, read live.
   *
   * It is how the AI hooks know an exam they were not told about. A host that
   * draws its own question passes `renderMode` on to them, but nothing makes
   * it: the hooks would then default to `practice` and, under an
   * `LkAiProvider` somewhere above, offer hints on a paper of record. The set
   * around the question decides, and an `exam` here wins over anything the
   * caller passes or forgets to pass.
   */
  readonly renderMode: RenderMode;
  /**
   * The delivery policy of the PAPER around this question, read live, for the
   * same reason as the mode: whatever a host's own question was handed, the
   * paper's restrictions hold in it. See `useDeliveryPolicy`.
   */
  readonly delivery: ResolvedDeliveryPolicy;
  /**
   * The scoring policy of the PAPER around this question, read live, when the
   * paper was given one: it holds for every question in it, however drawn.
   * `undefined` when the paper has none, so a question's own applies.
   */
  readonly scoring: ResolvedItemScoringPolicy | undefined;
  /**
   * Whether the paper has closed every question's tries: it reported its set,
   * or its learner finished. A "Try again" after that would change a grade the
   * paper has already handed on.
   */
  readonly triesClosed: boolean;
  /** Tells the paper where this question is with its tries: see {@link TriesState}. */
  triesState(state: TriesState): void;
  /**
   * Reports the state of the take numbered `take`, a number from
   * {@link mintTake}. A take numbered below the slot's latest is a take the
   * learner has since replaced, and the pager ignores it.
   */
  takeState(take: number, state: TakeState): void;
}

/** `null` outside a pager: a standalone component belongs to no slot. */
export const SequenceSlotContext = createContext<SequenceSlotChannel | null>(null);

/**
 * The last take number handed out. Module-level and never reset, so a number
 * is unique for the life of the page: across mounts, across papers, and across
 * two pagers side by side. A result can therefore only ever match the take that
 * produced it, whatever slot and activity ids a later paper reuses — ids a host
 * chooses, and can repeat, never decide it.
 */
let lastTake = 0;

/** A take number no other take on this page has had, or will have. */
export function mintTake(): number {
  lastTake += 1;
  return lastTake;
}

/**
 * The take each reported value belongs to. A `WeakMap` rather than a field, so
 * a response or a result a host receives carries no extra key it would persist
 * or compare, and the number never outlives the object.
 */
const takes = new WeakMap<object, number>();

/** Marks `value` as produced by take `take`, and returns it. */
export function stampTake<T extends object>(value: T, take: number): T {
  takes.set(value, take);
  return value;
}

/** The take `value` was produced by, or `undefined` when nothing stamped it. */
export function takeOf(value: unknown): number | undefined {
  return typeof value === 'object' && value !== null ? takes.get(value) : undefined;
}
