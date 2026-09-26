/**
 * The contract between an activity and a model the HOST runs, for help a
 * learner reads: an explanation of a graded answer, and hints before one.
 *
 * The SDK never calls a model and holds no key, prompt or provider. It builds
 * the facts a model is given — from the item, the learner's answer and the
 * SDK's own scorer — and checks what comes back. The model explains a verdict
 * the SDK reached; it never reaches one.
 */

import type { DraftValidationResult, ItemFinding } from './authoring.js';
import type { CriterionScore, GraderUsage, InlineCorrection } from './grading.js';

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
  /**
   * An explanation of the learner's graded answer — and, on a written
   * response, feedback on a draft, and on a read-aloud, coaching on the
   * marks: each is a model's words about the learner's own answer.
   */
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

/** The kinds of help a learner can be given. */
export type AiFeature = 'explanation' | 'hint' | 'writing-feedback' | 'pronunciation-coaching';

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
  /**
   * What the call cost, as the provider reported it to your port: the same
   * {@link GraderUsage} a returned grade carries, so one shape covers help for
   * a learner and marking by a grader.
   *
   * The SDK never estimates it and never adds it up. It carries what a port
   * sends through to `onInteraction`, beside the provenance, so the record of
   * what a learner was shown and the record of what it cost are the same
   * record. Numbers that are not finite and zero or more are dropped.
   */
  usage?: GraderUsage;
}

/**
 * Why a result was not shown. `misquotes-answer` is writing feedback that
 * corrects words the learner did not write: a correction whose quote is not in
 * the draft, or not where it claims to be. `contradicts-marks` is coaching on
 * a word the engine did not mark, or on a sound it did not report.
 * `contradicts-item` is a critique of an item that points at a field the item
 * does not have, or quotes words that field does not contain.
 */
export type AiRefusal =
  | 'malformed'
  | 'empty'
  | 'too-long'
  | 'contradicts-grade'
  | 'reveals-answer'
  | 'misquotes-answer'
  | 'contradicts-marks'
  | 'contradicts-item';

// ── Feedback on writing ─────────────────────────────────────────────────

/** One criterion of a written response's rubric, as the author wrote it. */
export interface AiRubricCriterionFact {
  name: string;
  description?: string;
  weight: number;
}

/**
 * What a model is told about a draft of a written response: the task as the
 * learner saw it, the draft verbatim, and the rubric it will be graded on.
 */
export interface AiWritingFacts {
  activityType: 'written-response';
  activityId: string;
  title: string;
  /** The language the item is written in, when the author gave one. */
  locale?: string;
  prompt: string;
  /** The draft, exactly as the learner wrote it. Every correction quotes it. */
  text: string;
  /** Recomputed with `countWords`, as the grader will count it. */
  wordCount: number;
  minWords: number;
  maxWords: number;
  withinWordBounds: boolean;
  /** The rubric the answer will be graded on; `null` when the item has none. */
  rubric: AiRubricCriterionFact[] | null;
  /** The target language and level, when the author gave one (e.g. `"en-A2"`). */
  languageTarget?: string;
}

/**
 * Asks for feedback on a draft of a written response, before the learner
 * submits it. Practice only.
 */
export interface AiWritingFeedbackRequest {
  feature: 'writing-feedback';
  facts: AiWritingFacts;
  /** 1-based: which draft this is. */
  draftNumber: number;
  /** The text of the feedback already shown on earlier drafts, oldest first. */
  previousFeedback: string[];
  /** The language to write in: the learner's interface language, when known. */
  learnerLocale?: string;
}

/**
 * One correction a model proposes. `original` must be words the learner
 * wrote; the SDK finds them in the draft itself, so a model need not count
 * characters — leave `range` out unless you are sure of it, because a range
 * that does not hold the quote is refused.
 */
export interface AiWritingCorrection {
  original: string;
  corrected: string;
  explanation?: string;
  /** An error-type tag, e.g. `"tense"`, `"article"`. */
  category?: string;
  range?: { start: number; end: number };
}

/**
 * A model's judgement of one rubric criterion. The SDK attaches the author's
 * weight; a weight sent here is ignored.
 */
export type AiCriterionJudgement = Omit<CriterionScore, 'weight'> & { weight?: number };

/**
 * What a host's `writingFeedback` port returns: the overall feedback as plain
 * text, and optionally corrections and a judgement per rubric criterion.
 */
