import { cleanText } from './ai-text.js';
import { PLACEHOLDER_RE } from './schemas/fill-in-the-blanks.js';
import { alignDictation } from './scoring/dictation/align.js';
import { isGradeInRange } from './scoring/grade-numbers.js';
import { score } from './scoring/index.js';
import type {
  ActivityData,
  DictationData,
  FillInTheBlanksData,
  GapSelectData,
  ItemOutcome,
  LearnerResponse,
  MultipleChoiceData,
  ScoringDetail,
} from './types/activity.js';
import type {
  AiActivityInput,
  AiExplanationRequest,
  AiFeature,
  AiGrade,
  AiHintRequest,
  AiItemFacts,
  AiProvenance,
  AiRefusal,
  AiSupportedActivityType,
  AiTextResult,
  AiVerdict,
  AiWordFact,
} from './types/ai.js';
import type { GraderUsage } from './types/grading.js';

/**
 * The activity types the SDK builds facts for, and which of them take hints.
 * A dictation takes none: its answer is the whole sentence, and it has
 * word-by-word hints of its own.
 */
export const AI_EXPLANATION_TYPES: readonly AiSupportedActivityType[] = [
  'multiple-choice',
  'fill-in-the-blanks',
  'gap-select',
  'dictation',
];
export const AI_HINT_TYPES: readonly AiSupportedActivityType[] = [
  'multiple-choice',
  'fill-in-the-blanks',
  'gap-select',
];

/** The longest AI text shown, in code points. Longer is refused, not cut. */
export const AI_TEXT_MAX_LENGTH = 2000;

/**
 * Whether the SDK supports `feature` for this activity type: explanations and
 * hints for the types it builds facts for, and writing feedback for a written
 * response, and coaching for a read-aloud. A consumer's own type has none.
 */
export function aiSupports(activityType: string, feature: AiFeature): boolean {
  if (feature === 'writing-feedback') {
    return activityType === 'written-response';
  }
  if (feature === 'pronunciation-coaching') {
    return activityType === 'read-aloud';
  }
  const types = feature === 'hint' ? AI_HINT_TYPES : AI_EXPLANATION_TYPES;
  return (types as readonly string[]).includes(activityType);
}

/**
 * Whether the item's author allows `feature`. Only an explicit `false`
 * switches it off: an author can refuse a feature, never force one on.
 *
 * Writing feedback and pronunciation coaching read `explanations`: each is a
 * model's words about the learner's own answer, and an author who switched one
 * off has switched off the others.
 */
export function aiAllowedByContent(data: AiActivityInput, feature: AiFeature): boolean {
  const permissions = (data as { ai?: unknown }).ai;
  if (typeof permissions !== 'object' || permissions === null) {
    return true;
  }
  const key = feature === 'hint' ? 'hints' : 'explanations';
  return (permissions as Record<string, unknown>)[key] !== false;
}

/** A grade as an explanation must speak to it: all marks, some, or none. */
export function aiGradeOf(result: { score: number; maxScore: number; passed: boolean }): AiGrade {
  const ratio = result.maxScore > 0 ? result.score / result.maxScore : 0;
  let category: AiVerdict = 'partly-correct';
  if (ratio >= 1 - 1e-9) {
    category = 'correct';
  } else if (ratio <= 1e-9) {
    category = 'incorrect';
  }
  return { score: result.score, maxScore: result.maxScore, passed: result.passed, category };
}

// ── Facts ──────────────────────────────────────────────────────────────

/**
 * The ids of a passage's placeholders, in the order they appear. Read with the
 * schema's own expression, so a passage means here what it means to validation.
 */
function placeholderOrder(passage: string): string[] {
  return [...passage.matchAll(PLACEHOLDER_RE)].map((match) => match[1] as string);
}

/** The passage with each placeholder written as `[n]`, in passage order. */
function numberedPassage(passage: string): string {
  let position = 0;
  return passage.replace(PLACEHOLDER_RE, () => {
    position += 1;
    return `[${position}]`;
  });
}

/**
 * The `correct` flag a detail stored before 0.3 carries instead of an
 * `outcome`. On a blank, a gap or a word it meant the part was right; on a
 * multiple-choice option, that the learner acted rightly on it.
 */
const legacyCorrect = (detail: ScoringDetail): boolean =>
  (detail as { correct?: unknown }).correct === true;

