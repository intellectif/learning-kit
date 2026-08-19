import type { TextMatchPolicy } from '../scoring/text-match.js';
import type { XAPIStatement } from './xapi.js';

/**
 * Maps each ActivityType string to its corresponding data shape.
 *
 * Open for extension via TypeScript module augmentation: a consumer that
 * registers a custom activity type (`registerActivityType`) can augment this
 * interface so `ActivityType`, `ActivityData`, `validateActivity`, and
 * `evaluate` pick the new type up without an SDK release:
 *
 * ```ts
 * declare module '@intellectif/lk-core' {
 *   interface ActivityDataMap { 'my-type': MyTypeData }
 *   interface LearnerResponseMap { 'my-type': MyTypeLearnerResponse }
 * }
 * ```
 */
export interface ActivityDataMap {
  'multiple-choice': MultipleChoiceData;
  'fill-in-the-blanks': FillInTheBlanksData;
  'written-response': WrittenResponseData;
}

/**
 * The set of activity types supported by learning-kit. Derived from
 * {@link ActivityDataMap}, so module augmentation widens it automatically.
 */
export type ActivityType = keyof ActivityDataMap;

/** Union of all valid activity data shapes. */
export type ActivityData = ActivityDataMap[ActivityType];

/**
 * Optional media (image/audio/video) shown above a question or passage.
 * URL-only: hosting/delivery is the consuming application's responsibility.
 */
export interface ActivityMedia {
  /** The kind of media; selects the rendered element. `embed` → sandboxed iframe. */
  type: 'image' | 'audio' | 'video' | 'embed';
  /**
   * Source URL. For `embed` this MUST be the provider's embeddable URL
   * (e.g. `https://www.youtube.com/embed/<id>`), not the watch page.
   */
  url: string;
  /** Alternative text. Required for `image` and `embed`; optional label for audio/video. */
  alt?: string;
  /** Optional WebVTT captions track URL for `audio`/`video`. */
  captionsUrl?: string;
}

/**
 * Optional authored "overall feedback" shown after submission, chosen by
 * whether the learner passed (h5p-style overall feedback). Distinct from
 * per-option feedback; either field may be omitted.
 */
export interface ActivityFeedback {
  /** Shown when the learner passes (score ≥ pass threshold). */
  correct?: string;
  /** Shown when the learner does not pass. */
  incorrect?: string;
}

/** A single selectable option within a Multiple Choice activity. */
export interface MultipleChoiceOption {
  /** Unique identifier for this option within the activity. */
  id: string;
  /** Display text shown to the learner. */
  text: string;
  /** Whether this option is part of the correct answer. */
  isCorrect: boolean;
  /** Optional per-option feedback shown after submission. */
  feedback?: string;
}

/** Data contract for a Multiple Choice activity. */
export interface MultipleChoiceData {
  schemaVersion: '1.0';
  type: 'multiple-choice';
  /** Unique identifier for this activity. */
  id: string;
  /** Human-readable title used in xAPI statements and error boundaries. */
  title: string;
  /** The question stem presented to the learner. */
  question: string;
  /** `single` allows one selection; `multi` allows multiple. */
  mode: 'single' | 'multi';
  /** Ordered list of answer options. */
  options: MultipleChoiceOption[];
  /** Scoring algorithm applied when the learner submits. */
  scoringStrategy: 'all-or-nothing' | 'partial';
  /** Optional media shown above the question. */
  media?: ActivityMedia;
  /** Optional authored overall feedback shown after submission. */
  feedback?: ActivityFeedback;
  /** Minimum scaled score [0–1] required to pass. Defaults to {@link DEFAULT_PASS_THRESHOLD} (0.7) when absent. */
  passThreshold?: number;
  /** When true, options are shuffled deterministically per session. */
  shuffle?: boolean;
  /** BCP 47 language tag for the activity content. */
  locale?: string;
  /** IRI references to learning objectives addressed by this activity. */
  learningObjectives?: string[];
  /** Subjective difficulty on a 1–5 scale. */
  difficultyLevel?: 1 | 2 | 3 | 4 | 5;
}

