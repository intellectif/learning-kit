import type {
  ActivityData,
  ActivityResult,
  InteractionEvent,
  ItemGroup,
  ItemOutcome,
  LearnerResponse,
  RedactedActivityData,
  SequenceEntry,
  ThemeTokens,
} from '@intellectif/lk-core';

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
  onInteraction?: (event: InteractionEvent) => void;
  /** Per-instance token overrides, applied as inline CSS vars on the root. */
  theme?: Partial<ThemeTokens>;
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
 * Pass `renderMode="exam"` (or `"review"`). Redacted data has no answer key,
 * and the default `practice` mode grades locally — so `<MultipleChoice>` and
 * `<FillInTheBlanks>` throw at render rather than fail at submit time.
 *
 * `<WrittenResponse>` is the exception: it never grades on the client and has
 * no such guard, so a redacted essay renders and stays answerable in
 * `practice`. A mis-wired essay item is therefore SILENT — set `renderMode`
 * explicitly rather than relying on the throw.
 */
export function asRenderableSequence(
  entries: readonly (RedactedActivityData | RedactedItemGroupData)[],
): readonly SequenceEntry<RenderableActivity>[] {
  return entries as unknown as readonly SequenceEntry<RenderableActivity>[];
}

/** Structural shape of a `redactItemGroup()` projection, as it arrives from a server. */
type RedactedItemGroupData = ItemGroup<RedactedActivityData> & { redacted: true };