/** Whether a blank, a gap or a word was right, read from a server's detail. */
function detailRight(detail: ScoringDetail): boolean {
  const outcome: unknown = detail.outcome;
  return outcome === undefined ? legacyCorrect(detail) : outcome === 'correct';
}

/** Whether an option is part of the answer, read from a server's detail (as the renderer reads it). */
function isAnswerOption(detail: ScoringDetail, chosen: boolean): boolean {
  switch (detail.outcome) {
    case 'correct':
    case 'incorrect-omission':
      return true;
    case 'incorrect':
    case 'correct-omission':
      return false;
    default:
      return chosen ? legacyCorrect(detail) : !legacyCorrect(detail);
  }
}

const firstString = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const listOf = (value: string | string[] | undefined): string[] | null =>
  value === undefined ? null : Array.isArray(value) ? [...value] : [value];

/** The response a learner has before touching anything. */
function emptyResponse(type: string): LearnerResponse | null {
  switch (type) {
    case 'multiple-choice':
      return { type: 'multiple-choice', selectedOptionIds: [] };
    case 'fill-in-the-blanks':
      return { type: 'fill-in-the-blanks', answers: {} };
    case 'gap-select':
      return { type: 'gap-select', selections: {} };
    case 'dictation':
      return { type: 'dictation', text: '' };
    default:
      return null;
  }
}

const base = (data: AiActivityInput) => ({
  activityId: data.id,
  title: data.title,
  ...(typeof data.locale === 'string' ? { locale: data.locale } : {}),
});

/**
 * The facts a model is given about one item and one answer. `details` are the
 * SDK's per-part verdicts — from its own scorer, or from a server's outcome in
 * review — and every `correct` is `null` without them. A redacted item yields
 * facts without a key, which is what the learner's side holds; a port that
 * needs the key loads the item on its server.
 *
 * `null` for a type the SDK builds no facts for.
 */
