import { outcomeFromGrade } from '../../grading.js';
import { hashSeed } from '../../shuffle.js';
import type { ItemOutcome } from '../../types/activity.js';
import type { GradeRecord, GradeRouting, GradeRoutingReason } from '../../types/grading.js';
import {
  type CalibrationReport,
  type CalibrationScope,
  type CriterionCalibration,
  criterionOf,
  graderConfiguration,
  levelOf,
  rubricScales,
  sameConfiguration,
} from './calibration.js';

/**
 * The thresholds a calibration report must meet before a model's grade counts.
 * The SDK has no default for any of them, as rounding has no default `dp`: a
 * threshold you leave out is not checked. A metric a threshold needs that the
 * report cannot give — a kappa with no variance, a degradation without a second
 * person — fails it: what cannot be shown is not assumed.
 */
export interface CalibrationThresholds {
  /** Fewest pairs a criterion, and the total, must be measured on. */
  minPairs?: number;
  /** Lowest quadratic kappa, on each criterion with levels. */
  minQuadraticKappa?: number;
  /** Lowest exact agreement, on each criterion with levels. */
  minExactAgreement?: number;
  /** Lowest Pearson's r, on each criterion without levels and on the total. */
  minPearson?: number;
  /** Highest mean absolute error, on every criterion and the total. */
  maxMeanAbsoluteError?: number;
  /** Highest |standardised mean difference|, on every criterion and the total. */
  maxAbsStandardizedMeanDifference?: number;
  /** Highest degradation from human–human agreement, on every criterion and the total. */
  maxDegradation?: number;
  /** Highest expected calibration error, on each criterion with levels whose grades carry probabilities. */
  maxCalibrationError?: number;
}

/** How `routeGrade` decides. Every part is optional and has no default. */
export interface GradeRoutingPolicy {
  /** What a calibration must show. Read when a report is supplied. */
  calibration?: CalibrationThresholds;
  /**
   * A criterion judged on levels whose chosen level the grader gave a lower
   * probability than this goes to a person (`unsure`), and so does one whose
   * grade carries no distribution to read: what cannot be shown is not assumed.
   */
  minLevelProbability?: number;
  /** Send a grade whose grader's own `confidence` is `low` to a person (`low-confidence`). */
  routeLowConfidence?: boolean;
  /** Send this share of grades to a person too, chosen by `inAuditSample` (`audit-sample`). */
  audit?: { rate: number; seed: string };
}

/** What `routeGrade` reads besides the grade. */
export interface GradeRoutingContext {
  /** `exam` for a paper of record: a grade needs a matching calibration there (`no-calibration`). */
  mode: 'exam' | 'practice';
  /** The item graded: its rubric and target name the configuration a report must certify. */
  item: CalibrationScope;
  /** The calibration of this grader's configuration, when the host has one. */
  calibration?: CalibrationReport;
  policy?: GradeRoutingPolicy;
  /** The response's stable identity — an attempt and slot — for the audit sample. Required with `policy.audit`. */
  sampleKey?: string;
}

/** A threshold the caller configured: a finite number, and a rate within 0 to 1 where it is one. */
function checkThreshold(name: string, value: number | undefined, rate: boolean): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || (rate && (value < 0 || value > 1))) {
    throw new RangeError(
      `routeGrade: policy ${name} must be a finite number${rate ? ' from 0 to 1' : ''}; got ${String(value)}.`,
    );
  }
}

function checkPolicy(policy: GradeRoutingPolicy): void {
  const thresholds = policy.calibration ?? {};
  checkThreshold('calibration.minPairs', thresholds.minPairs, false);
  checkThreshold('calibration.minQuadraticKappa', thresholds.minQuadraticKappa, false);
  checkThreshold('calibration.minExactAgreement', thresholds.minExactAgreement, true);
  checkThreshold('calibration.minPearson', thresholds.minPearson, false);
  checkThreshold('calibration.maxMeanAbsoluteError', thresholds.maxMeanAbsoluteError, true);
  checkThreshold(
    'calibration.maxAbsStandardizedMeanDifference',
    thresholds.maxAbsStandardizedMeanDifference,
    false,
  );
  checkThreshold('calibration.maxDegradation', thresholds.maxDegradation, false);
  checkThreshold('calibration.maxCalibrationError', thresholds.maxCalibrationError, true);
  checkThreshold('minLevelProbability', policy.minLevelProbability, true);
  if (policy.audit !== undefined) {
    checkThreshold('audit.rate', policy.audit.rate, true);
    if (typeof policy.audit.seed !== 'string') {
      throw new RangeError('routeGrade: policy audit.seed must be a string.');
    }
  }
}