/** Configuration for a single fill-in-the-blank slot. */
export interface BlankConfig {
  /** Unique identifier matching the `{{blank_id}}` placeholder in the passage. */
  id: string;
  /** List of strings accepted as correct answers for this blank. */
  acceptedAnswers: string[];
  /** Whether answer matching is case-sensitive. Defaults to false. */
  caseSensitive?: boolean;
  /** Whether leading/trailing whitespace is stripped before matching. Defaults to true. */
  trimWhitespace?: boolean;
  /**
   * Optional matching-tolerance policy for this blank (Unicode normalization,
   * diacritic folding, whitespace collapse, punctuation tolerance, typo
   * tolerance). Every tolerance is opt-in; when absent, matching reproduces
   * the v1 trim + case-fold semantics exactly. Fields set here take
   * precedence over the legacy `caseSensitive` / `trimWhitespace` flags.
   */
  match?: TextMatchPolicy;
  /** Optional hint text revealed on learner request. */
  hint?: string;
  /** Optional feedback shown inline next to this blank after submission. */
  feedback?: string;
}

/** Data contract for a Fill-in-the-Blanks activity. */
export interface FillInTheBlanksData {
  schemaVersion: '1.0';
  type: 'fill-in-the-blanks';
  /** Unique identifier for this activity. */
  id: string;
  /** Human-readable title used in xAPI statements and error boundaries. */
  title: string;
  /** Passage text containing `{{blank_id}}` placeholders. */
  passage: string;
  /** Configuration for each blank in the passage. */
  blanks: BlankConfig[];
  /** Scoring algorithm applied when the learner submits. */
  scoringStrategy: 'all-or-nothing' | 'partial';
  /** Optional media shown above the passage. */
  media?: ActivityMedia;
  /** Optional authored overall feedback shown after submission. */
  feedback?: ActivityFeedback;
  /** Minimum scaled score [0–1] required to pass. Defaults to {@link DEFAULT_PASS_THRESHOLD} (0.7) when absent. */
  passThreshold?: number;
  /** BCP 47 language tag for the activity content. */
  locale?: string;
  /** IRI references to learning objectives addressed by this activity. */
  learningObjectives?: string[];
  /** Subjective difficulty on a 1–5 scale. */
  difficultyLevel?: 1 | 2 | 3 | 4 | 5;
}

/** A single criterion within a written-response grading rubric. */
export interface WrittenResponseRubricCriterion {
  /** Criterion name (e.g. "Task achievement", "Grammar range"). */
  name: string;
  /** Optional longer description of what the criterion assesses. */
  description?: string;
  /** Non-negative weight of this criterion in the overall grade. */
  weight: number;
}

/** Grading rubric attached to a written-response activity. */
export interface WrittenResponseRubric {
  /** Optional display label for the rubric as a whole. */
  label?: string;
  /** The criteria the response is graded against. Non-empty when present. */
  criteria: WrittenResponseRubricCriterion[];
}

/**
 * Data contract for a Written Response activity (free-text writing graded
 * asynchronously — by an AI or human grader — after submission).
 *
 * Wire-format note (Req 22.9): field names and casing are locked for
 * byte-compatibility with consumer-stored JSONB rows. `feedback` and
 * `passThreshold` are SDK-side optional additions for component parity
 * (Req 22.8 / Req 3.9) — being optional, their absence keeps stored payloads
 * byte-identical.
 */
