'use client';

import type {
  CriterionScore,
  GradeRecord,
  ReadAloudDimension,
  ScoringDetail,
  ScoringOutcome,
  SpeechAssessment,
} from '@intellectif/lk-core';

/**
 * The one reader of a grade that arrives from a host.
 *
 * Nothing validates a `GradeRecord`, an `ItemOutcome` or an assess result on
 * the way in: each is the application's, it crosses a network, and a field a
 * backend serialised as `null`, as a string or as an object is the ordinary way
 * to meet one. Every render path used to dereference them in its own way, so
 * every guard added for one shape left its sibling open — `criteria: null`
 * guarded and `criteria: [null]` not, a numeric `score` guarded and a string
 * `maxScore` shown as 8200%, `feedback` as an object taking a whole activity
 * down, `passed: null` dropping a grade from every callback in development and
 * sending an invalid statement in production.
 *
 * So the question "what did the host send?" has one answer, given here. The
 * panel, the outcome summary, the announcement, the decision about who shows
 * the score, `onComplete` and the xAPI statement read ONLY what these functions
 * return, and a payload they refuse is shown as could-not-be-graded — never the
 * error boundary, never `NaN`, never a percentage invented from a string.
 *
 * The rules, once:
 *
 * - **A required field is well-formed or the grade is refused.** `score` and
 *   `maxScore` are finite numbers, `maxScore` above 0 and `score` between 0 and
 *   it; `passed` is a boolean. A numeric string is not a number: `"100"` is how
 *   a grade out of 100 turned into 8200%, and coercing it would only move the
 *   guess somewhere else.
 * - **An optional field is absent when it is `undefined` or `null`** — how a
 *   backend writes an absent optional — and otherwise well-formed or dropped.
 *   `feedback` that is not a string is no feedback.
 * - **`criteria` keeps each well-formed entry and drops the rest.** Criteria are
 *   named rows, each independent: an entry that cannot be read names no row.
 * - **`details` is read whole or not at all.** It is the word marks in order,
 *   and a list with one word quietly missing would tell a learner they never
 *   read a word they did.
 * - **Nothing here throws.** A payload whose getter throws is a payload that
 *   cannot be read.
 */

/** Marks a grade as read by {@link readGrade}. Type-only: it never exists at run time. */
declare const READ: unique symbol;

/**
 * A grade {@link readGrade} has checked: `0 <= score <= maxScore`, `maxScore >
 * 0`, both finite, `passed` a boolean, `feedback` a string or `null`, and
 * `criteria` and `details` (when present) holding only well-formed entries.
 * Still a `GradeRecord`, so it can be handed to anything that takes one — and
 * reading it again gives the same grade.
 */
export type ReadGrade = GradeRecord & { readonly [READ]: true };

/** A stored outcome, as a renderer may show it. */
export type OutcomeReading =
  /** A grade to show: the outcome's own for `scored`, its `grade` for `graded`. */
  | { kind: 'graded'; status: 'scored' | 'graded'; grade: ReadGrade }
  | { kind: 'deferred' }
  /** `code` is a developer's label: put on an attribute, never shown. */
  | { kind: 'unscorable'; code: string | undefined }
  /** Claimed a grade, or claimed nothing a renderer knows, and could not be read. */
  | { kind: 'unreadable'; status: 'scored' | 'graded' | undefined };

/** An assessor's answer, as a renderer and a statement may use it. */
export type AssessReading =
  | {
      status: 'graded';
      /** `null` when what came back cannot be read as a grade. */
      grade: ReadGrade | null;
      /** The evidence when it is an object at all; whether it VALIDATES is the panel's question. */
      assessment: SpeechAssessment | null;
      recognizedText: string | undefined;
    }
  | { status: 'unscorable'; code: string | undefined }
  | { status: 'failed'; retryable: boolean };

/** One dimension row: a whole percentage, or `undefined` for a dimension nobody measured. */
export interface DimensionReading {
  dimension: ReadAloudDimension;
  percent: number | undefined;
}

/**
 * Every dimension a read-aloud grade can weigh, in the order a learner reads
 * them: what was said, how it flowed, how much of it was there, and how it was
 * pitched. Fixed rather than derived from the evidence, so a dimension the
 * engine did not measure is reported as unmeasured instead of vanishing.
 */
const DIMENSIONS: readonly ReadAloudDimension[] = [
  'accuracy',
  'fluency',
  'completeness',
  'prosody',
];

const OUTCOMES: readonly ScoringOutcome[] = [
  'correct',
  'incorrect',
  'correct-omission',
  'incorrect-omission',
];

/**
 * How far past its own maximum a score may sit and still be read as that
 * maximum. A grader that sums weighted parts lands on `1.0000000000000002`
 * for a perfect take as readily as on `1`, and "could not be graded" is the
 * wrong thing to tell the learner who earned it. Far below any difference a
 * whole percentage can show.
 */
