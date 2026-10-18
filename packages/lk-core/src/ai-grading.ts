import { AI_TEXT_MAX_LENGTH } from './ai.js';
import { materialFacts } from './ai-material.js';
import { provenanceOf, usageOf } from './ai-text.js';
import {
  AI_WRITING_MAX_FIELD_LENGTH,
  checkCorrections,
  isRecord,
  textField,
} from './ai-written.js';
import { countWords } from './count-words.js';
import {
  LEVEL_PROBABILITY_TOLERANCE,
  levelDistribution,
  levelKey,
  readRubricLevels,
} from './rubric-levels.js';
import type { LearnerResponse, WrittenResponseData } from './types/activity.js';
import type {
  AiActivityInput,
  AiGradedCriterion,
  AiGradingCriterionFact,
  AiGradingJudgement,
  AiGradingRequest,
  AiGradingRequestProblem,
  AiGroupInput,
  AiRefusal,
} from './types/ai.js';

/**
 * How far a model's level probabilities may sum from 1 and still be a
 * distribution: rounding in a model's output, not a different judgement.
 */
export const AI_GRADING_PROBABILITY_TOLERANCE = LEVEL_PROBABILITY_TOLERANCE;

/**
 * The request for a model's grade of a submitted written response, or why there
 * is none to make.
 *
 * Grading happens on the server, from the whole item: the rubric is what a
 * model is held to, so an item without one — or one whose criteria are not each
 * a name and a weight — gives no request, nor does a `redact()` projection or
 * an empty response. A criterion's `levels`, when there are any, must be ones
 * the grading functions can read; levels they cannot read give no request
 * rather than a grade on a scale the author did not mean. `group` is the item
 * group the task sits in: its material goes with the request as `material`, as
 * on feedback on writing.
 *
 * The author's AI switch (`ai.explanations`) is not read: grading is the
 * deployment's decision, made on the server, not help a learner asks for.
 */
export function aiGradingRequest(input: {
  data: AiActivityInput;
  response: LearnerResponse | null;
  group?: AiGroupInput;
  learnerLocale?: string;
}):
  | { ok: true; request: AiGradingRequest }
  | { ok: false; problem: AiGradingRequestProblem; path?: (string | number)[] } {
  const { data, response, learnerLocale } = input;
  if (data.type !== 'written-response') {
    return { ok: false, problem: 'not-written-response' };
  }
  if ((data as { redacted?: unknown }).redacted === true) {
    return { ok: false, problem: 'redacted' };
  }
  const item = data as unknown as WrittenResponseData;
  const rubric = rubricFacts(item.rubric);
  if (!rubric.ok) {
    return rubric;
  }
  const text = response?.type === 'written-response' ? response.text : undefined;
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, problem: 'empty-response' };
  }
  const wordCount = countWords(text);
  const minWords = typeof item.minWords === 'number' ? item.minWords : 0;
  const maxWords = typeof item.maxWords === 'number' ? item.maxWords : Number.POSITIVE_INFINITY;
  const material = materialFacts(input.group);
  return {
    ok: true,
    request: {
      feature: 'grading',
      facts: {
        activityType: 'written-response',
        activityId: data.id,
        title: data.title,
        ...(typeof data.locale === 'string' ? { locale: data.locale } : {}),
        prompt: typeof item.prompt === 'string' ? item.prompt : '',
        text,
        wordCount,
        minWords,
        maxWords,
        withinWordBounds: wordCount >= minWords && wordCount <= maxWords,
        rubric: rubric.criteria,
        ...(typeof item.languageTarget === 'string' ? { languageTarget: item.languageTarget } : {}),
      },
      ...(material !== null ? { material } : {}),
      ...(learnerLocale !== undefined ? { learnerLocale } : {}),
    },
  };
}

