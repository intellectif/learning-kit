'use client';

import {
  ActivitySchemaError,
  type ItemOutcome,
  type LearnerResponse,
  type MultipleChoiceData,
  type MultipleChoiceLearnerResponse,
  type MultipleChoiceOption,
  type ScoringDetail,
  score,
  seededShuffle,
  validateActivity,
  xAPIBuilder,
  xapiDefinitionFor,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useActivityState } from '../../hooks/useActivityState.js';
import { ANONYMOUS_ACTOR, isDevelopment, objectIdFor, randomSessionId } from '../_internal.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import type { ActivityProps } from '../types.js';

/**
 * Selected option ids carried by a learner response. Any other response shape
 * (a caller wiring the wrong item's state through `value`) reads as "nothing
 * selected" rather than throwing mid-exam.
 */
function selectionOf(response: LearnerResponse | undefined): string[] {
  return response?.type === 'multiple-choice' ? response.selectedOptionIds : [];
}

/**
 * Whether an option is part of the correct answer, derived from the SERVER's
 * outcome — review mode never holds an answer key of its own.
 * {@link ScoringDetail.outcome} states this unambiguously. For 0.2-era details
 * that carry only the deprecated `correct` flag (which means "the learner
 * ACTED correctly on this option", not "this option is the answer") the fact
 * is still recoverable, because we know whether the learner selected it:
 * `isCorrect = wasSelected ? correct : !correct`.
 */
function isAnswerOption(detail: ScoringDetail, wasSelected: boolean): boolean {
  switch (detail.outcome) {
    case 'correct':
    case 'incorrect-omission':
      return true;
    case 'incorrect':
    case 'correct-omission':
      return false;
    default:
      return wasSelected ? detail.correct : !detail.correct;
  }
}

/** Announcement for `review` mode, built only from the server-supplied outcome. */
function reviewAnnouncement(outcome: ItemOutcome | undefined): string | null {
  if (outcome === undefined) {
    return null;
  }
  if (outcome.status === 'scored') {
    const overall = outcome.feedback;
    return `Score ${Math.round(outcome.score * 100)}%. ${
      outcome.passed ? 'Passed.' : 'Not passed.'
    }${overall ? ` ${overall}` : ''}`;
  }
  if (outcome.status === 'deferred') {
    // Never "0%": ungraded is not the same as wrong.
    return 'Not graded yet.';
  }
  return null;
}

export interface MultipleChoiceProps extends ActivityProps<MultipleChoiceData> {
  /**
   * Seed for the deterministic option shuffle. Supply one (e.g. the attempt
   * id) to make the shuffled order reproducible server-side, stable across
   * page reloads, and identical between SSR and hydration. When absent, a
   * random per-mount session seed is used (order stable within the mount
   * only — the behaviour before `shuffleSeed` existed).
   */
  shuffleSeed?: string;
}

