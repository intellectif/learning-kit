import type {
  ActivityData,
  ActivityResult,
  InteractionEvent,
  ItemGroup,
  ItemOutcome,
  LearnerResponse,
  MediaPlayClaim,
  MediaPlayGrant,
  MediaPlayLedgerEntry,
  RedactedActivityData,
  SequenceEntry,
  ThemeTokens,
} from '@intellectif/lk-core';
import type { LkStringsOverride } from '../i18n/strings.js';

/**
 * How an activity is being presented. This is the single switch that decides
 * whether the component may grade, reveal, or submit — the three things a
 * summative exam must take away from the client.
 *
 * - `practice` (default, and the only behaviour before `renderMode` existed):
 *   the component owns the attempt. It
 *   scores locally on submit, reveals correctness and feedback, and calls
 *   `onComplete` with a full {@link ActivityResult}.
 * - `exam`: the component NEVER scores and NEVER reveals correctness. Submit
 *   emits the raw learner response through `onSubmit`; the server grades it.
 *   Safe to render redacted data, because nothing here needs the answer key.
 * - `review`: read-only. Renders the learner's submitted answer, and marks
 *   correctness only from an `outcome` the caller supplies (which the server
 *   computed). Nothing is submittable.
 */
export type RenderMode = 'practice' | 'exam' | 'review';

/**
 * Makes the answer-key-bearing parts of an activity optional, so a component
 * can render either full activity data OR a `redact()` projection with the
 * same props. Fields the SDK classifies `answer-key` become optional here;
 * a component in `exam` mode must not read them at all.
 */
export type Renderable<TData> = Omit<TData, 'scoringStrategy'> & {
  scoringStrategy?: unknown;
  /** Present on a `redact()` projection. */
  redacted?: true;
};

/**
 * {@link Renderable} DISTRIBUTED over a union of activity types.
 *
 * This distinction is load-bearing, not cosmetic. `Renderable<T>` is built on
 * `Omit`, and `Omit` does not distribute: `Omit<A | B, K>` collapses to the
 * keys A and B have IN COMMON, so `Renderable<ActivityData>` is a single
 * object type carrying only the fields every activity shares. Narrowing it
 * dies with it — after `if (data.type === 'multiple-choice')` the compiler
 * still refuses `data.options`, because the union it would narrow to no
 * longer exists.
 *
 * The conditional below re-distributes, so `RenderableActivity` is a real
 * union of per-type renderables and `.type` narrows again. Anything that
 * accepts "some renderable activity, I don't know which" — a custom renderer,
 * a sequence entry — must use THIS, not `Renderable<ActivityData>`.
 */
export type RenderableActivity<TData extends ActivityData = ActivityData> = TData extends unknown
  ? Renderable<TData>
  : never;

/**
 * Sanitiser for author-supplied rich text (`questionHtml`, `promptHtml`, and a
 * stimulus's `bodyHtml`). The SDK deliberately ships NO sanitiser — that would
 * add a dependency and, worse, a false promise. Rich text is rendered only when
 * you supply this function; without it the component falls back to the
 * plain-text field, which is always escaped. Fail-safe by construction: the SDK
 * never injects HTML it was not explicitly given a sanitiser for.
 *
 * `FillInTheBlanks.passageHtml` is the one exception, and is **never**
 * rendered: the passage hosts the answer inputs, so it cannot be split at the
 * `{{blank}}` placeholders without voiding the sanitiser. The plain `passage`
 * is always used, and passing `passageHtml` warns in development.
 */
export type HtmlSanitizer = (html: string) => string;

/**
 * The prop contract shared by every activity component (Req 3.1). Defined
 * here (React-specific) rather than in lk-core, which is React-free.
 *
 * Controlled / uncontrolled follows the React convention: pass `value` +
 * `onChange` to own the learner's answer (restore an in-progress attempt,
 * autosave a delta, drive a review); pass `defaultValue` to seed an
 * uncontrolled component; pass neither to keep the pre-2.1.0 behaviour, where
 * the component owns the answer outright.
 */
