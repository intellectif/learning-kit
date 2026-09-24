/**
 * The read-aloud grade: the arithmetic over a pronunciation assessment's
 * dimension scores, and the checks that decide whether that evidence may be
 * graded at all.
 *
 * The SDK calls no assessor and holds no key. It is given the application's
 * assessment and the server's own measurement of the recording, and it refuses
 * evidence it cannot tie to this item, this text and this recording — a refusal
 * is never a zero, because a learner who was not heard has not failed.
 */
import { countWords } from '../../count-words.js';
import { ActivitySchemaError, RedactedScoringError } from '../../errors.js';
import { gradeFromRubric } from '../../grading.js';
import { isRedacted } from '../../is-redacted.js';
import { ReadAloudDataSchema } from '../../schemas/read-aloud.js';
import type {
  ReadAloudData,
  ReadAloudLearnerResponse,
  RecordingRef,
  ScoringDetail,
  ValidationError,
} from '../../types/activity.js';
import type { CriterionScore, GradeRecord } from '../../types/grading.js';
import type {
  GradeReadAloudOptions,
  ReadAloudWordAlignment,
  SpeechAssessment,
  SpeechUnscorable,
  SpeechUnscorableCode,
} from '../../types/speech.js';
import { dictationReferenceWords } from '../dictation/align.js';
import { computePassThreshold, selectFeedback } from '../pass-threshold.js';
import { roundingPolicyOf } from '../rounding.js';
import { alignValidated } from './align.js';
import { describeValidationError, validateSpeechAssessment } from './assessment.js';

/**
 * Float slack when comparing two measurements of the same recording: voiced
 * time is summed window by window, so it can land a hair above the duration it
 * was measured from without either number being wrong.
 */
const MEASUREMENT_TOLERANCE = 1e-6;

/** What every assessor score is out of, and what a criterion declares. */
const ASSESSMENT_SCALE = 100;

/** A value named in an error message, without serialising the object it came from. */
function describeValue(value: unknown): string {
  return typeof value === 'number' ? String(value) : `of type ${typeof value}`;
}

/**
 * The recording a response carries, checked and copied — or `undefined` when
 * the value is not a response this grade can read.
 *
 * It answers with a copy for the same reason the item and the assessment are
 * graded from their checked copies: the response has no schema to parse it, so
 * this is the only place its fields are read. An accessor that answered a take
 * here and `null` afterwards would have graded a real reading as a blank 0, and
 * one that answered another key afterwards would have walked past the
 * recording-key binding. Every field is read once, and what is returned is what
 * was checked.
 */
function readResponseRecording(value: unknown): { recording: RecordingRef | null } | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { type, recording } = value as { type?: unknown; recording?: unknown };
  if (type !== 'read-aloud') {
    return undefined;
  }
  // `null` is the blank: the learner submitted without recording. A take that
  // failed to upload is never null, so a blank is a decision, not an accident.
  if (recording === null) {
    return { recording: null };
  }
  if (typeof recording !== 'object') {
    return undefined;
  }
  const { key, mimeType } = recording as { key?: unknown; mimeType?: unknown };
  if (typeof key !== 'string' || key === '' || typeof mimeType !== 'string') {
    return undefined;
  }
  // `durationMs` is deliberately not carried over. A duration the client
  // reported is not evidence — the grade measures the recording itself through
  // `options.measured` — so the checked take holds only what the grade reads.
  return { recording: { key, mimeType } };
}

/**
 * How many words were spoken, for the speech-rate check: what the assessor
 * recognised as text when it reported any, and otherwise the words it kept —
 * an omission was not spoken, and an insertion is not in the text.
 *
 * `countWords` is the counter on purpose: it is the one the SDK already counts
 * a written response with, and a rate compared against a policy an application
 * set must be counted the same way every time.
 */
function spokenWordCount(assessment: SpeechAssessment): number {
  const recognized = assessment.recognizedText;
  if (recognized !== undefined && recognized.trim() !== '') {
    return countWords(recognized);
  }
  return countWords(
    assessment.words
      .filter((word) => word.error !== 'omission' && word.error !== 'insertion')
      .map((word) => word.text)
      .join(' '),
  );
}

