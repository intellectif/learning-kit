/**
 * The `./lk-core` adapter (design 5.10, R7.7) (M10): an lk-core `ItemOutcome`
 * becomes evidence. The input types are structural copies of the lk-core
 * shapes the adapter reads, so this package never imports lk-core (D2); the
 * contract test assigns real lk-core values to them.
 */

import { evidenceFromGrade, evidenceOf, skillOutcomesOf } from '../../contracts/grade.js';
import type {
  Evidence,
  EvidenceMeta,
  GradeResult,
  PracticeItem,
  SkillOutcome,
} from '../../types.js';

/** lk-core's `CriterionScore`, the fields the adapter reads. */
export interface CriterionScoreLike {
  readonly name: string;
  readonly score?: number;
  readonly maxScore?: number;
  readonly notApplicable?: boolean;
}

/** lk-core's `GradeRecord`, the fields the adapter reads. */
export interface GradeRecordLike {
  readonly score: number;
  readonly maxScore: number;
  readonly passed: boolean;
  readonly criteria?: readonly CriterionScoreLike[];
  readonly confidence?: 'high' | 'medium' | 'low';
  readonly requiresHumanReview?: boolean;
  readonly grader?: { readonly kind: 'ai' | 'auto' | 'human'; readonly id?: string };
  readonly routing?: { readonly to: 'model' | 'person' };
}

/** lk-core's `ItemOutcome`, discriminated by `status`, the fields the adapter reads. */
export type ItemOutcomeLike =
  | { readonly status: 'unscorable'; readonly maxScore: number; readonly reason: string }
  | {
      readonly status: 'scored';
      readonly score: number;
      readonly maxScore: number;
      readonly passed: boolean;
    }
  | {
      readonly status: 'graded';
      readonly score: number;
      readonly maxScore: number;
      readonly passed: boolean;
      readonly grade: GradeRecordLike;
    }
  | {
      readonly status: 'deferred';
      readonly maxScore: number;
      /** lk-core's `DeferredReason`. */
      readonly reason: string;
      readonly pendingGrade?: GradeRecordLike;
    };

/**
 * Evidence from an lk-core outcome (R7.7). `meta` supplies what an outcome
 * does not carry, as for `evidenceFromGrade`.
 *
 * - `scored`: an `auto` source with the outcome's score, maximum and pass.
 * - `graded`: the grade's grader kind (`auto` when absent), with its
 *   confidence (absent on an `ai` grade means `medium`), `requiresHumanReview`
 *   and grader id; the outcome's score, maximum and pass; and `skillOutcomes`
 *   from the grade's criteria (`skillOutcomesFromCriteria`). A model's grade
 *   routed to a person is `pending` (`routed-to-person`); a person's own grade
 *   never is, so it can confirm the held one.
 * - `deferred`: `pending`, `routed-to-person` when it awaits human review,
 *   else `deferred` (async grading, a rejected grade); both are held until a
 *   grade confirms them (`meta.confirms`).
 * - `unscorable`, and `deferred` with `no_response_recorded`: `null`. Nothing
 *   was attempted, so there is nothing to record. **(revised in M10)** R7.7
 *   holds every `deferred`; a slot never answered would be held forever.
 *
 * Throws a `TypeError` for an unknown status, a grade `evidenceFromGrade`
 * refuses, or a `meta.itemId` that is not `task.id`.
 */
export function evidenceFromOutcome(
  outcome: ItemOutcomeLike,
  task: PracticeItem,
  meta: EvidenceMeta,
): Evidence | null {
  if (meta?.itemId !== task?.id) {
    throw new TypeError('lk-practice: meta.itemId must equal task.id.');
  }
  switch (outcome?.status) {
    case 'unscorable':
      return null;
    case 'scored': {
      const { score, maxScore, passed } = outcome;
      return evidenceFromGrade({ score, maxScore, passed, grader: { kind: 'auto' } }, task, meta);
    }
    case 'graded': {
      const { grade } = outcome;
      if (grade.routing?.to === 'person' && grade.grader?.kind !== 'human') {
        return evidenceOf(meta, { kind: 'pending', reason: 'routed-to-person' }, []);
      }
      return evidenceFromGrade(gradeResultOf(outcome), task, meta);
    }
    case 'deferred': {
      if (outcome.reason === 'no_response_recorded') return null;
      const routed =
        outcome.reason === 'awaiting_human_review' ||
        outcome.pendingGrade?.routing?.to === 'person';
      return evidenceOf(
        meta,
        { kind: 'pending', reason: routed ? 'routed-to-person' : 'deferred' },
        [],
      );
    }
    default:
      throw new TypeError(
        'lk-practice: an outcome has the status unscorable, scored, graded or deferred.',
      );
  }
}

/**
 * The per-skill outcomes of lk-core criteria through the task's `criteria`
 * (R7.7): an entry that is `notApplicable` or lacks a numeric `score` and
 * `maxScore` is skipped; entries with one name, then entries bound to one
 * skill, are summed; skills come in the order the task first names them.
 */
export function skillOutcomesFromCriteria(
  criteria: readonly CriterionScoreLike[],
  task: PracticeItem,
): readonly SkillOutcome[] {
  return Object.freeze(skillOutcomesOf(applicable(criteria), task));
}

/** The criteria with numbers, applicable, one entry per name. */
function applicable(
  criteria: readonly CriterionScoreLike[],
): { name: string; score: number; maxScore: number }[] {
  const byName = new Map<string, { name: string; score: number; maxScore: number }>();
  for (const criterion of criteria) {
    const { name, score, maxScore } = criterion;
    if (criterion.notApplicable === true || typeof score !== 'number') continue;
    if (typeof maxScore !== 'number') continue;
    const total = byName.get(name);
    byName.set(name, {
      name,
      score: (total?.score ?? 0) + score,
      maxScore: (total?.maxScore ?? 0) + maxScore,
    });
  }
  return [...byName.values()];
}

/** The `GradeResult` an lk-core graded outcome reads as. */
function gradeResultOf(outcome: Extract<ItemOutcomeLike, { status: 'graded' }>): GradeResult {
  const { grade } = outcome;
  const criteria = applicable(grade.criteria ?? []);
  return {
    score: outcome.score,
    maxScore: outcome.maxScore,
    passed: outcome.passed,
    ...(grade.confidence === undefined ? {} : { confidence: grade.confidence }),
    ...(grade.requiresHumanReview === undefined
      ? {}
      : { requiresHumanReview: grade.requiresHumanReview }),
    ...(criteria.length === 0 ? {} : { criteria }),
    grader: {
      kind: grade.grader?.kind ?? 'auto',
      ...(grade.grader?.id === undefined ? {} : { id: grade.grader.id }),
    },
  };
}
