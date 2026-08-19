'use client';

import {
  ActivitySchemaError,
  countWords,
  evaluate,
  type InteractionEvent,
  type ThemeTokens,
  validateActivity,
  type WrittenResponseData,
  type XAPIStatement,
  xAPIBuilder,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useActivityState } from '../../hooks/useActivityState.js';
import { ANONYMOUS_ACTOR, isDevelopment, objectIdFor } from '../_internal.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';

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
 * bug this type exists to fix.
 */
export interface WrittenResponseProps {
  data: WrittenResponseData;
  onSubmitted: (submission: WrittenResponseSubmission) => void;
  onInteraction?: (event: InteractionEvent) => void;
  /** Per-instance token overrides, applied as inline CSS vars on the root. */
  theme?: Partial<ThemeTokens>;
  locale?: string;
  disabled?: boolean;
}

export function WrittenResponse({
  data,
  onSubmitted,
  onInteraction,
  theme,
  locale,
  disabled,
}: WrittenResponseProps) {
  // Dev-only boundary validation (Req 2.3), same convention as MC/FIB.
  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    const result = validateActivity('written-response', data);
    return result.success ? null : new ActivitySchemaError('written-response', result.errors);
  }, [data]);

  const { state, start, complete, getTimeSpent, reset } = useActivityState();
  const [text, setText] = useState('');
  const [summary, setSummary] = useState<string | null>(null);

  // Reset on data-prop change (Req 3.7).
  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the reset trigger (Req 3.7)
  useEffect(() => {
    setText('');
    setSummary(null);
    reset();
  }, [data, reset]);

  if (devError) {
    throw devError;
  }

  const submitted = state === 'completed';
  const inactive = disabled === true || submitted;
  const wordCount = countWords(text);
  const withinBounds = wordCount >= data.minWords && wordCount <= data.maxWords;

  const handleChange = (value: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    setText(value);
    onInteraction?.({
      type: 'text-changed',
      activityId: data.id,
      timestamp: Date.now(),
      payload: { wordCount: countWords(value) },
    });
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive || text.trim().length === 0) {
      return;
    }
    const outcome = evaluate(data, { type: 'written-response', text, wordCount });
    complete();
    const timeSpent = getTimeSpent();
    const partial = outcome.status === 'deferred' ? outcome.partial : undefined;
    const finalWordCount = typeof partial?.wordCount === 'number' ? partial.wordCount : wordCount;
    const finalWithinBounds =
      typeof partial?.withinWordBounds === 'boolean' ? partial.withinWordBounds : withinBounds;
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
    onSubmitted({
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
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      {data.media ? <ActivityMedia media={data.media} /> : null}
      <p className="lk-wr-prompt" id={promptId}>
        {data.prompt}
      </p>
      <textarea
        className="lk-wr-textarea"
        aria-labelledby={promptId}
        aria-describedby={counterId}
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        disabled={inactive}
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
      <button
        type="submit"
        className="lk-wr-submit"
        disabled={inactive || text.trim().length === 0}
      >
        Submit
      </button>
      <FeedbackRegion id={`${data.id}-feedback`}>{summary}</FeedbackRegion>
    </form>
  );
}
