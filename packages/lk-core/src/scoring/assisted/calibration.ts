import { contentHash } from '../../content-hash.js';
import { levelDistribution, levelKey, readRubricLevels } from '../../rubric-levels.js';
import type { WrittenResponseRubric } from '../../types/activity.js';
import type { CriterionScore, GradeRecord, GraderConfiguration } from '../../types/grading.js';
import { isGradeInRange } from '../grade-numbers.js';

/** One response marked twice: by the model, and by a person — and, optionally, a second person. */
export interface CalibrationPair {
  /** The model's grade, from `gradeFromJudgement`: its `grader` names the model and the prompt. */
  model: GradeRecord;
  /** A person's grade of the same response, criterion by criterion. */
  person: GradeRecord;
  /** A second person's grade, for the human–human agreement a model is compared with. */
  secondPerson?: GradeRecord;
}

/** What the responses were graded against: the rubric, and the target language. */
export interface CalibrationScope {
  rubric?: WrittenResponseRubric;
  languageTarget?: string;
}

/** How a model's judgements of one criterion agree with a person's. Rates are fractions from 0 to 1. */
export interface CriterionCalibration {
  name: string;
  /** `levels` when the criterion is judged on levels; `score` when on a score from 0 to 1. */
  scale: 'levels' | 'score';
  /** How many levels, on a criterion with levels. */
  levels?: number;
  /** Pairs where both judged this criterion on its scale. */
  pairs: number;
  /** Levels: the share of pairs on the same level. */
  exactAgreement?: number | null;
  /** Levels: the share of pairs at most one level apart. */
  adjacentAgreement?: number | null;
  /** Levels: Cohen's kappa, quadratic weights. `null` when it is undefined (no variance). */
  quadraticKappa?: number | null;
  /** Levels: pair counts, `confusion[personLevel][modelLevel]`, lowest first. */
  confusion?: number[][];
  /** Pearson's r between the two scores. `null` when undefined (fewer than 2 pairs, or no variance). */
  pearson: number | null;
  /** The mean absolute difference between the two scores, from 0 to 1. `null` with no pairs. */
  meanAbsoluteError: number | null;
  /**
   * The model's mean score minus the person's, over their pooled standard
   * deviation (population): positive when the model is more lenient. `null`
   * when undefined.
   */
  standardizedMeanDifference: number | null;
  /** Levels: pairs whose model grade carried level probabilities. */
  probabilityPairs?: number;
  /**
   * Levels: expected calibration error over ten equal bins of the model's
   * confidence (its likeliest level's probability): how far stated confidence
   * is from how often that level was the person's. `null` without
   * probabilities.
   */
  calibrationError?: number | null;
  /** Levels: the multi-class Brier score of the probabilities against the person's level. `null` without them. */
  brierScore?: number | null;
  /** Pairs with a second person's grade of this criterion. */
  humanPairs?: number;
  /** Levels: quadratic kappa between the two people. */
  humanQuadraticKappa?: number | null;
  /** Pearson's r between the two people. */
  humanPearson?: number | null;
  /**
   * How much worse the model agrees with a person than two people agree: the
   * human kappa minus the model's on levels, the human r minus the model's on
   * scores. `null` without a second person.
   */
  degradation?: number | null;
}

/** How the model's totals agree with a person's. */
export interface TotalCalibration {
  pairs: number;
  pearson: number | null;
  meanAbsoluteError: number | null;
  standardizedMeanDifference: number | null;
  /** The share of pairs whose pass or fail is the same. */
  passAgreement: number | null;
  humanPairs?: number;
  humanPearson?: number | null;
  degradation?: number | null;
}

/**
 * How one grader configuration agrees with people, on the host's own responses.
 * It ships no thresholds: the host decides what agreement admits a model to a
 * paper of record, and `routeGrade` applies that decision.
 */
export interface CalibrationReport {
  /** What this report certifies: one model, one prompt revision, one rubric, one target. */
  configuration: GraderConfiguration;
  /** Pairs given. */
  pairs: number;
  /** One entry per rubric criterion, in the rubric's order. */
  criteria: CriterionCalibration[];
  total: TotalCalibration;
  /** `contentHash` of everything above: what a routed grade records it relied on. */
  reportHash: string;
}

// ── Statistics ─────────────────────────────────────────────────────────

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Population variance. */
function variance(values: readonly number[]): number {
  const m = mean(values);
  return mean(values.map((value) => (value - m) ** 2));
}

