/**
 * The spoken-answer grade: a rubric scored partly by a judge, from the
 * transcript of what the learner said, and partly from an engine's measures of
 * how they said it.
 *
 * As for a read-aloud, the SDK calls no engine and no model. It is given the
 * application's unscripted assessment of the take, a judgement of the criteria
 * a judge scores, and the server's own measurement of the recording, and it
 * refuses evidence it cannot tie to this item and this recording — a refusal is
 * never a zero.
 */
import { countWords } from '../../count-words.js';
import { ActivitySchemaError, RedactedScoringError } from '../../errors.js';
import { gradeFromRubric } from '../../grading.js';
import { isRedacted } from '../../is-redacted.js';
import { levelKey } from '../../rubric-levels.js';
import { SpeakingResponseDataSchema } from '../../schemas/speaking-response.js';
import type {
  SpeakingMeasure,
  SpeakingResponseData,
  SpeakingResponseLearnerResponse,
  SpeakingRubricCriterion,
  ValidationError,
} from '../../types/activity.js';
import type { AiGradingJudgement } from '../../types/ai.js';
import type { CriterionScore, GradeRecord } from '../../types/grading.js';
import type {
  GradeSpeakingResponseOptions,
  SpeakingEvidence,
  SpeechAssessment,
  SpeechUnscorable,
  SpeechUnscorableCode,
} from '../../types/speech.js';
import { computePassThreshold, selectFeedback } from '../pass-threshold.js';
import { roundingPolicyOf } from '../rounding.js';
import { describeValidationError, validateSpeechAssessment } from './assessment.js';
import {
  describeValue,
  MEASUREMENT_TOLERANCE,
  readResponseRecording,
  spokenWordCount,
} from './grade.js';

/** What every assessor score is out of. */
const ASSESSMENT_SCALE = 100;

/** The assessment score each measure is read from. */
const MEASURE_SCORE: Readonly<Record<SpeakingMeasure, 'accuracy' | 'fluency' | 'prosody'>> = {
  pronunciation: 'accuracy',
  fluency: 'fluency',
  prosody: 'prosody',
};

/**
 * How many words were spoken, for the speech-rate check: the transcript's when
 * the evidence carries one — it is the text the judge grades — and otherwise
 * what the engine recognised.
 */
function wordsSpoken(evidence: SpeechAssessment): number {
  return evidence.transcript !== undefined
    ? countWords(evidence.transcript.text)
    : spokenWordCount(evidence);
}

/**
 * The judged criteria, each read once and matched to the criterion of the
 * rubric it judges — or why the judgement cannot be graded with this item.
 */
function matchJudgement(
  judgement: AiGradingJudgement,
  byJudge: readonly SpeakingRubricCriterion[],
): CriterionScore[] | string {
  const listed: unknown = judgement.criteria;
  if (!Array.isArray(listed)) {
    return 'The judgement carries no list of criteria.';
  }
  const wanted = new Map(byJudge.map((criterion) => [levelKey(criterion.name), criterion]));
  const judged = new Set<string>();
  const criteria: CriterionScore[] = [];
  for (const one of listed as readonly unknown[]) {
    const { name, score, level, probabilities, comment } = (one ?? {}) as Partial<
      AiGradingJudgement['criteria'][number]
    >;
    const key = typeof name === 'string' ? levelKey(name) : undefined;
    const criterion = key === undefined ? undefined : wanted.get(key);
    if (key === undefined || criterion === undefined || judged.has(key)) {
      return `The judgement names criterion ${typeof name === 'string' ? `"${name}"` : describeValue(name)}, which is not one the judge scores on this item once.`;
    }
    if (typeof score !== 'number' || !(score >= 0 && score <= 1)) {
      return `The judgement scores "${criterion.name}" ${describeValue(score)}, off its 0..1 scale.`;
    }
    judged.add(key);
    criteria.push({
      name: criterion.name,
      score,
      weight: criterion.weight,
      ...(level !== undefined ? { band: level } : {}),
      ...(probabilities !== undefined ? { levelProbabilities: [...probabilities] } : {}),
      ...(comment !== undefined ? { comment } : {}),
    });
  }
  const left = byJudge.find((criterion) => !judged.has(levelKey(criterion.name)));
  if (left !== undefined) {
    return `The judgement leaves out criterion "${left.name}". A total over fewer criteria would grade a different task.`;
  }
  return criteria;
}

