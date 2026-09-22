'use client';

import {
  type AiRefusal,
  type AiTextResult,
  aiAllowedByContent,
  aiExplanationRequest,
  aiHintRequest,
  aiSupports,
  checkAiExplanation,
  checkAiHint,
  type InteractionEvent,
  type ItemOutcome,
  type LearnerResponse,
} from '@intellectif/lk-core';
import { useEffect, useRef, useState } from 'react';
import type { LearnerAi } from '../../ai/LkAiProvider.js';
import type { LkStrings } from '../../i18n/strings.js';
import { isDevelopment } from '../_internal.js';
import type { RenderableActivity, RenderMode } from '../types.js';

/** The most hints a question gives when the host names no number, and the most it may name. */
const DEFAULT_MAX_HINTS = 3;
const MAX_HINTS_CEILING = 10;

/** `maxHints` as a whole number from 1 to 10; anything else is the default. */
export function hintLimit(ai: LearnerAi | undefined): number {
  const asked = ai?.maxHints;
  return typeof asked === 'number' && Number.isInteger(asked) && asked >= 1
    ? Math.min(asked, MAX_HINTS_CEILING)
    : DEFAULT_MAX_HINTS;
}

/**
 * Whether the learner may ask for a hint: `practice`, before submit, on a
 * question that is not disabled, of a type that takes hints, whose author left
 * hints on, and whole — a redacted item is an exam's, and gives none.
 */
export function hintOffered(input: {
  data: RenderableActivity;
  renderMode: RenderMode;
  submitted: boolean;
  disabled: boolean;
}): boolean {
  const { data, renderMode, submitted, disabled } = input;
  return (
    renderMode === 'practice' &&
    !submitted &&
    !disabled &&
    data.redacted !== true &&
    aiSupports(data.type, 'hint') &&
    aiAllowedByContent(data, 'hint')
  );
}

/**
 * Whether the learner may ask for an explanation: of a graded answer — in
 * `practice` once submitted, or in `review` when the grade of record is
 * scored — of a type the SDK explains, whose author left explanations on.
 * Never in `exam`.
 */
export function explanationOffered(input: {
  data: RenderableActivity;
  renderMode: RenderMode;
  submitted: boolean;
  outcome: ItemOutcome | undefined;
}): boolean {
  const { data, renderMode, submitted, outcome } = input;
  const graded =
    (renderMode === 'practice' && submitted) ||
    (renderMode === 'review' && outcome?.status === 'scored');
  return graded && aiSupports(data.type, 'explanation') && aiAllowedByContent(data, 'explanation');
}

/** Calls a port, turning a synchronous throw into a rejection. */
function callPort<T>(call: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(call());
  } catch (error) {
    return Promise.reject(error);
  }
}

/** Tells a developer why a port's answer was not shown. Silent in production. */
function warnRefused(feature: 'explanation' | 'hint', activityId: string, reason: AiRefusal): void {
  if (isDevelopment()) {
    console.warn(
      `learning-kit: the AI ${feature} for "${activityId}" was not shown (${reason}). The learner saw "not available" instead.`,
    );
  }
}

const localeOf = (ai: LearnerAi | undefined, locale: string | undefined) => {
  const chosen = ai?.learnerLocale ?? locale;
  return chosen === undefined ? {} : { learnerLocale: chosen };
};

/** What an explanation is about: when any of it changes, the explanation shown no longer is. */
function explanationKey(
  renderMode: RenderMode,
  submitted: boolean,
  response: LearnerResponse,
  outcome: ItemOutcome | undefined,
): string {
  let graded = '';
  if (outcome !== undefined) {
    graded = `${outcome.status}:${'score' in outcome ? outcome.score : ''}`;
  }
  return `${renderMode}|${submitted}|${graded}|${JSON.stringify(response)}`;
}

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

type ExplanationState =
  | { key: string; status: 'idle' | 'loading' | 'unavailable' }
  | { key: string; status: 'shown'; result: AiTextResult };