const OVERSHOOT = 1e-9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** An optional field a backend left out, written either way it writes one. */
function isAbsent(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** A score on `0..max`, a hair of overshoot read as `max`; `null` for anything else. */
function withinMax(score: unknown, max: number): number | null {
  if (!isFiniteNumber(score) || score < 0) {
    return null;
  }
  if (score <= max) {
    return score;
  }
  return score - max <= max * OVERSHOOT ? max : null;
}

/** A learner's or a reference response: a string, or strings. */
function isResponse(value: unknown): value is string | string[] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
  );
}

/** Runs a read that touches a host's object, whose getters may throw. */
function guarded<T>(read: () => T, refused: T): T {
  try {
    return read();
  } catch {
    return refused;
  }
}

function readCriterion(value: unknown): CriterionScore | null {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return null;
  }
  const { maxScore, notApplicable } = value;
  if (!isAbsent(maxScore) && !(isFiniteNumber(maxScore) && maxScore > 0)) {
    return null;
  }
  if (!isAbsent(notApplicable) && typeof notApplicable !== 'boolean') {
    return null;
  }
  // `CriterionScore.maxScore` defaults to 1, the SDK's scaled convention.
  const score = isAbsent(value.score) ? undefined : withinMax(value.score, maxScore ?? 1);
  if (score === null) {
    return null;
  }
  return {
    name: value.name,
    ...(score !== undefined ? { score } : {}),
    ...(!isAbsent(maxScore) ? { maxScore } : {}),
    ...(notApplicable === true ? { notApplicable } : {}),
  };
}

function readDetail(value: unknown): ScoringDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const { itemId, correct, outcome, learnerResponse, correctResponse, weight, score } = value;
  if (
    typeof itemId !== 'string' ||
    typeof correct !== 'boolean' ||
    !isResponse(learnerResponse) ||
    !isResponse(correctResponse)
  ) {
    return null;
  }
  const checkedOutcome = OUTCOMES.find((known) => known === outcome);
  if (!isAbsent(outcome) && checkedOutcome === undefined) {
    return null;
  }
  if (!isAbsent(weight) && !isFiniteNumber(weight)) {
    return null;
  }
  // A detail's own score is a fraction of 1.
  const checkedScore = isAbsent(score) ? undefined : withinMax(score, 1);
  if (checkedScore === null) {
    return null;
  }
  return {
    itemId,
    correct,
    learnerResponse,
    correctResponse,
    ...(checkedOutcome !== undefined ? { outcome: checkedOutcome } : {}),
    ...(!isAbsent(weight) ? { weight } : {}),
    ...(checkedScore !== undefined ? { score: checkedScore } : {}),
  };
}

function readDetails(value: unknown): ScoringDetail[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const details: ScoringDetail[] = [];
  for (const entry of value) {
    const detail = readDetail(entry);
    if (detail === null) {
      return undefined;
    }
    details.push(detail);
  }
  return details;
}

/**
 * A host's grade as a checked copy, or `null` when it carries no grade that can
 * be shown or reported. See the module notes for the rules.
 */
export function readGrade(value: unknown): ReadGrade | null {
  return guarded(() => {
    if (!isRecord(value)) {
      return null;
    }
    const { maxScore, passed } = value;
    if (!isFiniteNumber(maxScore) || maxScore <= 0 || typeof passed !== 'boolean') {
      return null;
    }
    const score = withinMax(value.score, maxScore);
    if (score === null) {
      return null;
    }
    const criteria = Array.isArray(value.criteria)
      ? value.criteria.flatMap((entry) => {
          const criterion = readCriterion(entry);
          return criterion === null ? [] : [criterion];
        })
      : undefined;
    const details = readDetails(value.details);
    const grade: GradeRecord = {
      score,
      maxScore,
      passed,
      feedback: typeof value.feedback === 'string' ? value.feedback : null,
      ...(criteria !== undefined ? { criteria } : {}),
      ...(details !== undefined ? { details } : {}),
    };
    return grade as ReadGrade;
  }, null);
}

/** A read grade as a fraction of 1: in `0..1`, because the reader made it so. */
export function fractionOfGrade(grade: ReadGrade): number {
  return grade.score / grade.maxScore;
}

/** A read grade as a whole percentage: in `0..100`, because the reader made it so. */
export function percentOfGrade(grade: ReadGrade): number {
  return Math.round(fractionOfGrade(grade) * 100);
}