export interface AiWritingFeedbackResult {
  /** The overall feedback, addressed to the learner. Plain text, never HTML. */
  text: string;
  corrections?: AiWritingCorrection[];
  criteria?: AiCriterionJudgement[];
  provenance?: AiProvenance;
  usage?: GraderUsage;
}

/**
 * Feedback on a draft, as the SDK accepted it: what a learner is shown.
 */
export interface AiWritingFeedback {
  text: string;
  /**
   * Every correction, anchored in the draft: `range` is where the SDK found
   * the quote, and `original` is the draft's own text at that range.
   */
  corrections: InlineCorrection[];
  /** The model's judgements, with the rubric's weights. */
  criteria: CriterionScore[];
  /**
   * The rubric's weighted total of the judgements, from 0 to 1, computed by
   * the SDK as `gradeFromRubric` computes a grade — when every criterion of
   * the rubric was judged; `null` otherwise, and on an item with no rubric.
   *
   * **An indication, never a grade:** it is a model's reading of a draft the
   * learner has not submitted, and nothing in the SDK scores an answer with
   * it. `ai-writing-feedback-shown` reports it, so a record can say what the
   * learner was shown.
   */
  indicativeScore: number | null;
  provenance?: AiProvenance;
  usage?: GraderUsage;
}

// ── Coaching on a read-aloud ────────────────────────────────────────────

/** One sound of a word, as the engine reported it. */
export interface AiSoundFact {
  /** The sound expected, in the assessment's phoneme alphabet. */
  symbol: string;
  /** How close it came, 0..100, when the engine scored it. */
  accuracy?: number;
  /** What the engine heard instead, best first, each with its score 0..100. */
  heardAs?: { symbol: string; score: number }[];
}

/** One word of a reading, as the engine marked it. */
export interface AiReadingWordFact {
  /** `w<n>` for a word of the text; absent for a word the learner added. */
  itemId?: string;
  /** The word of the text, normalised; `''` for a word the learner added. */
  word: string;
  /** What was heard, normalised; `''` for an omitted word. */
  heard: string;
  state: 'correct' | 'mispronounced' | 'omitted' | 'inserted';
  /** The engine's accuracy for the word, 0..100, when it has one. */
  accuracy?: number;
  /** The word's sounds, from the full assessment only. */
  sounds?: AiSoundFact[];
}

/**
 * What a model is told about a read-aloud: the text, the engine's marks word
 * by word, and its scores. The marks are the engine's; a model explains them
 * and never makes its own.
 */
export interface AiReadingFacts {
  activityType: 'read-aloud';
  activityId: string;
  title: string;
  /** The language the text is in. */
  locale: string;
  referenceText: string;
  instructions?: string;
  /** Who made the marks: a measurement engine, a model, or a person. */
  assessor: 'auto' | 'ai' | 'human' | 'unknown';
  /** The alphabet `sounds` are written in, when any are. */
  phonemeAlphabet?: 'ipa' | 'sapi';
  /** The engine's dimension scores, each 0..100, where it measured them. */
  scores: { accuracy?: number; fluency?: number; completeness?: number; prosody?: number };
  words: AiReadingWordFact[];
}

/**
 * Asks for coaching on a graded reading: what to work on, word by word, and
 * how. Never in an exam.
 */
export interface AiCoachingRequest {
  feature: 'pronunciation-coaching';
  facts: AiReadingFacts;
  /** The grade of the reading, when there is one. */
  grade?: { score: number; maxScore: number; passed: boolean };
  /** The language to write in: the learner's interface language, when known. */
  learnerLocale?: string;
}

/** One word a model coaches, as it returns it. */
export interface AiCoachingWord {
  /** The `itemId` of a word the engine marked mispronounced or omitted. */
  itemId: string;
  /** What to do about it, addressed to the learner. */
  tip: string;
  /**
   * A sound the engine reported for this word — `expected` — and, if the
   * model names one, what the engine heard instead.
   */
  sound?: { expected: string; heard?: string };
}

/** What a host's `pronunciationCoaching` port returns. */
export interface AiCoachingResult {
  /** The coaching as a whole, addressed to the learner. Plain text, never HTML. */
  text: string;
  words?: AiCoachingWord[];
  provenance?: AiProvenance;
  usage?: GraderUsage;
}

/** Coaching, as the SDK accepted it: what a learner is shown. */
export interface AiCoaching {
  text: string;
  /**
   * The words to work on, in reading order, each with the word of the text as
   * the SDK has it — never the model's spelling of it.
   */
  words: (AiCoachingWord & { word: string })[];
  provenance?: AiProvenance;
  usage?: GraderUsage;
}

