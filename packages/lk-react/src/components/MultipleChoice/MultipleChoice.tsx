'use client';

import {
  ActivitySchemaError,
  type MultipleChoiceData,
  type MultipleChoiceOption,
  score,
  validateActivity,
  type XAPIActor,
  xAPIBuilder,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useActivityState } from '../../hooks/useActivityState.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import type { ActivityProps } from '../types.js';

/** Dev = anything other than an explicit production NODE_ENV (browser-safe). */
function isDevelopment(): boolean {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.NODE_ENV !== 'production';
}

/**
 * The component cannot know the learner's identity (Req 3.1 fixes the prop
 * set). It emits a structurally-valid statement with an anonymous actor;
 * real identity is applied by the useXAPI/LRS layer (XAPIConfig.actor).
 */
const ANONYMOUS_ACTOR: XAPIActor = {
  objectType: 'Agent',
  account: { homePage: 'https://github.com/intellectif/learning-kit', name: 'anonymous' },
};

/** `data.id` is not an IRI; xAPI object ids must be. Wrap it as a URN. */
function objectIdFor(id: string): string {
  return `urn:learning-kit:activity:${encodeURIComponent(id)}`;
}

/** FNV-1a hash → 32-bit seed. */
function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** Deterministic LCG Fisher–Yates; returns a permutation (no loss/dupe). */
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function MultipleChoice({
  data,
  onComplete,
  onInteraction,
  theme,
  locale,
  disabled,
}: ActivityProps<MultipleChoiceData>) {
  // Dev-only boundary validation (Req 2.3). Throwing during render lets
  // ActivityErrorBoundary catch it. Memoised so it only re-runs on data change.
  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    const result = validateActivity('multiple-choice', data);
    return result.success ? null : new ActivitySchemaError('multiple-choice', result.errors);
  }, [data]);

  const [sessionId] = useState(() => crypto.randomUUID());
  const { state, start, complete, getTimeSpent, reset } = useActivityState();
  const [selected, setSelected] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  // Reset on data-prop change (Req 3.7). `data` is an intentional change
  // trigger (not read in the body); dropping it would break the reset.
  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the reset trigger (Req 3.7)
  useEffect(() => {
    setSelected([]);
    setSummary(null);
    reset();
  }, [data, reset]);

  const displayedOptions = useMemo<MultipleChoiceOption[]>(
    () =>
      data.shuffle
        ? seededShuffle(data.options, hashSeed(`${sessionId}:${data.id}`))
        : [...data.options],
    [data, sessionId],
  );

  // All hooks are called before this throw, so hook order stays stable.
  if (devError) {
    throw devError;
  }

  const isSingle = data.mode === 'single';
  const submitted = state === 'completed';
  const inactive = disabled === true || submitted;

  const fireInteraction = (
    type: 'option-selected' | 'option-deselected' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  const selectSingle = (optionId: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    setSelected([optionId]);
    fireInteraction('option-selected', { optionId });
  };

  const toggleMulti = (optionId: string, checked: boolean): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    setSelected((prev) => (checked ? [...prev, optionId] : prev.filter((id) => id !== optionId)));
    fireInteraction(checked ? 'option-selected' : 'option-deselected', { optionId });
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive) {
      return;
    }
    const response = { type: 'multiple-choice', selectedOptionIds: selected } as const;
    const scoringResult = score('multiple-choice', data, response);
    complete();
    const timeSpent = getTimeSpent();
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: { id: objectIdFor(data.id), name: { 'en-US': data.title } },
      scoringResult,
      timeSpentMs: timeSpent,
      response: selected.join(','),
    });
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
    fireInteraction('submitted', {
      selectedOptionIds: selected,
      score: scoringResult.score,
    });
  };

  const questionId = `${data.id}-question`;

  return (
    <div className="lk-mc" lang={locale} style={theme as CSSProperties | undefined}>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={inactive}>
          <legend id={questionId}>{data.question}</legend>
          {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: both radiogroup and group support aria-labelledby; role is computed so Biome cannot verify it statically */}
          <div role={isSingle ? 'radiogroup' : 'group'} aria-labelledby={questionId}>
            {displayedOptions.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <label
                  key={option.id}
                  className="lk-mc-option"
                  data-correct={submitted ? String(option.isCorrect) : undefined}
                >
                  <input
                    type={isSingle ? 'radio' : 'checkbox'}
                    name={isSingle ? `${data.id}-options` : undefined}
                    value={option.id}
                    checked={checked}
                    disabled={inactive}
                    aria-disabled={inactive || undefined}
                    onChange={(e) =>
                      isSingle ? selectSingle(option.id) : toggleMulti(option.id, e.target.checked)
                    }
                  />
                  <span>{option.text}</span>
                  {submitted && option.feedback ? (
                    <span className="lk-mc-option-feedback" role="note">
                      {option.feedback}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <button type="submit" disabled={inactive}>
            Submit
          </button>
        </fieldset>
      </form>
      <FeedbackRegion id={`${data.id}-feedback`}>{summary}</FeedbackRegion>
    </div>
  );
}