/**
 * The mark for one reference word: nothing was read for an omitted word, and a
 * word the assessor did not measure carries no mark at all — an absent score is
 * not a zero.
 */
function scoreOf(entry: ReadAloudWordAlignment): { score?: number } {
  if (entry.state === 'omitted') {
    return { score: 0 };
  }
  return entry.accuracy !== undefined ? { score: entry.accuracy / ASSESSMENT_SCALE } : {};
}

/**
 * Grades a read-aloud take from a {@link SpeechAssessment} the application
 * obtained, the response that was submitted, and the server's own measurement
 * of the recording.
 *
 * The weighted total is computed by `gradeFromRubric` from the authored
 * dimensions that carry a weight above 0, each out of 100. The per-word marks
 * in `details` are for display and review: **they never feed the score**, which
 * is the assessor's utterance-level judgement, weighted as the item authored it.
 *
 * Evidence is refused, never scored 0, when it cannot be tied to this item and
 * this recording, when the assessor heard nothing, when the recording holds too
 * little voiced time for the words claimed, or when a weighted dimension has no
 * score — see {@link SpeechUnscorableCode}. Store a refusal with
 * `outcomeFromUnscorable`.
 *
 * A blank (`response.recording === null`) is a grade of 0 with a mark per
 * reference word: the learner submitted, and read nothing. The assessment and
 * the measurement are not read for it.
 *
 * @throws RangeError when `options.plausibility` or `options.rounding` cannot be
 * applied, or when `options.measured` is not a pair of non-negative, finite
 * millisecond counts with `voicedMs` inside `durationMs`.
 * @throws TypeError when `response` is not a read-aloud response, or when a
 * non-blank response is graded without an assessment or without a measurement.
 * @throws ActivitySchemaError when `data` is not valid read-aloud data.
 * @throws RedactedScoringError when `data` is a `redact()` projection. A
 * read-aloud projection is a valid activity, so the authored feedback would
 * simply be missing from the grade; grade against the full data server-side.
 */
