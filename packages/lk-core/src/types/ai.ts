/**
 * The contract between an activity and a model the HOST runs, for help a
 * learner reads: an explanation of a graded answer, and hints before one.
 *
 * The SDK never calls a model and holds no key, prompt or provider. It builds
 * the facts a model is given — from the item, the learner's answer and the
 * SDK's own scorer — and checks what comes back. The model explains a verdict
 * the SDK reached; it never reaches one.
 */

/**
 * What an author allows AI to do for one item. Absent, or a feature left out,
 * leaves the choice to the deployment. `false` switches a feature off for this
 * item wherever it is delivered; an author can only switch a feature off,
 * never force one on.
 *
 * Switch hints off where any hint would give the answer away — a
 * one-word vocabulary item, say.
 */
export interface ActivityAiPermissions {
  /** An explanation of the learner's graded answer. */
  explanations?: boolean;
  /** Hints before the learner submits. */
  hints?: boolean;
}

/**
 * An activity as a renderer holds it: full data or a `redact()` projection.
 * Structural rather than the data union, so a renderer's own view of an item —
 * whose answer-key fields may be absent — is accepted as it is. The AI
 * functions read every field defensively.
 */
export interface AiActivityInput {
  readonly type: string;
  readonly id: string;
  readonly title: string;
  readonly locale?: unknown;
  readonly redacted?: unknown;
  readonly ai?: unknown;
}

/** The two kinds of help a learner can be given. */
export type AiFeature = 'explanation' | 'hint';

/** The activity types the SDK builds facts for. */
export type AiSupportedActivityType =
  | 'multiple-choice'
  | 'fill-in-the-blanks'
  | 'gap-select'
  | 'dictation';

/**
 * A whole answer's grade, from the SDK's scorer. `category` is the verdict an
 * explanation must agree with: all marks, some, or none.
 */
export interface AiGrade {
  score: number;
  maxScore: number;
  passed: boolean;
  category: AiVerdict;
}

/** The three verdicts an explanation can speak to. */
export type AiVerdict = 'correct' | 'partly-correct' | 'incorrect';

interface AiFactsBase {
  activityId: string;
  title: string;
  /** The language the item is written in, when the author gave one. */
  locale?: string;
}

/** One option of a multiple-choice question, and what the learner did with it. */
export interface AiOptionFact {
  id: string;
  text: string;
  chosen: boolean;
  /** Whether this option is part of the answer; `null` when the key is not available. */
  correct: boolean | null;
  /** The author's feedback on this option. */
  feedback?: string;
}

export interface AiMultipleChoiceFacts extends AiFactsBase {
  activityType: 'multiple-choice';
  question: string;
  mode: 'single' | 'multi';
  options: AiOptionFact[];
}

/** One blank, in the order it appears in the passage. */
export interface AiBlankFact {
  id: string;
  /** 1-based, in passage order. */
  position: number;
  /** What the learner typed, or `''`. */
  typed: string;
  /** The answers that count; `null` when the key is not available. */
  accepted: string[] | null;
  /** The SDK's verdict on this blank; `null` before it is graded or without a key. */
  correct: boolean | null;
  /** The author's hint for this blank. */
  hint?: string;
  /** The author's feedback for this blank. */
  feedback?: string;
}

export interface AiFillInTheBlanksFacts extends AiFactsBase {
  activityType: 'fill-in-the-blanks';
  /** The passage, each blank written as `[1]`, `[2]`… in passage order. */
  passage: string;
  blanks: AiBlankFact[];
}

/** One gap, in the order it appears in the passage. */
export interface AiGapFact {
  id: string;
  /** 1-based, in passage order. */
  position: number;
  /** The words offered at this gap. */
  choices: string[];
  /** The word the learner chose, or `null`. */
  chosen: string | null;
  /** The right word; `null` when the key is not available. */
  answer: string | null;
  /** The SDK's verdict on this gap; `null` before it is graded or without a key. */
  correct: boolean | null;
  /** The author's feedback for this gap. */
  feedback?: string;
}

export interface AiGapSelectFacts extends AiFactsBase {
  activityType: 'gap-select';
  /** The passage, each gap written as `[1]`, `[2]`… in passage order. */
  passage: string;
  gaps: AiGapFact[];
}

/** One word of a dictation, as the SDK's alignment paired it. */
export interface AiWordFact {
  /** The word the recording says; `''` for an extra word the learner added. */
  expected: string;
  /** The word the learner typed; `''` for a word they left out. */
  typed: string;
  status: 'correct' | 'incorrect' | 'missing' | 'extra';
}

export interface AiDictationFacts extends AiFactsBase {
  activityType: 'dictation';
  /** What the recording says; `null` when the key is not available. */
  transcript: string | null;
  /** What the learner typed. */
  typed: string;
  /** The alignment word by word; `null` when the key is not available. */
  words: AiWordFact[] | null;
}

/**
 * What a model is told about one item and one answer: the question as the
 * learner saw it, what they answered, and — part by part — the SDK's verdict.
 */
export type AiItemFacts =
  | AiMultipleChoiceFacts
  | AiFillInTheBlanksFacts
  | AiGapSelectFacts
  | AiDictationFacts;

/**
 * Asks for an explanation of a graded answer. Sent after the SDK has graded
 * it, so `grade` is always present, and an explanation that contradicts
 * `grade.category` is refused.
 */
export interface AiExplanationRequest {
  feature: 'explanation';
  facts: AiItemFacts;
  grade: AiGrade;
  /** The language to answer in: the learner's interface language, when known. */
  learnerLocale?: string;
}

/**
 * Asks for the next hint before the learner submits. `facts` carries the key
 * so a model can hint toward the answer; the SDK refuses any hint that
 * contains it.
 */
export interface AiHintRequest {
  feature: 'hint';
  facts: AiItemFacts;
  /** 1-based: the hint being asked for. */
  hintNumber: number;
  /** The hints already shown for this item, oldest first. */
  previousHints: string[];
  learnerLocale?: string;
}

/** What produced an AI text, for the record a host keeps. */
export interface AiProvenance {
  /** The model's identifier, e.g. a name and version. */
  model?: string;
  /** A hash or id of the prompt revision. */
  promptHash?: string;
  /** ISO 8601. */
  generatedAt?: string;
}

/**
 * What a host's port returns. Plain text: the SDK renders it as text, never
 * as HTML. An explanation may state the verdict it assumed; one that
 * disagrees with the SDK's is refused.
 */
export interface AiTextResult {
  text: string;
  /** For an explanation: the verdict the model explained. */
  verdict?: AiVerdict;
  provenance?: AiProvenance;
}

/** Why a result was not shown. */
export type AiRefusal = 'malformed' | 'empty' | 'too-long' | 'contradicts-grade' | 'reveals-answer';
