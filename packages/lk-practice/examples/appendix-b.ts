/**
 * Appendix B of the requirements (criterion 18; M10): a language-learning host
 * places a learner from a placement test, then records lk-core outcomes as
 * evidence. It imports the package by name, so `pnpm typecheck` checks it
 * against the built `dist/`, as a host sees it (`turbo.json` builds first).
 */
import { type ActivityData, evaluate, type LearnerResponse } from '@intellectif/lk-core';
import {
  createPractice,
  type PracticeItem,
  type PracticeState,
  type RecordResult,
  type SkillGraph,
} from '@intellectif/lk-practice';
import { evidenceFromOutcome } from '@intellectif/lk-practice/lk-core';

const practice = createPractice();

/** One `prior` per objective, from the placement test's theta (the pseudo-count is the host's choice). */
export function place(
  state: PracticeState,
  graph: SkillGraph,
  placement: { readonly id: string; readonly at: number; readonly thetas: Record<string, number> },
): PracticeState {
  let placed = state;
  for (const [objectiveId, theta] of Object.entries(placement.thetas)) {
    const result = practice.act(placed, graph, {
      id: `prior:${placement.id}:${objectiveId}`,
      at: placement.at,
      action: { kind: 'prior', skillId: objectiveId, theta, pseudoCount: 10 },
    });
    if (result.kind === 'applied') placed = result.state;
  }
  return placed;
}

/** Practice: an lk-core outcome becomes evidence; `null` means nothing to record. */
export function practise(
  state: PracticeState,
  graph: SkillGraph,
  activity: ActivityData,
  response: LearnerResponse,
  item: PracticeItem,
  attempt: {
    readonly id: string;
    readonly submittedAt: number;
    readonly attempts: number;
    readonly hintsUsed: number;
  },
): RecordResult | null {
  const outcome = evaluate(activity, response);
  const evidence = evidenceFromOutcome(outcome, item, {
    id: attempt.id,
    itemId: item.id,
    at: attempt.submittedAt,
    attempts: attempt.attempts,
    hintsUsed: attempt.hintsUsed,
  });
  return evidence === null ? null : practice.record(state, { graph, item, evidence });
}
