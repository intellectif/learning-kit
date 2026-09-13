import type { z } from 'zod/v4';
import { fillInTheBlanksAuthoring } from '../authoring/fill-in-the-blanks.js';
import { multipleChoiceAuthoring } from '../authoring/multiple-choice.js';
import { writtenResponseAuthoring } from '../authoring/written-response.js';
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
 * free. Authored feedback is answer-key (it may quote or hint the answer).
 * Rubrics are PUBLIC: a rubric tells the learner what they are assessed on,
 * and a deployment that wants it hidden tightens it per call — see the
 * `rubric` entry in the written-response policy below.
 */
/**
 * `media` classified field by field, not as one opaque leaf.
 *
 * A scalar `Sensitivity` classifies the WHOLE field, so `media: 'public'`
 * returned the author's object by reference without recursing — and an
 * unclassified key nested under it (`media.secretAnswerHint`) survived
 * `redact()` AND passed `assertRedacted()`. The fail-closed contract the SDK
 * documents ("a field the policy does not classify is removed") stopped at the
 * media boundary. It no longer does.
 *
 * Everything here is public by necessity: the client is the thing that renders
 * and enforces the policy, and "1 play remaining" is text the learner has to
 * read. None of it is an answer key — a listening paper's answer key is
 * `stimulus.transcript`, which stays `author-only`.
 */
export const MEDIA_FIELD_POLICY: FieldPolicy = {
  type: 'public',
  url: 'public',
  alt: 'public',
  captionsUrl: 'public',
  playback: {
    controls: 'public',
    maxPlays: 'public',
    seek: 'public',
    rate: 'public',
    nativeControlHints: 'public',
  },
};

const SHARED_PUBLIC_FIELDS: FieldPolicy = {
  schemaVersion: 'public',
  type: 'public',
  id: 'public',
  // Assembly metadata, not content: it names the slot this item occupies in a
  // paper. It has to survive redaction, or the exam client derives positional
  // slot ids while the server's stored plan holds keyed ones, and the
  // responses cannot be matched back to the attempt.
  slotKey: 'public',
  title: 'public',
  media: MEDIA_FIELD_POLICY,
  passThreshold: 'public',
  locale: 'public',
  learningObjectives: 'public',
  difficultyLevel: 'public',
};

/**
 * Activity-level feedback, classified field by field.
 *
 * The third object leaf to need this, after `media` and `rubric`, and the same
 * defect each time: a scalar classification assigns the author's object by
 * reference without recursing, so under `reveal: 'after-submit'` an
 * unclassified key nested inside it — a grader note, an internal cost — was
 * forwarded to the learner along with the answer key, and `redact()` handed
 * back an alias of the caller's object. `FeedbackSchema` is loose, so anything
 * can be parked there.
 *
 * Both fields stay `answer-key`: activity feedback IS the answer key's
 * commentary, so `reveal: 'none'` still drops the whole object.
 */
export const FEEDBACK_FIELD_POLICY: FieldPolicy = {
  correct: 'answer-key',
  incorrect: 'answer-key',
};

/**
 * A blank's matching tolerances, classified key by key.
 *
 * Same reasoning as {@link FEEDBACK_FIELD_POLICY}: `TextMatchPolicy` is a
 * documented set of knobs, and a consumer's private tuning parked beside them
 * is not part of what an after-submit reveal promises to show.
 */
export const TEXT_MATCH_FIELD_POLICY: FieldPolicy = {
  caseSensitive: 'answer-key',
  trim: 'answer-key',
  normalize: 'answer-key',
  foldDiacritics: 'answer-key',
  collapseInnerWhitespace: 'answer-key',
  ignorePunctuation: 'answer-key',
  levenshtein: 'answer-key',
  locale: 'answer-key',
};

const MULTIPLE_CHOICE_FIELD_POLICY: FieldPolicy = {
  ...SHARED_PUBLIC_FIELDS,
  question: 'public',
  questionHtml: 'public',
  mode: 'public',
  shuffle: 'public',
  scoringStrategy: 'answer-key',
  feedback: FEEDBACK_FIELD_POLICY,
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
  feedback: FEEDBACK_FIELD_POLICY,
  blanks: {
    id: 'public',
    hint: 'public',
    acceptedAnswers: 'answer-key',
    caseSensitive: 'answer-key',
    trimWhitespace: 'answer-key',
    match: TEXT_MATCH_FIELD_POLICY,
    feedback: 'answer-key',
  },
};

/**
 * The rubric classified field by field, not as one opaque leaf.
 *
 * A scalar `Sensitivity` classifies the WHOLE field, so `rubric: 'public'`
 * returned the author's object by reference without recursing — and an
 * unclassified key nested under it survived `redact()` AND passed
 * `assertRedacted()`. A grader's `modelAnswer` or `aiModel` stashed on the
 * rubric went straight to the exam client. Same defect as the one `media` had,
 * one field along: "the rubric is public" has to mean its documented fields
 * are public, not that anything anyone parks under it is.
 */
export const RUBRIC_FIELD_POLICY: FieldPolicy = {
  label: 'public',
  // Applies to every element of the array.
  criteria: {
    name: 'public',
    description: 'public',
    weight: 'public',
  },
};

const WRITTEN_RESPONSE_FIELD_POLICY: FieldPolicy = {
  ...SHARED_PUBLIC_FIELDS,
  prompt: 'public',
  promptHtml: 'public',
  minWords: 'public',
  maxWords: 'public',
  languageTarget: 'public',
  feedback: FEEDBACK_FIELD_POLICY,
  // A rubric is a LEARNER affordance, not a grader secret: it tells the
  // learner what they are being graded on, which is pedagogically the point
  // of publishing one. (Classifying it author-only broke real deployments
  // that render a rubric panel during the attempt.) A deployment that wants
  // it hidden can tighten this per call via `redact(data, { policy })`.
  // Classified field by field so that stays true of the rubric's DOCUMENTED
  // fields only — see {@link RUBRIC_FIELD_POLICY}.
  rubric: RUBRIC_FIELD_POLICY,
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
  authoring: multipleChoiceAuthoring,
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
  authoring: fillInTheBlanksAuthoring,
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
  authoring: writtenResponseAuthoring,
});

registerActivityType(multipleChoiceType);
registerActivityType(fillInTheBlanksType);
registerActivityType(writtenResponseType);