export function MultipleChoice({
  data,
  onComplete,
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
  shuffleSeed,
}: MultipleChoiceProps) {
  // Dev-only boundary validation (Req 2.3). Throwing during render lets
  // ActivityErrorBoundary catch it. Memoised so it only re-runs on data change.
  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    // A `redact()` projection cannot satisfy the full content schema — the
    // answer key is gone by design — and must not be checked against the
    // strict redacted schema either, since a `reveal: 'after-submit'`
    // projection legitimately carries answer-key fields for review renders.
    if (data.redacted === true) {
      return null;
    }
    const result = validateActivity('multiple-choice', data);
    return result.success ? null : new ActivitySchemaError('multiple-choice', result.errors);
  }, [data]);

  // Lazily created only when shuffling without a caller seed: avoids calling
  // crypto.randomUUID (absent on non-secure http origins) unless needed.
  const sessionIdRef = useRef<string | null>(null);
  const { state, start, complete, getTimeSpent, reset } = useActivityState(
    defaultSubmitted === true ? 'completed' : 'idle',
  );
  // Uncontrolled state. `defaultValue` seeds the mount only (React convention);
  // to re-seed later, remount with a `key` or drive the component with `value`.
  const [internalSelection, setInternalSelection] = useState<string[]>(() =>
    selectionOf(defaultValue),
  );
  const [summary, setSummary] = useState<string | null>(null);

  // Reset on data-prop CHANGE (Req 3.7). The identity guard makes the mount
  // run a no-op, which it always was before `defaultValue` existed — without
  // it this effect would wipe the seed immediately after the first render.
  // (It also makes the reset StrictMode-safe: a remount with unchanged data
  // no longer discards the learner's selection.)
  // Resets back to `defaultValue`, not to empty. Clearing looked safer — it
  // cannot carry a stale answer into a different question — but `data`
  // identity is a poor proxy for "different question": a parent that builds
  // entries in render (`activities={raw.map(redact)}`, the documented exam
  // pattern) hands over a new object every render, and clearing wiped every
  // RESTORED answer on the first unrelated re-render, silently. `defaultValue`
  // is by definition the caller's seed for the CURRENT data, which is what
  // FillInTheBlanks already reset to; the two now agree.
  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);
  // A data change must return the item to its SEED, submitted state included —
  // resetting to idle unlocked work the learner had already committed.
  const defaultSubmittedRef = useRef(defaultSubmitted);
  useEffect(() => {
    defaultSubmittedRef.current = defaultSubmitted;
  }, [defaultSubmitted]);
  const lastDataRef = useRef(data);
  useEffect(() => {
    if (lastDataRef.current === data) {
      return;
    }
    lastDataRef.current = data;
    setInternalSelection(selectionOf(defaultValueRef.current));
    setSummary(null);
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [data, reset]);

  const displayedOptions = useMemo<MultipleChoiceOption[]>(() => {
    if (!data.shuffle) {
      return [...data.options];
    }
    // biome-ignore lint/suspicious/noAssignInExpressions: sanctioned lazy ref initialization
    const seedSource = shuffleSeed ?? (sessionIdRef.current ??= randomSessionId());
    // The seed string is unchanged from when the algorithm lived in this file,
    // so an order a consumer recorded against a seed still reproduces.
    return seededShuffle(data.options, `${seedSource}:${data.id}`);
  }, [data, shuffleSeed]);

  // Per-option correctness for `review`, indexed by option id. Null unless the
  // caller supplied a SCORED outcome — the only source of truth this mode has.
  const reviewDetails = useMemo(() => {
    if (renderMode !== 'review' || outcome === undefined || outcome.status !== 'scored') {
      return null;
    }
    return new Map(outcome.details.map((detail) => [detail.itemId, detail]));
  }, [renderMode, outcome]);

  // All hooks are called before these throws, so hook order stays stable.
  if (devError) {
    throw devError;
  }
  // Practice grades locally, which a redacted projection cannot support:
  // `score()` would throw from the submit handler — where no error boundary
  // can catch it — AFTER the learner has answered. Fail loudly at render
  // instead, in production too. Wiring an exam item into the self-grading
  // mode is precisely the accident `renderMode` exists to prevent.
  if (data.redacted === true && renderMode === 'practice') {
    throw new Error(
      `Multiple Choice "${data.id}" received redacted activity data in renderMode "practice", ` +
        'which grades locally and has no answer key to grade against. ' +
        'Render redacted data with renderMode="exam" (server grades) or "review" (pass `outcome`).',
    );
  }

  const isSingle = data.mode === 'single';
  const isExam = renderMode === 'exam';
  const isReview = renderMode === 'review';
  const submitted = state === 'completed';
  const inactive = disabled === true || submitted || isReview;
  const isControlled = value !== undefined;
  const selected = isControlled ? selectionOf(value) : internalSelection;
  /**
   * Whether correctness and authored feedback may be shown. Practice earns it
   * by grading locally after submit; review shows what the server already
   * graded. Exam never reveals anything — not before, not after submit.
   */
  const reveal = isReview || (renderMode === 'practice' && submitted);

  const fireInteraction = (
    type: 'option-selected' | 'option-deselected' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  /** Single funnel for every response change: owns state only when uncontrolled. */
  const emitChange = (selectedOptionIds: string[]): void => {
    if (!isControlled) {
      setInternalSelection(selectedOptionIds);
    }
    onChange?.({ type: 'multiple-choice', selectedOptionIds });
  };

  const selectSingle = (optionId: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    emitChange([optionId]);
    fireInteraction('option-selected', { optionId });
  };

  const toggleMulti = (optionId: string, checked: boolean): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    emitChange(checked ? [...selected, optionId] : selected.filter((id) => id !== optionId));
    fireInteraction(checked ? 'option-selected' : 'option-deselected', { optionId });
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive) {
      return;
    }
    const response: MultipleChoiceLearnerResponse = {
      type: 'multiple-choice',
      selectedOptionIds: selected,
    };
    // Always first, and before anything that can throw: an exam runner must be
    // able to persist the raw response no matter what happens after.
    onSubmit?.(response);

    if (isExam) {
      // No score(), no answer key read, no onComplete, no xAPI — the server
      // grades. The announcement deliberately carries no correctness signal.
      complete();
      setSummary('Answer submitted.');
      fireInteraction('submitted', { selectedOptionIds: selected });
      return;
    }

    const scoringResult = score('multiple-choice', data as MultipleChoiceData, response);
    complete();
    const timeSpent = getTimeSpent();
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [data.locale ?? 'en-US']: data.title },
        // Activity-type IRI, interaction type and correct-responses pattern
        // come from the REGISTERED descriptor, so a consumer-registered type
        // gets correct interop without touching this component.
        ...xapiDefinitionFor(data),
        choices: data.options.map((option) => ({
          id: option.id,
          description: { [data.locale ?? 'en-US']: option.text },
        })),
      },
      scoringResult,
      timeSpentMs: timeSpent,
      response: selected.join(','),
    });
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
    fireInteraction('submitted', {
      selectedOptionIds: selected,
      score: scoringResult.score,
    });
  };

  const questionId = `${data.id}-question`;
  // Rich text renders ONLY through a caller-supplied sanitiser; without one we
  // fall back to the plain-text field, escaped by React (types.ts HtmlSanitizer).
  const questionHtml =
    sanitizeHtml !== undefined && data.questionHtml !== undefined
      ? sanitizeHtml(data.questionHtml)
      : null;

  const optionList = displayedOptions.map((option) => {
    const checked = selected.includes(option.id);
    // `data-correct` means "this option is part of the correct answer".
    let correctness: string | undefined;
    if (isReview) {
      const detail = reviewDetails?.get(option.id);
      correctness = detail === undefined ? undefined : String(isAnswerOption(detail, checked));
    } else if (reveal) {
      correctness = String(option.isCorrect);
    }
    return (
      <label key={option.id} className="lk-mc-option" data-correct={correctness}>
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
        {reveal && option.feedback ? (
          <span className="lk-mc-option-feedback" role="note">
            {option.feedback}
          </span>
        ) : null}
      </label>
    );
  });

  return (
    <div className="lk-mc" lang={locale} style={theme as CSSProperties | undefined}>
      {data.media ? <ActivityMedia media={data.media} /> : null}
      <form onSubmit={handleSubmit}>
        <fieldset disabled={inactive}>
          {questionHtml === null ? (
            <legend id={questionId}>{data.question}</legend>
          ) : (
            <legend
              id={questionId}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is the output of the caller-supplied sanitizeHtml (types.ts HtmlSanitizer contract)
              dangerouslySetInnerHTML={{ __html: questionHtml }}
            />
          )}
          {/*
            single: an explicit radiogroup is meaningful (fieldset's implicit
            role is `group`, not `radiogroup`). multi: the fieldset + legend
            already provide a named group — an explicit role="group" here would
            be a redundant, duplicate same-named group in the a11y tree, so we
            use a plain layout div. (Refines the design ARIA sketch.)
          */}
          {isSingle ? (
            <div role="radiogroup" aria-labelledby={questionId}>
              {optionList}
            </div>
          ) : (
            <div>{optionList}</div>
          )}
          {/* review is read-only: there is nothing left to submit. */}
          {isReview ? null : (
            <button type="submit" disabled={inactive}>
              Submit
            </button>
          )}
        </fieldset>
      </form>
      <FeedbackRegion id={`${data.id}-feedback`}>
        {isReview ? reviewAnnouncement(outcome) : summary}
      </FeedbackRegion>
    </div>
  );
}