/**
 * "Explain my answer": asks the host's `explain` port about a graded answer,
 * when the learner presses it, and shows the explanation with who wrote it.
 * Nothing renders without a port, or where {@link explanationOffered} says no.
 *
 * When the answer or its grade changes, the explanation is dropped and a call
 * still on its way is abandoned: a late explanation never lands beside an
 * answer it was not written for.
 */
export function AiExplanation({
  ai,
  data,
  renderMode,
  submitted,
  response,
  outcome,
  locale,
  onInteraction,
  strings: s,
}: Situation & { outcome: ItemOutcome | undefined }) {
  const resetKey = explanationKey(renderMode, submitted, response, outcome);
  const [state, setState] = useState<ExplanationState>({ key: resetKey, status: 'idle' });
  const run = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const refocus = useRef(false);
  const current: ExplanationState =
    state.key === resetKey ? state : { key: resetKey, status: 'idle' };

  // Another answer, or the component going away: abandon the call in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger — its cleanup runs when the answer changes
  useEffect(() => {
    return () => {
      run.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [resetKey]);

  // The button that asked goes away when the explanation arrives; focus moves
  // to what it asked for rather than falling to the page.
  useEffect(() => {
    if (current.status === 'shown' && refocus.current) {
      refocus.current = false;
      panelRef.current?.focus();
    }
  }, [current.status]);

  const port = ai?.explain;
  if (port === undefined || !explanationOffered({ data, renderMode, submitted, outcome })) {
    return null;
  }

  const ask = (): void => {
    if (current.status === 'loading') {
      return;
    }
    const request = aiExplanationRequest({
      data,
      response,
      ...(renderMode === 'review' && outcome !== undefined ? { outcome } : {}),
      ...localeOf(ai, locale),
    });
    if (request === null) {
      setState({ key: resetKey, status: 'unavailable' });
      return;
    }
    run.current += 1;
    const mine = run.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    refocus.current =
      typeof document !== 'undefined' && document.activeElement === buttonRef.current;
    setState({ key: resetKey, status: 'loading' });
    callPort(() => port(request, { signal: abort.signal })).then(
      (raw) => {
        if (run.current !== mine) {
          return;
        }
        const checked = checkAiExplanation(raw, request);
        if (!checked.ok) {
          warnRefused('explanation', data.id, checked.refusal);
          refocus.current = false;
          setState({ key: resetKey, status: 'unavailable' });
          return;
        }
        setState({ key: resetKey, status: 'shown', result: checked.result });
        onInteraction?.({
          type: 'ai-explanation-shown',
          activityId: data.id,
          timestamp: Date.now(),
          payload:
            checked.result.provenance !== undefined
              ? { provenance: checked.result.provenance }
              : {},
        });
      },
      () => {
        if (run.current === mine) {
          refocus.current = false;
          setState({ key: resetKey, status: 'unavailable' });
        }
      },
    );
  };

  const loading = current.status === 'loading';
  return (
    <div className="lk-ai" data-state={current.status}>
      {current.status === 'shown' ? null : (
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
      )}
      <div aria-live="polite">
        {current.status === 'shown' ? (
          <section
            ref={panelRef}
            className="lk-ai-panel"
            tabIndex={-1}
            aria-label={s.aiExplanation}
          >
            <p className="lk-ai-heading">{s.aiExplanation}</p>
            <p className="lk-ai-text">{current.result.text}</p>
            <p className="lk-ai-notice">{s.aiNotice}</p>
          </section>
        ) : current.status === 'unavailable' ? (
          <p className="lk-ai-unavailable">{s.aiExplanationUnavailable}</p>
        ) : null}
      </div>
    </div>
  );
}

interface HintState {
  key: string;
  hints: AiTextResult[];
  status: 'idle' | 'loading' | 'unavailable';
}

/**
 * "Get a hint": asks the host's `hint` port for the next hint on an answer not
 * yet submitted, up to the host's limit, and lists every hint given. A hint
 * that contains an answer is refused, and neither shown nor counted.
 *
 * The hints stay listed after submit — the learner can see what they were
 * given — but no more can be asked for. Another question starts with none.
 */
export function AiHints({
  ai,
  data,
  renderMode,
  submitted,
  disabled,
  response,
  locale,
  onInteraction,
  strings: s,
}: Situation & { disabled: boolean }) {
  const resetKey = data.id;
  const [state, setState] = useState<HintState>({ key: resetKey, hints: [], status: 'idle' });
  const run = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const current: HintState =
    state.key === resetKey ? state : { key: resetKey, hints: [], status: 'idle' };
  const offered = hintOffered({ data, renderMode, submitted, disabled });

  // Another question, or the component going away: abandon the call in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger — its cleanup runs when the question changes
  useEffect(() => {
    return () => {
      run.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [resetKey]);

  // Submitted, or disabled, while a hint was on its way: it would arrive for
  // an answer that can no longer use it.
  useEffect(() => {
    if (!offered) {
      run.current += 1;
      controller.current?.abort();
      controller.current = null;
      setState((previous) =>
        previous.status === 'loading' ? { ...previous, status: 'idle' } : previous,
      );
    }
  }, [offered]);

  const port = ai?.hint;
  if (port === undefined || (!offered && current.hints.length === 0)) {
    return null;
  }

  const limit = hintLimit(ai);
  const used = current.hints.length;

  const ask = (): void => {
    if (current.status === 'loading' || used >= limit) {
      return;
    }
    const request = aiHintRequest({
      data,
      response,
      previousHints: current.hints.map((hint) => hint.text),
      ...localeOf(ai, locale),
    });
    if (request === null) {
      setState({ ...current, status: 'unavailable' });
      return;
    }
    run.current += 1;
    const mine = run.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ ...current, status: 'loading' });
    callPort(() => port(request, { signal: abort.signal })).then(
      (raw) => {
        if (run.current !== mine) {
          return;
        }
        const checked = checkAiHint(raw, request);
        if (!checked.ok) {
          warnRefused('hint', data.id, checked.refusal);
          setState((latest) => ({ ...latest, status: 'unavailable' }));
          return;
        }
        setState((latest) => ({
          ...latest,
          hints: [...latest.hints, checked.result],
          status: 'idle',
        }));
        onInteraction?.({
          type: 'ai-hint-shown',
          activityId: data.id,
          timestamp: Date.now(),
          payload: {
            hintNumber: request.hintNumber,
            ...(checked.result.provenance !== undefined
              ? { provenance: checked.result.provenance }
              : {}),
          },
        });
      },
      () => {
        if (run.current === mine) {
          setState((latest) => ({ ...latest, status: 'unavailable' }));
        }
      },
    );
  };

  const loading = current.status === 'loading';
  return (
    <div className="lk-ai lk-ai-hint-area" data-state={current.status}>
      <div aria-live="polite">
        {used > 0 ? (
          <ol className="lk-ai-hints" aria-label={s.aiHints}>
            {current.hints.map((hint, index) => (
              // Hints are only ever appended, so a position is a stable key.
              // biome-ignore lint/suspicious/noArrayIndexKey: an append-only list
              <li key={index} className="lk-ai-hint">
                <span className="lk-ai-hint-label">{s.aiHintNumber(index + 1)}</span>{' '}
                <span className="lk-ai-text">{hint.text}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {current.status === 'unavailable' ? (
          <p className="lk-ai-unavailable">{s.aiHintUnavailable}</p>
        ) : null}
      </div>
      {offered ? (
        used < limit ? (
          <button
            type="button"
            className="lk-ai-button"
            aria-busy={loading || undefined}
            aria-disabled={loading || undefined}
            onClick={ask}
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
