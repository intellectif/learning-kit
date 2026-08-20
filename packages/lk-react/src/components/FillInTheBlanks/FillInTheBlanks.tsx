'use client';

import {
  ActivitySchemaError,
  assertRedacted,
  type FillInTheBlanksData,
  type FillInTheBlanksLearnerResponse,
  type LearnerResponse,
  type ScoringDetail,
  type ScoringResult,
  score,
  validateActivity,
  xAPIBuilder,
  xapiDefinitionFor,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useActivityState } from '../../hooks/useActivityState.js';
import { ANONYMOUS_ACTOR, isDevelopment, objectIdFor } from '../_internal.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import type { ActivityProps } from '../types.js';

export interface FillInTheBlanksProps extends ActivityProps<FillInTheBlanksData> {
  /**
   * After submission, replace each incorrectly-answered blank with its first
   * accepted answer, styled distinctly (Req 5.7). Component-specific prop: it
   * is presentation, not activity data, and is outside the fixed Req-3.1 set.
   *
   * Ignored in `exam` mode — revealing the key is precisely what an exam must
   * not do, and on a `redact()` projection there is no key to reveal. In
   * `review` mode it applies only to blanks the supplied `outcome` marks
   * incorrect, and only when the caller passed data that still carries the key
   * (e.g. `redact(data, { reveal: 'after-submit' })`).
   */
  showCorrectAnswers?: boolean;
}

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

type Segment = { kind: 'text'; value: string } | { kind: 'blank'; id: string; ordinal: number };

function parsePassage(passage: string): Segment[] {
  const segments: Segment[] = [];
  const re = new RegExp(PLACEHOLDER);
  let last = 0;
  let ordinal = 0;
  let match = re.exec(passage);
  while (match !== null) {
    if (match.index > last) {
      segments.push({ kind: 'text', value: passage.slice(last, match.index) });
    }
    ordinal += 1;
    segments.push({ kind: 'blank', id: match[1] as string, ordinal });
    last = match.index + match[0].length;
    match = re.exec(passage);
  }
  if (last < passage.length) {
    segments.push({ kind: 'text', value: passage.slice(last) });
  }
  return segments;
}

/** Shared empty map: keeps the "no response supplied" path allocation-free. */
const NO_ANSWERS: Record<string, string> = {};

/**
 * Reads the answer map out of a `LearnerResponse`. A response of another
 * activity type is treated as "no answers" rather than throwing: a controlled
 * host that has not yet swapped its state on an activity change would
 * otherwise crash the attempt.
 */
function answersOf(response: LearnerResponse | undefined): Record<string, string> {
  return response !== undefined && response.type === 'fill-in-the-blanks'
    ? response.answers
    : NO_ANSWERS;
}

/**
 * Per-item correctness keyed by blank id. Prefers the unambiguous `outcome`
 * field (always written by the built-in scorers since lk-core 0.3.0) and
 * falls back to the deprecated `correct` boolean so a 0.2-era
 * consumer-constructed `ItemOutcome` still marks correctly in `review`.
 */
function correctnessByItem(details: readonly ScoringDetail[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const detail of details) {
    map.set(
      detail.itemId,
      detail.outcome !== undefined ? detail.outcome === 'correct' : detail.correct,
    );
  }
  return map;
}