export interface ActivityProps<TData extends ActivityData = ActivityData> {
  /** Activity content. Accepts a `redact()` projection in `exam` mode. */
  data: RenderableActivity<TData>;
  /**
   * Called when the component scored the attempt itself. Only ever fires in
   * `practice` mode — in `exam` mode the client does not grade, so there is
   * no `ActivityResult` to give you; use `onSubmit`.
   */
  onComplete?: (result: ActivityResult) => void;
  /**
   * Called on submit with the raw learner response and no grade. Fires in
   * every mode, before `onComplete`, so an exam runner can persist the
   * response and let the server score it.
   */
  onSubmit?: (response: LearnerResponse) => void;
  /** Controlled value: the learner's current response. */
  value?: LearnerResponse;
  /** Initial response for an uncontrolled component (ignored when `value` is set). */
  defaultValue?: LearnerResponse;
  /**
   * Mount the component as already submitted — read at mount only, like any
   * `default*` prop.
   *
   * Restoring an attempt without it reopens a question the learner had already
   * submitted as answerable, so on a summative paper they can change and
   * re-submit it. `AttemptState.submittedSlotIds` is what this consumes.
   */
  defaultSubmitted?: boolean;
  /** Fires on every change to the learner's response. Required for a controlled component. */
  onChange?: (response: LearnerResponse) => void;
  /** Presentation mode. Defaults to `practice`. */
  renderMode?: RenderMode;
  /**
   * Server-computed outcome, used by `review` mode to mark correctness
   * without the client ever scoring. Ignored in other modes.
   */
  outcome?: ItemOutcome;
  /** Renders author-supplied rich text when provided. See {@link HtmlSanitizer}. */
  sanitizeHtml?: HtmlSanitizer;
  /**
   * Binds this activity's own `data.media` to a play budget the consumer
   * persists. Usually supplied by `<ActivitySequence mediaBudget={…}>`; pass it
   * yourself when rendering an activity standalone.
   */
  mediaBudget?: MediaBudgetBinding;
  /** Translations for the audio transport chrome. See {@link MediaTransportStrings}. */
  mediaStrings?: Partial<MediaTransportStrings>;
  /**
   * Overrides the SDK's chrome text for this activity, layered on whatever
   * `LkIntlProvider` supplies. `mediaStrings` still works and is merged after
   * this, so an existing 0.8.x call site keeps behaving as it did.
   */
  strings?: LkStringsOverride;
  onInteraction?: (event: InteractionEvent) => void;
  /** Per-instance token overrides, applied as inline CSS vars on the root. */
  theme?: Partial<ThemeTokens>;
  /**
   * BCP 47 tag stamped as `lang` on this component's root. This is the
   * INTERFACE language — the SDK's own chrome renders inside that element — so
   * it should carry the same value you give `<LkIntlProvider locale>`. Passing
   * a different one re-declares the language of every SDK string in this
   * subtree without changing the words.
   *
   * It is NOT `data.locale`, which labels xAPI statements only. Authored
   * content in another language belongs on `stimulus.locale`, which
   * `<StimulusPanel>` puts on the passage alone.
   */
  locale?: string;
  disabled?: boolean;
}

/**
 * Bridges a server-produced `redact()` projection into the `data` prop.
 *
 * `RedactedActivityData` is deliberately index-signature typed in lk-core — it
 * proves a payload is learner-safe, not what shape it has — so TypeScript
 * cannot know it still carries the public fields a renderer needs. This is the
 * SDK's single, documented crossing of that gap, so an exam runner does not
 * have to write `as unknown as` at every call site:
 *
 * ```tsx
 * <MultipleChoice
 *   data={asRenderable<MultipleChoiceData>(redactedFromServer)}
 *   renderMode="exam"
 *   onSubmit={persist}
 * />
 * ```
 *
 * Safe because `exam` mode reads only public fields; the answer-key fields the
 * type claims are exactly the ones the component is forbidden to touch there.
 *
 * Per-type redacted interfaces (`RedactedMultipleChoiceData`, …) ship from
 * lk-core since 0.6.0, but they are not yet *assignable* to `data`:
 * {@link Renderable} widens `scoringStrategy` and leaves nested answer-key
 * fields (`options[].isCorrect`, `blanks[].acceptedAnswers`) required, so a
 * real redacted payload still needs this bridge. Closing that gap is tracked
 * in the roadmap.
 */