/**
 * Grades a spoken answer to a `speaking-response` item (1.9).
 *
 * Each criterion of the rubric is scored once:
 *
 * - **by the judge** when it names no `measure` — what was said, how it was
 *   organised, the range and accuracy of the language — from
 *   `evidence.judgement`: a model's reply as `checkAiGrading` read it, or a
 *   person's marks in the same shape, each from 0 to 1;
 * - **from the engine** when it names one: `pronunciation` is the assessment's
 *   accuracy, `fluency` its fluency, `prosody` its prosody, each out of 100. With
 *   `options.judgeMeasures` the judge scores those too, and the engine's scores
 *   are not read.
 *
 * The weighted total is `gradeFromRubric`'s, over the item's weights and pass
 * line. Evidence is refused rather than scored, as a read-aloud's is: an
 * assessment that is not `unscripted`, not for the item's locale or not for
 * this recording; one from a model, unless `allowAiAssessor`; a take with no
 * speech, too little voiced time, or more words in its transcript than the
 * voiced time holds; a weighted measure the assessment has no score for
 * (`missing_dimension`); and a judgement that does not score each criterion the
 * judge scores exactly once, on its 0..1 scale (`judgement_mismatch`). A
 * judgement is matched whenever one is given, so marks meant for another item,
 * or for measures the judge was not asked to score, are refused.
 *
 * A blank (`response.recording === null`) is a grade of 0: the learner
 * submitted and said nothing. The evidence and the measurement are not read.
 *
 * With a judge, the grade is the judge's, as `gradeFromJudgement` makes one:
 * its feedback (or the authored feedback, when it gave none), its corrections
 * and rationale, `requiresHumanReview`, and `grader: { kind: 'ai', model,
 * promptHash }` — so `routeGrade` routes a spoken answer as it routes a written
 * one. Without one, the feedback is the authored feedback and the grader is the
 * engine that measured.
 *
 * @throws RangeError when `options.plausibility` or `options.rounding` cannot be
 * applied, or `options.measured` is not a pair of finite, non-negative
 * millisecond counts with `voicedMs` inside `durationMs`.
 * @throws TypeError when `response` is not a speaking-response response, or a
 * recording is graded without an assessment, a measurement, or — when the
 * judge scores a criterion — a judgement.
 * @throws ActivitySchemaError when `data` is not valid speaking-response data.
 * @throws RedactedScoringError when `data` is a `redact()` projection.
 */
