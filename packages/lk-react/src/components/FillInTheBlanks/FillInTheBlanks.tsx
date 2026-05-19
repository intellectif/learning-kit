'use client';

import {
  ActivitySchemaError,
  type FillInTheBlanksData,
  type ScoringResult,
  score,
  validateActivity,
  xAPIBuilder,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
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

export function FillInTheBlanks({
  data,
  onComplete,
  onInteraction,
  theme,
  locale,
  disabled,
  showCorrectAnswers,
}: FillInTheBlanksProps) {
  // Dev-only boundary validation (Req 2.3); throws in render so the wrapping
  // ActivityErrorBoundary catches it. Re-runs only when data changes.
  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    const result = validateActivity('fill-in-the-blanks', data);
    return result.success ? null : new ActivitySchemaError('fill-in-the-blanks', result.errors);
  }, [data]);

  const { state, start, complete, getTimeSpent, reset } = useActivityState();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [feedbackHidden, setFeedbackHidden] = useState(false);

  // `data` is an intentional reset trigger (Req 3.7), not read in the body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the reset trigger (Req 3.7)
  useEffect(() => {
    setAnswers({});
    setRevealed(new Set());
    setResult(null);
    setSummary(null);
    setFeedbackHidden(false);
    reset();
  }, [data, reset]);

  const segments = useMemo(() => parsePassage(data.passage), [data.passage]);
  const blankById = useMemo(() => new Map(data.blanks.map((b) => [b.id, b])), [data.blanks]);

  if (devError) {
    throw devError;
  }

  const submitted = state === 'completed';
  const inactive = disabled === true || submitted;

  const fireInteraction = (
    type: 'blank-filled' | 'hint-requested' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  const handleChange = (blankId: string, value: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    setAnswers((prev) => ({ ...prev, [blankId]: value }));
    fireInteraction('blank-filled', { blankId, value });
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
    const response = { type: 'fill-in-the-blanks', answers } as const;
    const scoringResult = score('fill-in-the-blanks', data, response);
    complete();
    const timeSpent = getTimeSpent();
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: { id: objectIdFor(data.id), name: { 'en-US': data.title } },
      scoringResult,
      timeSpentMs: timeSpent,
      response: JSON.stringify(answers),
    });
    setResult(scoringResult);
    onComplete({
      score: scoringResult.score,
      maxScore: scoringResult.maxScore,
      passed: scoringResult.passed,
      timeSpent,
      xapiStatement,
    });
    const overall = scoringResult.passed ? data.feedback?.correct : data.feedback?.incorrect;
    setSummary(
      `Answer submitted. Score ${Math.round(scoringResult.score * 100)}%. ${
        scoringResult.passed ? 'Passed.' : 'Not passed.'
      }${overall ? ` ${overall}` : ''}`,
    );
    fireInteraction('submitted', { answers, score: scoringResult.score });
  };

  const correctByBlank = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const detail of result?.details ?? []) {
      map.set(detail.itemId, detail.correct);
    }
    return map;
  }, [result]);

  return (
    <form
      className="lk-fib"
      aria-label={data.title}
      lang={locale}
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
            const isCorrect = correctByBlank.get(seg.id) === true;
            const hintId = `${data.id}-hint-${seg.id}`;
            if (submitted && showCorrectAnswers && !isCorrect) {
              return (
                <span key={seg.id} className="lk-fib-answer" data-correct="false">
                  {blank.acceptedAnswers[0]}
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
                  data-correct={submitted ? String(isCorrect) : undefined}
                  onChange={(e) => handleChange(seg.id, e.target.value)}
                />
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
                {submitted && !feedbackHidden && blank.feedback ? (
                  <span
                    className="lk-fib-blank-feedback"
                    role="note"
                    data-correct={String(isCorrect)}
                  >
                    {blank.feedback}
                  </span>
                ) : null}
              </span>
            );
          })}
        </p>
        <button type="submit" disabled={inactive}>
          Check answers
        </button>
      </fieldset>
      {submitted && data.blanks.some((b) => b.feedback) ? (
        <button
          type="button"
          className="lk-fib-feedback-toggle"
          aria-expanded={!feedbackHidden}
          onClick={() => setFeedbackHidden((h) => !h)}
        >
          {feedbackHidden ? 'Show feedback' : 'Hide feedback'}
        </button>
      ) : null}
      <FeedbackRegion id={`${data.id}-feedback`}>{summary}</FeedbackRegion>
    </form>
  );
}