export function buildAiFacts(
  data: AiActivityInput,
  response: LearnerResponse | null,
  details: readonly ScoringDetail[] | null,
): AiItemFacts | null {
  const byId = new Map((details ?? []).map((detail) => [detail.itemId, detail]));
  const full = (data as { redacted?: unknown }).redacted !== true;
  switch (data.type) {
    case 'multiple-choice': {
      const item = data as unknown as MultipleChoiceData;
      const chosen = new Set(
        response?.type === 'multiple-choice' ? response.selectedOptionIds : [],
      );
      return {
        ...base(data),
        activityType: 'multiple-choice',
        question: item.question,
        mode: item.mode,
        options: item.options.map((option) => {
          const detail = byId.get(option.id);
          const wasChosen = chosen.has(option.id);
          let correct: boolean | null = null;
          if (full && typeof option.isCorrect === 'boolean') {
            correct = option.isCorrect;
          } else if (detail !== undefined) {
            correct = isAnswerOption(detail, wasChosen);
          }
          return {
            id: option.id,
            text: option.text,
            chosen: wasChosen,
            correct,
            ...(typeof option.feedback === 'string' ? { feedback: option.feedback } : {}),
          };
        }),
      };
    }
    case 'fill-in-the-blanks': {
      const item = data as unknown as FillInTheBlanksData;
      const answers = response?.type === 'fill-in-the-blanks' ? response.answers : {};
      const blanks = new Map(item.blanks.map((blank) => [blank.id, blank]));
      return {
        ...base(data),
        activityType: 'fill-in-the-blanks',
        passage: numberedPassage(item.passage),
        blanks: placeholderOrder(item.passage).map((id, index) => {
          const blank = blanks.get(id);
          const detail = byId.get(id);
          const accepted =
            full && Array.isArray(blank?.acceptedAnswers)
              ? [...blank.acceptedAnswers]
              : listOf(detail?.correctResponse);
          return {
            id,
            position: index + 1,
            typed: typeof answers[id] === 'string' ? (answers[id] as string) : '',
            accepted,
            correct: detail === undefined ? null : detailRight(detail),
            ...(typeof blank?.hint === 'string' ? { hint: blank.hint } : {}),
            ...(typeof blank?.feedback === 'string' ? { feedback: blank.feedback } : {}),
          };
        }),
      };
    }
    case 'gap-select': {
      const item = data as unknown as GapSelectData;
      const selections = response?.type === 'gap-select' ? response.selections : {};
      const gaps = new Map(item.gaps.map((gap) => [gap.id, gap]));
      const banks = new Map((item.banks ?? []).map((bank) => [bank.id, bank]));
      return {
        ...base(data),
        activityType: 'gap-select',
        passage: numberedPassage(item.passage),
        gaps: placeholderOrder(item.passage).map((id, index) => {
          const gap = gaps.get(id);
          const choices =
            gap?.choices ??
            (gap?.bankId === undefined ? [] : (banks.get(gap.bankId)?.choices ?? []));
          const textOf = (choiceId: string | undefined): string | null =>
            choiceId === undefined
              ? null
              : (choices.find((choice) => choice.id === choiceId)?.text ?? null);
          const detail = byId.get(id);
          const answerId =
            full && typeof gap?.correctChoiceId === 'string'
              ? gap.correctChoiceId
              : firstString(detail?.correctResponse);
          return {
            id,
            position: index + 1,
            choices: choices.map((choice) => choice.text),
            chosen: textOf(selections[id]),
            answer: textOf(answerId),
            correct: detail === undefined ? null : detailRight(detail),
            ...(typeof gap?.feedback === 'string' ? { feedback: gap.feedback } : {}),
          };
        }),
      };
    }
    case 'dictation': {
      const item = data as unknown as DictationData;
      const typed = response?.type === 'dictation' ? response.text : '';
      const hasKey = full && typeof item.transcript === 'string';
      let words: AiWordFact[] | null = null;
      if (hasKey) {
        words = alignDictation(item, typed).words.map((word) => ({
          expected: word.reference,
          typed: word.attempt,
          status: word.status,
        }));
      } else if (details !== null && details.length > 0) {
        words = details.map((detail) => {
          const expected = firstString(detail.correctResponse) ?? '';
          const attempt = firstString(detail.learnerResponse) ?? '';
          let status: 'correct' | 'incorrect' | 'missing' | 'extra' = 'incorrect';
          if (detailRight(detail)) {
            status = 'correct';
          } else if (attempt === '') {
            status = 'missing';
          } else if (expected === '') {
            status = 'extra';
          }
          return { expected, typed: attempt, status };
        });
      }
      return {
        ...base(data),
        activityType: 'dictation',
        transcript: hasKey ? item.transcript : null,
        typed,
        words,
      };
    }
    default:
      return null;
  }
}

/** The SDK's own grade of `response`, with its per-part details; `null` when it cannot grade. */
function gradeLocally(
  data: AiActivityInput,
  response: LearnerResponse,
): { details: ScoringDetail[]; grade: AiGrade } | null {
  if ((data as { redacted?: unknown }).redacted === true) {
    return null;
  }
  try {
    const result = score(data.type as never, data as unknown as ActivityData, response);
    return { details: result.details, grade: aiGradeOf(result) };
  } catch {
    return null;
  }
}

/**
 * The request for an explanation of `response`, or `null` when there is none
 * to give: an unsupported type, an author who switched explanations off,
 * nothing graded to explain, or a grade of record that cannot be a grade.
 *
 * A scored `outcome` — the grade of record a review shows — wins over grading
 * locally, so the explanation speaks to the grade on the screen. One whose
 * numbers cannot be a grade (the rule `outcomeFromGrade` applies: `maxScore`
 * positive and finite, `score` finite from 0 to it) gets no explanation at all:
 * explaining 85 "out of 1" would tell the model a wrong answer was correct, and
 * grading locally instead would speak to a grade the screen does not show.
 */
export function aiExplanationRequest(input: {
  data: AiActivityInput;
  response: LearnerResponse | null;
  outcome?: ItemOutcome;
  learnerLocale?: string;
}): AiExplanationRequest | null {
  const { data, response, outcome, learnerLocale } = input;
  if (!aiSupports(data.type, 'explanation') || !aiAllowedByContent(data, 'explanation')) {
    return null;
  }
  let details: ScoringDetail[] | null = null;
  let grade: AiGrade | null = null;
  if (outcome?.status === 'scored') {
    // Read once, so the check and the grade handed on see the same numbers.
    const { score: recorded, maxScore, passed } = outcome;
    if (!isGradeInRange(recorded, maxScore)) {
      return null;
    }
    details = outcome.details;
    grade = aiGradeOf({ score: recorded, maxScore, passed });
  } else if (response !== null) {
    const local = gradeLocally(data, response);
    if (local !== null) {
      details = local.details;
      grade = local.grade;
    }
  }
  if (grade === null) {
    return null;
  }
  const facts = buildAiFacts(data, response, details);
  if (facts === null) {
    return null;
  }
  return {
    feature: 'explanation',
    facts,
    grade,
    ...(learnerLocale !== undefined ? { learnerLocale } : {}),
  };
}

