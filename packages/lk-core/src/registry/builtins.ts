import type { z } from 'zod/v4';
import { countWords } from '../count-words.js';
import { FillInTheBlanksDataSchema } from '../schemas/fill-in-the-blanks.js';
import { MultipleChoiceDataSchema } from '../schemas/multiple-choice.js';
import {
  RedactedFillInTheBlanksDataSchema,
  RedactedMultipleChoiceDataSchema,
  RedactedWrittenResponseDataSchema,
} from '../schemas/redacted.js';
import { WrittenResponseDataSchema } from '../schemas/written-response.js';
import { scoreFillInTheBlanks } from '../scoring/activity-scorers/fill-in-the-blanks.js';
import { scoreMultipleChoice } from '../scoring/activity-scorers/multiple-choice.js';
import type {
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse,
  MultipleChoiceData,
  MultipleChoiceLearnerResponse,
  WrittenResponseData,
  WrittenResponseLearnerResponse,
} from '../types/activity.js';
import { defineActivityType, type FieldPolicy, registerActivityType } from './registry.js';

/**
 * Field-sensitivity policies for the built-in types (R7). Fail-closed:
 * anything not listed here is dropped by `redact()`. `scoringStrategy` is
 * answer-key everywhere — MC `partial` penalises wrong selections while
 * `all-or-nothing` does not, so the strategy reveals whether guessing is
 * free. Authored feedback is answer-key (it may quote or hint the answer);
 * rubrics are author-only (grader assets).
 */
const SHARED_PUBLIC_FIELDS: FieldPolicy = {
  schemaVersion: 'public',
  type: 'public',
  id: 'public',
  title: 'public',
  media: 'public',
  passThreshold: 'public',
  locale: 'public',
  learningObjectives: 'public',
  difficultyLevel: 'public',
};

const MULTIPLE_CHOICE_FIELD_POLICY: FieldPolicy = {
  ...SHARED_PUBLIC_FIELDS,
  question: 'public',
  questionHtml: 'public',
  mode: 'public',
  shuffle: 'public',
  scoringStrategy: 'answer-key',
  feedback: 'answer-key',
  options: {
    id: 'public',
    text: 'public',
    isCorrect: 'answer-key',
    feedback: 'answer-key',
  },
};

const FILL_IN_THE_BLANKS_FIELD_POLICY: FieldPolicy = {
  ...SHARED_PUBLIC_FIELDS,
  passage: 'public',
  passageHtml: 'public',
  scoringStrategy: 'answer-key',
  feedback: 'answer-key',
  blanks: {
    id: 'public',
    hint: 'public',
    acceptedAnswers: 'answer-key',
    caseSensitive: 'answer-key',
    trimWhitespace: 'answer-key',
    match: 'answer-key',
    feedback: 'answer-key',
  },
};

const WRITTEN_RESPONSE_FIELD_POLICY: FieldPolicy = {
  ...SHARED_PUBLIC_FIELDS,
  prompt: 'public',
  promptHtml: 'public',
  minWords: 'public',
  maxWords: 'public',
  languageTarget: 'public',
  feedback: 'answer-key',
  // A rubric is a LEARNER affordance, not a grader secret: it tells the
  // learner what they are being graded on, which is pedagogically the point
  // of publishing one. (Classifying it author-only broke real deployments
  // that render a rubric panel during the attempt.) A deployment that wants
  // it hidden can tighten this per call via `redact(data, { policy })`.
  rubric: 'public',
};

/** Built-in Multiple Choice descriptor. */
export const multipleChoiceType = defineActivityType<
  MultipleChoiceData,
  MultipleChoiceLearnerResponse
>({
  type: 'multiple-choice',
  // zod4 optional outputs are `T | undefined`; the hand-written wire types use
  // exact optionals. Structurally identical at runtime — cast is type-level only.
  schema: MultipleChoiceDataSchema as unknown as z.ZodType<MultipleChoiceData>,
  scoring: { kind: 'sync', score: scoreMultipleChoice },
  isAnswered: (response) => (response?.selectedOptionIds.length ?? 0) > 0,
  fieldPolicy: MULTIPLE_CHOICE_FIELD_POLICY,
  redactedSchema: RedactedMultipleChoiceDataSchema,
  interop: {
    xapiActivityTypeIri: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    xapiInteractionType: 'choice',
    correctResponsesPattern: (data) => [
      data.options
        .filter((option) => option.isCorrect)
        .map((option) => option.id)
        .join('[,]'),
    ],
  },
  interactions: ['option-selected', 'option-deselected', 'submitted'],
});

/** Built-in Fill-in-the-Blanks descriptor. */
export const fillInTheBlanksType = defineActivityType<
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse
>({
  type: 'fill-in-the-blanks',
  schema: FillInTheBlanksDataSchema as unknown as z.ZodType<FillInTheBlanksData>,
  scoring: { kind: 'sync', score: scoreFillInTheBlanks },
  isAnswered: (response) =>
    Object.values(response?.answers ?? {}).some((answer) => answer.trim().length > 0),
  fieldPolicy: FILL_IN_THE_BLANKS_FIELD_POLICY,
  redactedSchema: RedactedFillInTheBlanksDataSchema,
  interop: {
    xapiActivityTypeIri: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    xapiInteractionType: 'fill-in',
    // xAPI fill-in pattern: blank answers joined with "[,]". Only the first
    // accepted answer per blank is emitted (full alternates would explode
    // combinatorially); the complete key lives in the activity data.
    correctResponsesPattern: (data) => [
      data.blanks.map((blank) => blank.acceptedAnswers[0] ?? '').join('[,]'),
    ],
  },
  interactions: ['blank-filled', 'hint-requested', 'submitted'],
});

/**
 * Built-in Written Response descriptor. Grading is DEFERRED: submissions are
 * graded asynchronously (AI or human) by the consumer; the synchronous
 * outcome reports only word-count facts. `wordCount` is recomputed from the
 * submitted text with the canonical `countWords()` — the client-supplied
 * count is informational, never trusted.
 */
export const writtenResponseType = defineActivityType<
  WrittenResponseData,
  WrittenResponseLearnerResponse
>({
  type: 'written-response',
  schema: WrittenResponseDataSchema as unknown as z.ZodType<WrittenResponseData>,
  scoring: {
    kind: 'deferred',
    reason: 'requires_async_grading',
    partial: (data, response) => {
      const wordCount = countWords(response?.text ?? '');
      return {
        withinWordBounds:
          response !== undefined && wordCount >= data.minWords && wordCount <= data.maxWords,
        wordCount,
      };
    },
  },
  isAnswered: (response) => (response?.text.trim().length ?? 0) > 0,
  fieldPolicy: WRITTEN_RESPONSE_FIELD_POLICY,
  redactedSchema: RedactedWrittenResponseDataSchema,
  interop: {
    xapiActivityTypeIri: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    xapiInteractionType: 'long-fill-in',
    correctResponsesPattern: () => [],
  },
  interactions: ['text-changed', 'submitted'],
});

registerActivityType(multipleChoiceType);
registerActivityType(fillInTheBlanksType);
registerActivityType(writtenResponseType);