function checkContext(context: GradeRoutingContext, policy: GradeRoutingPolicy): void {
  if (context.mode !== 'exam' && context.mode !== 'practice') {
    throw new RangeError(
      `routeGrade: mode must be 'exam' or 'practice'; got ${String(context.mode)}.`,
    );
  }
  if (policy.audit !== undefined && typeof context.sampleKey !== 'string') {
    throw new RangeError(
      "routeGrade: a policy with an audit needs a sampleKey, the response's stable identity.",
    );
  }
}

/** At least `min`, when there is a minimum; a missing value fails it. */
const atLeast = (value: number | null | undefined, min: number | undefined): boolean =>
  min === undefined || (typeof value === 'number' && value >= min);

/** At most `max`, when there is a maximum; a missing value fails it. */
const atMost = (value: number | null | undefined, max: number | undefined): boolean =>
  max === undefined || (typeof value === 'number' && value <= max);

const absolute = (value: number | null): number | null => (value === null ? null : Math.abs(value));

function criterionMeets(criterion: CriterionCalibration, t: CalibrationThresholds): boolean {
  const shared =
    atLeast(criterion.pairs, t.minPairs) &&
    atMost(criterion.meanAbsoluteError, t.maxMeanAbsoluteError) &&
    atMost(absolute(criterion.standardizedMeanDifference), t.maxAbsStandardizedMeanDifference) &&
    atMost(criterion.degradation, t.maxDegradation);
  if (criterion.scale === 'score') {
    return shared && atLeast(criterion.pearson, t.minPearson);
  }
  return (
    shared &&
    atLeast(criterion.quadraticKappa, t.minQuadraticKappa) &&
    atLeast(criterion.exactAgreement, t.minExactAgreement) &&
    // Probabilities are optional on a grade: calibration error is checked
    // only where grades carried them.
    (criterion.probabilityPairs === 0 || atMost(criterion.calibrationError, t.maxCalibrationError))
  );
}

/** Whether a report meets every threshold, on every criterion and on the total. */
function reportMeets(report: CalibrationReport, t: CalibrationThresholds): boolean {
  const total = report.total;
  return (
    report.criteria.every((criterion) => criterionMeets(criterion, t)) &&
    atLeast(total.pairs, t.minPairs) &&
    atLeast(total.pearson, t.minPearson) &&
    atMost(total.meanAbsoluteError, t.maxMeanAbsoluteError) &&
    atMost(absolute(total.standardizedMeanDifference), t.maxAbsStandardizedMeanDifference) &&
    atMost(total.degradation, t.maxDegradation)
  );
}

/**
 * Whether a criterion judged on levels is less sure than `minimum`: the
 * grader gave its chosen level a lower probability, or the grade has no
 * distribution over the levels to read, or no level at all. A rubric whose
 * levels cannot be read is unsure throughout.
 */
function isUnsure(grade: GradeRecord, item: CalibrationScope, minimum: number): boolean {
  const read = rubricScales(item.rubric);
  if (!read.ok) {
    return true;
  }
  return read.scales.some((scale) => {
    const judged = criterionOf(grade, scale.name);
    if (scale.levels === null || judged?.notApplicable === true) {
      return false;
    }
    const level = judged === undefined ? null : levelOf(judged, scale.levels);
    return (
      level === null ||
      level.probabilities === null ||
      (level.probabilities[level.level] as number) < minimum
    );
  });
}

/**
 * Murmur3's 32-bit finaliser, so every bit of the hash moves every bit of the
 * result. FNV-1a alone barely moves its high bits for a change in a key's last
 * characters, and the sample reads the high bits: `attempt-1:slot-1` and
 * `attempt-1:slot-2` were drawn together 97 times in 100 at a rate of 0.25.
 */