export function asRenderable<TData extends ActivityData>(
  redacted: RedactedActivityData,
): Renderable<TData> {
  return redacted as unknown as Renderable<TData>;
}

/**
 * The same bridge as {@link asRenderable}, for a whole sequence: activities
 * and item groups as a server hands them over, ready for `<ActivitySequence>`.
 *
 * Needed for the same reason and no other. `redactItemGroup` returns
 * `ItemGroup<RedactedActivityData>`, and `RedactedActivityData` is an
 * index-signature type whose fields are all `unknown` — so its `question` is
 * not a `string` and it satisfies no per-type renderable, however the prop is
 * widened. Widening alone cannot fix this; a crossing point is required, and
 * having exactly one keeps `as unknown as` out of consumer code.
 *
 * ```tsx
 * const entries = await fetchExam();            // redacted, server-side
 * <ActivitySequence
 *   activities={asRenderableSequence(entries)}
 *   renderMode="exam"                           // REQUIRED: see below
 *   shuffleSeed={attemptId}
 *   onSubmit={persist}
 * />
 * ```
 *
 * Pass `renderMode="exam"` (or `"review"`). Redacted data has no answer key, and
 * all three built-in activities throw at render in the default `practice` mode
 * rather than fail later: `<MultipleChoice>` and `<FillInTheBlanks>` because
 * they grade locally, and `<WrittenResponse>` because `practice` still runs its
 * local submit path and emits a practice-mode xAPI statement.
 */
export function asRenderableSequence(
  entries: readonly (RedactedActivityData | RedactedItemGroupData)[],
): readonly SequenceEntry<RenderableActivity>[] {
  return entries as unknown as readonly SequenceEntry<RenderableActivity>[];
}

/** Structural shape of a `redactItemGroup()` projection, as it arrives from a server. */
type RedactedItemGroupData = ItemGroup<RedactedActivityData> & { redacted: true };

/**
 * Every word the SDK's audio transport renders.
 *
 * Words, not characters: the `m:ss / m:ss` clock is digits and punctuation and
 * is formatted by the component, because it reads identically in every locale
 * this SDK targets. The scrubber's SPOKEN value does have a word in it and does
 * have a key ({@link MediaTransportStrings.timeValue}).
 *
 * Supply them to translate it. These are the highest-stakes strings on a
 * listening paper — "No plays remaining" decides whether a learner believes
 * they may try again — so shipping them as untranslatable English inside a
 * Spanish panel was not acceptable. Supplying any of them also sets `lang` on
 * the transport chrome, so a screen reader does not read the SDK's own words
 * with the passage's phonetics.
 */
export interface MediaTransportStrings {
  play: string;
  pause: string;
  preparing: string;
  mute: string;
  unmute: string;
  volume: string;
  speed: string;
  seek: string;
  /**
   * Spoken value of the scrubber, e.g. `('1:05', '4:30') => '1:05 of 4:30'`.
   * Takes ALREADY-FORMATTED `m:ss` strings: a translation should not have to
   * reimplement the clock to change the word between them.
   */
  timeValue: (elapsed: string, duration: string) => string;
  /** e.g. `(1, 2) => '1 of 2 plays remaining'`. */
  playsRemaining: (remaining: number, max: number) => string;
  noPlaysRemaining: string;
  /** Shown before the LAST play is spent, so a stray press cannot cost it. */
  lastPlayConfirm: string;
  lastPlayStart: string;
  lastPlayCancel: string;
  seekBlocked: string;
  rateBlocked: string;
  playFailed: string;
}

/**
 * Binds ONE media block to a play budget the consumer persists.
 *
 * The SDK refuses a play; it does not remember one. Everything durable here is
 * the consuming application's — see {@link SequenceMediaBudget.onPlayConsumed}.
 */
