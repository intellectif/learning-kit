import type {
  ActivityData,
  ActivityResult,
  InteractionEvent,
  ItemOutcome,
  LearnerResponse,
  RedactedActivityData,
  ThemeTokens,
} from '@intellectif/lk-core';

/**
 * How an activity is being presented. This is the single switch that decides
 * whether the component may grade, reveal, or submit — the three things a
 * summative exam must take away from the client.
 *
 * - `practice` (default, v1 behaviour): the component owns the attempt. It
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
 * Sanitiser for author-supplied rich text (`questionHtml`, `passageHtml`,
 * `promptHtml`). The SDK deliberately ships NO sanitiser — that would add a
 * dependency and, worse, a false promise. Rich text is rendered only when you
 * supply this function; without it the component falls back to the plain-text
 * field, which is always escaped. Fail-safe by construction: the SDK never
 * injects HTML it was not explicitly given a sanitiser for.
 */
export type HtmlSanitizer = (html: string) => string;

/**
 * The prop contract shared by every activity component (Req 3.1). Defined
 * here (React-specific) rather than in lk-core, which is React-free.
 *
 * Controlled / uncontrolled follows the React convention: pass `value` +
 * `onChange` to own the learner's answer (restore an in-progress attempt,
 * autosave a delta, drive a review); pass `defaultValue` to seed an
 * uncontrolled component; pass neither for the v1 behaviour.
 */
export interface ActivityProps<TData extends ActivityData = ActivityData> {
  /** Activity content. Accepts a `redact()` projection in `exam` mode. */
  data: Renderable<TData>;
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
 * A future release will derive per-type redacted interfaces so this becomes
 * unnecessary.
 */
export function asRenderable<TData extends ActivityData>(
  redacted: RedactedActivityData,
): Renderable<TData> {
  return redacted as unknown as Renderable<TData>;
}
