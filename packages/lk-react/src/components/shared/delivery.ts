'use client';

import {
  combineDeliveryPolicies,
  type DeliveryPolicy,
  type ItemOutcome,
  type ResolvedDeliveryPolicy,
  validateDeliveryPolicy,
} from '@intellectif/lk-core';
import { useContext, useEffect } from 'react';
import { isDevelopment } from '../_internal.js';
import { SequenceSlotContext } from './sequence-slot.js';

/**
 * The delivery policy a question is under: the one it was handed, and the one
 * of the paper around it, whichever is stricter setting by setting.
 *
 * The paper's comes from the slot channel, never from a prop, for the reason
 * the mode does: a host that draws its own question is expected to pass
 * `delivery` on and nothing makes it. A paper that switched hints off keeps
 * them off in every question it holds, however that question was drawn.
 *
 * A policy that would not pass `validateDeliveryPolicy` is still applied — a
 * setting nobody can read restricts — and a development build says so once.
 */
export function useDeliveryPolicy(
  given: DeliveryPolicy | null | undefined,
): ResolvedDeliveryPolicy {
  const around = useContext(SequenceSlotContext)?.delivery;
  const key = policyKey(given);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the policy's content is the trigger, not its identity
  useEffect(() => {
    if (!isDevelopment() || given === undefined || given === null) {
      return;
    }
    const checked = validateDeliveryPolicy(given);
    if (!checked.success) {
      console.warn(
        `learning-kit: this delivery policy is not valid, and its unreadable settings are applied as restrictions: ${checked.issues
          .map((issue) => `${issue.path || 'policy'} — ${issue.message}`)
          .join('; ')}`,
      );
    }
  }, [key]);
  return combineDeliveryPolicies(given, around);
}

/** A policy's content as a string, so a new object with the same settings is the same policy. */
function policyKey(given: unknown): string {
  try {
    return JSON.stringify(given) ?? '';
  } catch {
    return String(given);
  }
}

/**
 * Whether reading an outcome back says how the answer was marked — a score, a
 * pass or a fail — which a policy without `feedback` does not show. "Not graded
 * yet" and "No grade available" say nothing about the answer, and stay.
 */
export function outcomeShowsMarks(outcome: ItemOutcome | undefined): boolean {
  return outcome?.status === 'scored' || outcome?.status === 'graded';
}

/**
 * What an activity's feedback region says, by the rule every activity that
 * scores on submit follows — kept in one place because the copies drifted: a
 * multiple choice once said "Answer submitted." before anything was answered.
 *
 * - In review, a grade read back is feedback, said only when the policy shows
 *   feedback; "not graded yet" says nothing about the answer and is always said.
 * - Live, nothing before a submit. After one, the result — or, without
 *   feedback, only that the answer was received. The score still reaches
 *   `onComplete`.
 *
 * `result` is what a submit announces (`null` before one), `readBack` what a
 * review announces, `received` what a submit says without feedback.
 */
export function feedbackAnnouncement<T>(input: {
  review: boolean;
  feedback: boolean;
  outcome: ItemOutcome | undefined;
  readBack: T | null;
  submitted: boolean;
  result: T | null;
  received: T;
}): T | null {
  if (input.review) {
    return input.feedback || !outcomeShowsMarks(input.outcome) ? input.readBack : null;
  }
  if (!input.submitted) {
    return null;
  }
  return input.feedback ? input.result : input.received;
}