export function gradeSpeakingResponse(
  data: SpeakingResponseData,
  response: SpeakingResponseLearnerResponse,
  evidence: SpeakingEvidence,
  options: GradeSpeakingResponseOptions,
): GradeRecord | SpeechUnscorable {
  // The caller's configuration first, read defensively, as `gradeReadAloud`
  // reads it: a policy that cannot be applied is a bug in the server.
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

  const parsed = SpeakingResponseDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new ActivitySchemaError(
      'speaking-response',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
        code: issue.code,
      })),
    );
  }
  // Asked of both, as `gradeReadAloud` asks: the loose parse carries an own
  // marker through, and only the argument carries an inherited one.
  if (isRedacted(data) || isRedacted(parsed.data)) {
    throw new RedactedScoringError('speaking-response');
  }
  // The checked copies from here on, never the caller's objects.
  const item = parsed.data as unknown as SpeakingResponseData;
  const checkedResponse = readResponseRecording(response, 'speaking-response');
  if (checkedResponse === undefined) {
    throw new TypeError(
      'gradeSpeakingResponse needs a speaking-response response: { type: "speaking-response", recording: null } for a blank, ' +
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
    };
  }

  const judgeMeasures = options.judgeMeasures === true;
  const byJudge = item.rubric.criteria.filter(
    (criterion) => judgeMeasures || criterion.measure === undefined,
  );
  const byEngine = item.rubric.criteria.filter(
    (criterion) => !judgeMeasures && criterion.measure !== undefined,
  );

  // Past the blank, missing evidence is the caller's bug, not evidence the SDK
  // could refuse on its merits.
  const assessment = evidence?.assessment;
  if (assessment === null || assessment === undefined) {
    throw new TypeError(
      "gradeSpeakingResponse needs the engine's unscripted assessment of a response that carries a recording. Pass one, or grade the blank (recording: null).",
    );
  }
  const judgement = evidence.judgement ?? undefined;
  if (judgement === undefined && byJudge.length > 0) {
    throw new TypeError(
      `gradeSpeakingResponse needs a judgement of the criteria a judge scores on this item: ${byJudge.map((criterion) => `"${criterion.name}"`).join(', ')}.`,
    );
  }
  const measured = options.measured;
  if (measured === null || measured === undefined) {
    throw new TypeError(
      "gradeSpeakingResponse needs `options.measured`, the server's own measurement of the recording (inspectWav), for a response that carries a recording. A duration the client reported is not evidence.",
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
  const engine = checked.data;
  if (engine.task !== 'unscripted') {
    return unscorable(
      'task_mismatch',
      `The assessment was made for a "${engine.task}" task; a spoken answer is assessed unscripted, against what the learner said.`,
    );
  }
  if (engine.locale !== item.locale) {
    return unscorable(
      'locale_mismatch',
      `The assessment was made for locale "${engine.locale}", and the item is answered in "${item.locale}". Pronunciation is assessed against one locale's speech.`,
    );
  }
  if (engine.recordingKey !== recording.key) {
    return unscorable(
      'recording_mismatch',
      engine.recordingKey === undefined
        ? `The assessment names no recording, and this response submitted "${recording.key}". Unscripted evidence must carry the key of the recording it measured.`
        : `The assessment was made for recording "${engine.recordingKey}", and this response submitted "${recording.key}".`,
    );
  }
  if (engine.assessor.kind === 'ai' && options.allowAiAssessor !== true) {
    return unscorable(
      'assessor_not_accepted',
      'The assessment was produced by a generative model. Pass `allowAiAssessor: true` to accept that as measurement evidence.',
    );
  }
  if (engine.status === 'no_speech') {
    return unscorable('no_speech', 'The assessor heard no speech in this recording.');
  }
  if (voicedMs < minVoicedMs) {
    return unscorable(
      'insufficient_voiced_time',
      `The recording holds ${voicedMs} ms of voiced time, and the policy asks for at least ${minVoicedMs} ms.`,
    );
  }
  const words = wordsSpoken(engine);
  if (words > 0 && (voicedMs === 0 || words / (voicedMs / 1000) > maxWordsPerSecond)) {
    return unscorable(
      'implausible_speech_rate',
      `The assessment claims ${words} word(s) in ${voicedMs} ms of voiced time, above the ${maxWordsPerSecond} word(s) per second the policy allows.`,
    );
  }
  // Before the arithmetic: `gradeFromRubric` drops a criterion with no numeric
  // score, so an absent measure would silently regrade the answer on the rest
  // at different effective weights. An unweighted one moves no total, and is
  // left out when the engine did not score it.
  const missing = byEngine.find(
    (criterion) =>
      criterion.weight > 0 &&
      engine.scores[MEASURE_SCORE[criterion.measure as SpeakingMeasure]] === undefined,
  );
  if (missing !== undefined) {
    const score = MEASURE_SCORE[missing.measure as SpeakingMeasure];
    return unscorable(
      'missing_dimension',
      `The item scores "${missing.name}" from ${missing.measure}, and the assessment carries no ${score} score. An absent score is not a 0.`,
    );
  }

  const criteria: CriterionScore[] = [];
  for (const criterion of byEngine) {
    const score = engine.scores[MEASURE_SCORE[criterion.measure as SpeakingMeasure]];
    if (score !== undefined) {
      criteria.push({
        name: criterion.name,
        score,
        maxScore: ASSESSMENT_SCALE,
        weight: criterion.weight,
      });
    }
  }
  if (judgement !== undefined) {
    const judged = matchJudgement(judgement, byJudge);
    if (typeof judged === 'string') {
      return unscorable('judgement_mismatch', judged);
    }
    criteria.push(...judged);
  }
  // In the rubric's order, whoever scored each criterion.
  const order = new Map(
    item.rubric.criteria.map((criterion, index) => [levelKey(criterion.name), index]),
  );
  criteria.sort(
    (a, b) => (order.get(levelKey(a.name)) as number) - (order.get(levelKey(b.name)) as number),
  );

  const graded = gradeFromRubric(criteria, item, rounding !== undefined ? { rounding } : {});
  if ('unscorable' in graded) {
    // Unreachable for data and evidence that passed the checks above: a weight
    // is above 0, every engine score is a finite 0..100 and every judged one a
    // 0..1. Kept because the alternative to a refusal here is inventing a number.
    return unscorable(
      'invalid_assessment',
      `No weighted total could be computed from the evidence: ${graded.reason}`,
    );
  }

  if (byJudge.length === 0 || judgement === undefined) {
    return {
      ...graded,
      feedback: selectFeedback(item, graded.passed),
      // A copy, so a stored grade keeps who measured it.
      grader: { ...engine.assessor },
    };
  }
  const { provenance, usage } = judgement;
  return {
    ...graded,
    feedback: judgement.feedback ?? selectFeedback(item, graded.passed),
    ...(judgement.corrections.length > 0 ? { corrections: [...judgement.corrections] } : {}),
    ...(judgement.rationale !== undefined ? { rationale: judgement.rationale } : {}),
    requiresHumanReview: judgement.requiresHumanReview,
    grader: {
      kind: 'ai',
      ...(provenance?.model !== undefined ? { model: provenance.model } : {}),
      ...(provenance?.promptHash !== undefined ? { promptHash: provenance.promptHash } : {}),
    },
    ...(usage !== undefined ? { usage } : {}),
    ...(provenance?.generatedAt !== undefined ? { gradedAt: provenance.generatedAt } : {}),
  };
}
