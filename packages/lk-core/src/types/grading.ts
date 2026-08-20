/**
 * The return trip for deferred grading.
 *
 * `evaluate()` can say a submission is `deferred` — graded later by an AI or a
 * human — but until now there was no type for the grade that comes BACK, so
 * every consumer invented one. The shapes here are the intersection of two
 * independent production graders (a rubric-based essay grader and a CEFR
 * speaking grader) that converged on the same envelope: a normalised total,
 * per-criterion scores with comments, grader-authored artefacts, a confidence
 * signal, an explicit human-review flag, and provenance.
 *
 * The SDK models the SHAPE and the arithmetic. It never calls a model, never
 * holds a key, and never decides what a rubric means — that stays yours.
 */

/**
 * Lifecycle of a deferred grade. A grade exists only in the `graded` state;
 * every other state means "no grade, and here is why" — which is precisely the
 * distinction that stops an ungraded submission being rendered as a zero.
 */
export type GradingState = 'queued' | 'running' | 'graded' | 'failed' | 'skipped';

/** Who produced a grade. */
export type GraderKind = 'ai' | 'human' | 'auto';

/** Provenance of a grade, so a re-grade two years later is explicable. */
export interface Grader {
  kind: GraderKind;
  /** Identifier of the human grader, when `kind` is `'human'`. */
  id?: string;
  /** Model identifier, when `kind` is `'ai'` (e.g. a model name and version). */
  model?: string;
  /** Hash or id of the prompt/rubric revision used, for auditability. */
  promptHash?: string;
}

/** Optional cost/usage telemetry emitted by an AI grader. */
export interface GraderUsage {
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
}

/** A grader's verdict on one rubric criterion. */
export interface CriterionScore {
  /** Matches a `WrittenResponseRubricCriterion.name` when a rubric is known. */
  name: string;
  /** Scaled [0,1]. Absent when the criterion is judged on an ordinal `band`. */
  score?: number;
  /** Ordinal verdict when the rubric is banded rather than numeric (e.g. `"B1"`). */
  band?: string;
  /** The grader's comment for this criterion, addressed to the learner. */
  comment?: string;
  /** Weight actually applied, echoed from the rubric so the total is checkable. */
  weight?: number;
  /** Not applicable to this submission (e.g. interaction on a monologue task). */
  notApplicable?: boolean;
}

/** A suggested correction anchored in the learner's own text. */
export interface InlineCorrection {
  /** Verbatim span from the submission. */
  original: string;
  /** Suggested replacement. */
  corrected: string;
  explanation?: string;
  /** Character offsets into the submitted text, so a UI can anchor it inline. */
  range?: { start: number; end: number };
  /** Error-type tag (`"article"`, `"tense"`, `"register"`). */
  category?: string;
}

/**
 * A grade that came back from an asynchronous grader. `score` is scaled
 * [0,1] against `maxScore`, matching every other score in the SDK, so a
 * grader that works in points must normalise before handing one over
 * (or set `maxScore` accordingly).
 */
export interface GradeRecord {
  score: number;
  maxScore: number;
  passed: boolean;
  /** Narrative feedback addressed to the learner. */
  feedback: string | null;
  /** Per-criterion breakdown, when the grader worked against a rubric. */
  criteria?: CriterionScore[];
  /** Corrections anchored in the learner's text. */
  corrections?: InlineCorrection[];
  /** Supporting observations the grader cited. */
  evidence?: string[];
  /** How the grader reached this verdict. */
  rationale?: string;
  /** The grader's own confidence — a signal for routing to human review. */
  confidence?: 'high' | 'medium' | 'low';
  /** The grader is unsure or the submission is atypical; route to a human. */
  requiresHumanReview?: boolean;
  grader?: Grader;
  usage?: GraderUsage;
  /** ISO 8601 timestamp of when the grade was produced. */
  gradedAt?: string;
}
