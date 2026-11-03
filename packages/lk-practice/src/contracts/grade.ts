/**
 * The grader contract (design 8.8, R8) (M7). The package defines what a
 * grader receives (`GradeRequest`) and checks what it returns; it never calls
 * a grader. Both functions are pure.
 */

import { frozenCopy } from '../schema/copy.js';
import { gradeResultShape, shapeIssues } from '../schema/shape.js';
import type {
  CheckResult,
  Evidence,
  EvidenceMeta,
  EvidenceSource,
  GradeResult,
  Issue,
  PracticeItem,
  SkillOutcome,
} from '../types.js';

/**
 * Checks a grader's result (R8.2). Total: any value gives issues and never
 * throws. `SHAPE_INVALID` for the fields (including `checks.passed` above
 * `checks.total`); `GRADE_SCORE_OUT_OF_RANGE` for a score outside
 * [0, maxScore], the result's or a criterion's; `GRADE_CRITERION_DUPLICATE`
 * for a criterion name used twice. The value is a frozen canonical copy.
 */
export function checkGradeResult(value: unknown): CheckResult<GradeResult> {
  const issues = shapeIssues(gradeResultShape, value);
  if (issues.length > 0) return { ok: false, issues };
  const result = value as GradeResult;
  const found: Issue[] = [];
  if (!inRange(result.score, result.maxScore)) {
    found.push(outOfRange(['score'], result.score, result.maxScore));
  }
  const names = new Set<string>();
  result.criteria?.forEach((criterion, index) => {
    if (!inRange(criterion.score, criterion.maxScore)) {
      found.push(outOfRange(['criteria', index, 'score'], criterion.score, criterion.maxScore));
    }
    if (names.has(criterion.name)) {
      found.push({
        code: 'GRADE_CRITERION_DUPLICATE',
        path: ['criteria', index, 'name'],
        message: `Criterion "${criterion.name}" is reported twice.`,
      });
    }
    names.add(criterion.name);
  });
  if (found.length > 0) return { ok: false, issues: found };
  return frozenCopy<GradeResult>(value);
}

function inRange(score: number, maxScore: number): boolean {
  return score >= 0 && score <= maxScore;
}

function outOfRange(path: Issue['path'], score: number, maxScore: number): Issue {
  return {
    code: 'GRADE_SCORE_OUT_OF_RANGE',
    path,
    message: `score ${score} is outside [0, ${maxScore}].`,
  };
}

/**
 * Evidence from a grade (R8.3). The source kind is the grader's kind, with
 * `grader.id` as `graderId` for `ai` and `human`, and `checks` for `auto`.
 * An `ai` grade without a confidence counts as `medium`, as the `./lk-core`
 * adapter reads an `lk-core` grade without one (R7.7), so a grade schedules
 * the same whichever way it arrives. `criteria` map to `skillOutcomes`
 * through the task's `criteria`:
 * a reported criterion the task binds to a skill adds its score and maximum
 * to that skill's outcome, in the order the task first names each skill; a
 * reported criterion the task does not bind is ignored, and with no bound
 * criterion there are no outcomes. `meta` supplies the rest. Throws a
 * `TypeError` when the result fails `checkGradeResult` or `meta.itemId` is
 * not `task.id`.
 */
export function evidenceFromGrade(
  result: GradeResult,
  task: PracticeItem,
  meta: EvidenceMeta,
): Evidence {
  const checked = checkGradeResult(result);
  if (!checked.ok) {
    throw new TypeError(
      `lk-practice: evidenceFromGrade needs a valid grade result (${checked.issues[0]?.code}).`,
    );
  }
  if (meta?.itemId !== task?.id) {
    throw new TypeError('lk-practice: meta.itemId must equal task.id.');
  }
  const grade = checked.value;
  const outcomes = skillOutcomes(grade, task);
  const evidence: Record<string, unknown> = {
    id: meta.id,
    itemId: meta.itemId,
    at: meta.at,
    source: Object.freeze(sourceOf(grade)),
  };
  for (const key of META_KEYS) {
    if (meta[key] !== undefined) evidence[key] = meta[key];
  }
  if (outcomes.length > 0) evidence.skillOutcomes = Object.freeze(outcomes);
  return Object.freeze(evidence) as unknown as Evidence;
}

/** The optional evidence fields `meta` may carry. */
const META_KEYS = [
  'context',
  'targetId',
  'durationMs',
  'hintsUsed',
  'attempts',
  'learnerConfidence',
  'confirms',
  'supplements',
] as const;

function sourceOf(grade: GradeResult): EvidenceSource {
  const scored = { score: grade.score, maxScore: grade.maxScore, passed: grade.passed };
  const graderId = grade.grader.id === undefined ? {} : { graderId: grade.grader.id };
  switch (grade.grader.kind) {
    case 'auto':
      return {
        kind: 'auto',
        ...scored,
        ...(grade.checks === undefined ? {} : { checks: grade.checks }),
      };
    case 'ai':
      return {
        kind: 'ai',
        ...scored,
        confidence: grade.confidence ?? 'medium',
        ...(grade.requiresHumanReview === undefined
          ? {}
          : { requiresHumanReview: grade.requiresHumanReview }),
        ...graderId,
      };
    default:
      return { kind: 'human', ...scored, ...graderId };
  }
}

function skillOutcomes(grade: GradeResult, task: PracticeItem): SkillOutcome[] {
  const reported = new Map<string, { score: number; maxScore: number }>();
  for (const criterion of grade.criteria ?? []) reported.set(criterion.name, criterion);
  const totals = new Map<string, { score: number; maxScore: number }>();
  for (const binding of task.criteria ?? []) {
    const found = reported.get(binding.name);
    if (found === undefined) continue;
    const total = totals.get(binding.skillId) ?? { score: 0, maxScore: 0 };
    totals.set(binding.skillId, {
      score: total.score + found.score,
      maxScore: total.maxScore + found.maxScore,
    });
  }
  return [...totals].map(([skillId, total]) => Object.freeze({ skillId, ...total }));
}