/** Pearson's r; `null` with fewer than two pairs or no variance on a side. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length < 2) {
    return null;
  }
  const mx = mean(xs);
  const my = mean(ys);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = (xs[i] as number) - mx;
    const dy = (ys[i] as number) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  return vx === 0 || vy === 0 ? null : cov / Math.sqrt(vx * vy);
}

/** Model mean minus person mean, over the pooled population standard deviation. */
export function standardizedMeanDifference(
  model: readonly number[],
  person: readonly number[],
): number | null {
  if (model.length === 0) {
    return null;
  }
  const pooled = Math.sqrt((variance(model) + variance(person)) / 2);
  return pooled === 0 ? null : (mean(model) - mean(person)) / pooled;
}

/** Cohen's kappa with quadratic weights over `k` levels; `null` when undefined. */
export function quadraticKappa(
  rows: readonly number[],
  cols: readonly number[],
  k: number,
): number | null {
  const n = rows.length;
  if (n === 0 || k < 2) {
    return null;
  }
  const observed = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const rowTotals = new Array<number>(k).fill(0);
  const colTotals = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i += 1) {
    const r = rows[i] as number;
    const c = cols[i] as number;
    (observed[r] as number[])[c] = ((observed[r] as number[])[c] as number) + 1;
    rowTotals[r] = (rowTotals[r] as number) + 1;
    colTotals[c] = (colTotals[c] as number) + 1;
  }
  let disagreement = 0;
  let chance = 0;
  for (let r = 0; r < k; r += 1) {
    for (let c = 0; c < k; c += 1) {
      const weight = (r - c) ** 2 / (k - 1) ** 2;
      disagreement += weight * ((observed[r] as number[])[c] as number);
      chance += (weight * (rowTotals[r] as number) * (colTotals[c] as number)) / n;
    }
  }
  return chance === 0 ? null : 1 - disagreement / chance;
}

/** Ten equal bins of confidence; the mean absolute gap between confidence and accuracy, weighted by bin size. */
function expectedCalibrationError(confidence: readonly number[], correct: readonly boolean[]) {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, confidence: 0, correct: 0 }));
  for (let i = 0; i < confidence.length; i += 1) {
    const c = confidence[i] as number;
    const bin = bins[Math.min(9, Math.floor(c * 10))] as (typeof bins)[number];
    bin.n += 1;
    bin.confidence += c;
    bin.correct += correct[i] ? 1 : 0;
  }
  return bins.reduce(
    (sum, bin) =>
      bin.n === 0
        ? sum
        : sum +
          (bin.n / confidence.length) * Math.abs(bin.correct / bin.n - bin.confidence / bin.n),
    0,
  );
}

// ── Reading grades ─────────────────────────────────────────────────────

/** The grader configuration a model grade comes from, on items with this rubric and target; `null` when the grade does not name its model and prompt. */
export function graderConfiguration(
  grade: GradeRecord,
  scope: CalibrationScope,
): GraderConfiguration | null {
  const model = grade.grader?.model;
  const promptHash = grade.grader?.promptHash;
  if (
    typeof model !== 'string' ||
    model === '' ||
    typeof promptHash !== 'string' ||
    promptHash === ''
  ) {
    return null;
  }
  return {
    model,
    promptHash,
    rubricHash: contentHash(scope.rubric ?? null),
    languageTarget: typeof scope.languageTarget === 'string' ? scope.languageTarget : null,
  };
}

/** Configurations as equal as a calibration requires: every field. */
export function sameConfiguration(a: GraderConfiguration, b: GraderConfiguration): boolean {
  return (
    a.model === b.model &&
    a.promptHash === b.promptHash &&
    a.rubricHash === b.rubricHash &&
    a.languageTarget === b.languageTarget
  );
}

/** The scale a rubric criterion is judged on: its levels, or `null` for a score. */
export interface Scale {
  name: string;
  levels: { label: string }[] | null;
}

/** Each rubric criterion's scale, or the name of the first whose levels cannot be read. */
export function rubricScales(
  rubric: WrittenResponseRubric | undefined,
): { ok: true; scales: Scale[] } | { ok: false; name: string } {
  const scales: Scale[] = [];
  for (const criterion of rubric?.criteria ?? []) {
    const read = readRubricLevels(criterion.levels);
    if (!read.ok) {
      return { ok: false, name: criterion.name };
    }
    scales.push({ name: criterion.name, levels: read.levels });
  }
  return { ok: true, scales };
}

/** A grade's judgement of the criterion named `name`, its name compared as labels are. */
export function criterionOf(grade: GradeRecord, name: string): CriterionScore | undefined {
  return (grade.criteria ?? []).find((one) => levelKey(one.name) === levelKey(name));
}

/**
 * A judgement on a criterion's levels: the index of the level its `band`
 * names, and its `levelProbabilities` when they are a distribution over the
 * levels whose likeliest is that level. `null` when it names no level the
 * criterion has.
 */
