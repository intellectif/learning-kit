import { dictationAuthoring } from '../authoring/dictation.js';
import { fillInTheBlanksAuthoring } from '../authoring/fill-in-the-blanks.js';
import { gapSelectAuthoring } from '../authoring/gap-select.js';
import { multipleChoiceAuthoring } from '../authoring/multiple-choice.js';
import { readAloudAuthoring } from '../authoring/read-aloud.js';
import { writtenResponseAuthoring } from '../authoring/written-response.js';
import { countWords } from '../count-words.js';
import { DictationDataSchema } from '../schemas/dictation.js';
import { FillInTheBlanksDataSchema } from '../schemas/fill-in-the-blanks.js';
import { GapSelectDataSchema } from '../schemas/gap-select.js';
import { MultipleChoiceDataSchema } from '../schemas/multiple-choice.js';
import { ReadAloudDataSchema } from '../schemas/read-aloud.js';
import { ownSchemas } from '../schemas/read-schema.js';
import {
  RedactedDictationDataSchema,
  RedactedFillInTheBlanksDataSchema,
  RedactedGapSelectDataSchema,
  RedactedMultipleChoiceDataSchema,
  RedactedReadAloudDataSchema,
  RedactedWrittenResponseDataSchema,
} from '../schemas/redacted.js';
import { WrittenResponseDataSchema } from '../schemas/written-response.js';
import { scoreDictation } from '../scoring/activity-scorers/dictation.js';
import { scoreFillInTheBlanks } from '../scoring/activity-scorers/fill-in-the-blanks.js';
import { scoreGapSelect } from '../scoring/activity-scorers/gap-select.js';
import { scoreMultipleChoice } from '../scoring/activity-scorers/multiple-choice.js';
import {
  DICTATION_MAX_TEXT_LENGTH,
  normalizeDictationText,
  truncateCodePoints,
} from '../scoring/dictation/normalize.js';
import type { StandardSchemaV1 } from '../standard-schema.js';
import type {
  DictationData,
  DictationLearnerResponse,
  FillInTheBlanksData,
  FillInTheBlanksLearnerResponse,
  GapSelectData,
  GapSelectLearnerResponse,
  MultipleChoiceData,
  MultipleChoiceLearnerResponse,
  ReadAloudData,
  ReadAloudLearnerResponse,
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
  poster: 'public',
  // Applies to every element of the array.
  tracks: {
    kind: 'public',
    src: 'public',
    srclang: 'public',
    label: 'public',
    default: 'public',
  },
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
  // What an author allows AI to do for the item. Public, field by field: a
  // review that explains an answer must still honour an author who said no,
  // and an unclassified key parked inside it must not ride along.
  ai: { explanations: 'public', hints: 'public' },
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
    // Public, and classified key by key rather than as one leaf — the lesson
    // `media`, `rubric` and `feedback` each taught: a scalar classification
    // assigns the author's object by reference without recursing, so an
    // unclassified key parked inside it survives redact() AND assertRedacted().
    // An option's picture or recording IS the thing the learner picks, so
    // stripping it would ship a row of blank options.
    media: {
      type: 'public',
      url: 'public',
      alt: 'public',
      captionsUrl: 'public',
    },
  },
};

/**
 * Gap Select, where the sensitivity of "the candidate answers" INVERTS.
 *
 * Fill-in-the-Blanks classifies `acceptedAnswers` as answer-key, because the
 * list of things that would be accepted IS the key. Here the same-shaped data
 * is the opposite: a learner who cannot see `choices` cannot answer at all, so
 * every choice — and every shared bank — is `public`, and `correctChoiceId` is
 * the single field withheld. Copying the Fill-in-the-Blanks policy across would
 * have produced an exam nobody could sit, which is why the two types do not
 * share one.
 */