export interface MediaBudgetBinding {
  /** From `slotMediaKey(slotId)` / `stimulusMediaKey(slotId)` in lk-core. */
  key: string;
  /** Plays already spent, and where playback stood. Read at mount only. */
  entry?: MediaPlayLedgerEntry;
  /** Defaults to `renderMode !== 'review'`. An explicit boolean wins either way. */
  enforced?: boolean;
  /** Slot context stamped onto the claim and the interaction event. */
  slotId: string;
  index: number;
  activityId?: string;
  onPlayConsumed?: (claim: MediaPlayClaim) => undefined | Promise<MediaPlayGrant | undefined>;
  onPlayRefunded?: (claim: MediaPlayClaim) => void;
  onPosition?: (key: string, seconds: number) => void;
  /** Translations for the transport chrome. */
  strings?: Partial<MediaTransportStrings>;
}

/**
 * The pager-level half of a play budget. One prop, because it is one concept.
 */
export interface SequenceMediaBudget {
  /**
   * `MediaPlayLedger.entries` goes straight in. An absent key means nothing
   * spent. Read at mount, like `responses`.
   */
  plays?: Readonly<Record<string, MediaPlayLedgerEntry>>;
  /**
   * Re-seed token. Change this string and the budgets re-seed from `plays`
   * WITHOUT remounting the pager — the invigilator path ("the audio never
   * started, give her the play back") that would otherwise cost the learner
   * their focus, their scroll position and an unsaved answer.
   */
  resumeKey?: string;
  /** Explicit override of the default (`renderMode !== 'review'`). */
  enforced?: boolean;
  /**
   * Called the instant a play is claimed, BEFORE any audio is audible.
   *
   * Two tiers, chosen by what you return:
   *
   * - **Return nothing (optimistic).** Playback starts immediately and the
   *   count is only as durable as your write. **Do not debounce this, and do
   *   not batch it with the answer autosave** — an eight-second debounce is
   *   exactly long enough to start a third play and hard-reload. A `pagehide`
   *   beacon is a backstop, not the mechanism. A crash between this call and
   *   your write landing RETURNS the play to the learner; that is the honest
   *   description of what you are buying.
   * - **Return a promise (confirmed).** Playback is held — the button reads
   *   "Preparing…" and is `aria-busy` — until it settles. Resolve with
   *   `{ playsUsed }` from an ATOMIC server write (`UPDATE … SET plays = plays
   *   + 1 … RETURNING plays`, or a compare-and-set on
   *   `claim.previousPlaysUsed`). A resolved count above `maxPlays` refuses the
   *   play, which is how a second tab is caught: two mounts both seeded at 0
   *   both claim 1, and only an atomic increment can tell them apart. A
   *   rejection charges nothing and lets the learner retry. This is the only
   *   tier in which "consumed before audible" is true of storage rather than
   *   only of memory; use it for summative papers.
   *
   * Never settle the promise and the learner cannot play at all: settle it.
   */
  onPlayConsumed?: (claim: MediaPlayClaim) => undefined | Promise<MediaPlayGrant | undefined>;
  /**
   * Called when a charged play produced no audio — the element errored before
   * playback advanced past 0.25 s, an expired signed URL being the realistic
   * cause. Supply it to give the play back, decrementing with a compare-and-set
   * on `claim.playsUsed`. Omit it and the play stays spent: the SDK will not
   * decrement a ledger it has no channel to correct.
   */
  onPlayRefunded?: (claim: MediaPlayClaim) => void;
  /**
   * Position reports, so a refresh resumes the play the learner already paid
   * for instead of charging them again. Fires on pause, on end (with 0), and at
   * most once per whole second of playback.
   *
   * **This one you MAY throttle** — the granularity you persist is the
   * granularity of the replay a crash grants. Three seconds is sane; three
   * minutes is not.
   */
  onPosition?: (key: string, seconds: number) => void;
  /** Translations for the transport chrome. Defaults are English. */
  strings?: Partial<MediaTransportStrings>;
}
