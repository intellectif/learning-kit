import { DeferredScoringError, RedactedScoringError, UnknownActivityTypeError } from '../errors.js';
import { isRedacted } from '../is-redacted.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import type {
  ActivityData,
  ActivityType,
  ItemOutcome,
  LearnerResponse,
  ScoringResult,
} from '../types/activity.js';
import type {
  ItemScoringPolicy,
  ItemTryScore,
  ResolvedItemScoringPolicy,
} from '../types/item-scoring.js';
import { isGradeInRange } from './grade-numbers.js';
import { resolveItemScoringPolicy, scoreTries } from './item-scoring.js';
import { computePassThreshold, selectFeedback } from './pass-threshold.js';
import { type RoundingPolicy, roundingPolicyOf } from './rounding.js';

// Every type a public signature on this subpath names — argument, return value,
// and the shapes inside them an adapter fills in. A consumer that imports
// `gradeReadAloud` from `./scoring` imports it from here alone, and a function
// whose arguments and result cannot be named is one that has to be called from
// `any` — which is how the evidence stops being checked. Type-only: the bundle
// is unchanged.
export type {
  ItemOutcome,
  ReadAloudData,
  ReadAloudLearnerResponse,
  RecordingRef,
} from '../types/activity.js';
export type { GradeRecord } from '../types/grading.js';
export type {
  ItemScoringCount,
  ItemScoringPolicy,
  ItemScoringPolicyIssue,
  ItemTriesScore,
  ItemTry,
  ItemTryScore,
  ResolvedItemScoringPolicy,
} from '../types/item-scoring.js';
export type {
  GradeReadAloudOptions,
  ReadAloudWordAlignment,
  ReadAloudWordState,
  SpeechAssessment,
  SpeechMeasurement,
  SpeechPhoneme,
  SpeechPhonemeCandidate,
  SpeechPlausibilityPolicy,
  SpeechSyllable,
  SpeechUnscorable,
  SpeechUnscorableCode,
  SpeechWord,
  SpeechWordError,
  WavInspection,
  WavInspectionPolicy,
} from '../types/speech.js';
export type {
  AssessmentScore,
  AssessmentSectionInput,
  CompositionPolicy,
  PassFailureReason,
  ScoredItem,
  SectionScore,
} from './compose.js';
export { composeAssessmentScore } from './compose.js';
export type {
  DictationAlignment,
  DictationCharOp,
  DictationReference,
  DictationWordAlignment,
} from './dictation/index.js';
export {
  alignDictation,
  DICTATION_MAX_ACCEPTED_TRANSCRIPTS,
  DICTATION_MAX_EQUIVALENCE_LENGTH,
  DICTATION_MAX_EQUIVALENCES,
  DICTATION_MAX_TEXT_LENGTH,
  DICTATION_MAX_TRANSCRIPT_LENGTH,
  dictationReferenceWords,
  diffDictationChars,
} from './dictation/index.js';
export {
  DEFAULT_ITEM_SCORING_POLICY,
  ITEM_SCORING_MAX_RETRIES,
  resolveItemScoringPolicy,
  scoreTries,
  validateItemScoringPolicy,
} from './item-scoring.js';
export { computePassThreshold, DEFAULT_PASS_THRESHOLD } from './pass-threshold.js';
export type { Band, RoundingMode, RoundingPolicy } from './rounding.js';
export { classifyBand, gte, roundGrade } from './rounding.js';
export {
  alignReadAloud,
  gradeReadAloud,
  inspectWav,
  READ_ALOUD_MAX_DIMENSION_WEIGHT,
  READ_ALOUD_MAX_REFERENCE_LENGTH,
  READ_ALOUD_MAX_SECONDS,
  READ_ALOUD_MAX_TAKES,
  SPEECH_ASSESSMENT_MAX_WORDS,
  validateSpeechAssessment,
} from './speech/index.js';
export type { TextMatchPolicy, TextMatchResult } from './text-match.js';
export { levenshteinDistance, matchText } from './text-match.js';
export { outcomeFromUnscorable } from './unscorable.js';

/**
 * Options for {@link score} and {@link evaluate}. Additive: with none, both
 * behave exactly as they always have.
 */
export interface ScoringOptions {
  /**
   * Compare the pass line the way the score is displayed — both sides rounded,
   * via {@link computePassThreshold} — so an item shown as "70%" is not
   * recorded as a fail at 69.995. `passed` AND the authored feedback selected by
   * it follow the rounded comparison. Opt-in, for the reason
   * {@link computePassThreshold} gives: switching it on moves item-level
   * pass/fail for scores in the rounding band.
   *
   * Checked at the call: `null` reads as no policy, and a policy that cannot be
   * applied — an unknown `mode`, or a `dp` that is not a whole number from 0 to
   * 15 — throws a `RangeError` instead of quietly failing every comparison.
   */
  rounding?: RoundingPolicy;
}

/**
 * Options for {@link evaluate} and {@link evaluateTries}: {@link ScoringOptions},
 * and the paper's scoring policy.
 */