export function levelOf(
  judged: CriterionScore,
  levels: readonly { label: string }[],
): { level: number; probabilities: number[] | null } | null {
  const band = judged.band;
  const level =
    typeof band === 'string'
      ? levels.findIndex((one) => levelKey(one.label) === levelKey(band))
      : -1;
  if (level === -1) {
    return null;
  }
  const probabilities = judged.levelProbabilities;
  return {
    level,
    probabilities: Array.isArray(probabilities)
      ? levelDistribution(probabilities, levels.length, level)
      : null,
  };
}

/**
 * A judgement on a score, as a fraction of its `maxScore`, read as
 * `gradeFromRubric` reads one: a positive, finite maximum, and a ratio within
 * 0 to 1, a hair outside it float noise and clamped. `null` when it has none.
 */
function scoreOf(judged: CriterionScore): number | null {
  const score = judged.score;
  const max = judged.maxScore ?? 1;
  if (typeof score !== 'number' || !Number.isFinite(score) || !(Number.isFinite(max) && max > 0)) {
    return null;
  }
  const EPSILON = 1e-9;
  const ratio = score / max;
  return ratio < -EPSILON || ratio > 1 + EPSILON ? null : Math.min(1, Math.max(0, ratio));
}

/**
 * A grade's judgement of a criterion on its scale: its score from 0 to 1, and on
 * levels the level's index (-1 on a score) and any distribution. `null` when it
 * is not applicable or cannot be read.
 */
function reading(
  grade: GradeRecord,
  scale: Scale,
): { score: number; level: number; probabilities: number[] | null } | null {
  const judged = criterionOf(grade, scale.name);
  if (judged === undefined || judged.notApplicable === true) {
    return null;
  }
  if (scale.levels === null) {
    const score = scoreOf(judged);
    return score === null ? null : { score, level: -1, probabilities: null };
  }
  const read = levelOf(judged, scale.levels);
  return read === null ? null : { score: read.level / (scale.levels.length - 1), ...read };
}

function calibrateCriterion(scale: Scale, pairs: readonly CalibrationPair[]): CriterionCalibration {
  const model: number[] = [];
  const person: number[] = [];
  const modelLevels: number[] = [];
  const personLevels: number[] = [];
  const confidence: number[] = [];
  const correct: boolean[] = [];
  let brier = 0;
  const human = {
    first: [] as number[],
    second: [] as number[],
    firstLevels: [] as number[],
    secondLevels: [] as number[],
  };
  for (const pair of pairs) {
    const m = reading(pair.model, scale);
    const p = reading(pair.person, scale);
    if (m === null || p === null) {
      continue;
    }
    model.push(m.score);
    person.push(p.score);
    modelLevels.push(m.level);
    personLevels.push(p.level);
    if (m.probabilities !== null) {
      confidence.push(m.probabilities[m.level] as number);
      correct.push(m.level === p.level);
      brier += m.probabilities.reduce(
        (sum, probability, index) => sum + (probability - (index === p.level ? 1 : 0)) ** 2,
        0,
      );
    }
    const s = pair.secondPerson === undefined ? null : reading(pair.secondPerson, scale);
    if (s !== null) {
      human.first.push(p.score);
      human.second.push(s.score);
      human.firstLevels.push(p.level);
      human.secondLevels.push(s.level);
    }
  }
  const n = model.length;
  const shared = {
    name: scale.name,
    pairs: n,
    pearson: pearson(model, person),
    meanAbsoluteError:
      n === 0 ? null : mean(model.map((value, i) => Math.abs(value - (person[i] as number)))),
    standardizedMeanDifference: standardizedMeanDifference(model, person),
  };
  const humanPairs = human.first.length;
  // `pearson` and `quadraticKappa` are `null` for too few pairs, none included.
  const humanPearson = pearson(human.first, human.second);
  if (scale.levels === null) {
    return {
      ...shared,
      scale: 'score',
      ...(humanPairs > 0
        ? {
            humanPairs,
            humanPearson,
            degradation:
              humanPearson === null || shared.pearson === null
                ? null
                : humanPearson - shared.pearson,
          }
        : {}),
    };
  }
  const k = scale.levels.length;
  const kappa = quadraticKappa(personLevels, modelLevels, k);
  const confusion = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  personLevels.forEach((r, i) => {
    (confusion[r] as number[])[modelLevels[i] as number] += 1;
  });
  const humanKappa = quadraticKappa(human.firstLevels, human.secondLevels, k);
  return {
    ...shared,
    scale: 'levels',
    levels: k,
    exactAgreement:
      n === 0 ? null : modelLevels.filter((level, i) => level === personLevels[i]).length / n,
    adjacentAgreement:
      n === 0
        ? null
        : modelLevels.filter((level, i) => Math.abs(level - (personLevels[i] as number)) <= 1)
            .length / n,
    quadraticKappa: kappa,
    confusion,
    probabilityPairs: confidence.length,
    calibrationError:
      confidence.length === 0 ? null : expectedCalibrationError(confidence, correct),
    brierScore: confidence.length === 0 ? null : brier / confidence.length,
    ...(humanPairs > 0
      ? {
          humanPairs,
          humanQuadraticKappa: humanKappa,
          humanPearson,
          degradation: humanKappa === null || kappa === null ? null : humanKappa - kappa,
        }
      : {}),
  };
}

