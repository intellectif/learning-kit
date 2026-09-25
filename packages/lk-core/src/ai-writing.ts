import { aiAllowedByContent, aiSupports, readAiTextResult } from './ai.js';
import { cleanText, folded, needle } from './ai-text.js';
import { countWords } from './count-words.js';
import { gradeFromRubric } from './grading.js';
import type { LearnerResponse, WrittenResponseData } from './types/activity.js';
import type {
  AiActivityInput,
  AiRefusal,
  AiRubricCriterionFact,
  AiWritingFeedback,
  AiWritingFeedbackRequest,
} from './types/ai.js';
import type { CriterionScore, InlineCorrection } from './types/grading.js';

/** The most corrections one piece of writing feedback may carry. More is refused, not cut. */
export const AI_WRITING_MAX_CORRECTIONS = 20;

/** The longest quote, correction, explanation or criterion comment, in code points. */
export const AI_WRITING_MAX_FIELD_LENGTH = 500;

/** The longest `category` or `band`: a tag, not a sentence. */
const MAX_TAG_LENGTH = 40;

/**
 * The request for feedback on a draft, or `null` when there is none to give:
 * not a written response, an author who switched explanations off (writing
 * feedback reads `ai.explanations`), a redacted item — feedback is for
 * practice, where the item is whole — or a draft with nothing in it.
 *
 * The facts are the task as the learner saw it, the draft verbatim with its
 * word count recomputed as the grader will count it, and the rubric the answer
 * will be graded on. `previousFeedback` is the text of the feedback already
 * shown on earlier drafts, so a model can speak to what changed.
 */
export function aiWritingFeedbackRequest(input: {
  data: AiActivityInput;
  response: LearnerResponse | null;
  previousFeedback?: readonly string[];
  learnerLocale?: string;
}): AiWritingFeedbackRequest | null {
  const { data, response, learnerLocale } = input;
  if (
    !aiSupports(data.type, 'writing-feedback') ||
    !aiAllowedByContent(data, 'writing-feedback') ||
    (data as { redacted?: unknown }).redacted === true
  ) {
    return null;
  }
  const text = response?.type === 'written-response' ? response.text : '';
  if (typeof text !== 'string' || text.trim() === '') {
    return null;
  }
  const item = data as unknown as WrittenResponseData;
  const wordCount = countWords(text);
  const minWords = typeof item.minWords === 'number' ? item.minWords : 0;
  const maxWords = typeof item.maxWords === 'number' ? item.maxWords : Number.POSITIVE_INFINITY;
  const criteria = Array.isArray(item.rubric?.criteria) ? item.rubric.criteria : null;
  const rubric: AiRubricCriterionFact[] | null =
    criteria === null || criteria.length === 0
      ? null
      : criteria.map((criterion) => ({
          name: criterion.name,
          ...(typeof criterion.description === 'string'
            ? { description: criterion.description }
            : {}),
          weight: criterion.weight,
        }));
  const previousFeedback = [...(input.previousFeedback ?? [])];
  return {
    feature: 'writing-feedback',
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
      rubric,
      ...(typeof item.languageTarget === 'string' ? { languageTarget: item.languageTarget } : {}),
    },
    draftNumber: previousFeedback.length + 1,
    previousFeedback,
    ...(learnerLocale !== undefined ? { learnerLocale } : {}),
  };
}

// ── Finding a quote in the draft ───────────────────────────────────────

/**
 * Where `quote` sits in the draft: at `claimed`, when the model named a range —
 * which must then hold the quote — or else at its first occurrence not already
 * taken by an identical quote, so a mistake made twice is anchored twice. A
 * quote corrected more often than it occurs takes its first occurrence again.
 * `null` when the draft does not contain it where claimed, or at all.
 */