const GAP_SELECT_FIELD_POLICY: FieldPolicy = {
  ...SHARED_PUBLIC_FIELDS,
  passage: 'public',
  passageHtml: 'public',
  presentation: 'public',
  shuffleChoices: 'public',
  scoringStrategy: 'answer-key',
  feedback: FEEDBACK_FIELD_POLICY,
  banks: {
    id: 'public',
    choices: { id: 'public', text: 'public' },
  },
  gaps: {
    id: 'public',
    bankId: 'public',
    choices: { id: 'public', text: 'public' },
    correctChoiceId: 'answer-key',
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
 * Dictation, where the answer key is the sentence itself.
 *
 * `transcript` and `acceptedTranscripts` are the key. So is `tolerance`, and it
 * is classified as ONE scalar leaf on purpose: `redact()` maps an array element
 * by element and omits only an empty OBJECT, so a nested policy over
 * `equivalences` would project two all-answer-key rules to `[{}, {}]` — not
 * empty, kept under `reveal: 'none'`, and refused by the strict redacted schema,
 * so every item carrying a rule set would fail to redact. The leaf projects to
 * nothing under `none` and to the whole object under `after-submit`.
 *
 * The slow recording is public, key by key, for the reason a gap-select choice
 * is: the learner must be able to play it in an exam. The schema refuses it
 * beside a play budget, so its being public cannot open one. The hint mode is
 * public because it is inert without the transcript.
 */
const DICTATION_FIELD_POLICY: FieldPolicy = {
  ...SHARED_PUBLIC_FIELDS,
  transcript: 'answer-key',
  acceptedTranscripts: 'answer-key',
  slowMedia: { type: 'public', url: 'public', alt: 'public' },
  hints: { mode: 'public' },
  tolerance: 'answer-key',
  feedback: FEEDBACK_FIELD_POLICY,
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
  schema: MultipleChoiceDataSchema as unknown as StandardSchemaV1<unknown, MultipleChoiceData>,
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
  schema: FillInTheBlanksDataSchema as unknown as StandardSchemaV1<unknown, FillInTheBlanksData>,
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
  schema: WrittenResponseDataSchema as unknown as StandardSchemaV1<unknown, WrittenResponseData>,
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

/** Built-in Gap Select descriptor. */
export const gapSelectType = defineActivityType<GapSelectData, GapSelectLearnerResponse>({
  type: 'gap-select',
  schema: GapSelectDataSchema as unknown as StandardSchemaV1<unknown, GapSelectData>,
  scoring: { kind: 'sync', score: scoreGapSelect },
  isAnswered: (response) =>
    Object.values(response?.selections ?? {}).some((choiceId) => choiceId !== ''),
  fieldPolicy: GAP_SELECT_FIELD_POLICY,
  redactedSchema: RedactedGapSelectDataSchema,
  interop: {
    xapiActivityTypeIri: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    // `matching`, not `choice` or `fill-in`. The learner pairs a set of sources
    // (the gaps) with a set of targets (the choices), which is exactly what the
    // xAPI matching interaction describes, and it is the only built-in type
    // whose pattern can name WHICH gap took which answer. `fill-in` — what the
    // Fill-in-the-Blanks descriptor uses — would flatten the gaps into an
    // ordered list of strings and lose that.
    xapiInteractionType: 'matching',
    correctResponsesPattern: (data) => [
      data.gaps.map((gap) => `${gap.id}[.]${gap.correctChoiceId}`).join('[,]'),
    ],
  },
  interactions: ['gap-selected', 'submitted'],
  authoring: gapSelectAuthoring,
});

/**
 * Built-in Dictation descriptor. Graded synchronously: the score is the
 * character-level similarity of the typed text to the transcript, a pure
 * computation identical in a browser and on a server.
 */
export const dictationType = defineActivityType<DictationData, DictationLearnerResponse>({
  type: 'dictation',
  schema: DictationDataSchema as unknown as StandardSchemaV1<unknown, DictationData>,
  scoring: { kind: 'sync', score: scoreDictation },
  // Whitespace-only or punctuation-only text is no answer. Without the
  // tolerance, which this signature cannot see: the one gap is an attempt made
  // ONLY of a symbol an equivalence names, which reads as unanswered here and
  // is scored as the rewritten word — documented in the authoring guide. The
  // reverse cannot happen: a rule inserts words, never nothing, and the text is
  // cut where the scorer cuts, so text past the cap never counts as an answer.
  isAnswered: (response) =>
    normalizeDictationText(
      truncateCodePoints(
        typeof response?.text === 'string' ? response.text : '',
        DICTATION_MAX_TEXT_LENGTH,
      ),
    ) !== '',
  fieldPolicy: DICTATION_FIELD_POLICY,
  redactedSchema: RedactedDictationDataSchema,
  interop: {
    xapiActivityTypeIri: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    // `fill-in`, as for fill-in-the-blanks: a typed answer with a key pattern.
    // `long-fill-in` is what written-response uses for free text nothing scores.
    xapiInteractionType: 'fill-in',
    correctResponsesPattern: (data) => [data.transcript, ...(data.acceptedTranscripts ?? [])],
  },
  interactions: ['text-changed', 'hint-requested', 'submitted'],
  authoring: dictationAuthoring,
});

/**
 * Read Aloud, the type with no answer key at all.
 *
 * Everything an author writes is shown to the learner — the text to read most of
 * all — so every field is `public`, and redaction removes only the authored
 * pass/fail feedback, which is written about a grade that does not exist yet.
 * The bounds, the slow recording and the dimension weights are classified key by
 * key rather than as one leaf each, for the reason `media` was: a scalar
 * classification assigns the author's object by reference without recursing, so
 * an unclassified key parked inside it survives `redact()` AND
 * `assertRedacted()`.
 *
 * The weights are public deliberately. They tell the learner what the reading is
 * judged on, and they are no key: knowing that fluency counts twice cannot tell
 * anyone how to pronounce a word. They are not tightenable per call either, the
 * way a rubric is: `RedactedReadAloudDataSchema` REQUIRES `scoring` — as it
 * requires `recording`, `referenceText` and `locale` — so a policy override that
 * classified any of them `author-only` would produce a projection the schema
 * refuses, and `redact()` would throw rather than hide the field.
 */
const READ_ALOUD_FIELD_POLICY: FieldPolicy = {
  ...SHARED_PUBLIC_FIELDS,
  instructions: 'public',
  referenceText: 'public',
  recording: { maxSeconds: 'public', minSeconds: 'public', maxTakes: 'public' },
  slowMedia: { type: 'public', url: 'public', alt: 'public' },
  scoring: { dimensions: { name: 'public', weight: 'public' } },
  feedback: FEEDBACK_FIELD_POLICY,
};

/**
 * Whether a response carries a stored recording: an object whose `key` is a
 * non-empty string. Read defensively, because both callers are handed whatever
 * an application stored — `evaluate()` passes `partial` a response that may be
 * absent (a slot nobody answered), and a take that failed to upload is never a
 * `null` recording but may be anything at all in an older row.
 */
function hasRecording(response: ReadAloudLearnerResponse | undefined): boolean {
  const recording = (response as { recording?: unknown } | undefined)?.recording;
  return (
    typeof recording === 'object' &&
    recording !== null &&
    typeof (recording as { key?: unknown }).key === 'string' &&
    (recording as { key: string }).key !== ''
  );
}

/**
 * Built-in Read Aloud descriptor. Grading is DEFERRED: the SDK calls no
 * assessor, so the synchronous outcome reports only whether a recording was
 * stored, and `gradeReadAloud` produces the grade once the application holds a
 * speech assessment.
 */
export const readAloudType = defineActivityType<ReadAloudData, ReadAloudLearnerResponse>({
  type: 'read-aloud',
  schema: ReadAloudDataSchema as unknown as StandardSchemaV1<unknown, ReadAloudData>,
  scoring: {
    kind: 'deferred',
    reason: 'requires_async_grading',
    partial: (_data, response) => ({ hasRecording: hasRecording(response) }),
  },
  isAnswered: (response) => hasRecording(response),
  fieldPolicy: READ_ALOUD_FIELD_POLICY,
  redactedSchema: RedactedReadAloudDataSchema,
  interop: {
    xapiActivityTypeIri: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    // `other`, not `performance`: xAPI's performance interaction describes a set
    // of steps with their own responses, and a reading has one. There is no
    // pattern to publish either — the "correct response" is a pronunciation, not
    // a string a statement can carry.
    xapiInteractionType: 'other',
    correctResponsesPattern: () => [],
  },
  interactions: ['recording-started', 'recording-stopped', 'recording-uploaded', 'submitted'],
  authoring: readAloudAuthoring,
});

// The SDK's own schemas are read with zod, which reports what each failing
// check was given; see `readSchema`.
for (const descriptor of [
  multipleChoiceType,
  fillInTheBlanksType,
  writtenResponseType,
  gapSelectType,
  dictationType,
  readAloudType,
]) {
  ownSchemas(
    descriptor.schema,
    ...(descriptor.redactedSchema !== undefined ? [descriptor.redactedSchema] : []),
  );
}

registerActivityType(multipleChoiceType);
registerActivityType(fillInTheBlanksType);
registerActivityType(writtenResponseType);
registerActivityType(gapSelectType);
registerActivityType(dictationType);
registerActivityType(readAloudType);