/** The rubric as a model is given it, each criterion's levels read. */
function rubricFacts(
  rubric: unknown,
):
  | { ok: true; criteria: AiGradingCriterionFact[] }
  | { ok: false; problem: AiGradingRequestProblem; path?: (string | number)[] } {
  const listed = isRecord(rubric) ? rubric.criteria : undefined;
  if (!Array.isArray(listed) || listed.length === 0) {
    return { ok: false, problem: 'no-rubric' };
  }
  const criteria: AiGradingCriterionFact[] = [];
  const names = new Set<string>();
  for (const [index, criterion] of listed.entries()) {
    if (!isRecord(criterion)) {
      return { ok: false, problem: 'no-rubric', path: ['rubric', 'criteria', index] };
    }
    const { name, description, weight } = criterion;
    if (typeof name !== 'string' || name.trim() === '' || typeof weight !== 'number') {
      return { ok: false, problem: 'no-rubric', path: ['rubric', 'criteria', index] };
    }
    // A model cannot tell two criteria named alike apart, so neither can a check.
    if (names.has(levelKey(name))) {
      return {
        ok: false,
        problem: 'duplicate-criteria',
        path: ['rubric', 'criteria', index, 'name'],
      };
    }
    names.add(levelKey(name));
    const levels = readRubricLevels(criterion.levels);
    if (!levels.ok) {
      return {
        ok: false,
        problem: 'unreadable-levels',
        path: ['rubric', 'criteria', index, 'levels'],
      };
    }
    criteria.push({
      name,
      ...(typeof description === 'string' ? { description } : {}),
      weight,
      levels: levels.levels,
    });
  }
  return { ok: true, criteria };
}

// ── Checking what comes back ───────────────────────────────────────────

type Refused = { ok: false; refusal: AiRefusal };

/**
 * The rubric's criteria by name, folded as level labels are: composed, trimmed,
 * spaced once, lower-cased. A model that writes "task achievement" for "Task
 * achievement" judged that criterion. The request refused a rubric with two
 * names alike once folded, so a folded name is one criterion's alone.
 */
function criterionIndex(
  rubric: readonly AiGradingCriterionFact[],
): (name: string) => number | undefined {
  const folded = new Map(rubric.map((criterion, index) => [levelKey(criterion.name), index]));
  return (name) => folded.get(levelKey(name));
}

/** A finite number. */
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * One criterion's judgement, on that criterion's scale: a level it has, with
 * any probabilities a distribution over its levels whose likeliest is the
 * level chosen; or, without levels, a score from 0 to its `maxScore` (1 by
 * default).
 */
function judgeCriterion(
  entry: Record<string, unknown>,
  criterion: AiGradingCriterionFact,
): { ok: true; judged: Omit<AiGradedCriterion, 'comment'> } | Refused {
  const { level, score, maxScore, probabilities } = entry;
  const levels = criterion.levels;
  if (levels === null) {
    if (level !== undefined || probabilities !== undefined) {
      return { ok: false, refusal: 'out-of-scale' };
    }
    if (score === undefined) {
      return { ok: false, refusal: 'misses-criteria' };
    }
    if (!isNumber(score) || (maxScore !== undefined && !isNumber(maxScore))) {
      return { ok: false, refusal: 'malformed' };
    }
    const max = maxScore ?? 1;
    if (!(max > 0) || score < 0 || score - max > max * 1e-9) {
      return { ok: false, refusal: 'out-of-scale' };
    }
    return { ok: true, judged: { name: criterion.name, score: Math.min(1, score / max) } };
  }
  if (score !== undefined || maxScore !== undefined) {
    return { ok: false, refusal: 'out-of-scale' };
  }
  if (level === undefined) {
    return { ok: false, refusal: 'misses-criteria' };
  }
  if (typeof level !== 'string') {
    return { ok: false, refusal: 'malformed' };
  }
  const chosen = levels.findIndex((one) => levelKey(one.label) === levelKey(level));
  if (chosen === -1) {
    return { ok: false, refusal: 'out-of-scale' };
  }
  const judged: Omit<AiGradedCriterion, 'comment'> = {
    name: criterion.name,
    level: (levels[chosen] as { label: string }).label,
    score: chosen / (levels.length - 1),
  };
  if (probabilities === undefined) {
    return { ok: true, judged };
  }
  if (!Array.isArray(probabilities)) {
    return { ok: false, refusal: 'malformed' };
  }
  const values = levelDistribution(probabilities, levels.length, chosen);
  if (values === null) {
    return { ok: false, refusal: 'out-of-scale' };
  }
  return { ok: true, judged: { ...judged, probabilities: values } };
}