function anchor(
  draft: { text: string; chars: string; from: number[] },
  quote: string,
  claimed: { start: number; end: number } | undefined,
  taken: Set<string>,
): { start: number; end: number } | null {
  const sought = needle(quote);
  if (sought === '') {
    return null;
  }
  if (claimed !== undefined) {
    const { start, end } = claimed;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end > draft.text.length ||
      start >= end
    ) {
      return null;
    }
    const span = draft.text.slice(start, end);
    if (needle(span) !== sought) {
      return null;
    }
    // The span, without whitespace the model's range took in at either end.
    const lead = span.length - span.trimStart().length;
    const trail = span.length - span.trimEnd().length;
    return { start: start + lead, end: end - trail };
  }
  let first: { start: number; end: number } | null = null;
  for (let at = draft.chars.indexOf(sought); at !== -1; at = draft.chars.indexOf(sought, at + 1)) {
    const start = draft.from[at] as number;
    const end = (draft.from[at + sought.length - 1] as number) + 1;
    const found = { start, end };
    first ??= found;
    const key = `${start}:${end}`;
    if (!taken.has(key)) {
      taken.add(key);
      return found;
    }
  }
  return first;
}

// ── Checking what comes back ───────────────────────────────────────────

/** A field that must be a string, at most `max` code points once cleaned; `undefined` when absent. */
function textField(
  value: unknown,
  max: number,
): { ok: true; value: string | undefined } | { ok: false; refusal: AiRefusal } {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, refusal: 'malformed' };
  }
  const cleaned = cleanText(value);
  if ([...cleaned].length > max) {
    return { ok: false, refusal: 'too-long' };
  }
  return { ok: true, value: cleaned === '' ? undefined : cleaned };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The corrections, each anchored in the draft, or why the reply is refused. */
function checkCorrections(
  raw: unknown,
  text: string,
): { ok: true; corrections: InlineCorrection[] } | { ok: false; refusal: AiRefusal } {
  if (raw === undefined || raw === null) {
    return { ok: true, corrections: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, refusal: 'malformed' };
  }
  if (raw.length > AI_WRITING_MAX_CORRECTIONS) {
    return { ok: false, refusal: 'too-long' };
  }
  const draft = { text, ...folded(text) };
  const taken = new Set<string>();
  const corrections: InlineCorrection[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.original !== 'string') {
      return { ok: false, refusal: 'malformed' };
    }
    if (typeof entry.corrected !== 'string') {
      return { ok: false, refusal: 'malformed' };
    }
    if (
      [...entry.original].length > AI_WRITING_MAX_FIELD_LENGTH ||
      [...entry.corrected].length > AI_WRITING_MAX_FIELD_LENGTH
    ) {
      return { ok: false, refusal: 'too-long' };
    }
    // A correction that changes nothing corrects nothing.
    if (needle(entry.original) === needle(entry.corrected)) {
      return { ok: false, refusal: 'malformed' };
    }
    const explanation = textField(entry.explanation, AI_WRITING_MAX_FIELD_LENGTH);
    const category = textField(entry.category, MAX_TAG_LENGTH);
    if (!explanation.ok) {
      return explanation;
    }
    if (!category.ok) {
      return category;
    }
    let claimed: { start: number; end: number } | undefined;
    if (entry.range !== undefined && entry.range !== null) {
      if (!isRecord(entry.range)) {
        return { ok: false, refusal: 'malformed' };
      }
      claimed = { start: entry.range.start as number, end: entry.range.end as number };
    }
    const at = anchor(draft, entry.original, claimed, taken);
    if (at === null) {
      return { ok: false, refusal: 'misquotes-answer' };
    }
    corrections.push({
      original: text.slice(at.start, at.end),
      corrected: cleanText(entry.corrected),
      ...(explanation.value !== undefined ? { explanation: explanation.value } : {}),
      ...(category.value !== undefined ? { category: category.value } : {}),
      range: at,
    });
  }
  return { ok: true, corrections };
}

/** A criterion score a grade could be computed from: finite, 0 or more, and not above its maximum. */
function isJudgedScore(score: unknown, maxScore: unknown): boolean {
  if (score === undefined) {
    return maxScore === undefined || (typeof maxScore === 'number' && maxScore > 0);
  }
  const max = maxScore ?? 1;
  return (
    typeof score === 'number' &&
    typeof max === 'number' &&
    Number.isFinite(score) &&
    Number.isFinite(max) &&
    max > 0 &&
    score >= 0 &&
    score - max <= max * 1e-9
  );
}