export function gradeReadAloud(
  data: ReadAloudData,
  response: ReadAloudLearnerResponse,
  assessment: SpeechAssessment | null,
  options: GradeReadAloudOptions,
): GradeRecord | SpeechUnscorable {
  // The caller's own configuration first: a policy that cannot be applied is a
  // bug in the server that grades, and answering every take "unscorable" would
  // hide it. Read defensively — these decide whether a take is graded at all,
  // and untyped JavaScript can arrive without them.
  const maxWordsPerSecond = options?.plausibility?.maxWordsPerSecond;
  if (
    typeof maxWordsPerSecond !== 'number' ||
    !Number.isFinite(maxWordsPerSecond) ||
    maxWordsPerSecond <= 0
  ) {
    throw new RangeError(
      `Invalid plausibility policy (maxWordsPerSecond ${describeValue(maxWordsPerSecond)}): expected a finite number above 0.`,
    );
  }
  const minVoicedMs = options?.plausibility?.minVoicedMs;
  if (typeof minVoicedMs !== 'number' || !Number.isFinite(minVoicedMs) || minVoicedMs < 0) {
    throw new RangeError(
      `Invalid plausibility policy (minVoicedMs ${describeValue(minVoicedMs)}): expected a finite number of milliseconds, 0 or above.`,
    );
  }
  const rounding = roundingPolicyOf(options?.rounding);

  const parsed = ReadAloudDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new ActivitySchemaError(
      'read-aloud',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
        code: issue.code,
      })),
    );
  }
  // A learner-safe projection parses as read-aloud data, and it keeps every
  // field this grade reads, so nothing further down would notice that the
  // authored feedback had been removed rather than never written: the grade
  // comes out a plausible number with `feedback: null`, where a type whose
  // answer key the projection drops fails closed on a non-finite score.
  // `score()` throws the same error for the same reason — a grade made without
  // the answer key is not a grade — and this is a public grader that does not
  // go through it.
  //
  // Asked of BOTH values. The parsed one, because the schema is loose and
  // carries `redacted` through, so a getter cannot answer the parse `true` and
  // this guard `false`; and the argument, because the parse copies own
  // enumerable keys only, so an INHERITED marker is absent from the copy —
  // and `score()` reads the argument, which is the parity to keep.
  if (isRedacted(data) || isRedacted(parsed.data)) {
    throw new RedactedScoringError('read-aloud');
  }
  // The checked copy of the item from here on, never the caller's object, for
  // the reason the assessment's checked copy exists below: a property getter
  // that answers the schema one value and a later read another marks a reading
  // the item never asked for — a `referenceText` honest for the parse and the
  // mismatch check, and longer on the third read, had the learner marked
  // against words that are not in the text.
  const item = parsed.data as unknown as ReadAloudData;
  const checkedResponse = readResponseRecording(response);
  if (checkedResponse === undefined) {
    throw new TypeError(
      'gradeReadAloud needs a read-aloud response: { type: "read-aloud", recording: null } for a blank, ' +
        'or a recording with a non-empty `key` and a `mimeType`.',
    );
  }
  const recording = checkedResponse.recording;

  if (recording === null) {
    const passed = computePassThreshold(item, 0, rounding);
    return {
      score: 0,
      maxScore: 1,
      passed,
      feedback: selectFeedback(item, passed),
      criteria: [],
      // Every word of the text, unread. A blank is graded from the item alone:
      // there is no assessment to read, and no grader to credit.
      details: referenceWordsOf(item).map(({ itemId, word }) => ({
        itemId,
        outcome: 'incorrect-omission' as const,
        learnerResponse: '',
        correctResponse: word,
        weight: 1,
        score: 0,
      })),
    };
  }

  // Past the blank, a grade needs evidence and a measurement. Missing either is
  // the caller's bug, not evidence the SDK could refuse on its merits.
  if (assessment === null || assessment === undefined) {
    throw new TypeError(
      'gradeReadAloud needs a speech assessment for a response that carries a recording. Pass one, or grade the blank (recording: null).',
    );
  }
  const measured = options.measured;
  if (measured === null || measured === undefined) {
    throw new TypeError(
      "gradeReadAloud needs `options.measured`, the server's own measurement of the recording (inspectWav), for a response that carries a recording. A duration the client reported is not evidence.",
    );
  }
  const { durationMs, voicedMs } = measured;
  if (
    typeof durationMs !== 'number' ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    typeof voicedMs !== 'number' ||
    !Number.isFinite(voicedMs) ||
    voicedMs < 0 ||
    voicedMs > durationMs + MEASUREMENT_TOLERANCE
  ) {
    throw new RangeError(
      `Invalid recording measurement (durationMs ${describeValue(durationMs)}, voicedMs ${describeValue(voicedMs)}): expected finite millisecond counts, 0 or above, with voicedMs inside durationMs.`,
    );
  }

  const unscorable = (code: SpeechUnscorableCode, reason: string): SpeechUnscorable => ({
    unscorable: true,
    code,
    reason,
  });

  const checked = validateSpeechAssessment(assessment);
  if (!checked.success) {
    return unscorable(
      'invalid_assessment',
      `The speech assessment is not well formed (${describeValidationError(checked.errors[0] as ValidationError)}).`,
    );
  }
  // The checked copy of the evidence too, never the caller's object: a property
  // getter can answer one value to the validator and another to the grade, and
  // a mark computed from the second leaves the [0, 1] range `ScoringDetail`
  // promises. `roundingPolicyOf` guards the rounding policy the same way, and
  // for the same reason.
  const evidence = checked.data;
  if (evidence.task !== 'scripted') {
    return unscorable(
      'task_mismatch',
      `The assessment was made for a "${evidence.task}" task; a read-aloud grade needs one made against the item's text.`,
    );
  }
  if (evidence.locale !== item.locale) {
    return unscorable(
      'locale_mismatch',
      `The assessment was made for locale "${evidence.locale}", and the item is read in "${item.locale}". Pronunciation is assessed against one locale's speech.`,
    );
  }
  if (evidence.referenceText !== item.referenceText) {
    return unscorable(
      'reference_mismatch',
      'The assessment was made against a different text from the one this item asks the learner to read.',
    );
  }
  if (evidence.recordingKey !== recording.key) {
    return unscorable(
      'recording_mismatch',
      `The assessment was made for recording "${String(evidence.recordingKey)}", and this response submitted "${recording.key}".`,
    );
  }
  if (evidence.assessor.kind === 'ai' && options.allowAiAssessor !== true) {
    return unscorable(
      'assessor_not_accepted',
      'The assessment was produced by a generative model. Pass `allowAiAssessor: true` to accept that as measurement evidence.',
    );
  }
  if (evidence.status === 'no_speech') {
    return unscorable('no_speech', 'The assessor heard no speech in this recording.');
  }
  if (voicedMs < minVoicedMs) {
    return unscorable(
      'insufficient_voiced_time',
      `The recording holds ${voicedMs} ms of voiced time, and the policy asks for at least ${minVoicedMs} ms.`,
    );
  }
  const words = spokenWordCount(evidence);
  if (words > 0 && (voicedMs === 0 || words / (voicedMs / 1000) > maxWordsPerSecond)) {
    return unscorable(
      'implausible_speech_rate',
      `The assessment claims ${words} word(s) in ${voicedMs} ms of voiced time, above the ${maxWordsPerSecond} word(s) per second the policy allows.`,
    );
  }
  const weighed = item.scoring.dimensions.filter((dimension) => dimension.weight > 0);
  // Before the arithmetic: `gradeFromRubric` drops a criterion with no numeric
  // score, so an absent dimension would silently regrade the learner on the
  // rest at different effective weights.
  const missing = weighed.find((dimension) => evidence.scores[dimension.name] === undefined);
  if (missing !== undefined) {
    return unscorable(
      'missing_dimension',
      `The item weighs "${missing.name}", and the assessment carries no ${missing.name} score. An absent score is not a 0.`,
    );
  }

  const criteria: CriterionScore[] = weighed.map((dimension) => ({
    name: dimension.name,
    score: evidence.scores[dimension.name] as number,
    maxScore: ASSESSMENT_SCALE,
    weight: dimension.weight,
  }));
  const graded = gradeFromRubric(criteria, item, rounding !== undefined ? { rounding } : {});
  if ('unscorable' in graded) {
    // Unreachable for data and an assessment that passed the checks above: every
    // weight is above 0 and every score is a finite 0..100. Kept because the
    // alternative to a refusal here would be inventing a number.
    return unscorable(
      'invalid_assessment',
      `No weighted total could be computed from the assessment's scores: ${graded.reason}`,
    );
  }

  const details: ScoringDetail[] = [];
  for (const entry of alignValidated(item, evidence)) {
    // An inserted word is not one of the item's: it has no id to store a mark
    // under, and a word the learner added is not a word the item asked for.
    if (entry.itemId === undefined) {
      continue;
    }
    details.push({
      itemId: entry.itemId,
      outcome:
        entry.state === 'correct'
          ? 'correct'
          : entry.state === 'mispronounced'
            ? 'incorrect'
            : 'incorrect-omission',
      learnerResponse: entry.heard,
      correctResponse: entry.reference,
      weight: 1,
      ...scoreOf(entry),
    });
  }

  return {
    ...graded,
    feedback: selectFeedback(item, graded.passed),
    details,
    // A copy, so a stored grade keeps who measured it even if the assessment
    // object is later mutated or reused.
    grader: { ...evidence.assessor },
  };
}

/** The item's reference words, as `dictationReferenceWords` numbers them. */
function referenceWordsOf(
  data: Pick<ReadAloudData, 'referenceText'>,
): readonly { itemId: string; word: string }[] {
  return dictationReferenceWords({ transcript: data.referenceText })[0] as readonly {
    itemId: string;
    word: string;
  }[];
}