// ── Reviewing an item with a model ─────────────────────────────────────

/**
 * What a model may find wrong with an item, in the SDK's words:
 *
 * - `ambiguous` — a stem, passage or blank that reads two ways;
 * - `second-answer` — a distractor that is defensibly right, or an answer the
 *   key does not accept;
 * - `wrong-key` — the answer marked right is not;
 * - `implausible-distractor` — an option nobody who read the question would pick;
 * - `cue` — grammar or wording that points at the answer;
 * - `level` — language above or below the level the item is for;
 * - `language` — a mistake in the item's own language;
 * - `sensitivity` — content a learner may find loaded or unfamiliar for
 *   reasons that have nothing to do with what is assessed;
 * - `other`.
 */
export type AiCritiqueKind =
  | 'ambiguous'
  | 'second-answer'
  | 'wrong-key'
  | 'implausible-distractor'
  | 'cue'
  | 'level'
  | 'language'
  | 'sensitivity'
  | 'other';

/** One field of an item a critique may point at, and what it says. */
export interface AiCritiqueField {
  path: string[];
  text: string;
}

/**
 * What a host's model is given to review an item. Built by
 * `aiCritiqueRequest`; for an author, never a learner, so it carries the
 * answer key.
 */
export interface AiCritiqueRequest {
  feature: 'item-critique';
  facts: {
    activityType: string;
    /** The item as the author wrote it, answer key included. */
    item: Readonly<Record<string, unknown>>;
    /** Every text field a finding may point at, with its text: the only paths a finding may name. */
    fields: AiCritiqueField[];
    /**
     * What the SDK's own critic already found, so a model does not say it
     * again: code, path and message.
     */
    findings: { path: string[]; code: string; message: string }[];
    /** The level the item is for, as the host names it (`A2`, `B1`), when it gave one. */
    level?: string;
  };
  /** The language to write findings in: the author's. */
  authorLocale?: string;
}

/** One finding as a host's port returns it. */
export interface AiCritiqueFindingResult {
  /** A path from `facts.fields`, exactly. */
  path: (string | number)[];
  kind: AiCritiqueKind;
  /** What is wrong, and what to do, addressed to the author. */
  message: string;
  /** Words copied from that field, when the finding is about some of them. */
  quote?: string;
}

/** What a host's critique port returns. */
export interface AiCritiqueResult {
  findings: AiCritiqueFindingResult[];
  provenance?: AiProvenance;
  usage?: GraderUsage;
}

/**
 * A model's finding, as the SDK accepted it: an `ItemFinding` — always
 * `advice`, since it is a model's opinion — whose code is `ai_` and the kind
 * (`ai_second_answer`), with the quote it pointed at.
 */
export interface AiCritiqueFinding extends ItemFinding {
  severity: 'advice';
  quote?: string;
}

/** A critique, as the SDK accepted it. */
export interface AiCritique {
  findings: AiCritiqueFinding[];
  provenance?: AiProvenance;
  usage?: GraderUsage;
}

// ── Drafts from a source ───────────────────────────────────────────────

/**
 * The types a model can draft from a source. An interactive video takes the
 * first five; a written response is for a quiz of its own.
 */
export type AiDraftType =
  | 'multiple-choice'
  | 'fill-in-the-blanks'
  | 'gap-select'
  | 'dictation'
  | 'read-aloud'
  | 'written-response';

/**
 * What drafts are written from: a passage or a script as text — an item
 * group's `stimulus.transcript` is one — or a video's captions, each with its
 * start and end in seconds, so a question can be placed where its caption ends.
 */
export type AiDraftSource =
  | { kind: 'passage' | 'transcript'; text: string }
  | { kind: 'captions'; cues: { start: number; end: number; text: string }[] };

/** A caption as a model is given it: numbered, so a draft can name the one it is about. */
export interface AiDraftCaption {
  index: number;
  start: number;
  end: number;
  text: string;
}

/** One problem with a draft, as a model is told it on a repair. */
export interface AiDraftProblem {
  path: string[];
  code: string;
  message: string;
  severity: 'incomplete' | 'invalid' | 'warning';
}

/**
 * Fields of the host's for every draft of a type — settings a model never
 * writes: a read-aloud's `recording`, `scoring` and region-tagged `locale`, a
 * question's `shuffle` or `scoringStrategy`. They are put on each draft of
 * that type before it is checked, and never override what the model wrote, nor
 * the draft's `id`, `type` or `schemaVersion`.
 */
export type AiDraftSettings = Partial<Record<AiDraftType, Readonly<Record<string, unknown>>>>;

