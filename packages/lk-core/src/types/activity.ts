import type { XAPIStatement } from './xapi.js';

/** The set of activity types supported by learning-kit. */
export type ActivityType = 'multiple-choice' | 'fill-in-the-blanks';

/** Maps each ActivityType string to its corresponding data shape. */
export interface ActivityDataMap {
  'multiple-choice': MultipleChoiceData;
  'fill-in-the-blanks': FillInTheBlanksData;
}

/** Union of all valid activity data shapes. */
export type ActivityData = MultipleChoiceData | FillInTheBlanksData;

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
  /** Minimum scaled score [0–1] required to pass. Defaults to 0.6 when absent. */
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
  /** Optional hint text revealed on learner request. */
  hint?: string;
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
  /** Minimum scaled score [0–1] required to pass. Defaults to 0.6 when absent. */
  passThreshold?: number;
  /** BCP 47 language tag for the activity content. */
  locale?: string;
  /** IRI references to learning objectives addressed by this activity. */
  learningObjectives?: string[];
  /** Subjective difficulty on a 1–5 scale. */
  difficultyLevel?: 1 | 2 | 3 | 4 | 5;
}

/** Union of all learner response shapes. */
export type LearnerResponse = MultipleChoiceLearnerResponse | FillInTheBlanksLearnerResponse;

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

/** Per-item scoring breakdown returned by the scoring engine. */
export interface ScoringDetail {
  /** ID of the option or blank this detail refers to. */
  itemId: string;
  /** Whether the learner's response for this item was correct. */
  correct: boolean;
  /** The learner's actual response for this item. */
  learnerResponse: string | string[];
  /** The expected correct response(s) for this item. */
  correctResponse: string | string[];
  /** Optional weight applied to this item's contribution to the overall score. */
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
  /** Optional top-level feedback message, or null when absent. */
  feedback: string | null;
  /** Per-item scoring breakdown. */
  details: ScoringDetail[];
}

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

/** Fired by activity components on every discrete learner interaction. */
export interface InteractionEvent {
  /** The kind of interaction that occurred. */
  type: 'option-selected' | 'option-deselected' | 'blank-filled' | 'hint-requested' | 'submitted';
  /** ID of the activity that produced the event. */
  activityId: string;
  /** Unix timestamp (ms) of when the interaction occurred. */
  timestamp: number;
  /** Additional event-specific data. */
  payload: Record<string, unknown>;
}
