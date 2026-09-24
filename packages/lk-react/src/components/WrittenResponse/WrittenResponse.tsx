'use client';

import {
  ActivitySchemaError,
  type CriterionScore,
  countWords,
  type DeliveryPolicy,
  evaluate,
  type GradeRecord,
  type InlineCorrection,
  type InteractionEvent,
  type ItemOutcome,
  type LearnerResponse,
  type ThemeTokens,
  validateActivity,
  type WrittenResponseData,
  type XAPIStatement,
  xAPIBuilder,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { type LearnerAi, useLearnerAi } from '../../ai/LkAiProvider.js';
import { type AiWritingFeedbackHelp, useAiWritingFeedback } from '../../ai/useAiHelp.js';
import { useActivityState } from '../../hooks/useActivityState.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStrings, LkStringsOverride } from '../../i18n/strings.js';
import { ANONYMOUS_ACTOR, isDevelopment, objectIdFor } from '../_internal.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { outcomeShowsMarks, useDeliveryPolicy } from '../shared/delivery.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import type {
  HtmlSanitizer,
  MediaBudgetBinding,
  MediaTransportStrings,
  Renderable,
  RenderMode,
} from '../types.js';

/**
 * Payload delivered when the learner submits a written response. Grading is
 * DEFERRED (asynchronous AI/human grading), so there is no score here — and
 * deliberately no fake one: an ungraded submission must never be shown or
 * stored as a 0. The consumer persists `text` and grades it out-of-band.
 */
export interface WrittenResponseSubmission {
  /** The submitted text, verbatim. */
  text: string;
  /** Word count of `text`, recomputed with the canonical `countWords()`. */
  wordCount: number;
  /** Whether `wordCount` falls within the activity's `[minWords, maxWords]`. */
  withinWordBounds: boolean;
  /** Time in milliseconds from first interaction to submission. */
  timeSpent: number;
  /** The SUBMITTED-verb xAPI statement built for this submission (no score fields). */
  xapiStatement: XAPIStatement;
}

/**
 * Props for {@link WrittenResponse}. Mirrors `ActivityProps` except for the
 * completion callback: a deferred-grading activity completes with a
 * {@link WrittenResponseSubmission} (`onSubmitted`), not a scored
 * `ActivityResult` (`onComplete`) — deviation from Req 22.8 recorded in the
 * roadmap (§3.1): fabricating a score of 0 for ungraded work is the exact
 * bug this type exists to fix. Everything else — controlled value, render
 * mode, server outcome, rich text — follows the shared `ActivityProps`
 * contract verbatim.
 */
export interface WrittenResponseProps {
  /** Activity content. Accepts a `redact()` projection in `exam` mode. */
  data: Renderable<WrittenResponseData>;
  /**
   * Called on submit with the ungraded submission (text, recomputed word
   * count, bounds flag, timing, xAPI statement). Fires in `practice` and
   * `exam` mode, after `onSubmit`; never in `review`.
   *
   * Optional since lk-react 2.1.0 so a `review`-mode render (which has no submit
   * control) and an exam runner that only wants the raw response through
   * `onSubmit` do not have to pass a no-op. Supply it in `practice`/`exam`
   * unless `onSubmit` already captures everything you persist.
   */
  onSubmitted?: (submission: WrittenResponseSubmission) => void;
  /**
   * Called on submit with the raw learner response and no grade, BEFORE
   * `onSubmitted`. This is the only submit callback an exam runner needs:
   * the server grades the text and returns an {@link ItemOutcome} later.
   */
  onSubmit?: (response: LearnerResponse) => void;
  /**
   * Controlled value: the learner's current response. When present the
   * textarea renders from it (never from internal state) and every keystroke
   * goes out through `onChange` — restore an in-progress attempt, autosave a
   * delta, or drive a review render with it.
   */
  value?: LearnerResponse;
  /** Initial response for an uncontrolled component (ignored when `value` is set). */
  defaultValue?: LearnerResponse;
  /**
   * Mount as already submitted — read at mount only. Without it a resumed
   * attempt reopens an essay the learner had already submitted as editable
   * and re-submittable.
   */
  defaultSubmitted?: boolean;
  /** Fires on every change to the learner's response. Required for a controlled component. */
  onChange?: (response: LearnerResponse) => void;
  /**
   * Presentation mode, default `practice`. `practice` and `exam` are nearly
   * identical here — a written response is never graded client-side, so
   * there is no local score to withhold; `exam` additionally never calls
   * `evaluate()` and renders happily from a `redact()` projection.
   * `review` is read-only and shows the server's `outcome`.
   */
  renderMode?: RenderMode;
  /**
   * Server-computed outcome, rendered by `review` mode: `deferred` shows a
   * "not graded yet" affordance, `scored` shows the returned grade and
   * feedback. Ignored in other modes — this component never manufactures an
   * outcome of its own.
   */
  outcome?: ItemOutcome;
  /** Renders `data.promptHtml` when provided. See `HtmlSanitizer`. */
  sanitizeHtml?: HtmlSanitizer;
  /** Binds this activity's own `data.media` to a play budget. See {@link MediaBudgetBinding}. */
  mediaBudget?: MediaBudgetBinding;
  /** Translations for the audio transport chrome. See {@link MediaTransportStrings}. */
  mediaStrings?: Partial<MediaTransportStrings>;
  /** Overrides the SDK's chrome text for this activity. See {@link LkIntlProvider}. */
  strings?: LkStringsOverride;
  onInteraction?: (event: InteractionEvent) => void;
  /** Per-instance token overrides, applied as inline CSS vars on the root. */
  theme?: Partial<ThemeTokens>;
  locale?: string;
  disabled?: boolean;
  /**
   * The delivery policy. An essay is graded later, so `feedback` reaches it —
   * `false` reads a returned grade back as nothing in `review` — and so does
   * AI feedback on a draft, which needs `feedback`, `solutions` and
   * `ai.explanations`. See `DeliveryPolicy` in lk-core.
   */
  delivery?: DeliveryPolicy | null;
  /**
   * The host's AI ports, overriding `LkAiProvider`'s. With a `writingFeedback`
   * port, a learner in `practice` can ask for feedback on a draft before
   * submitting it — up to `maxWritingFeedback` times — and revise. Every
   * correction in it quotes the learner's own words, or the SDK refuses it.
   * Never in `exam` or `review`. See {@link LearnerAi}.
   */
  ai?: LearnerAi;
}

/**
 * Reads the text out of a learner response. Another activity type's response
 * shape (the `value`/`defaultValue` props take the `LearnerResponse` union,
 * so a generic runner can hand any of them over) reads as empty rather than
 * throwing mid-exam.
 */
function textOf(response: LearnerResponse | undefined): string {
  return response !== undefined && response.type === 'written-response' ? response.text : '';
}

/**
 * One criterion's score as a percentage of its OWN maximum.
 *
 * `CriterionScore.maxScore` defaults to 1 — the SDK's scaled convention — but
 * a grader may work out of 100, or out of 9 for a CEFR band, and
 * `gradeFromRubric` deliberately stores those judgements verbatim so a grade
 * stays auditable in the units the grader actually used. It normalises when it
 * computes the total; anything DISPLAYING a criterion has to normalise too, or
 * a perfectly ordinary 82/100 renders as "8200%". This is the same guard the
 * overall score already applies against `outcome.maxScore`.
 */
function criterionPercent(criterion: CriterionScore): string {
  const max = criterion.maxScore !== undefined && criterion.maxScore > 0 ? criterion.maxScore : 1;
  return `${Math.round(((criterion.score as number) / max) * 100)}%`;
}

/**
 * Pairs each correction with a list key that is unique by construction. The
 * same mistake made twice carries the same `original`/`corrected` pair, so
 * the grader's `range` is what tells the occurrences apart. `range` is
 * optional and nothing validates it, so a correction without one — or one
 * whose range the grader already used — is keyed by its position instead.
 * Only position keys start with `#`, so the two kinds never collide.
 */
function keyedCorrections(
  corrections: readonly InlineCorrection[],
): { key: string; correction: InlineCorrection }[] {
  const used = new Set<string>();
  return corrections.map((correction, index) => {
    const anchored = correction.range
      ? `${correction.range.start}-${correction.range.end}:${correction.corrected}`
      : undefined;
    const key = anchored !== undefined && !used.has(anchored) ? anchored : `#${index}`;
    used.add(key);
    return { key, correction };
  });
}

/**
 * Renders the server-computed outcome in `review` mode. The grade shown here
 * always came back from the asynchronous grader — nothing on this path scores,
 * infers, or defaults a grade. A `written-response` outcome carries no
 * per-item `details` (there are no options or blanks to mark), so the render
 * is the scaled score, the pass state, and the grader's feedback.
 */
function CriteriaList({ criteria, s }: { criteria: readonly CriterionScore[]; s: LkStrings }) {
  return (
    <ul className="lk-wr-criteria">
      {criteria.map((criterion) => (
        <li
          className="lk-wr-criterion"
          key={criterion.name}
          data-na={String(criterion.notApplicable === true)}
        >
          <span className="lk-wr-criterion-name">{criterion.name}</span>
          {criterion.notApplicable === true ? (
            <span className="lk-wr-criterion-score">{s.notApplicable}</span>
          ) : (
            <span className="lk-wr-criterion-score">
              {criterion.band ??
                (typeof criterion.score === 'number' ? criterionPercent(criterion) : '')}
            </span>
          )}
          {criterion.comment ? (
            <span className="lk-wr-criterion-comment">{criterion.comment}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CorrectionsList({
  corrections,
  label,
}: {
  corrections: readonly InlineCorrection[];
  label?: string;
}) {
  return (
    <ul className="lk-wr-corrections" {...(label !== undefined ? { 'aria-label': label } : {})}>
      {keyedCorrections(corrections).map(({ key, correction }) => (
        <li className="lk-wr-correction" key={key}>
          <del className="lk-wr-correction-original">{correction.original}</del>{' '}
          <ins className="lk-wr-correction-corrected">{correction.corrected}</ins>
          {correction.explanation ? (
            <span className="lk-wr-correction-explanation">{correction.explanation}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function GradeBody({ grade, s }: { grade: GradeRecord; s: LkStrings }) {
  return (
    <>
      {grade.feedback ? <p className="lk-wr-grade-feedback">{grade.feedback}</p> : null}
      {grade.criteria && grade.criteria.length > 0 ? (
        <CriteriaList criteria={grade.criteria} s={s} />
      ) : null}
      {grade.corrections && grade.corrections.length > 0 ? (
        <CorrectionsList corrections={grade.corrections} />
      ) : null}
      {grade.requiresHumanReview === true ? (
        <p className="lk-wr-review-flag">{s.awaitingHumanReview}</p>
      ) : null}
    </>
  );
}

/**
 * "Get feedback on my draft", and the feedback: what a model said, the
 * corrections it proposed — each quoting the learner's own words, or the SDK
 * would have refused it — its comment on each criterion, and the rubric's
 * total as an indication, never a grade. A revision since the feedback is
 * said, because its corrections may point at words that are gone.
 */
function DraftFeedback({
  help,
  draft,
  disabled,
  s,
}: {
  help: AiWritingFeedbackHelp;
  draft: string;
  disabled: boolean;
  s: LkStrings;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const refocus = useRef(false);
  const latest = help.latest;

  // The feedback lands beside the button that asked; focus follows it there,
  // so a screen reader reads it from its heading rather than all at once.
  useEffect(() => {
    if (latest !== null && refocus.current) {
      refocus.current = false;
      panelRef.current?.focus();
    }
  }, [latest]);
  useEffect(() => {
    if (help.status === 'unavailable') {
      refocus.current = false;
    }
  }, [help.status]);

  if (!help.offered && help.used === 0) {
    return null;
  }
  const loading = help.status === 'loading';
  const empty = draft.trim() === '';
  const ask = (): void => {
    refocus.current =
      typeof document !== 'undefined' && document.activeElement === buttonRef.current;
    help.ask();
  };
  return (
    <div className="lk-ai lk-wr-ai" data-state={help.status}>
      <div aria-live="polite">
        {latest !== null ? (
          <section
            ref={panelRef}
            className="lk-ai-panel"
            tabIndex={-1}
            aria-label={s.aiWritingFeedbackHeading}
            data-current={String(help.current)}
          >
            <p className="lk-ai-heading">{s.aiWritingFeedbackHeading}</p>
            {help.current ? null : <p className="lk-ai-note">{s.aiWritingFeedbackOutdated}</p>}
            <p className="lk-ai-text">{latest.text}</p>
            {latest.corrections.length > 0 ? (
              <CorrectionsList corrections={latest.corrections} label={s.aiCorrections} />
            ) : null}
            {latest.criteria.length > 0 ? <CriteriaList criteria={latest.criteria} s={s} /> : null}
            {latest.indicativeScore !== null ? (
              <p className="lk-wr-indicative">
                {s.aiIndicativeScore(Math.round(latest.indicativeScore * 100))}
              </p>
            ) : null}
            <p className="lk-ai-notice">{s.aiNotice}</p>
          </section>
        ) : null}
        {help.status === 'unavailable' ? (
          <p className="lk-ai-unavailable">{s.aiWritingFeedbackUnavailable}</p>
        ) : null}
      </div>
      {help.offered ? (
        help.used < help.limit ? (
          <button
            ref={buttonRef}
            type="button"
            className="lk-ai-button"
            aria-busy={loading || undefined}
            // aria-disabled rather than disabled: focus stays on the button.
            aria-disabled={loading || empty || disabled || undefined}
            onClick={ask}
          >
            {loading ? s.aiWritingFeedbackLoading : s.aiWritingFeedback}
          </button>
        ) : (
          <p className="lk-ai-note">{s.aiNoMoreWritingFeedback}</p>
        )
      ) : null}
    </div>
  );
}

/**
 * Renders the server-computed outcome in `review` mode. The grade shown here
 * always came back from the grader — nothing on this path scores, infers, or
 * defaults a grade.
 */
function OutcomeSummary({ outcome, s }: { outcome: ItemOutcome; s: LkStrings }) {
  if (outcome.status === 'scored' || outcome.status === 'graded') {
    // `score` is scaled [0–1] against `maxScore`; normalising by `maxScore`
    // is a no-op for the canonical maxScore of 1 and keeps an unscaled
    // grader payload (8.5 / 10) from rendering as 850%.
    const percent =
      outcome.maxScore > 0
        ? Math.round((outcome.score / outcome.maxScore) * 100)
        : Math.round(outcome.score * 100);
    return (
      <div
        className="lk-wr-outcome"
        data-status={outcome.status}
        data-passed={String(outcome.passed)}
      >
        <p className="lk-wr-grade">{s.scoreAnnouncement(percent, outcome.passed)}</p>
        {outcome.status === 'graded' ? (
          <GradeBody grade={outcome.grade} s={s} />
        ) : outcome.feedback ? (
          <p className="lk-wr-grade-feedback">{outcome.feedback}</p>
        ) : null}
      </div>
    );
  }
  if (outcome.status === 'deferred') {
    return (
      <div className="lk-wr-outcome" data-status="deferred">
        <p className="lk-wr-grade">{s.awaitingGrade}</p>
      </div>
    );
  }
  // `unscorable` reasons are developer-facing strings; surface the state, not
  // the reason, and leave it on the element for diagnostics.
  return (
    <div className="lk-wr-outcome" data-status="unscorable" data-reason={outcome.reason}>
      <p className="lk-wr-grade">{s.couldNotBeGraded}</p>
    </div>
  );
}

export function WrittenResponse({
  data,
  onSubmitted,
  onSubmit,
  value,
  defaultValue,
  defaultSubmitted,
  onChange,
  renderMode = 'practice',
  outcome,
  sanitizeHtml,
  mediaBudget,
  mediaStrings,
  strings,
  onInteraction,
  theme,
  locale,
  disabled,
  delivery,
  ai: aiProp,
}: WrittenResponseProps) {
  // Dev-only boundary validation (Req 2.3), same convention as MC/FIB. The
  // content schema is loose, so a `redact()` projection validates too.
  const s = useLkStrings(strings);
  // An essay is graded later, so `feedback` is the one setting that reaches
  // it: whether a returned grade — the score, each criterion, the corrections
  // — is read back in review.
  const policy = useDeliveryPolicy(delivery);
  const ai = useLearnerAi(aiProp);

  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    const result = validateActivity('written-response', data);
    return result.success ? null : new ActivitySchemaError('written-response', result.errors);
  }, [data]);

  const { state, start, complete, getTimeSpent, reset } = useActivityState(
    defaultSubmitted === true ? 'completed' : 'idle',
  );
  const isControlled = value !== undefined;
  const [innerText, setInnerText] = useState<string>(() => textOf(defaultValue));
  const [summary, setSummary] = useState<string | null>(null);

  /**
   * Rich text is rendered ONLY through a caller-supplied sanitiser, and only
   * when the author actually shipped the HTML sidecar. Without both, the
   * plain-text prompt is rendered as an escaped React child.
   */
  const promptHtml = useMemo(() => {
    if (sanitizeHtml === undefined || typeof data.promptHtml !== 'string') {
      return null;
    }
    return sanitizeHtml(data.promptHtml);
  }, [data.promptHtml, sanitizeHtml]);

  // Latest seed text, kept in a ref so `defaultValue` is NOT a reset trigger:
  // callers pass an object literal, whose identity changes every render.
  const defaultTextRef = useRef<string>(textOf(defaultValue));
  useEffect(() => {
    defaultTextRef.current = textOf(defaultValue);
  }, [defaultValue]);

  // Reset on data-prop change (Req 3.7): back to the seed (empty when there
  // is none — the v1 behaviour), never the previous activity's draft.
  // Mirror `defaultSubmitted` so the reset below returns to the SEEDED state.
  // Resetting unconditionally to idle unlocked an item the learner had already
  // committed — which made `defaultSubmitted` a no-op here, since this effect
  // runs right after the first paint.
  const defaultSubmittedRef = useRef(defaultSubmitted);
  useEffect(() => {
    defaultSubmittedRef.current = defaultSubmitted;
  }, [defaultSubmitted]);

  // Identity guard so the MOUNT run is a no-op. Without it this effect fires
  // after the first paint and undoes every seed it was just given; with it,
  // only a real `data` change resets. A parent that rebuilds structurally
  // identical entries in render (`activities={raw.map(redact)}`) must not
  // unlock or revert a restored answer — the pager already remounts a slot
  // whose activity actually changed, via its key.
  const lastDataRef = useRef(data);
  useEffect(() => {
    if (lastDataRef.current === data) {
      return;
    }
    lastDataRef.current = data;
    setInnerText(defaultTextRef.current);
    setSummary(null);
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [data, reset]);

  // Feedback on a draft is a hook, so it is read here, before the throws below.
  const draft = isControlled ? textOf(value) : innerText;
  const writingFeedback = useAiWritingFeedback({
    data,
    response: { type: 'written-response', text: draft, wordCount: countWords(draft) },
    submitted: state === 'completed',
    renderMode,
    delivery: policy,
    disabled: disabled === true,
    ...(ai !== undefined ? { ai } : {}),
    ...(locale !== undefined ? { locale } : {}),
    ...(onInteraction !== undefined ? { onInteraction } : {}),
  });

  if (devError) {
    throw devError;
  }

  const isExam = renderMode === 'exam';
  const isReview = renderMode === 'review';

  const text = isControlled ? textOf(value) : innerText;
  const submitted = state === 'completed';
  const inactive = disabled === true || submitted || isReview;
  const wordCount = countWords(text);
  const withinBounds = wordCount >= data.minWords && wordCount <= data.maxWords;

  const handleChange = (next: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    // A controlled component renders from `props.value` only; the caller's
    // state is the single source of truth for the text.
    if (!isControlled) {
      setInnerText(next);
    }
    const nextWordCount = countWords(next);
    onChange?.({ type: 'written-response', text: next, wordCount: nextWordCount });
    onInteraction?.({
      type: 'text-changed',
      activityId: data.id,
      timestamp: Date.now(),
      payload: { wordCount: nextWordCount },
    });
  };

  // Practice reveals nothing an essay could leak, but it DOES run the local
  // submit path and emit a practice xAPI statement for work the server is
  // supposed to grade. MultipleChoice and FillInTheBlanks have refused
  // redacted data in `practice` since 0.5.0; this component silently accepted
  // it, so an all-essay redacted paper mounted without `renderMode` looked
  // entirely healthy end to end. Fail at render, like its siblings.
  if (data.redacted === true && renderMode === 'practice') {
    throw new Error(
      `Written Response "${data.id}" received redacted activity data in renderMode "practice". ` +
        'Practice runs the local submit path and emits a practice-mode xAPI statement, so an ' +
        'exam item wired this way is graded nowhere and looks fine while it happens. ' +
        'Render redacted data with renderMode="exam" (server grades) or "review" (pass `outcome`).',
    );
  }

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive || text.trim().length === 0) {
      return;
    }
    let finalWordCount = wordCount;
    let finalWithinBounds = withinBounds;
    // `exam` mode must not call evaluate(): the component does not grade, and
    // a redacted projection carries no scoring input anyway. The two facts
    // evaluate() returns for a deferred type (recomputed word count, bounds)
    // are exactly what is computed above, so the payload is identical either
    // way; practice keeps going through core so the numbers stay canonical.
    if (!isExam) {
      const itemOutcome = evaluate(data, { type: 'written-response', text, wordCount });
      const partial = itemOutcome.status === 'deferred' ? itemOutcome.partial : undefined;
      if (typeof partial?.wordCount === 'number') {
        finalWordCount = partial.wordCount;
      }
      if (typeof partial?.withinWordBounds === 'boolean') {
        finalWithinBounds = partial.withinWordBounds;
      }
    }
    complete();
    const timeSpent = getTimeSpent();
    const xapiStatement = xAPIBuilder.buildSubmittedStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [data.locale ?? 'en-US']: data.title },
        type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
        interactionType: 'long-fill-in',
      },
      timeSpentMs: timeSpent,
      response: text,
      resultExtensions: {
        'urn:learning-kit:extension:word-count': finalWordCount,
        'urn:learning-kit:extension:within-word-bounds': finalWithinBounds,
      },
    });
    // Raw response first (an exam runner persists this), then the fuller
    // ungraded submission — mirroring `onSubmit` before `onComplete`.
    onSubmit?.({ type: 'written-response', text, wordCount: finalWordCount });
    onSubmitted?.({
      text,
      wordCount: finalWordCount,
      withinWordBounds: finalWithinBounds,
      timeSpent,
      xapiStatement,
    });
    setSummary(s.responseSubmitted);
    onInteraction?.({
      type: 'submitted',
      activityId: data.id,
      timestamp: Date.now(),
      payload: { wordCount: finalWordCount, withinWordBounds: finalWithinBounds },
    });
  };

  const promptId = `${data.id}-prompt`;
  const counterId = `${data.id}-counter`;
  const boundsLabel = s.wordBounds(data.minWords, data.maxWords);

  return (
    <form
      className="lk-wr"
      aria-label={data.title}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      {data.media ? (
        <ActivityMedia
          media={data.media}
          renderMode={renderMode}
          {...(mediaBudget !== undefined ? { mediaBudget } : {})}
          {...(mediaStrings !== undefined ? { mediaStrings } : {})}
          {...(strings !== undefined ? { strings } : {})}
          {...(onInteraction !== undefined ? { onInteraction } : {})}
          {...(locale !== undefined ? { locale } : {})}
        />
      ) : null}
      {promptHtml === null ? (
        <p className="lk-wr-prompt" id={promptId}>
          {data.prompt}
        </p>
      ) : (
        // A div, not a p: sanitised author HTML may contain block content.
        <div
          className="lk-wr-prompt"
          id={promptId}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered only through the caller-supplied HtmlSanitizer — the SDK never injects unsanitised markup
          dangerouslySetInnerHTML={{ __html: promptHtml }}
        />
      )}
      <textarea
        className="lk-wr-textarea"
        aria-labelledby={promptId}
        aria-describedby={counterId}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        // `review` uses readOnly rather than disabled: the submitted essay
        // must stay focusable, selectable and scrollable for a screen reader
        // and a keyboard, while remaining uneditable.
        disabled={!isReview && inactive}
        readOnly={isReview}
        rows={8}
      />
      <div
        className="lk-wr-counter"
        id={counterId}
        aria-live="polite"
        data-within-bounds={withinBounds}
      >
        {s.wordCount(wordCount)} ({boundsLabel})
      </div>
      {ai?.writingFeedback !== undefined ? (
        <DraftFeedback help={writingFeedback} draft={text} disabled={disabled === true} s={s} />
      ) : null}
      {isReview ? null : (
        <button
          type="submit"
          className="lk-wr-submit"
          disabled={inactive || text.trim().length === 0}
        >
          {s.submit}
        </button>
      )}
      <FeedbackRegion id={`${data.id}-feedback`}>
        {isReview ? (
          outcome && (policy.feedback || !outcomeShowsMarks(outcome)) ? (
            <OutcomeSummary outcome={outcome} s={s} />
          ) : null
        ) : (
          summary
        )}
      </FeedbackRegion>
    </form>
  );
}