export interface WrittenResponseData {
  schemaVersion: '1.0';
  type: 'written-response';
  /** Unique identifier for this activity. */
  id: string;
  /** Human-readable title used in xAPI statements and error boundaries. */
  title: string;
  /** The writing prompt, as plain text. */
  prompt: string;
  /** Optional sanitised rich-HTML sidecar of the prompt (not rendered by the SDK yet). */
  promptHtml?: string;
  /** Minimum acceptable word count (≥ 0). */
  minWords: number;
  /** Maximum acceptable word count (≥ 1, and ≥ `minWords`). */
  maxWords: number;
  /** Optional grading rubric consumed by the asynchronous grader. */
  rubric?: WrittenResponseRubric;
  /** Optional target language/level for the response (e.g. `"en-A2"`, `"es-B1"`). */
  languageTarget?: string;
  /** Optional media shown above the prompt. */
  media?: ActivityMedia;
  /** Optional authored overall feedback (surfaced once the deferred grade exists). */
  feedback?: ActivityFeedback;
  /** Minimum scaled score [0–1] required to pass once graded. Defaults to {@link DEFAULT_PASS_THRESHOLD} (0.7) when absent. */
  passThreshold?: number;
  /** BCP 47 language tag for the activity content. */
  locale?: string;
  /** IRI references to learning objectives addressed by this activity. */
  learningObjectives?: string[];
  /** Subjective difficulty on a 1–5 scale. */
  difficultyLevel?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Maps each ActivityType string to its learner-response shape. Open for
 * extension via module augmentation, mirroring {@link ActivityDataMap}.
 */
export interface LearnerResponseMap {
  'multiple-choice': MultipleChoiceLearnerResponse;
  'fill-in-the-blanks': FillInTheBlanksLearnerResponse;
  'written-response': WrittenResponseLearnerResponse;
}

/** Union of all learner response shapes. */
export type LearnerResponse = LearnerResponseMap[keyof LearnerResponseMap];

/** Learner response for a Multiple Choice activity. */
export interface MultipleChoiceLearnerResponse {
  type: 'multiple-choice';
  /** IDs of the options the learner selected. */
  selectedOptionIds: string[];
}

/** Learner response for a Fill-in-the-Blanks activity. */
export interface FillInTheBlanksLearnerResponse {
  type: 'fill-in-the-blanks';
  /** Map of blank ID to the learner's typed answer. */
  answers: Record<string, string>;
}

/** Learner response for a Written Response activity. */
export interface WrittenResponseLearnerResponse {
  type: 'written-response';
  /** The learner's free-text response. */
  text: string;
  /** Word count of `text`, computed with the canonical `countWords()` helper. */
  wordCount: number;
}

/**
 * Fine-grained outcome of the learner's action on a single item, replacing the
 * ambiguous {@link ScoringDetail.correct}:
 * - `correct` — the learner selected/entered the right answer.
 * - `incorrect` — the learner selected/entered a wrong answer.
 * - `correct-omission` — the learner correctly left a non-answer unselected (multiple-choice only).
 * - `incorrect-omission` — the learner failed to select a correct answer (multiple-choice only).
 */
export type ScoringOutcome = 'correct' | 'incorrect' | 'correct-omission' | 'incorrect-omission';

/** Per-item scoring breakdown returned by the scoring engine. */
export interface ScoringDetail {
  /** ID of the option or blank this detail refers to. */
  itemId: string;
  /**
   * @deprecated Ambiguous: for multiple-choice this means "the learner acted
   * correctly on this option" (`wasSelected === option.isCorrect`), NOT "this
   * option is the answer" — an unselected wrong option reads `correct: true`.
   * Read {@link ScoringDetail.outcome} instead; `correct` remains written for
   * backward compatibility and will be removed in v1.0.
   */
  correct: boolean;
  /**
   * Unambiguous outcome of the learner's action on this item. Optional in the
   * type so 0.2-era consumer-constructed literals keep compiling, but ALWAYS
   * written by both built-in scorers since 0.3.0; becomes required in v1.0
   * when the deprecated `correct` is removed.
   */
  outcome?: ScoringOutcome;
  /** The learner's actual response for this item. */
  learnerResponse: string | string[];
  /** The expected correct response(s) for this item. */
  correctResponse: string | string[];
  /**
   * Weight applied to this item's contribution to the overall score. Both
   * built-in scorers currently weight every item equally and write `1`.
   */
  weight?: number;
}

/** Full scoring result returned by the scoring engine. */
export interface ScoringResult {
  /** Scaled score in the range [0, 1]. */
  score: number;
  /** Maximum possible scaled score (always 1). */
  maxScore: number;
  /** Whether the score meets or exceeds the activity's pass threshold. */
  passed: boolean;
  /**
   * The authored overall feedback selected for this result: `feedback.correct`
   * when the learner passed, `feedback.incorrect` otherwise; `null` when the
   * activity authored no matching feedback.
   */
  feedback: string | null;
  /** Per-item scoring breakdown. */
  details: ScoringDetail[];
}

/**
 * Progress facts about a deferred (asynchronously graded) submission that are
 * computable synchronously at submit time. For written-response, both fields
 * are always present and `wordCount` is recomputed from the submitted text
 * with the canonical `countWords()` (the client-supplied count is not trusted).
 */
export interface DeferredScoringPartial {
  /** Whether the recomputed word count falls within `[minWords, maxWords]`. */
  withinWordBounds?: boolean;
  /** Recomputed word count of the submitted text. */
  wordCount?: number;
  [key: string]: unknown;
}

/**
 * The outcome of evaluating a learner response against an activity — the
 * union `evaluate()` returns. Unlike {@link ScoringResult}, it can express
 * "not gradable yet" (`deferred`) and "not gradable at all" (`unscorable`),
 * so an ungraded written response is never conflated with a score of 0.
 */
export type ItemOutcome =
  | {
      status: 'scored';
      /** Scaled score in the range [0, 1]. */
      score: number;
      /** Maximum possible scaled score. */
      maxScore: number;
      /** Whether the score meets or exceeds the activity's pass threshold. */
      passed: boolean;
      /** Authored overall feedback selected by pass state, or null. */
      feedback: string | null;
      /** Per-item scoring breakdown. */
      details: ScoringDetail[];
    }
  | {
      status: 'deferred';
      /** Why the grade is deferred (asynchronous AI/human grading). */
      reason: 'requires_async_grading';
      /** Maximum possible scaled score once graded. */
      maxScore: number;
      /** Synchronously computable progress facts (word bounds, counts). */
      partial?: DeferredScoringPartial;
    }
  | {
      status: 'unscorable';
      /** Why no grade can be produced (e.g. unregistered activity type). */
      reason: string;
      /** Maximum possible scaled score, when known. */
      maxScore: number;
    };

/** A single validation error produced by `validateActivity`. */
export interface ValidationError {
  /** JSON-path-style location of the invalid field. */
  path: string[];
  /** Human-readable description of the validation failure. */
  message: string;
  /** Machine-readable error code. */
  code: string;
}

/**
 * Result of a `validateActivity` call.
 * On success, `data` is the validated and typed activity data.
 * On failure, `errors` contains one entry per violated constraint.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

/** The payload delivered to an activity's `onComplete` callback. */
export interface ActivityResult {
  /** Scaled score in the range [0, 1]. */
  score: number;
  /** Maximum possible scaled score (always 1). */
  maxScore: number;
  /** Whether the learner passed based on the activity's pass threshold. */
  passed: boolean;
  /** Time in milliseconds from first interaction to submission. */
  timeSpent: number;
  /** The xAPI statement built and (optionally) sent for this attempt. */
  xapiStatement: XAPIStatement;
}

/**
 * The kinds of interaction the built-in components emit. Custom activity types
 * registered by consumers may emit their own kinds, so any string is accepted;
 * the named literals are kept for autocompletion.
 */
export type InteractionKind =
  | 'option-selected'
  | 'option-deselected'
  | 'blank-filled'
  | 'hint-requested'
  | 'text-changed'
  | 'submitted'
  // biome-ignore lint/complexity/noBannedTypes: `string & {}` preserves literal autocompletion while keeping the union open for registered custom types
  | (string & {});

/** Fired by activity components on every discrete learner interaction. */
export interface InteractionEvent {
  /** The kind of interaction that occurred. */
  type: InteractionKind;
  /** ID of the activity that produced the event. */
  activityId: string;
  /** Unix timestamp (ms) of when the interaction occurred. */
  timestamp: number;
  /** Additional event-specific data. */
  payload: Record<string, unknown>;
}
