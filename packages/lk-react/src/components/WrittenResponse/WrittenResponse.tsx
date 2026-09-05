'use client';

import {
  ActivitySchemaError,
  type CriterionScore,
  countWords,
  evaluate,
  type GradeRecord,
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
import { useActivityState } from '../../hooks/useActivityState.js';
import { ANONYMOUS_ACTOR, isDevelopment, objectIdFor } from '../_internal.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import type { HtmlSanitizer, Renderable, RenderMode } from '../types.js';

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
  onInteraction?: (event: InteractionEvent) => void;
  /** Per-instance token overrides, applied as inline CSS vars on the root. */
  theme?: Partial<ThemeTokens>;
  locale?: string;
  disabled?: boolean;
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
 * Renders the server-computed outcome in `review` mode. The grade shown here
 * always came back from the asynchronous grader — nothing on this path scores,
 * infers, or defaults a grade. A `written-response` outcome carries no
 * per-item `details` (there are no options or blanks to mark), so the render
 * is the scaled score, the pass state, and the grader's feedback.
 */
function GradeBody({ grade }: { grade: GradeRecord }) {
  return (
    <>
      {grade.feedback ? <p className="lk-wr-grade-feedback">{grade.feedback}</p> : null}
      {grade.criteria && grade.criteria.length > 0 ? (
        <ul className="lk-wr-criteria">
          {grade.criteria.map((criterion) => (
            <li
              className="lk-wr-criterion"
              key={criterion.name}
              data-na={String(criterion.notApplicable === true)}
            >
              <span className="lk-wr-criterion-name">{criterion.name}</span>
              {criterion.notApplicable === true ? (
                <span className="lk-wr-criterion-score">Not applicable</span>
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
      ) : null}
      {grade.corrections && grade.corrections.length > 0 ? (
        <ul className="lk-wr-corrections">
          {grade.corrections.map((correction) => (
            <li className="lk-wr-correction" key={`${correction.original}:${correction.corrected}`}>
              <del className="lk-wr-correction-original">{correction.original}</del>{' '}
              <ins className="lk-wr-correction-corrected">{correction.corrected}</ins>
              {correction.explanation ? (
                <span className="lk-wr-correction-explanation">{correction.explanation}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {grade.requiresHumanReview === true ? (
        <p className="lk-wr-review-flag">This grade is awaiting review by a teacher.</p>
      ) : null}
    </>
  );
}

/**
 * Renders the server-computed outcome in `review` mode. The grade shown here
 * always came back from the grader — nothing on this path scores, infers, or
 * defaults a grade.
 */
function OutcomeSummary({ outcome }: { outcome: ItemOutcome }) {
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
        <p className="lk-wr-grade">
          Score {percent}%. {outcome.passed ? 'Passed.' : 'Not passed.'}
        </p>
        {outcome.status === 'graded' ? (
          <GradeBody grade={outcome.grade} />
        ) : outcome.feedback ? (
          <p className="lk-wr-grade-feedback">{outcome.feedback}</p>
        ) : null}
      </div>
    );
  }
  if (outcome.status === 'deferred') {
    return (
      <div className="lk-wr-outcome" data-status="deferred">
        <p className="lk-wr-grade">Not graded yet. This response is waiting for its grade.</p>
      </div>
    );
  }
  // `unscorable` reasons are developer-facing strings; surface the state, not
  // the reason, and leave it on the element for diagnostics.
  return (
    <div className="lk-wr-outcome" data-status="unscorable" data-reason={outcome.reason}>
      <p className="lk-wr-grade">This response could not be graded.</p>
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
  onInteraction,
  theme,
  locale,
  disabled,
}: WrittenResponseProps) {
  // Dev-only boundary validation (Req 2.3), same convention as MC/FIB. The
  // content schema is loose, so a `redact()` projection validates too.
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the reset trigger (Req 3.7)
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
    setSummary('Response submitted. It will be graded and your result will appear here later.');
    onInteraction?.({
      type: 'submitted',
      activityId: data.id,
      timestamp: Date.now(),
      payload: { wordCount: finalWordCount, withinWordBounds: finalWithinBounds },
    });
  };

  const promptId = `${data.id}-prompt`;
  const counterId = `${data.id}-counter`;
  const boundsLabel =
    data.minWords > 0 ? `${data.minWords}–${data.maxWords} words` : `up to ${data.maxWords} words`;

  return (
    <form
      className="lk-wr"
      aria-label={data.title}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      {data.media ? <ActivityMedia media={data.media} /> : null}
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
        {wordCount} {wordCount === 1 ? 'word' : 'words'} ({boundsLabel})
      </div>
      {isReview ? null : (
        <button
          type="submit"
          className="lk-wr-submit"
          disabled={inactive || text.trim().length === 0}
        >
          Submit
        </button>
      )}
      <FeedbackRegion id={`${data.id}-feedback`}>
        {isReview ? outcome ? <OutcomeSummary outcome={outcome} /> : null : summary}
      </FeedbackRegion>
    </form>
  );
}
