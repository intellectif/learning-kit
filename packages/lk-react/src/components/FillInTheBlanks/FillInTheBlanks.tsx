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

  // `data` is an intentional reset trigger (Req 3.7), not read in the body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the reset trigger (Req 3.7)
  useEffect(() => {
    setAnswers({});
    setRevealed(new Set());
    setResult(null);
    setSummary(null);
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

  const revealHint = (blankId: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    setRevealed((prev) => new Set(prev).add(blankId));
    fireInteraction('hint-requested', { blankId });
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
    setSummary(
      `Answer submitted. Score ${Math.round(scoringResult.score * 100)}%. ${
        scoringResult.passed ? 'Passed.' : 'Not passed.'
      }`,
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
                    <button
                      type="button"
                      aria-controls={hintId}
                      disabled={inactive}
                      onClick={() => revealHint(seg.id)}
                    >
                      Show hint
                    </button>
                    {/*
                      Not role="tooltip": a real ARIA tooltip is a named
                      hover/focus popup. This is a click-to-reveal hint that
                      is the input's aria-describedby target and is announced
                      via aria-live. (Refines the design ARIA sketch; fixes
                      axe aria-tooltip-name.)
                    */}
                    <span id={hintId} aria-live="polite">
                      {revealed.has(seg.id) ? blank.hint : ''}
                    </span>
                  </>
                ) : null}
              </span>
            );
          })}
        </p>
        <button type="submit" disabled={inactive}>
          Check answers
        </button>
      </fieldset>
      <FeedbackRegion id={`${data.id}-feedback`}>{summary}</FeedbackRegion>
    </form>
  );
}