function calibrateTotal(pairs: readonly CalibrationPair[]): TotalCalibration {
  const model = pairs.map((pair) => pair.model.score / pair.model.maxScore);
  const person = pairs.map((pair) => pair.person.score / pair.person.maxScore);
  const both = pairs.filter((pair) => pair.secondPerson !== undefined);
  const humanPearson = pearson(
    both.map((pair) => pair.person.score / pair.person.maxScore),
    both.map((pair) => {
      const second = pair.secondPerson as GradeRecord;
      return second.score / second.maxScore;
    }),
  );
  const modelPearson = pearson(model, person);
  return {
    pairs: pairs.length,
    pearson: modelPearson,
    meanAbsoluteError: mean(model.map((value, i) => Math.abs(value - (person[i] as number)))),
    standardizedMeanDifference: standardizedMeanDifference(model, person),
    passAgreement:
      pairs.filter((pair) => pair.model.passed === pair.person.passed).length / pairs.length,
    ...(both.length > 0
      ? {
          humanPairs: both.length,
          humanPearson,
          degradation:
            humanPearson === null || modelPearson === null ? null : humanPearson - modelPearson,
        }
      : {}),
  };
}

/**
 * How one grader configuration — a model, a prompt revision, a rubric and a
 * target language — agrees with people, measured on responses the host had
 * marked twice. Pure: the same pairs give the same report and the same
 * `reportHash`.
 *
 * Every model grade must come from one configuration (its `grader` names the
 * model and the prompt), and no person's grade may be a model's. A criterion
 * is measured over the pairs where both judged it on its scale — levels by
 * their labels, scores as fractions of their maximum — and every metric that
 * is undefined is `null`, never a number made up. It ships no threshold:
 * `routeGrade` applies the host's.
 */
export function calibrationReport(
  pairs: readonly CalibrationPair[],
  scope: CalibrationScope,
): { ok: true; report: CalibrationReport } | { ok: false; reason: string } {
  if (pairs.length === 0) {
    return {
      ok: false,
      reason: 'No pairs: a calibration needs responses marked by the model and by a person.',
    };
  }
  const read = rubricScales(scope.rubric);
  if (!read.ok) {
    return {
      ok: false,
      reason: `Criterion "${read.name}" has levels the grading functions cannot read.`,
    };
  }
  const scales = read.scales;
  if (scales.length === 0) {
    return {
      ok: false,
      reason: 'No rubric: a calibration measures a grader criterion by criterion.',
    };
  }
  let configuration: GraderConfiguration | null = null;
  for (const [index, pair] of pairs.entries()) {
    const grades = [pair.model, pair.person, ...(pair.secondPerson ? [pair.secondPerson] : [])];
    if (grades.some((grade) => !isGradeInRange(grade.score, grade.maxScore))) {
      return {
        ok: false,
        reason: `Pair ${index + 1} has a grade whose numbers cannot be a grade.`,
      };
    }
    if (
      [pair.person, pair.secondPerson].some(
        (grade) => grade?.grader !== undefined && grade.grader.kind !== 'human',
      )
    ) {
      return {
        ok: false,
        reason: `Pair ${index + 1} has a person's grade that a grader other than a person gave.`,
      };
    }
    const own = graderConfiguration(pair.model, scope);
    if (own === null) {
      return {
        ok: false,
        reason: `Pair ${index + 1}'s model grade does not name its model and prompt (grader.model, grader.promptHash), so it cannot be calibrated.`,
      };
    }
    if (configuration !== null && !sameConfiguration(configuration, own)) {
      return {
        ok: false,
        reason: `Pair ${index + 1}'s model grade comes from another configuration: a report measures one model, prompt, rubric and target.`,
      };
    }
    configuration = own;
  }
  const report = {
    configuration: configuration as GraderConfiguration,
    pairs: pairs.length,
    criteria: scales.map((scale) => calibrateCriterion(scale, pairs)),
    total: calibrateTotal(pairs),
  };
  return { ok: true, report: { ...report, reportHash: contentHash(report) } };
}