export interface EvaluateOptions extends ScoringOptions {
  /**
   * What hints and tries cost, and which try counts — see
   * {@link ItemScoringPolicy}. Absent or `null`, nothing costs anything and the
   * outcome is exactly what it was before policies existed.
   *
   * `evaluate` reads the hints from the response's `hintsRevealed`. The count
   * is the client's: when your server knows better — it served the AI hints,
   * say — write its own count there before you evaluate.
   *
   * Checked at the call: a policy `validateItemScoringPolicy` refuses throws a
   * `RangeError`. A grade-moving setting has no safe way to be misread. Under a
   * policy, a scored outcome whose numbers cannot be a grade — a registered
   * scorer out of contract — has nothing to charge a cost to, and comes back
   * `unscorable`.
   */
  scoring?: ItemScoringPolicy | null;
}

/**
 * Scores a learner response against activity data and returns a full
 * {@link ScoringResult}.
 *
 * Pure and deterministic with no side effects. It does **not** re-validate
 * `activityData` — schema validation is the component boundary's
 * responsibility; this is a low-level scoring primitive that trusts its typed
 * inputs. Dispatch is registry-backed: consumer-registered types with `sync`
 * scoring work here too. An unregistered type throws
 * {@link UnknownActivityTypeError}; a type whose grading is deferred (e.g.
 * `written-response`) throws {@link DeferredScoringError} — use
 * {@link evaluate}, which can express "not graded yet".
 */
export function score(
  activityType: ActivityType,
  activityData: ActivityData,
  learnerResponse: LearnerResponse,
  options?: ScoringOptions,
): ScoringResult {
  const rounding = roundingPolicyOf(options?.rounding);
  const descriptor = getActivityTypeDescriptor(activityType);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(String(activityType));
  }
  if (descriptor.scoring.kind === 'deferred') {
    throw new DeferredScoringError(descriptor.type);
  }
  if (isRedacted(activityData)) {
    throw new RedactedScoringError(descriptor.type);
  }

  const result = descriptor.scoring.score(activityData, learnerResponse);
  if (!Number.isFinite(result.score)) {
    throw new RedactedScoringError(descriptor.type);
  }
  const passed = computePassThreshold(activityData, result.score, rounding);
  return { ...result, passed, feedback: result.feedback ?? selectFeedback(activityData, passed) };
}

/**
 * Evaluates a learner response against an activity and returns an
 * {@link ItemOutcome} — the resilient, forward-compatible alternative to
 * {@link score}:
 *
 * - Synchronously graded types return `{ status: 'scored', ... }` with the
 *   same numbers `score()` produces.
 * - Asynchronously graded types (e.g. `written-response`) return
 *   `{ status: 'deferred', reason, partial }` instead of a fake zero — "not
 *   graded yet" is expressible in the type system, never conflated with
 *   "wrong".
 * - An unregistered `data.type` returns `{ status: 'unscorable' }` rather
 *   than throwing, so a mixed-version content bank cannot crash an exam run.
 * - With a scoring policy (`options.scoring`), a scored outcome is charged what
 *   the response's hints cost, and `passed` is read from what is left. The
 *   `details` and authored `feedback` stay the answer's. For several tries at
 *   one question, use {@link evaluateTries}.
 *
 * The activity type is read from `data.type` — there is no separate type
 * parameter to disagree with the payload.
 */
export function evaluate(
  data: ActivityData,
  response: LearnerResponse,
  options?: EvaluateOptions,
): ItemOutcome {
  // A malformed option is the caller's configuration, not the content bank's:
  // it throws before any item is read, rather than grading every item wrong.
  const rounding = roundingPolicyOf(options?.rounding);
  const scoring = options?.scoring;
  const rules = resolveItemScoringPolicy(scoring);
  const outcome = evaluateAnswer(data, response, rounding);
  if (scoring === undefined || scoring === null || outcome.status !== 'scored') {
    return outcome;
  }
  return costed(data, outcome, [{ response, outcome }], rules, rounding).outcome;
}

/** What `evaluate` does with no policy: the answer's own outcome. */
function evaluateAnswer(
  data: ActivityData,
  response: LearnerResponse,
  rounding: RoundingPolicy | undefined,
): ItemOutcome {
  const type = (data as { type?: unknown }).type;
  const descriptor = typeof type === 'string' ? getActivityTypeDescriptor(type) : undefined;

  if (descriptor === undefined) {
    return {
      status: 'unscorable',
      reason: `Activity type "${String(type)}" is not registered`,
      maxScore: 1,
    };
  }

  if (descriptor.scoring.kind === 'deferred') {
    const partial = descriptor.scoring.partial?.(data, response);
    return {
      status: 'deferred',
      reason: descriptor.scoring.reason,
      maxScore: 1,
      ...(partial !== undefined ? { partial } : {}),
    };
  }

  if (isRedacted(data)) {
    return {
      status: 'unscorable',
      reason:
        'Activity data is redacted (no answer key), so it cannot be scored on the client. Score against the full data server-side.',
      maxScore: 1,
    };
  }

  const result = descriptor.scoring.score(data, response);
  if (!Number.isFinite(result.score)) {
    // Defence in depth: incomplete data (a missing answer key, an empty
    // options array) used to divide by zero and surface as a real score of
    // NaN, which JSON-serializes to null in a grade column.
    return {
      status: 'unscorable',
      reason: `Scoring "${descriptor.type}" produced a non-finite score; the activity data is incomplete.`,
      maxScore: result.maxScore,
    };
  }
  const passed = computePassThreshold(data, result.score, rounding);
  return {
    status: 'scored',
    score: result.score,
    maxScore: result.maxScore,
    passed,
    feedback: result.feedback ?? selectFeedback(data, passed),
    details: result.details,
  };
}

