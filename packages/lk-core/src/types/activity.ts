import type { TextMatchPolicy } from '../scoring/text-match.js';
import type { ActivityAiPermissions } from './ai.js';
import type { GradeRecord } from './grading.js';
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
  'gap-select': GapSelectData;
  dictation: DictationData;
  'read-aloud': ReadAloudData;
}

/**
 * The set of activity types supported by learning-kit. Derived from
 * {@link ActivityDataMap}, so module augmentation widens it automatically.
 */
export type ActivityType = keyof ActivityDataMap;

/** Union of all valid activity data shapes. */
export type ActivityData = ActivityDataMap[ActivityType];

/** A text track for an `audio` or `video` recording. */
export interface MediaTrack {
  kind: 'captions' | 'subtitles';
  /** WebVTT URL. A player may fetch it through a loader the host supplies, with the host's credentials. */
  src: string;
  /** BCP 47 language tag of the text (`en`, `es`, `pt-BR`). */
  srclang: string;
  /** Shown in the captions menu. Non-empty, at most 60 characters. */
  label: string;
  /** Selected when the learner has chosen no language yet. At most one track may be the default. */
  default?: boolean;
}

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
  /**
   * Text tracks for `audio`/`video`, one per language: what `captionsUrl`
   * cannot say — a language, a label, more than one. When present, a player
   * that reads it ignores `captionsUrl`. At most 12, one `default`, and no two
   * sharing a `kind` and a `srclang`.
   */
  tracks?: MediaTrack[];
  /** An image shown before the first play. `video` only. */
  poster?: string;
  /**
   * How the recording may be played. `audio` only — see
   * {@link MediaPlaybackPolicy}. Absent means today's behaviour exactly: the
   * browser's own control bar, unlimited plays, free seeking and free speed.
   */
  playback?: MediaPlaybackPolicy;
}

/**
 * A hint to the browser's own control bar, emitted as a `controlsList` token.
 *
 * Advisory, and engine-dependent. `hide-download` removes a menu item where
 * `controlsList` is implemented; it never prevents a download, because the URL
 * is in the page and the bytes are in the network panel. The real control is a
 * short-lived signed URL, which belongs to the consuming application.
 */
export type NativeControlHint = 'hide-download' | 'hide-rate';

/**
 * How an audio recording may be played.
 *
 * Every field is optional and every default reproduces the SDK's pre-0.8.0
 * behaviour, so adding this key is the only thing that changes anything.
 *
 * Setting any *enforcement* field (`maxPlays`, `seek: 'none'`, `rate: 'fixed'`)
 * resolves `controls` to `'minimal'`: the browser's bar cannot express a spent
 * budget — its play button stays enabled — so the SDK renders its own
 * transport rather than leave a control that looks operable and does nothing.
 */