function avalanche(hash: number): number {
  let mixed = hash ^ (hash >>> 16);
  mixed = Math.imul(mixed, 0x85ebca6b);
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

/**
 * Whether `key` is in the audit sample: a stable share `rate` of keys, chosen
 * by a hash of the seed and the key, so the same response is always in or
 * always out, two responses are drawn independently even when their keys
 * differ by one character, and changing the seed draws a new sample.
 */
export function inAuditSample(key: string, rate: number, seed: string): boolean {
  checkThreshold('audit.rate', rate, true);
  if (typeof key !== 'string' || typeof seed !== 'string') {
    throw new RangeError('inAuditSample: the key and the seed must be strings.');
  }
  return avalanche(hashSeed(`${seed}\u0000${key}`)) / 2 ** 32 < rate;
}

/**
 * Where a model's grade goes: to count, or to a person first. Deterministic —
 * the same grade, context and policy always route the same way — and the
 * decision says every reason it rests on, in {@link GradeRoutingReason}'s
 * order, so an appeal can see why a person did or did not mark a response.
 *
 * - **In `exam`, a grade needs a calibration of its exact configuration**
 *   (`no-calibration`): the model and prompt its `grader` names, and the
 *   item's rubric and target. Fail closed: without a matching report, every
 *   grade goes to a person.
 * - A supplied report must meet the policy's thresholds (`calibration-below-policy`).
 * - A criterion on levels the grader was less sure of than
 *   `minLevelProbability`, or showed no probabilities for (`unsure`), a
 *   grader that asked for review (`model-asked`), a `low` confidence where
 *   the policy routes on it (`low-confidence`), and the audit sample
 *   (`audit-sample`) send it to a person too.
 *
 * A mode other than `exam` or `practice`, a policy threshold that is not a
 * finite number, a rate outside 0 to 1, or an audit without a `sampleKey`
 * throws a `RangeError`: it is the caller's configuration, not the grade's,
 * and a typo must not quietly make an exam a practice.
 */
export function routeGrade(grade: GradeRecord, context: GradeRoutingContext): GradeRouting {
  const policy = context.policy ?? {};
  checkPolicy(policy);
  checkContext(context, policy);
  const reasons: GradeRoutingReason[] = [];
  const own = graderConfiguration(grade, context.item);
  const report = context.calibration;
  const matching =
    report !== undefined && own !== null && sameConfiguration(own, report.configuration)
      ? report
      : undefined;
  if (context.mode === 'exam' && matching === undefined) {
    reasons.push('no-calibration');
  }
  if (matching !== undefined && !reportMeets(matching, policy.calibration ?? {})) {
    reasons.push('calibration-below-policy');
  }
  const minimum = policy.minLevelProbability;
  if (minimum !== undefined && isUnsure(grade, context.item, minimum)) {
    reasons.push('unsure');
  }
  if (grade.requiresHumanReview === true) {
    reasons.push('model-asked');
  }
  if (policy.routeLowConfidence === true && grade.confidence === 'low') {
    reasons.push('low-confidence');
  }
  if (
    policy.audit !== undefined &&
    inAuditSample(context.sampleKey as string, policy.audit.rate, policy.audit.seed)
  ) {
    reasons.push('audit-sample');
  }
  return {
    to: reasons.length === 0 ? 'model' : 'person',
    reasons,
    ...(matching !== undefined
      ? { calibration: { reportHash: matching.reportHash, pairs: matching.pairs } }
      : {}),
  };
}

/**
 * The outcome a routed grade gives its slot. To the model: the grade, with the
 * decision on its `routing`, lifted as `outcomeFromGrade` lifts any grade. To a
 * person: `{ status: 'deferred', reason: 'awaiting_human_review', pendingGrade }`
 * — not `graded`, so its `passed` is never read as a verdict, and a composed
 * attempt stays `provisional` until a person's grade replaces it.
 */
export function outcomeFromRoutedGrade(grade: GradeRecord, routing: GradeRouting): ItemOutcome {
  const routed: GradeRecord = { ...grade, routing };
  if (routing.to === 'model') {
    return outcomeFromGrade(routed);
  }
  return { status: 'deferred', reason: 'awaiting_human_review', maxScore: 1, pendingGrade: routed };
}