type ScoredOutcome = Extract<ItemOutcome, { status: 'scored' }>;

/** A question's outcome over its tries: see {@link evaluateTries}. */
export interface ItemTriesOutcome {
  /**
   * The question's outcome under the policy. Scored: the counted try's
   * `details` and authored `feedback` — they describe that answer — with its
   * `score` after what it cost and `passed` read from that score. Anything
   * else — deferred, unscorable — is the first try's outcome as `evaluate`
   * gives it.
   */
  outcome: ItemOutcome;
  /** 0-based: the try whose score counts. `null` when the outcome is not scored. */
  counted: number | null;
  /**
   * Every try the policy allows, as scored: before and after what it cost.
   * Empty when the outcome is not scored, or when, with no policy, it is an
   * outcome `evaluate` passes through that cannot be a grade.
   */
  tries: ItemTryScore[];
}

/**
 * A question's outcome from every try a learner made at it, in order, under a
 * paper's scoring policy: what a server that scores practice itself calls,
 * with the tries it stored, to reach the grade the SDK's components reached.
 *
 * Each response is scored as {@link evaluate} scores it, and costed and chosen
 * as {@link scoreTries} does: hints from each response's `hintsRevealed`,
 * which counts from the start of the question; the tries before each one;
 * and the try `counts` names. Only the first `1 + retries` responses are read.
 *
 * With no policy it is `evaluate` of the first response: one try, as before.
 * With no response at all, the question was never answered —
 * `{ status: 'deferred', reason: 'no_response_recorded' }`, as a missing slot
 * is everywhere else.
 */
export function evaluateTries(
  data: ActivityData,
  responses: readonly LearnerResponse[],
  options?: EvaluateOptions,
): ItemTriesOutcome {
  const rounding = roundingPolicyOf(options?.rounding);
  const rules = resolveItemScoringPolicy(options?.scoring);
  if (responses.length === 0) {
    return {
      outcome: { status: 'deferred', reason: 'no_response_recorded', maxScore: 1 },
      counted: null,
      tries: [],
    };
  }
  const graded = responses
    .slice(0, 1 + rules.retries)
    .map((response) => ({ response, outcome: evaluateAnswer(data, response, rounding) }));
  const opening = (graded[0] as { outcome: ItemOutcome }).outcome;
  if (opening.status !== 'scored') {
    return { outcome: opening, counted: null, tries: [] };
  }
  // No policy is one try that costs nothing: `evaluate` of the first answer,
  // exactly — even an outcome `evaluate` passes through that is not a grade.
  const unset = options?.scoring === undefined || options.scoring === null;
  if (unset && !isGradeInRange(opening.score, opening.maxScore)) {
    return { outcome: opening, counted: 0, tries: [] };
  }
  return costed(data, opening, graded, rules, rounding);
}

/**
 * Charges each try what it cost and picks the one that counts. A try whose
 * numbers cannot be a grade — a registered scorer out of contract — has
 * nothing to charge a cost to, and leaves the question unscorable rather than
 * scored on the other tries.
 */
function costed(
  data: ActivityData,
  opening: ScoredOutcome,
  graded: readonly { response: LearnerResponse; outcome: ItemOutcome }[],
  rules: ResolvedItemScoringPolicy,
  rounding: RoundingPolicy | undefined,
): ItemTriesOutcome {
  const scored: ScoredOutcome[] = [];
  for (const [index, one] of graded.entries()) {
    if (
      one.outcome.status !== 'scored' ||
      !isGradeInRange(one.outcome.score, one.outcome.maxScore)
    ) {
      return {
        outcome: {
          status: 'unscorable',
          reason: `Try ${index + 1} has no grade to charge a cost to, so the question has none under this scoring policy.`,
          maxScore: opening.maxScore,
        },
        counted: null,
        tries: [],
      };
    }
    scored.push(one.outcome);
  }
  const result = scoreTries(
    scored.map((outcome, index) => ({
      score: outcome.score,
      maxScore: outcome.maxScore,
      hintsRevealed: (graded[index]?.response as { hintsRevealed?: number } | undefined)
        ?.hintsRevealed,
    })),
    rules,
  );
  const chosen = scored[result.counted] as ScoredOutcome;
  return {
    outcome:
      result.score === chosen.score
        ? chosen
        : {
            ...chosen,
            score: result.score,
            passed: computePassThreshold(data, result.score, rounding),
          },
    counted: result.counted,
    tries: result.tries,
  };
}