/**
 * A stored outcome as a renderer may show it, or `undefined` for none —
 * `null` included, which is how a backend writes an absent optional.
 *
 * A `graded` outcome is read through its `grade`, the record
 * `outcomeFromGrade` mirrors onto it, so the summary and the panel beside it
 * can never show two different numbers; and it must be well-formed as a whole,
 * its own `score`, `maxScore` and `passed` included — a payload with a corrupt
 * copy of the grade is not one to pick a side of.
 */
export function readOutcome(value: unknown): OutcomeReading | undefined {
  if (isAbsent(value)) {
    return undefined;
  }
  return guarded(
    (): OutcomeReading => {
      if (!isRecord(value)) {
        return { kind: 'unreadable', status: undefined };
      }
      switch (value.status) {
        case 'deferred':
          return { kind: 'deferred' };
        case 'unscorable':
          return {
            kind: 'unscorable',
            code: typeof value.code === 'string' ? value.code : undefined,
          };
        case 'scored': {
          const grade = readGrade(value);
          return grade === null
            ? { kind: 'unreadable', status: 'scored' }
            : { kind: 'graded', status: 'scored', grade };
        }
        case 'graded': {
          const grade = readGrade(value.grade);
          return grade === null || readGrade(value) === null
            ? { kind: 'unreadable', status: 'graded' }
            : { kind: 'graded', status: 'graded', grade };
        }
        default:
          return { kind: 'unreadable', status: undefined };
      }
    },
    { kind: 'unreadable', status: undefined },
  );
}

/**
 * An assessor's answer as a renderer and a statement may use it.
 *
 * `failed` and `unscorable` need little: a `retryable` that is not `true`
 * offers no retry, which never spends an application's money on a guess, and a
 * `code` that is not a string is no code. Everything else — a `graded` result,
 * and anything that is not an object or names no status this component knows —
 * is read as a judgement: its grade when one can be read, its evidence when it
 * is an object. A judgement with neither is shown as could-not-be-graded.
 */
export function readAssessResult(value: unknown): AssessReading {
  const nothing: AssessReading = {
    status: 'graded',
    grade: null,
    assessment: null,
    recognizedText: undefined,
  };
  return guarded((): AssessReading => {
    if (!isRecord(value)) {
      return nothing;
    }
    if (value.status === 'failed') {
      return { status: 'failed', retryable: value.retryable === true };
    }
    if (value.status === 'unscorable') {
      return {
        status: 'unscorable',
        code: typeof value.code === 'string' ? value.code : undefined,
      };
    }
    if (value.status !== 'graded') {
      return nothing;
    }
    const assessment = readEvidence(value.assessment);
    const recognizedText = guarded(
      () =>
        typeof assessment?.recognizedText === 'string' ? assessment.recognizedText : undefined,
      undefined,
    );
    return { status: 'graded', grade: readGrade(value.grade), assessment, recognizedText };
  }, nothing);
}

/**
 * Evidence worth handing to the panel: an object. Whether it validates is the
 * panel's to decide, because what a refusal costs differs by mode.
 */
export function readEvidence(value: unknown): SpeechAssessment | null {
  return isRecord(value) ? (value as unknown as SpeechAssessment) : null;
}

/** One criterion's whole percentage of its own maximum, or `undefined` when it carries none. */
function percentOfCriterion(criterion: CriterionScore): number | undefined {
  if (criterion.notApplicable === true || criterion.score === undefined) {
    return undefined;
  }
  return Math.round((criterion.score / (criterion.maxScore ?? 1)) * 100);
}

/**
 * The dimension rows, from one source for the whole set and never a mix: the
 * grade's criteria when it has any it can read, and the evidence's own scores
 * otherwise. A dimension pulled out of the evidence and set beside graded ones
 * would read as if it had counted towards the grade.
 *
 * The evidence is read as defensively as the grade: in production the panel
 * shows these rows even for evidence the validator refused, which can carry
 * anything at all under `scores`. `scale` is 100 by schema, so an evidence
 * score is already a percentage — and one outside `0..100` is not one.
 */
export function readDimensions(
  assessment: unknown,
  grade: ReadGrade | null | undefined,
): DimensionReading[] {
  const criteria = grade?.criteria ?? [];
  if (criteria.length > 0) {
    return DIMENSIONS.map((dimension) => {
      const criterion = criteria.find((entry) => entry.name === dimension);
      return {
        dimension,
        percent: criterion === undefined ? undefined : percentOfCriterion(criterion),
      };
    });
  }
  const scores = guarded(() => (isRecord(assessment) ? assessment.scores : undefined), undefined);
  return DIMENSIONS.map((dimension) => {
    const score = withinMax(
      guarded(() => (isRecord(scores) ? scores[dimension] : undefined), undefined),
      100,
    );
    // Rounded rather than reformatted: the engine's own number is what was graded.
    return { dimension, percent: score === null ? undefined : Math.round(score) };
  });
}