/**
 * The request for the next hint on an unsubmitted answer, or `null` when
 * there is none to give: an unsupported type, an author who switched hints
 * off, or a redacted item — hints are for practice, where the item is whole.
 *
 * The facts carry the key, and which parts the learner has right so far, so a
 * model can hint where it helps. The learner never sees them; a hint that
 * contains an answer is refused by {@link checkAiHint}.
 */
export function aiHintRequest(input: {
  data: AiActivityInput;
  response: LearnerResponse | null;
  previousHints: readonly string[];
  learnerLocale?: string;
}): AiHintRequest | null {
  const { data, previousHints, learnerLocale } = input;
  if (
    !aiSupports(data.type, 'hint') ||
    !aiAllowedByContent(data, 'hint') ||
    (data as { redacted?: unknown }).redacted === true
  ) {
    return null;
  }
  const response = input.response ?? emptyResponse(data.type);
  const local = response === null ? null : gradeLocally(data, response);
  const facts = buildAiFacts(data, response, local?.details ?? null);
  if (facts === null) {
    return null;
  }
  return {
    feature: 'hint',
    facts,
    hintNumber: previousHints.length + 1,
    previousHints: [...previousHints],
    ...(learnerLocale !== undefined ? { learnerLocale } : {}),
  };
}

// ── Checking what comes back ───────────────────────────────────────────

const VERDICTS: readonly string[] = ['correct', 'partly-correct', 'incorrect'];

/** A provenance field a host may send, kept only when it is a short string. */
function provenanceOf(raw: unknown): AiProvenance | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const kept: AiProvenance = {};
  for (const key of ['model', 'promptHash', 'generatedAt'] as const) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) {
      kept[key] = value;
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * What the call cost, as a port reported it. Read on the same terms as the
 * provenance: a number that is not finite and zero or more says nothing about
 * a cost, so it is dropped rather than carried into a host's totals.
 */
function usageOf(raw: unknown): GraderUsage | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const kept: GraderUsage = {};
  for (const key of ['promptTokens', 'completionTokens', 'costUsd'] as const) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      kept[key] = value;
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * Reads what a port returned. Anything but an object with a string `text` is
 * `malformed`; text that is empty once cleaned, or longer than
 * {@link AI_TEXT_MAX_LENGTH}, is refused rather than shown or cut.
 */
export function readAiTextResult(
  raw: unknown,
): { ok: true; result: AiTextResult } | { ok: false; refusal: AiRefusal } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, refusal: 'malformed' };
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.text !== 'string') {
    return { ok: false, refusal: 'malformed' };
  }
  if (record.verdict !== undefined && !VERDICTS.includes(record.verdict as string)) {
    return { ok: false, refusal: 'malformed' };
  }
  const text = cleanText(record.text);
  if (text === '') {
    return { ok: false, refusal: 'empty' };
  }
  if ([...text].length > AI_TEXT_MAX_LENGTH) {
    return { ok: false, refusal: 'too-long' };
  }
  const provenance = provenanceOf(record.provenance);
  const usage = usageOf(record.usage);
  return {
    ok: true,
    result: {
      text,
      ...(record.verdict !== undefined ? { verdict: record.verdict as AiVerdict } : {}),
      ...(provenance !== undefined ? { provenance } : {}),
      ...(usage !== undefined ? { usage } : {}),
    },
  };
}

/**
 * Checks an explanation a port returned for `request`. On top of
 * {@link readAiTextResult}: an explanation that states a verdict other than
 * the SDK's grade is refused (`contradicts-grade`) — it explains an answer
 * the learner did not get.
 */