export interface MediaPlaybackPolicy {
  /**
   * `native` renders the browser's control bar. `minimal` renders the SDK
   * transport. Resolved automatically; set it explicitly only to keep the
   * native bar on a recording that has nothing to enforce.
   */
  controls?: 'native' | 'minimal';
  /**
   * How many times the recording may be STARTED (1–20). A play is consumed
   * when playback begins from anywhere other than where it last stopped, so
   * pausing, resuming, and paging between the questions of one listening group
   * are free.
   *
   * The SDK refuses the play; it does not remember it. The count is durable
   * only if the consuming application persists it — see `mediaBudget` on
   * `<ActivitySequence>` in `@intellectif/lk-react`.
   */
  maxPlays?: number;
  /** `none` renders no scrubber and reverts an out-of-band seek. Resolves to `none` under a budget. */
  seek?: 'allow' | 'none';
  /** `fixed` renders no speed control and snaps `playbackRate` back to 1. */
  rate?: 'allow' | 'fixed';
  /** Advisory hints to the native bar. See {@link NativeControlHint}. */
  nativeControlHints?: NativeControlHint[];
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
/**
 * A picture or a recording carried by ONE multiple-choice option — the
 * A1/A2 picture-choice item, and the minimal-pair listening item.
 *
 * Narrower than {@link ActivityMedia}, which sits above the question, and
 * deliberately so. An option is a click target, and two of the activity-level
 * kinds cannot be one:
 *
 * - **`embed` is refused.** A provider iframe swallows pointer events, so
 *   clicking the option would play the video instead of selecting the answer.
 *   The learner could not choose it at all.
 * - **`video` is refused** for the same reason one step down: a native control
 *   bar inside the option's label eats the clicks meant for the radio.
 * - **No `playback` policy.** `maxPlays` binds per slot through a
 *   `MediaBudgetBinding`, and four recordings in one question raise a question
 *   nothing has answered yet — whether the budget belongs to the option or to
 *   the item. Until something asks, an option plays through the browser's own
 *   bar and counts nothing.
 *
 * `alt` follows the same rule {@link ActivityMedia} uses, so there is only one
 * rule to learn: required and non-empty for an image, optional for audio, where
 * it becomes the player's accessible label.
 *
 * **On an image option, `alt` is part of the item.** It joins the option's
 * `text` in the radio's accessible name, so on "which picture shows a cat?" an
 * `alt` of "a cat" hands a screen-reader user the answer that a sighted learner
 * has to work out. That is a property of picture-choice items, not something a
 * schema can fix — the SDK requires `alt` so an option is never SILENTLY
 * inaccessible, and leaves the wording, and the item's validity, to the author.
 */
export interface MultipleChoiceOptionMedia {
  /** `image` for a picture-choice option, `audio` for a listening option. */
  type: 'image' | 'audio';
  /** Address of the file. Same scheme allow-list as {@link ActivityMedia}. */
  url: string;
  /** Required and non-empty for `image`; an optional accessible label for `audio`. */
  alt?: string;
  /** WebVTT captions for an audio option, rendered as a `<track>`. */
  captionsUrl?: string;
}

export interface MultipleChoiceOption {
  /** Unique identifier for this option within the activity. */
  id: string;
  /**
   * Display text shown to the learner.
   *
   * Required even when the option carries {@link media}: it names the option in
   * the radio's accessible name and in the xAPI statement, and it is what the
   * learner sees if a picture fails to load. For a pure picture-choice option,
   * a neutral label ("Picture 1") keeps the naming out of the answer.
   */
  text: string;
  /** Whether this option is part of the correct answer. */
  isCorrect: boolean;
  /** Optional per-option feedback shown after submission. */
  feedback?: string;
  /** An optional picture or recording shown as part of this option. */
  media?: MultipleChoiceOptionMedia;
}

/** Data contract for a Multiple Choice activity. */
export interface MultipleChoiceData {
  schemaVersion: '1.0';
  type: 'multiple-choice';
  /** Unique identifier for this activity. */
  id: string;
  /** Human-readable title used in xAPI statements and error boundaries. */
  title: string;
  /** The question stem presented to the learner, as plain text. */
  question: string;
  /**
   * Optional sanitised rich-HTML rendering of the question, parallel to
   * `WrittenResponseData.promptHtml`. `<MultipleChoice>` renders it in place
   * of `question` when — and only when — a `sanitizeHtml` function is
   * supplied; without one the plain `question` is rendered and escaped.
   * Sanitisation is the application's responsibility: the SDK ships none.
   */
  questionHtml?: string;
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
  /**
   * When true, option order is shuffled deterministically.
   *
   * The order is derived from the renderer's `shuffleSeed` when one is given —
   * pass the attempt id, and a review render reproduces exactly the order the
   * learner sat. Without a seed the order is stable for the life of the mount
   * only, and is NOT reproducible afterwards, so never grade or appeal against
   * a remembered position.
   */
  shuffle?: boolean;
  /** BCP 47 language tag for the activity content. */
  locale?: string;
  /** IRI references to learning objectives addressed by this activity. */
  learningObjectives?: string[];
  /** Subjective difficulty on a 1–5 scale. */
  difficultyLevel?: 1 | 2 | 3 | 4 | 5;
  /** What an author allows AI to do for this item: see {@link ActivityAiPermissions}. */
  ai?: ActivityAiPermissions;
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
/** One selectable option in a Gap Select activity. */
export interface GapSelectChoice {
  /** Unique identifier within the choice set the gap resolves to. */
  id: string;
  /** The text the learner reads in the selector. */
  text: string;
}

/**
 * A named set of choices several gaps can draw from — a word bank.
 *
 * A bank is what makes distractors possible: three gaps sharing a bank of five
 * choices means every selector offers all five, and two of them answer no gap
 * at all. That is the difference between a reading-comprehension item and a
 * sequence of three-way guesses, so it is modelled once here rather than
 * retrofitted after per-gap lists ship.
 */
export interface GapSelectBank {
  /** Unique identifier referenced by {@link GapSelectGap.bankId}. */
  id: string;
  /** The choices every gap on this bank offers. */
  choices: GapSelectChoice[];
}

/**
 * One gap in the passage, matching a `{{gap_id}}` placeholder.
 *
 * Its choices come from exactly one place: `choices` for a list of its own, or
 * `bankId` for a shared word bank. Both, or neither, is an authoring error the
 * schema rejects — with two sources a reader cannot tell which list the learner
 * is offered, and the answer key means nothing without one.
 */
export interface GapSelectGap {
  /** Unique identifier matching the `{{gap_id}}` placeholder in the passage. */
  id: string;
  /** This gap's own choices. Mutually exclusive with {@link bankId}. */
  choices?: GapSelectChoice[];
  /** The {@link GapSelectBank} this gap draws from. Mutually exclusive with {@link choices}. */
  bankId?: string;
  /** The `id` of the one choice that is correct. Must exist in the resolved choice set. */
  correctChoiceId: string;
  /** Optional feedback shown inline next to this gap after submission. */
  feedback?: string;
}

/**
 * Data contract for a Gap Select activity: a passage whose gaps the learner
 * fills by choosing from a list rather than typing.
 *
 * It is deliberately **not** a mode of {@link FillInTheBlanksData}, though the
 * passage and its `{{id}}` placeholders are authored the same way. A learner
 * picking from a selector cannot mistype, so the whole `TextMatchPolicy`
 * surface — diacritic folding, typo tolerance, locale-aware case — is not just
 * unused but misleading. Scoring is identity comparison of a choice id.
 * Redaction inverts too: in Fill-in-the-Blanks the candidate answers ARE the
 * key, while here the learner must be shown every choice and only
 * `correctChoiceId` is withheld.
 */
export interface GapSelectData {
  schemaVersion: '1.0';
  type: 'gap-select';
  /** Unique identifier for this activity. */
  id: string;
  /** Human-readable title used in xAPI statements and error boundaries. */
  title: string;
  /** Passage text containing `{{gap_id}}` placeholders. */
  passage: string;
  /**
   * Optional sanitised rich-HTML rendering of the passage. Carried and redacted
   * as learner-visible content; not rendered by the SDK, for the same reason
   * `FillInTheBlanksData.passageHtml` is not — slicing sanitised HTML at the
   * placeholders to host the selectors is both lossy and unsafe.
   */
  passageHtml?: string;
  /** Every gap in the passage, one per distinct `{{id}}` placeholder. */
  gaps: GapSelectGap[];
  /** Shared word banks. Only needed by gaps that set `bankId`. */
  banks?: GapSelectBank[];
  /** Scoring algorithm applied when the learner submits. */
  scoringStrategy: 'all-or-nothing' | 'partial';
  /**
   * How the choices are presented. Only `'dropdown'` exists today, and it is
   * the default.
   *
   * The field is here rather than assumed because a drag-and-drop presentation
   * is the obvious next request, and WCAG 2.5.7 requires that a drag interface
   * always keep a non-drag path — so the choice has to be expressible in the
   * content, not decided by a component prop. `'drag'` is NOT accepted yet:
   * shipping a value nothing renders would freeze an API this repository has
   * not validated. Widening the union later is additive.
   */
  presentation?: 'dropdown';
  /**
   * Whether the SDK shuffles each selector's choices. Off by default.
   *
   * Like `MultipleChoiceData.shuffle`, this needs a seed to be reproducible at
   * a remark — `<ActivitySequence>` refuses to shuffle without one outside
   * `practice` mode.
   */
  shuffleChoices?: boolean;
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
  /** What an author allows AI to do for this item: see {@link ActivityAiPermissions}. */
  ai?: ActivityAiPermissions;
}

export interface FillInTheBlanksData {
  schemaVersion: '1.0';
  type: 'fill-in-the-blanks';
  /** Unique identifier for this activity. */
  id: string;
  /** Human-readable title used in xAPI statements and error boundaries. */
  title: string;
  /** Passage text containing `{{blank_id}}` placeholders. */
  passage: string;
  /**
   * Optional sanitised rich-HTML rendering of the passage, parallel to
   * `WrittenResponseData.promptHtml`. Carried and redacted as learner-visible
   * content; not rendered by the SDK yet. Sanitisation is the application's.
   */
  passageHtml?: string;
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
  /** What an author allows AI to do for this item: see {@link ActivityAiPermissions}. */
  ai?: ActivityAiPermissions;
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
  /**
   * Optional sanitised rich-HTML sidecar of the prompt. `<WrittenResponse>`
   * renders it in place of `prompt` when a `sanitizeHtml` function is
   * supplied; without one the plain `prompt` is rendered and escaped.
   */
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
  /** What an author allows AI to do for this item: see {@link ActivityAiPermissions}. */
  ai?: ActivityAiPermissions;
}

/**
 * A second, slower recording of a dictation — a separate file (a text-to-speech
 * render at reduced speed, or a slower human reading), not a `playbackRate`
 * change. It carries no `captionsUrl` (a caption track of a dictation is the
 * transcript on screen) and no `playback` policy of its own: it follows the
 * policy on `media`, except the play budget, which it never has.
 */
export interface DictationSlowMedia {
  type: 'audio';
  /** Source URL, under the same policy as {@link ActivityMedia.url}. */
  url: string;
  /** Accessible label — a description ("Recording, slow"), never a transcription. */
  alt?: string;
}

/**
 * A whole-word rewrite applied to BOTH the transcript and the attempt before
 * they are compared. `from` and `to` are literal text: a rule is applied to
 * every whole-word occurrence, exactly once, in the order the rules are listed,
 * after spacing is collapsed and before punctuation is ignored — so a rule may
 * name a symbol (`{ from: '&', to: 'and' }`) and a multi-word `from` matches
 * across any whitespace.
 */
export interface DictationEquivalence {
  /** What to rewrite: at least one code point that survives case, quote and whitespace folding. */
  from: string;
  /** What it becomes: 1..200 code points, something of which survives normalisation. A rule cannot delete a word. */
  to: string;
}

/** Grading tolerances for a dictation. Part of the answer key. */
export interface DictationTolerance {
  /** Whole-word rewrites, applied in listed order, each exactly once. */
  equivalences?: DictationEquivalence[];
}

/**
 * Data contract for a Dictation activity: the learner listens to a recording
 * and types what they hear; the grade is how close their text is to the
 * transcript.
 *
 * Scoring is character-level similarity over the whole sentence —
 * `(length − edit distance) / length` over NFC code points after case,
 * punctuation and spacing are ignored — with one {@link ScoringDetail} per
 * transcript word carrying that word's own {@link ScoringDetail.score}. It is
 * deliberately not a mode of {@link FillInTheBlanksData}: a blank is right or
 * wrong, a dictation is graded on a continuum, and the whole `TextMatchPolicy`
 * surface (typo tolerance, diacritic folding) would be a second, competing
 * notion of "close enough".
 */
export interface DictationData {
  schemaVersion: '1.0';
  type: 'dictation';
  /** Unique identifier for this activity. */
  id: string;
  /**
   * Human-readable title used in xAPI statements and error boundaries. It is
   * the stem the learner sees, so it must not contain the transcript.
   */
  title: string;
  /**
   * What the learner is expected to type. ANSWER KEY. 1..2000 code points,
   * before and after its equivalences are applied, and something must survive
   * normalisation.
   */
  transcript: string;
  /**
   * Alternative transcriptions accepted at full credit — a regional spelling, a
   * numeral, a whole-sentence contraction variant. ANSWER KEY. At most 10, each
   * 1..2000 code points, none normalising equal to the transcript or to each
   * other. The attempt is scored against every candidate and the best
   * similarity wins; a tie goes to `transcript`.
   */
  acceptedTranscripts?: string[];
  /**
   * The recording. Audio only, never with captions. Optional in the schema — a
   * dictation inside an item group may draw on the group's stimulus recording —
   * but required whenever `slowMedia` is present. Budgeted per slot like any
   * other activity media, with the usual playback policy.
   */
  media?: ActivityMedia;
  /** A second, slower recording. See {@link DictationSlowMedia}. */
  slowMedia?: DictationSlowMedia;
  /**
   * Progressive word hints, in `practice` only (the transcript is absent in
   * `exam` mode, so there is nothing to reveal). Public: it reveals nothing by
   * itself. `progressive-words` reveals the transcript's words left to right,
   * one per request; a revealed hint never changes the score.
   */
  hints?: { mode: 'progressive-words' };
  /** Grading tolerances. ANSWER KEY. */
  tolerance?: DictationTolerance;
  /** Optional authored overall feedback shown after submission. */
  feedback?: ActivityFeedback;
  /** Minimum scaled score [0–1] required to pass. Defaults to {@link DEFAULT_PASS_THRESHOLD} (0.7) when absent. */
  passThreshold?: number;
  /** BCP 47 language tag for the activity content. Presentation only: scoring never reads it. */
  locale?: string;
  /** IRI references to learning objectives addressed by this activity. */
  learningObjectives?: string[];
  /** Subjective difficulty on a 1–5 scale. */
  difficultyLevel?: 1 | 2 | 3 | 4 | 5;
  /** What an author allows AI to do for this item: see {@link ActivityAiPermissions}. */
  ai?: ActivityAiPermissions;
}

/** A dimension of speech a pronunciation assessor scores, on a 0–100 scale. */
export type ReadAloudDimension = 'accuracy' | 'fluency' | 'completeness' | 'prosody';

/** One assessor dimension counted towards a read-aloud grade, and its weight. */
export interface ReadAloudDimensionWeight {
  name: ReadAloudDimension;
  /**
   * Relative weight, 0..1000 (`READ_ALOUD_MAX_DIMENSION_WEIGHT`). Weights need
   * not add up to anything; a weight of 0 leaves the dimension out of the grade.
   */
  weight: number;
}

/**
 * The limits on a read-aloud take, applied where the learner records. No grade
 * reads them: whether a take is plausible speech is decided from the server's
 * own measurement of the recording, never from a bound the client enforced.
 */
export interface RecordingBounds {
  /** The longest take, in seconds: above 0, and at most `READ_ALOUD_MAX_SECONDS` (300). */
  maxSeconds: number;
  /** The shortest take, in seconds: at least 0, and below `maxSeconds`. */
  minSeconds?: number;
  /** How many takes the learner may record: a whole number from 1 to `READ_ALOUD_MAX_TAKES` (20). */
  maxTakes?: number;
}

/**
 * A second, slower model recording of the reference text — a separate file,
 * not a `playbackRate` change. It carries no `captionsUrl` and no `playback`
 * policy of its own, requires `media`, must be a different file from it, and
 * cannot accompany a play limit on `media`.
 */
export interface ReadAloudSlowMedia {
  type: 'audio';
  /** Source URL, under the same policy as {@link ActivityMedia.url}. */
  url: string;
  /** Accessible label — a description ("Model recording, slow"). */
  alt?: string;
}

/**
 * Data contract for a Read Aloud activity: the learner reads a text aloud, an
 * assessor measures the recording, and the grade is the weighted total of the
 * assessor's dimension scores.
 *
 * Grading is deferred — `evaluate()` returns `deferred` until the application
 * holds an assessment — and nothing here is an answer key: the learner is shown
 * the text they are asked to read.
 */
export interface ReadAloudData {
  schemaVersion: '1.0';
  type: 'read-aloud';
  /** Unique identifier for this activity. */
  id: string;
  /** Human-readable title used in xAPI statements and error boundaries. */
  title: string;
  /** Optional instructions shown to the learner, as plain text. */
  instructions?: string;
  /**
   * The text the learner reads aloud. Shown to the learner (public). At most
   * `READ_ALOUD_MAX_REFERENCE_LENGTH` code points before and after
   * normalisation, in a script written with spaces between words.
   */
  referenceText: string;
  /**
   * BCP 47 tag in canonical form with a region (e.g. `en-US`). GRADE-DECIDING:
   * an assessment made for another locale is unscorable.
   */
  locale: string;
  /** A model recording of the text. Audio only; a playback policy is allowed. */
  media?: ActivityMedia;
  /** A second, slower model recording. See {@link ReadAloudSlowMedia}. */
  slowMedia?: ReadAloudSlowMedia;
  /** The limits on a take. See {@link RecordingBounds}. */
  recording: RecordingBounds;
  /**
   * The assessor dimensions the grade is made of, with their weights: 1 to 4
   * entries, each name at most once, at least one weight above 0. A weighted
   * dimension the assessment has no score for makes the take unscorable, never
   * a zero. Public.
   */
  scoring: { dimensions: ReadAloudDimensionWeight[] };
  /** Minimum scaled score [0–1] required to pass once graded. Defaults to {@link DEFAULT_PASS_THRESHOLD} (0.7) when absent. */
  passThreshold?: number;
  /** Optional authored overall feedback, selected once the grade exists. */
  feedback?: ActivityFeedback;
  /** IRI references to learning objectives addressed by this activity. */
  learningObjectives?: string[];
  /** Subjective difficulty on a 1–5 scale. */
  difficultyLevel?: 1 | 2 | 3 | 4 | 5;
  /** What an author allows AI to do for this item: see {@link ActivityAiPermissions}. */
  ai?: ActivityAiPermissions;
}

/**
 * Maps each ActivityType string to its learner-response shape. Open for
 * extension via module augmentation, mirroring {@link ActivityDataMap}.
 */
export interface LearnerResponseMap {
  'multiple-choice': MultipleChoiceLearnerResponse;
  'fill-in-the-blanks': FillInTheBlanksLearnerResponse;
  'written-response': WrittenResponseLearnerResponse;
  'gap-select': GapSelectLearnerResponse;
  dictation: DictationLearnerResponse;
  'read-aloud': ReadAloudLearnerResponse;
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

/**
 * Learner response for a Gap Select activity.
 *
 * A gap the learner has not answered is **absent from the map, or holds an
 * empty string** — the two are equivalent, because a `<select>` whose
 * placeholder is still showing submits `''`. Neither is a wrong answer: the
 * scorer reports it as `incorrect-omission`, which is how a blank the learner
 * never reached is told apart from one they got wrong.
 */
export interface GapSelectLearnerResponse {
  type: 'gap-select';
  /** Map of gap ID to the ID of the choice the learner selected. */
  selections: Record<string, string>;
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
 * Learner response for a Dictation activity.
 *
 * `text` is exactly what the learner typed; every normalisation happens in the
 * scorer. `hintsRevealed` is client-reported telemetry — how many hint words
 * were shown before submitting — that the scorer ignores and a consumer may
 * log or penalise, knowing it cannot be verified.
 */
export interface DictationLearnerResponse {
  type: 'dictation';
  /** The learner's text, as typed. */
  text: string;
  /** Hint words revealed before submitting (practice only). Absent or 0 means none. */
  hintsRevealed?: number;
}

/**
 * A learner recording held by the application. `key` is opaque,
 * application-issued storage identity: never a URL or bytes. `durationMs` is a
 * client claim no grade reads.
 */
export interface RecordingRef {
  key: string;
  /** The media type the recording was stored as, e.g. `audio/wav`. */
  mimeType: string;
  durationMs?: number;
}

/**
 * Learner response for a Read Aloud activity: a reference to the recording the
 * application stored, never the audio itself.
 */
export interface ReadAloudLearnerResponse {
  type: 'read-aloud';
  /** `null`: the learner submitted without recording (a blank). A take that failed to upload is never `null`. */
  recording: RecordingRef | null;
  /** Telemetry: takes used. No grade reads it. */
  takes?: number;
}

/**
 * Fine-grained outcome of the learner's action on a single item, replacing the
 * ambiguous {@link ScoringDetail.correct}:
 * - `correct` — the learner selected/entered the right answer.
 * - `incorrect` — the learner selected/entered a wrong answer.
 * - `correct-omission` — the learner correctly left a non-answer unselected (multiple-choice only).
 * - `incorrect-omission` — a correct answer the learner did not give: an unselected
 *   correct option, an unanswered gap, a missing dictation word.
 */
export type ScoringOutcome = 'correct' | 'incorrect' | 'correct-omission' | 'incorrect-omission';

/** Per-item scoring breakdown returned by the scoring engine. */
export interface ScoringDetail {
  /** ID of the option, blank, gap or dictation word (`w1`…`wN`) this detail refers to. */
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
   * written by every built-in scorer (by the first two since 0.3.0); becomes
   * required in v1.0 when the deprecated `correct` is removed.
   */
  outcome?: ScoringOutcome;
  /** The learner's actual response for this item. */
  learnerResponse: string | string[];
  /** The expected correct response(s) for this item. */
  correctResponse: string | string[];
  /**
   * Weight applied to this item's contribution to the overall score. Every
   * built-in scorer currently weights every item equally and writes `1`.
   */
  weight?: number;
  /**
   * The item's own scaled score in [0, 1], for a type that grades its items on
   * a continuum rather than right or wrong. Written by the dictation scorer
   * (the similarity of each transcript word to what was typed for it) and by
   * `gradeReadAloud` (the assessor's accuracy for each reference word as a
   * fraction, 0 for an omitted word, and absent where the assessor gave none).
   * Absent, an item is right or wrong: read `outcome`.
   */
  score?: number;
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
 * Why an item has no grade *yet* — a state that is explicitly not final, and
 * so keeps a composed assessment `provisional`.
 *
 * - `requires_async_grading` — the type is graded later by an AI or a human.
 * - `no_response_recorded` — nothing was stored against this slot at all. It
 *   is NOT the same as a zero: a learner who left a question blank on a
 *   submitted paper has earned zero, but a slot missing because a save failed,
 *   a grade has not landed, or the attempt is still open has earned nothing
 *   yet, and recording it as zero is how an incomplete attempt becomes a
 *   plausible-looking fail.
 * - `grade_rejected` — a grade came back, and `outcomeFromGrade` refused it
 *   because its numbers cannot be a grade (a `score` or `maxScore` that is not
 *   a finite number, a `maxScore` of 0 or less, or a score outside 0 to
 *   `maxScore`). The record is kept on `rejectedGrade`. A real grade is still
 *   owed, so re-grade the slot: waiting will not bring one.
 */
export type DeferredReason = 'requires_async_grading' | 'no_response_recorded' | 'grade_rejected';

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
      /** Why no grade exists yet. See {@link DeferredReason}. */
      reason: DeferredReason;
      /** Maximum possible scaled score once graded. */
      maxScore: number;
      /** Synchronously computable progress facts (word bounds, counts). */
      partial?: DeferredScoringPartial;
      /**
       * The record `outcomeFromGrade` refused, verbatim, when `reason` is
       * `grade_rejected` — kept for audit and for the re-grade. Nothing on it
       * is mirrored onto the outcome, and nothing reads it as a grade.
       */
      rejectedGrade?: GradeRecord;
    }
  | {
      status: 'graded';
      /**
       * A grade produced by an asynchronous grader (AI or human) and handed
       * back to the SDK. This is the state a `deferred` outcome transitions
       * to once grading completes; nothing in the SDK ever manufactures it.
       */
      grade: GradeRecord;
      /** Scaled score in the range [0, 1], mirrored from `grade` for uniform reads. */
      score: number;
      maxScore: number;
      passed: boolean;
      /** Narrative feedback from the grader, mirrored from `grade`. */
      feedback: string | null;
    }
  | {
      status: 'unscorable';
      /** Why no grade can be produced (e.g. unregistered activity type). */
      reason: string;
      /** Maximum possible scaled score, when known. */
      maxScore: number;
      /**
       * A machine-readable reason, written by `outcomeFromUnscorable` — for
       * example a read-aloud `SpeechUnscorableCode`. `evaluate` never writes it.
       */
      code?: string;
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
  /**
   * A play was charged against a recording's budget, before any audio was
   * audible. Emitted only when a budget is in force, so a `review`-mode replay
   * never pollutes the record an appeal reads.
   */
  | 'media-play-consumed'
  /** An exhausted budget refused a play. The artifact an appeal asks for. */
  | 'media-play-refused'
  /** A charged play produced no audio — a failed or expired media URL. */
  | 'media-play-errored'
  /** A charged play was returned, because the consumer accepted the refund. */
  | 'media-play-refunded'
  /** The microphone began capturing a take. */
  | 'recording-started'
  /** A take ended, by the learner or at its time limit. */
  | 'recording-stopped'
  /** A take was thrown away, to record another. */
  | 'recording-discarded'
  /** The application stored a take and returned its reference. */
  | 'recording-uploaded'
  /** Storing a take failed. A take that failed to upload is never a blank answer. */
  | 'recording-upload-failed'
  /** A stored take was sent for assessment. */
  | 'assessment-requested'
  /** An assessment request failed: the take has no grade. */
  | 'assessment-failed'
  /** Interactive video: the learner started playback. */
  | 'video-played'
  /** Interactive video: playback paused, by the learner or by a quiz. */
  | 'video-paused'
  /** Interactive video: the playhead moved (`from`, `to`, and whether navigation `clamped` it). */
  | 'video-seeked'
  | 'video-rate-changed'
  | 'video-ended'
  /** Interactive video: a quiz opened (`cueId`, `at`). */
  | 'video-quiz-opened'
  /** Interactive video: one question of an open quiz was shown (`cueId`, `slotId`). */
  | 'video-quiz-question-shown'
  | 'video-quiz-skipped'
  | 'video-quiz-closed'
  /**
   * Interactive video: the captions a learner chose. `payload.srclang` is the
   * primary line's language, or `null` with captions off; `payload.secondary` is
   * the second line's, or `null` with none showing. Fires when either changes.
   */
  | 'video-captions-changed'
  | 'video-fullscreen-changed'
  | 'video-pip-changed'
  /**
   * An AI hint was shown to the learner (`hintNumber`, and the port's
   * `provenance` when it sent one). Only a hint the SDK accepted: a refused one
   * is never shown and never reported here.
   */
  | 'ai-hint-shown'
  /** An AI explanation of the graded answer was shown (`provenance` when sent). */
  | 'ai-explanation-shown'
  // `string & {}` preserves literal autocompletion while keeping the union open
  // for registered custom types.
  | (string & {});

/**
 * Payload carried by every `media-play-*` {@link InteractionEvent}.
 *
 * `activityId` on the event is the slot the learner was standing on — position,
 * not ownership. `mediaKey` is the identity: one group stimulus serves several
 * questions and belongs to no single activity.
 */
export interface MediaPlayInteractionPayload {
  /** `slot:<slotId>` or `stimulus:<entryKey>`. */
  mediaKey: string;
  mediaType: 'audio';
  playsUsed: number;
  maxPlays: number;
  playsRemaining: number;
}

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
