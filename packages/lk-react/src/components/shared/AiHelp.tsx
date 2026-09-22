'use client';

import type { InteractionEvent, ItemOutcome, LearnerResponse } from '@intellectif/lk-core';
import { useEffect, useRef } from 'react';
import type { LearnerAi } from '../../ai/LkAiProvider.js';
import { useAiExplanation, useAiHints } from '../../ai/useAiHelp.js';
import type { LkStrings } from '../../i18n/strings.js';
import type { RenderableActivity, RenderMode } from '../types.js';

interface Situation {
  ai: LearnerAi | undefined;
  data: RenderableActivity;
  renderMode: RenderMode;
  submitted: boolean;
  /** The learner's answer as it stands: submitted, restored, or being written. */
  response: LearnerResponse;
  /** The component's `locale`, the default language for what is written. */
  locale: string | undefined;
  onInteraction: ((event: InteractionEvent) => void) | undefined;
  strings: LkStrings;
}

/** What the hooks take, from what a component holds: the optional half, without `undefined` values. */
function situation(input: Situation): {
  data: RenderableActivity;
  response: LearnerResponse;
  submitted: boolean;
  renderMode: RenderMode;
  ai?: LearnerAi;
  locale?: string;
  onInteraction?: (event: InteractionEvent) => void;
} {
  const { data, response, submitted, renderMode, ai, locale, onInteraction } = input;
  return {
    data,
    response,
    submitted,
    renderMode,
    ...(ai !== undefined ? { ai } : {}),
    ...(locale !== undefined ? { locale } : {}),
    ...(onInteraction !== undefined ? { onInteraction } : {}),
  };
}

/**
 * "Explain my answer": the SDK's own surface over {@link useAiExplanation} — a
 * button, the explanation with who wrote it, and "not available" when a call
 * fails or its answer is refused.
 *
 * Nothing renders without a port, or where the rules say no explanation.
 */
export function AiExplanation({
  outcome,
  ...rest
}: Situation & { outcome: ItemOutcome | undefined }) {
  const s = rest.strings;
  const help = useAiExplanation({
    ...situation(rest),
    ...(outcome !== undefined ? { outcome } : {}),
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const refocus = useRef(false);

  // The button that asked goes away when the explanation arrives; focus moves
  // to what it asked for rather than falling to the page.
  useEffect(() => {
    if (help.status === 'shown' && refocus.current) {
      refocus.current = false;
      panelRef.current?.focus();
    }
    if (help.status === 'unavailable') {
      refocus.current = false;
    }
  }, [help.status]);

  if (!help.offered) {
    return null;
  }

  const ask = (): void => {
    refocus.current =
      typeof document !== 'undefined' && document.activeElement === buttonRef.current;
    help.ask();
  };

  const loading = help.status === 'loading';
  return (
    <div className="lk-ai" data-state={help.status}>
      {help.explanation === null ? (
        <button
          ref={buttonRef}
          type="button"
          className="lk-ai-button"
          aria-busy={loading || undefined}
          aria-disabled={loading || undefined}
          onClick={ask}
        >
          {loading ? s.aiExplaining : s.aiExplain}
        </button>
      ) : null}
      <div aria-live="polite">
        {help.explanation !== null ? (
          <section
            ref={panelRef}
            className="lk-ai-panel"
            tabIndex={-1}
            aria-label={s.aiExplanation}
          >
            <p className="lk-ai-heading">{s.aiExplanation}</p>
            <p className="lk-ai-text">{help.explanation.text}</p>
            <p className="lk-ai-notice">{s.aiNotice}</p>
          </section>
        ) : help.status === 'unavailable' ? (
          <p className="lk-ai-unavailable">{s.aiExplanationUnavailable}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Get a hint": the SDK's own surface over {@link useAiHints} — a button, the
 * hints given so far as a numbered list, and who wrote them.
 *
 * The hints stay listed after submit, so the learner can see what they were
 * given, but no more can be asked for. Another question starts with none.
 */
export function AiHints({ disabled, ...rest }: Situation & { disabled: boolean }) {
  const s = rest.strings;
  const help = useAiHints({ ...situation(rest), disabled });
  const used = help.used;

  if (rest.ai?.hint === undefined || (!help.offered && used === 0)) {
    return null;
  }

  const loading = help.status === 'loading';
  return (
    <div className="lk-ai lk-ai-hint-area" data-state={help.status}>
      <div aria-live="polite">
        {used > 0 ? (
          <ol className="lk-ai-hints" aria-label={s.aiHints}>
            {help.hints.map((hint, index) => (
              // Hints are only ever appended, so a position is a stable key.
              // biome-ignore lint/suspicious/noArrayIndexKey: an append-only list
              <li key={index} className="lk-ai-hint">
                <span className="lk-ai-hint-label">{s.aiHintNumber(index + 1)}</span>{' '}
                <span className="lk-ai-text">{hint.text}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {help.status === 'unavailable' ? (
          <p className="lk-ai-unavailable">{s.aiHintUnavailable}</p>
        ) : null}
      </div>
      {help.offered ? (
        used < help.limit ? (
          <button
            type="button"
            className="lk-ai-button"
            aria-busy={loading || undefined}
            aria-disabled={loading || undefined}
            onClick={help.ask}
          >
            {loading ? s.aiHintLoading : s.aiHint}
          </button>
        ) : (
          <p className="lk-ai-note">{s.aiNoMoreHints}</p>
        )
      ) : null}
      {used > 0 ? <p className="lk-ai-notice">{s.aiNotice}</p> : null}
    </div>
  );
}