export function checkAiExplanation(
  raw: unknown,
  request: AiExplanationRequest,
): { ok: true; result: AiTextResult } | { ok: false; refusal: AiRefusal } {
  const read = readAiTextResult(raw);
  if (!read.ok) {
    return read;
  }
  if (read.result.verdict !== undefined && read.result.verdict !== request.grade.category) {
    return { ok: false, refusal: 'contradicts-grade' };
  }
  return read;
}

/**
 * Checks a hint a port returned for `request`. On top of
 * {@link readAiTextResult}: a hint that contains an answer is refused
 * (`reveals-answer`) — see {@link hintRevealsAnswer}.
 */
export function checkAiHint(
  raw: unknown,
  request: AiHintRequest,
): { ok: true; result: AiTextResult } | { ok: false; refusal: AiRefusal } {
  const read = readAiTextResult(raw);
  if (!read.ok) {
    return read;
  }
  if (hintRevealsAnswer(request.facts, read.result.text)) {
    return { ok: false, refusal: 'reveals-answer' };
  }
  return read;
}

// ── The answer-leak guard ──────────────────────────────────────────────

/**
 * Text folded for searching: compatibility forms read as what they stand for,
 * accents and other marks removed, lower-cased, and every run of anything but
 * letters and digits turned into one space. "Está," and "esta" fold alike.
 */
function fold(text: string): string[] {
  const folded = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return folded === '' ? [] : folded.split(' ');
}

/** Whether `needle` appears in `haystack` as a run of whole words. */
function containsWords(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) {
    return false;
  }
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let match = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        match = false;
        break;
      }
    }
    if (match) {
      return true;
    }
  }
  return false;
}

/**
 * An answer too short to search for on its own: one word of fewer than four
 * characters — "is", "the", "26". A hint may use such a word freely; it
 * reveals the answer only when it writes it where the answer goes.
 */
const isShort = (words: readonly string[]): boolean =>
  words.length === 1 && [...(words[0] as string)].length < 4;

/**
 * The words either side of the gap numbered `position` in a numbered
 * passage, other gaps left out.
 */
function neighbours(passage: string, position: number): { before?: string; after?: string } {
  const marker = `[${position}]`;
  const at = passage.indexOf(marker);
  if (at === -1) {
    return {};
  }
  const strip = (text: string): string => text.replace(/\[\d+\]/g, ' ');
  const left = fold(strip(passage.slice(0, at)));
  const right = fold(strip(passage.slice(at + marker.length)));
  const before = left[left.length - 1];
  const after = right[0];
  return {
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
  };
}

/**
 * Whether a hint gives away an answer, judged against the facts it was asked
 * for. It is a floor, not a proof: it finds an answer written out, not one
 * spelled letter by letter or described.
 *
 * - **Multiple choice:** the text of any correct option, as whole words.
 * - **Fill-in-the-blanks and gap select:** any accepted answer, as whole words.
 *   An answer of one short word ("is", "the") counts only where the hint
 *   writes it beside a neighbour it has in the passage — "name is", "is
 *   Rossi" — so a hint may still use the word on its own.
 *
 * Case, accents and punctuation are ignored on both sides.
 */
export function hintRevealsAnswer(facts: AiItemFacts, hint: string): boolean {
  const words = fold(hint);
  const reveals = (answer: string, passage?: string, position?: number): boolean => {
    const needle = fold(answer);
    if (needle.length === 0) {
      return false;
    }
    if (!isShort(needle) || passage === undefined || position === undefined) {
      return containsWords(words, needle);
    }
    const { before, after } = neighbours(passage, position);
    if (before === undefined && after === undefined) {
      return containsWords(words, needle);
    }
    return (
      (before !== undefined && containsWords(words, [before, ...needle])) ||
      (after !== undefined && containsWords(words, [...needle, after]))
    );
  };
  switch (facts.activityType) {
    case 'multiple-choice':
      return facts.options.some((option) => option.correct === true && reveals(option.text));
    case 'fill-in-the-blanks':
      return facts.blanks.some((blank) =>
        (blank.accepted ?? []).some((answer) => reveals(answer, facts.passage, blank.position)),
      );
    case 'gap-select':
      return facts.gaps.some(
        (gap) => gap.answer !== null && reveals(gap.answer, facts.passage, gap.position),
      );
    case 'dictation':
      // Never asked: a dictation takes no AI hints (AI_HINT_TYPES).
      return false;
    default:
      return false;
  }
}