/**
 * Checks a grade a port returned for `request`. Whole or nothing, as every AI
 * text is: a reply the SDK doubts in any part is refused, and is no grade —
 * re-ask the model or send the response to a person; never record a 0.
 *
 * - **Every criterion of the rubric, once** (`misses-criteria`). Names match as
 *   written, or folded when the folded name is one criterion's alone. Leaving
 *   one out, inventing or renaming one, judging one twice or calling one not
 *   applicable refuses the reply: a total renormalised over fewer criteria
 *   is a grade of a different task.
 * - **On each criterion's own scale** (`out-of-scale`). With levels: a `level`
 *   the criterion has, as labelled (case and spacing aside), and any
 *   `probabilities` a distribution over its levels, lowest first, whose
 *   likeliest is the level chosen. Without levels: a `score` from 0 to its
 *   `maxScore`, 1 by default.
 * - **Every correction quotes the response** (`misquotes-answer`), anchored as
 *   feedback on writing anchors it.
 * - **Text fields** — a criterion's `comment` (at most
 *   `AI_WRITING_MAX_FIELD_LENGTH` code points), `feedback` and `rationale`
 *   (at most `AI_TEXT_MAX_LENGTH`) — are plain text, cleaned; longer is
 *   `too-long`. `requiresHumanReview` is a boolean.
 *
 * The total is not computed here: `gradeFromJudgement` computes it, as
 * `gradeFromRubric` computes every grade in the SDK.
 */
export function checkAiGrading(
  raw: unknown,
  request: AiGradingRequest,
): { ok: true; judgement: AiGradingJudgement } | Refused {
  if (!isRecord(raw)) {
    return { ok: false, refusal: 'malformed' };
  }
  const { criteria: listed, feedback, corrections, rationale, requiresHumanReview } = raw;
  if (listed === undefined) {
    return { ok: false, refusal: 'misses-criteria' };
  }
  if (!Array.isArray(listed)) {
    return { ok: false, refusal: 'malformed' };
  }
  const rubric = request.facts.rubric;
  const indexOf = criterionIndex(rubric);
  const judged: (AiGradedCriterion | undefined)[] = rubric.map(() => undefined);
  for (const entry of listed) {
    if (!isRecord(entry)) {
      return { ok: false, refusal: 'malformed' };
    }
    // Each field read once, by name: a getter must not pass a check with one
    // value and hand on another. Not rest syntax, which a transpiler may lower
    // to a copy that reads the excluded fields again.
    const name = entry.name;
    const notApplicable = entry.notApplicable;
    const written = entry.comment;
    const scale = {
      level: entry.level,
      score: entry.score,
      maxScore: entry.maxScore,
      probabilities: entry.probabilities,
    };
    if (
      typeof name !== 'string' ||
      (notApplicable !== undefined && typeof notApplicable !== 'boolean')
    ) {
      return { ok: false, refusal: 'malformed' };
    }
    const index = indexOf(name);
    if (index === undefined || judged[index] !== undefined || notApplicable === true) {
      return { ok: false, refusal: 'misses-criteria' };
    }
    const criterion = rubric[index] as AiGradingCriterionFact;
    const scaled = judgeCriterion(scale, criterion);
    if (!scaled.ok) {
      return scaled;
    }
    const comment = textField(written, AI_WRITING_MAX_FIELD_LENGTH);
    if (!comment.ok) {
      return comment;
    }
    judged[index] = {
      ...scaled.judged,
      ...(comment.value !== undefined ? { comment: comment.value } : {}),
    };
  }
  if (judged.some((one) => one === undefined)) {
    return { ok: false, refusal: 'misses-criteria' };
  }
  const anchored = checkCorrections(corrections, request.facts.text);
  if (!anchored.ok) {
    return anchored;
  }
  const said = textField(feedback, AI_TEXT_MAX_LENGTH);
  if (!said.ok) {
    return said;
  }
  const why = textField(rationale, AI_TEXT_MAX_LENGTH);
  if (!why.ok) {
    return why;
  }
  if (requiresHumanReview !== undefined && typeof requiresHumanReview !== 'boolean') {
    return { ok: false, refusal: 'malformed' };
  }
  const provenance = provenanceOf(raw.provenance);
  const usage = usageOf(raw.usage);
  return {
    ok: true,
    judgement: {
      criteria: judged as AiGradedCriterion[],
      feedback: said.value ?? null,
      corrections: anchored.corrections,
      ...(why.value !== undefined ? { rationale: why.value } : {}),
      requiresHumanReview: requiresHumanReview === true,
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    },
  };
}