/**
 * What a host's model is given to draft items. Built by `aiDraftsRequest`, and
 * by `aiDraftsRepairRequest` for a second pass over the drafts that came back
 * unfinished or flawed in ways the model can fix.
 */
export interface AiDraftsRequest {
  feature: 'draft-generation';
  facts: {
    /**
     * The types the author chose, in the author's order: the ones to lean on
     * first, and the order questions are shown in where several share a moment
     * of a video — or share the end of one.
     */
    activityTypes: AiDraftType[];
    source:
      | { kind: 'passage' | 'transcript'; text: string }
      | { kind: 'captions'; captions: AiDraftCaption[] };
    /** How many drafts to write, at most. Absent: as many as the source is worth, up to `AI_DRAFTS_MAX_COUNT`. */
    count?: number;
    /** The language the items are written in. */
    locale?: string;
    /** The level they are for, as the host names it (`A2`, `B1`). */
    level?: string;
    /** What the author asked for, in their words. */
    instructions?: string;
  };
  /**
   * The JSON Schema of a reply — `{ drafts: [...] }` — for a model's structured
   * output, or its prompt. Plain JSON Schema a model can follow: types, required
   * fields, enums and descriptions, nothing a provider's structured output
   * commonly refuses. Each draft names its `type`, and fills the fields that
   * type uses.
   */
  shape: Readonly<Record<string, unknown>>;
  /** The host's settings for every draft of a type. Not for the model; `checkAiDrafts` applies them. */
  settings?: AiDraftSettings;
  /**
   * On a repair: the drafts to fix, each as the model wrote it, with what is
   * wrong with it that the model can fix. The reply holds one draft for each,
   * in this order.
   */
  repair?: {
    index: number;
    draft: Readonly<Record<string, unknown>>;
    problems: AiDraftProblem[];
  }[];
}

/** A draft as the SDK made it from a reply: ids minted, settings applied, checked, and critiqued. */
export interface AiGeneratedDraft {
  /** Its position in the first reply; a repaired draft keeps the position it replaces. */
  index: number;
  type: AiDraftType;
  /** The draft, an activity of its type once `validation` says `complete`. */
  draft: Record<string, unknown>;
  /** What `validateDraft` says of it. `complete` means valid — never approved. */
  validation: DraftValidationResult<unknown>;
  /** What the item critic says of it. */
  findings: ItemFinding[];
  /**
   * From captions: where the question goes, in seconds — the end of the
   * caption it named. Absent when it named no caption the source has: it
   * belongs at the end of the video.
   */
  at?: number;
  /**
   * A dictation from captions whose transcript is words of the caption it
   * named: that caption's start and end, in seconds — the stretch of the
   * video that says it, for a host that cuts the recording from the video.
   */
  clip?: { start: number; end: number };
  /** The draft as the model wrote it, for a repair. */
  generated: Readonly<Record<string, unknown>>;
}

/** What `checkAiDrafts` makes of a reply. */
export interface AiDrafts {
  /** The drafts in the author's order of types, and in the order the model wrote them within a type. */
  drafts: AiGeneratedDraft[];
  /** What only the set shows: every right option in one place (`set_key_position_same`). */
  findings: ItemFinding[];
  provenance?: AiProvenance;
  usage?: GraderUsage;
}

/** One call `generateDrafts` made: what it cost, or why it went no further. */
export type AiDraftsCall =
  | { ok: true; provenance?: AiProvenance; usage?: GraderUsage }
  | { ok: false; refusal?: AiRefusal; error?: string };

/** What `generateDrafts` came to. */
export interface AiDraftsRun {
  /** The drafts, in the author's order of types, each the best pass of it. */
  drafts: AiGeneratedDraft[];
  /** What only the set shows, over the drafts as they ended. */
  findings: ItemFinding[];
  /** Every call, in order: the first, then each repair. */
  calls: AiDraftsCall[];
}

/**
 * An interactive video made of drafts: an item group whose stimulus is the
 * video and whose timeline opens a quiz at each moment a draft was placed —
 * and one at the end for every draft placed nowhere. A draft, like every
 * draft: checked, critiqued, and approved by a person, never by the SDK.
 */
export interface AiVideoDraft {
  /** The item group, an interactive video once `validation` says `complete`. */
  group: Record<string, unknown>;
  /** What `validateItemGroupDraft` says of it. */
  validation: DraftValidationResult<unknown>;
  /** What `critiqueItemGroupDraft` says of it. */
  findings: ItemFinding[];
}