/** The judgements, each on a criterion the author wrote and weighted as the author weighted it. */
function checkCriteria(
  raw: unknown,
  rubric: readonly AiRubricCriterionFact[] | null,
): { ok: true; criteria: CriterionScore[] } | { ok: false; refusal: AiRefusal } {
  if (raw === undefined || raw === null) {
    return { ok: true, criteria: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, refusal: 'malformed' };
  }
  if (raw.length === 0) {
    return { ok: true, criteria: [] };
  }
  // Judging a criterion the author did not write is judging a different task.
  if (rubric === null) {
    return { ok: false, refusal: 'malformed' };
  }
  const weights = new Map(rubric.map((criterion) => [criterion.name, criterion.weight]));
  const seen = new Set<string>();
  const criteria: CriterionScore[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.name !== 'string') {
      return { ok: false, refusal: 'malformed' };
    }
    const weight = weights.get(entry.name);
    if (weight === undefined || seen.has(entry.name)) {
      return { ok: false, refusal: 'malformed' };
    }
    seen.add(entry.name);
    if (!isJudgedScore(entry.score, entry.maxScore)) {
      return { ok: false, refusal: 'malformed' };
    }
    if (entry.notApplicable !== undefined && typeof entry.notApplicable !== 'boolean') {
      return { ok: false, refusal: 'malformed' };
    }
    const band = textField(entry.band, MAX_TAG_LENGTH);
    const comment = textField(entry.comment, AI_WRITING_MAX_FIELD_LENGTH);
    if (!band.ok) {
      return band;
    }
    if (!comment.ok) {
      return comment;
    }
    criteria.push({
      name: entry.name,
      ...(typeof entry.score === 'number' ? { score: entry.score } : {}),
      ...(typeof entry.maxScore === 'number' ? { maxScore: entry.maxScore } : {}),
      ...(band.value !== undefined ? { band: band.value } : {}),
      ...(comment.value !== undefined ? { comment: comment.value } : {}),
      ...(entry.notApplicable === true ? { notApplicable: true } : {}),
      weight,
    });
  }
  return { ok: true, criteria };
}

/**
 * Checks writing feedback a port returned for `request`, and turns it into what
 * a learner is shown. The SDK shows a model's feedback whole or not at all: it
 * never drops the part it doubts and shows the rest.
 *
 * - **The text** is read as every AI text is (`readAiTextResult`): plain text,
 *   not empty, at most {@link AI_TEXT_MAX_LENGTH} code points.
 * - **Every correction must quote the draft** — the check only this SDK can run.
 *   The SDK finds each quote in the draft itself, typographic quotes and runs of
 *   whitespace aside, and anchors it there; a range the model claims must hold
 *   the quote. A correction of words the learner did not write refuses the
 *   whole reply as `misquotes-answer`, as a hint that gives the answer away
 *   refuses the hint. The `original` shown is the draft's own text at the range.
 *   At most {@link AI_WRITING_MAX_CORRECTIONS}; a correction that changes
 *   nothing is `malformed`.
 * - **Criteria are judgements; the arithmetic is the SDK's.** Each names a
 *   criterion of the item's rubric, once; its score, when it has one, is a
 *   score out of its `maxScore`. The rubric's weights are attached, whatever
 *   the model sent. Anything else is `malformed`, as is any criterion on an
 *   item with no rubric.
 * - **`indicativeScore`** is the rubric's weighted total, computed as
 *   `gradeFromRubric` computes a grade, when every criterion of the rubric was
 *   judged; `null` otherwise. An indication, never a grade.
 */
export function checkAiWritingFeedback(
  raw: unknown,
  request: AiWritingFeedbackRequest,
): { ok: true; feedback: AiWritingFeedback } | { ok: false; refusal: AiRefusal } {
  const read = readAiTextResult(raw);
  if (!read.ok) {
    return read;
  }
  const record = raw as Record<string, unknown>;
  const corrections = checkCorrections(record.corrections, request.facts.text);
  if (!corrections.ok) {
    return corrections;
  }
  const rubric = request.facts.rubric;
  const criteria = checkCriteria(record.criteria, rubric);
  if (!criteria.ok) {
    return criteria;
  }
  let indicativeScore: number | null = null;
  const judged = new Set(criteria.criteria.map((criterion) => criterion.name));
  if (rubric?.every((criterion) => judged.has(criterion.name))) {
    const grade = gradeFromRubric(criteria.criteria);
    indicativeScore = 'unscorable' in grade ? null : grade.score;
  }
  const { text, provenance, usage } = read.result;
  return {
    ok: true,
    feedback: {
      text,
      corrections: corrections.corrections,
      criteria: criteria.criteria,
      indicativeScore,
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    },
  };
}