export function FillInTheBlanks({
  data,
  onComplete,
  onSubmit,
  onChange,
  onInteraction,
  value,
  defaultValue,
  renderMode = 'practice',
  outcome,
  sanitizeHtml,
  theme,
  locale,
  disabled,
  showCorrectAnswers,
}: FillInTheBlanksProps) {
  const isExam = renderMode === 'exam';
  const isReview = renderMode === 'review';

  // Dev-only boundary validation (Req 2.3); throws in render so the wrapping
  // ActivityErrorBoundary catches it. Re-runs only when data changes.
  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    if (data.redacted === true) {
      // A redact() projection cannot satisfy the full content schema — the
      // answer key is gone by design. Validate it against the STRICT redacted
      // schema instead, which additionally proves the payload is learner-safe.
      try {
        assertRedacted(data);
        return null;
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    }
    const result = validateActivity('fill-in-the-blanks', data);
    return result.success ? null : new ActivitySchemaError('fill-in-the-blanks', result.errors);
  }, [data]);

  const { state, start, complete, getTimeSpent, reset } = useActivityState();
  // Controlled when `value` is supplied: the answers rendered are ALWAYS the
  // caller's, and internal state is never read. Uncontrolled otherwise,
  // seeded from `defaultValue`.
  const isControlled = value !== undefined;
  const [internalAnswers, setInternalAnswers] = useState<Record<string, string>>(() =>
    answersOf(defaultValue),
  );
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [feedbackHidden, setFeedbackHidden] = useState(false);

  const answers = isControlled ? answersOf(value) : internalAnswers;

  // `defaultValue` is read only by the reset effect, and it is commonly an
  // inline object literal — putting it in that effect's deps would re-seed
  // (and wipe) the learner's typing on every render. Mirror it into a ref in
  // its own effect, which commits before the reset effect below.
  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);

  // `data` is an intentional reset trigger (Req 3.7), not read in the body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the reset trigger (Req 3.7)
  useEffect(() => {
    setInternalAnswers(answersOf(defaultValueRef.current));
    setRevealed(new Set());
    setResult(null);
    setSummary(null);
    setFeedbackHidden(false);
    reset();
  }, [data, reset]);

  /*
   * RICH TEXT — deliberate, documented limitation (see `sanitizeHtml`).
   *
   * Every other activity can render its `*Html` field through the caller's
   * sanitiser, because the rich text is a LEAF: the sanitised string is
   * handed to one `dangerouslySetInnerHTML` node and nothing is inserted into
   * it. A fill-in-the-blanks passage is not a leaf — it is the CONTAINER of
   * the React-controlled `<input>`s, one per `{{id}}` placeholder.
   *
   * Placing those inputs inside sanitised HTML means slicing the sanitised
   * string at the placeholders and injecting each slice as its own HTML
   * fragment, which is unsafe and broken on both counts:
   *   1. Broken: the slices are unbalanced. `<p>A {{x}} B</p>` yields `<p>A `
   *      and ` B</p>`; the fragment parser auto-closes both, so the input
   *      lands OUTSIDE the paragraph and the authored block structure is
   *      destroyed.
   *   2. Unsafe: the sanitiser's guarantee covers the document it returned,
   *      not arbitrary substrings of it. A placeholder inside an attribute
   *      (`<img alt="{{x}}">`) splits mid-attribute, and re-parsing the
   *      halves in a fresh context is exactly the mutation (mXSS) class of
   *      transformation that voids a sanitiser's output guarantee. An exam
   *      runner must never depend on that.
   *
   * The safe alternative — parse the sanitised string once into a detached
   * DOM, split only TEXT nodes at placeholders, and portal the inputs into
   * anchors — needs a DOM at render time (no SSR) and a large imperative
   * subsystem. Until that lands, the plain-text `passage` is rendered (always
   * escaped by React), which is correct, answerable, and safe in every mode.
   * `data.passageHtml` is carried and redacted by lk-core regardless, so no
   * authored content is lost — only this component declines to render it.
   */
  useEffect(() => {
    if (isDevelopment() && sanitizeHtml !== undefined && data.passageHtml !== undefined) {
      console.warn(
        '[lk-react] FillInTheBlanks ignores `passageHtml`: the passage hosts the answer inputs, ' +
          'so rich HTML cannot be split at {{placeholders}} without voiding the sanitiser. ' +
          'Rendering the plain `passage` instead.',
      );
    }
  }, [sanitizeHtml, data.passageHtml]);

  const segments = useMemo(() => parsePassage(data.passage), [data.passage]);
  const blankById = useMemo(() => new Map(data.blanks.map((b) => [b.id, b])), [data.blanks]);

  if (devError) {
    throw devError;
  }

  const submitted = state === 'completed';
  const inactive = disabled === true || submitted || isReview;

  /**
   * Whether the component may show answer-key-derived information (per-blank
   * correctness, authored feedback, correct answers). NEVER in `exam`; in
   * `practice` only after the component scored locally; in `review` only once
   * the caller supplies a SCORED outcome — an item that is still awaiting a
   * grade must not have its key revealed just because it is being read back.
   */
  const revealing = isReview ? outcome?.status === 'scored' : !isExam && submitted;

  const fireInteraction = (
    type: 'blank-filled' | 'hint-requested' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  const handleChange = (blankId: string, text: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    const next = { ...answers, [blankId]: text };
    if (!isControlled) {
      setInternalAnswers(next);
    }
    onChange?.({ type: 'fill-in-the-blanks', answers: next });
    fireInteraction('blank-filled', { blankId, value: text });
  };

  const toggleHint = (blankId: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(blankId)) {
        next.delete(blankId);
        return next;
      }
      next.add(blankId);
      return next;
    });
    // Only a reveal is a "hint requested"; hiding is not a new request.
    if (!revealed.has(blankId)) {
      fireInteraction('hint-requested', { blankId });
    }
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive) {
      return;
    }
    const response: FillInTheBlanksLearnerResponse = { type: 'fill-in-the-blanks', answers };
    // Fires in every submitting mode and always BEFORE onComplete, so an exam
    // runner can persist the raw response regardless of local grading.
    onSubmit?.(response);

    if (isExam) {
      // EXAM: the client neither grades nor reveals. No score()/evaluate(), no
      // read of any answer-key field, no onComplete — and no xAPI statement,
      // because its `correctResponsesPattern` IS the answer key. The server
      // owns the grade; it emits the statement.
      complete();
      setSummary('Answer submitted.');
      fireInteraction('submitted', { answers });
      return;
    }

    // PRACTICE: unchanged v1 behaviour. `data` carries the key here — exam
    // mode is the only path that may be handed a redact() projection.
    const scoringResult = score('fill-in-the-blanks', data as FillInTheBlanksData, response);
    complete();
    const timeSpent = getTimeSpent();
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [data.locale ?? 'en-US']: data.title },
        ...xapiDefinitionFor(data),
      },
      scoringResult,
      timeSpentMs: timeSpent,
      response: JSON.stringify(answers),
    });
    setResult(scoringResult);
    onComplete?.({
      score: scoringResult.score,
      maxScore: scoringResult.maxScore,
      passed: scoringResult.passed,
      timeSpent,
      xapiStatement,
    });
    // Core selects the authored overall feedback on `passed` (B3 fix).
    const overall = scoringResult.feedback;
    setSummary(
      `Answer submitted. Score ${Math.round(scoringResult.score * 100)}%. ${
        scoringResult.passed ? 'Passed.' : 'Not passed.'
      }${overall ? ` ${overall}` : ''}`,
    );
    fireInteraction('submitted', { answers, score: scoringResult.score });
  };

  const correctByBlank = useMemo(() => {
    if (isExam) {
      // Nothing is ever marked client-side in an exam.
      return new Map<string, boolean>();
    }
    if (isReview) {
      // Correctness comes ONLY from the server-computed outcome; the component
      // never scores in review, so an absent/ungraded outcome marks nothing.
      return outcome?.status === 'scored'
        ? correctnessByItem(outcome.details)
        : new Map<string, boolean>();
    }
    return correctnessByItem(result?.details ?? []);
  }, [isExam, isReview, outcome, result]);

  /** Review has no local score: its summary is read off `outcome`, or nothing. */
  const reviewSummary = useMemo(() => {
    if (!isReview || outcome === undefined) {
      return null;
    }
    if (outcome.status === 'scored') {
      return `Score ${Math.round(outcome.score * 100)}%. ${
        outcome.passed ? 'Passed.' : 'Not passed.'
      }${outcome.feedback ? ` ${outcome.feedback}` : ''}`;
    }
    return outcome.status === 'deferred' ? 'Not graded yet.' : 'No grade available.';
  }, [isReview, outcome]);

  return (
    <form
      className="lk-fib"
      aria-label={data.title}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      {data.media ? <ActivityMedia media={data.media} /> : null}
      <fieldset disabled={inactive}>
        <p className="lk-fib-passage">
          {segments.map((seg, i) => {
            if (seg.kind === 'text') {
              // biome-ignore lint/suspicious/noArrayIndexKey: passage segments are positional and static
              return <span key={`t${i}`}>{seg.value}</span>;
            }
            const blank = blankById.get(seg.id);
            if (!blank) {
              return null;
            }
            // `Renderable` only widens `scoringStrategy` at the type level, so
            // the answer-key fields still LOOK required here while a redact()
            // projection omits them at runtime. Read them defensively, and
            // never at all in exam mode.
            const acceptedAnswers: string[] | undefined = isExam
              ? undefined
              : blank.acceptedAnswers;
            const blankFeedback = isExam ? undefined : blank.feedback;
            const correctness = correctByBlank.get(seg.id);
            const hintId = `${data.id}-hint-${seg.id}`;
            const correctAnswer = acceptedAnswers?.[0];
            if (revealing && showCorrectAnswers && correctness === false && correctAnswer) {
              return (
                <span key={seg.id} className="lk-fib-answer" data-correct="false">
                  {correctAnswer}
                </span>
              );
            }
            return (
              <span key={seg.id} className="lk-fib-blank">
                <input
                  type="text"
                  aria-label={`Fill in blank ${seg.ordinal}`}
                  aria-describedby={blank.hint ? hintId : undefined}
                  value={answers[seg.id] ?? ''}
                  disabled={inactive}
                  aria-disabled={inactive || undefined}
                  data-correct={
                    revealing && correctness !== undefined ? String(correctness) : undefined
                  }
                  onChange={(e) => handleChange(seg.id, e.target.value)}
                />
                {/*
                  Hints stay available in exam mode by design: lk-core's field
                  policy classifies `blanks.hint` as `public`, so it survives
                  redact() and is not part of the answer key.
                */}
                {blank.hint ? (
                  <>
                    {/*
                      Default affordance is an icon; the accessible NAME stays
                      text via aria-label (screen readers + tests rely on it).
                      The glyph is restylable/replaceable via .lk-fib-hint-btn.
                    */}
                    <button
                      type="button"
                      className="lk-fib-hint-btn"
                      aria-controls={hintId}
                      aria-expanded={revealed.has(seg.id)}
                      aria-label={revealed.has(seg.id) ? 'Hide hint' : 'Show hint'}
                      disabled={inactive}
                      onClick={() => toggleHint(seg.id)}
                    >
                      <svg
                        className="lk-fib-hint-icon"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path
                          fill="currentColor"
                          d="M9 21h6v-1H9v1Zm3-19a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2Z"
                        />
                      </svg>
                    </button>
                    {/*
                      Not role="tooltip": a real ARIA tooltip is a named
                      hover/focus popup with strict WCAG 1.4.13 constraints.
                      This is an accessible click-to-toggle disclosure that is
                      the input's aria-describedby target and is announced via
                      aria-live; the skin gives it a tooltip-like *visual*
                      without the tooltip *semantics*. (Refines Task 15.3.)
                    */}
                    <span id={hintId} aria-live="polite">
                      {revealed.has(seg.id) ? blank.hint : ''}
                    </span>
                  </>
                ) : null}
                {revealing && !feedbackHidden && blankFeedback ? (
                  <span
                    className="lk-fib-blank-feedback"
                    role="note"
                    data-correct={correctness !== undefined ? String(correctness) : undefined}
                  >
                    {blankFeedback}
                  </span>
                ) : null}
              </span>
            );
          })}
        </p>
        {/* Review is read-only: there is nothing to submit. */}
        {isReview ? null : (
          <button type="submit" disabled={inactive}>
            {isExam ? 'Submit answers' : 'Check answers'}
          </button>
        )}
      </fieldset>
      {revealing && data.blanks.some((b) => b.feedback) ? (
        <button
          type="button"
          className="lk-fib-feedback-toggle"
          aria-expanded={!feedbackHidden}
          onClick={() => setFeedbackHidden((h) => !h)}
        >
          {feedbackHidden ? 'Show feedback' : 'Hide feedback'}
        </button>
      ) : null}
      <FeedbackRegion id={`${data.id}-feedback`}>
        {isReview ? reviewSummary : summary}
      </FeedbackRegion>
    </form>
  );
}
