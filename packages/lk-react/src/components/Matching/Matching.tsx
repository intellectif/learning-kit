'use client';

import {
  ActivitySchemaError,
  assertRedacted,
  computePassThreshold,
  type LearnerResponse,
  type MatchingData,
  type MatchingLearnerResponse,
  type MatchingOption,
  type ScoringDetail,
  type ScoringResult,
  score,
  seededShuffle,
  validateActivity,
  xAPIBuilder,
  xapiDefinitionFor,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useLearnerAi } from '../../ai/LkAiProvider.js';
import { useActivityState } from '../../hooks/useActivityState.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import {
  ANONYMOUS_ACTOR,
  detailIsRight,
  isDevelopment,
  objectIdFor,
  randomSessionId,
} from '../_internal.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { AiExplanation, AiHints, useComponentAiHints } from '../shared/AiHelp.js';
import { feedbackAnnouncement, useDeliveryPolicy } from '../shared/delivery.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import { ItemInstructions, instructionsOf } from '../shared/ItemInstructions.js';
import { mintTake, stampTake } from '../shared/sequence-slot.js';
import {
  HintCost,
  hintsOf,
  TryActions,
  triesSummary,
  useItemScoringPolicy,
  useTries,
} from '../shared/tries.js';
import type { ActivityProps } from '../types.js';

export interface MatchingProps extends ActivityProps<MatchingData> {
  /**
   * Seeds the order of the list when `data.shuffleOptions` is set. Pass the
   * attempt id, exactly as on `<MultipleChoice>`: an order nobody can
   * reproduce cannot be reconciled with the attempt a server recorded. Without
   * one, a random per-mount seed is used — stable within the mount, and
   * deliberately not reproducible.
   */
  shuffleSeed?: string;
}

const NO_MATCHES: Record<string, string> = {};

/**
 * The matches out of a `LearnerResponse`. A response of another activity type
 * reads as "nothing matched" rather than throwing — a controlled host that has
 * not yet swapped its state on an activity change would otherwise crash the
 * attempt.
 */
function matchesOf(response: LearnerResponse | undefined): Record<string, string> {
  return response !== undefined && response.type === 'matching' ? response.matches : NO_MATCHES;
}

/** Per-prompt correctness keyed by prompt id, from each detail's `outcome`. */
function correctnessByItem(details: readonly ScoringDetail[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const detail of details) {
    map.set(detail.itemId, detailIsRight(detail));
  }
  return map;
}

/**
 * An option as the learner names it: its label and its text, or the label
 * alone where the text only repeats it — a list of paragraph letters.
 */
export function optionName(option: Pick<MatchingOption, 'label' | 'text'>): string {
  const label = option.label?.trim();
  if (label === undefined || label === '') {
    return option.text;
  }
  return label.toLowerCase() === option.text.trim().toLowerCase()
    ? label
    : `${label} ${option.text}`;
}

export function Matching({
  data,
  onComplete,
  onSubmit,
  onChange,
  onInteraction,
  value,
  defaultValue,
  defaultSubmitted,
  renderMode = 'practice',
  outcome,
  mediaBudget,
  mediaStrings,
  strings,
  theme,
  locale,
  disabled,
  shuffleSeed,
  ai: aiProp,
  delivery,
  scoring,
}: MatchingProps) {
  const isExam = renderMode === 'exam';
  const isReview = renderMode === 'review';
  const s = useLkStrings(strings);
  const ai = useLearnerAi(aiProp);
  const policy = useDeliveryPolicy(delivery);
  const scoringPolicy = useItemScoringPolicy(scoring);

  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    if (data.redacted === true) {
      try {
        assertRedacted(data);
        return null;
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    }
    const result = validateActivity('matching', data);
    return result.success ? null : new ActivitySchemaError('matching', result.errors);
  }, [data]);

  const { state, start, complete, getTimeSpent, reset } = useActivityState(
    defaultSubmitted === true ? 'completed' : 'idle',
  );
  // Before anything that resets them: a new question starts with no tries.
  const tries = useTries({
    policy: scoringPolicy,
    graded: renderMode === 'practice' && policy.feedback,
    submitted: state === 'completed',
    disabled: disabled === true,
  });
  const resetTries = tries.reset;
  const isControlled = value !== undefined;
  const [internalMatches, setInternalMatches] = useState<Record<string, string>>(() =>
    matchesOf(defaultValue),
  );
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [overall, setOverall] = useState<string | null>(null);
  const [feedbackHidden, setFeedbackHidden] = useState(false);
  // What a move under `optionUse: 'once'` did, said once, politely.
  const [moved, setMoved] = useState<string | null>(null);
  // Hints the learner had been shown before this mount: a restored answer's
  // count stands, and the hints shown here add to it.
  const seedHintsRef = useRef(hintsOf(value ?? defaultValue));
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const focusAfterRef = useRef<'answer' | 'feedback' | null>(null);

  const matches = isControlled ? matchesOf(value) : internalMatches;

  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);

  const defaultSubmittedRef = useRef(defaultSubmitted);
  useEffect(() => {
    defaultSubmittedRef.current = defaultSubmitted;
  }, [defaultSubmitted]);

  // Identity-guarded so the mount run is a no-op: without it this fires after
  // the first paint and undoes every seed it was just given.
  const lastDataRef = useRef(data);
  useEffect(() => {
    if (lastDataRef.current === data) {
      return;
    }
    lastDataRef.current = data;
    setInternalMatches(matchesOf(defaultValueRef.current));
    setResult(null);
    setSummary(null);
    setOverall(null);
    setFeedbackHidden(false);
    setMoved(null);
    seedHintsRef.current = hintsOf(defaultValueRef.current);
    resetTries();
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [data, reset, resetTries]);

  const sessionIdRef = useRef<string | null>(null);
  /**
   * The list in the order it is shown — the same order in the list and in
   * every selector, as on paper, where the learner reads it once.
   */
  const options = useMemo(() => {
    if (data.shuffleOptions !== true) {
      return data.options;
    }
    // biome-ignore lint/suspicious/noAssignInExpressions: sanctioned lazy ref initialization
    const seedSource = shuffleSeed ?? (sessionIdRef.current ??= randomSessionId());
    return seededShuffle(data.options, `${seedSource}:${data.id}`, { version: 1 });
  }, [data, shuffleSeed]);
  const optionById = useMemo(
    () => new Map(data.options.map((option) => [option.id, option])),
    [data.options],
  );
  const once = data.optionUse === 'once';

  // Hints are a hook, so they are read here, before the throws below.
  const answered = state === 'completed';
  const aiHints = useComponentAiHints({
    ai,
    data,
    renderMode,
    submitted: answered,
    disabled: disabled === true,
    response: { type: 'matching', matches },
    locale,
    onInteraction,
    strings: s,
    delivery: policy,
  });
  // Every hint the learner has been shown on this question, counted from its
  // start: what a scoring policy charges for. Hints exist only in practice.
  const hintsRevealed = renderMode === 'practice' ? seedHintsRef.current + aiHints.used : 0;
  const responseOf = (next: Record<string, string>): MatchingLearnerResponse => ({
    type: 'matching',
    matches: next,
    ...(hintsRevealed > 0 ? { hintsRevealed } : {}),
  });
  // A hint shown is part of the answer's record: say so as it happens.
  const hintsSeenRef = useRef(aiHints.used);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new hint is the trigger, and the response it reports is this render's
  useEffect(() => {
    if (hintsSeenRef.current === aiHints.used) {
      return;
    }
    hintsSeenRef.current = aiHints.used;
    if (aiHints.used > 0) {
      onChange?.(responseOf(matches));
    }
  }, [aiHints.used]);
  useEffect(() => {
    const target = focusAfterRef.current;
    if (target === null) {
      return;
    }
    focusAfterRef.current = null;
    if (target === 'answer') {
      formRef.current?.querySelector<HTMLElement>('select:not(:disabled)')?.focus();
    } else {
      feedbackRef.current?.focus();
    }
  });

  // All hooks are called before these throws, so hook order stays stable.
  if (devError) {
    throw devError;
  }
  // Practice grades locally, and a redacted projection has no answer key to
  // grade against: fail at render, in production too, as every built-in does.
  if (data.redacted === true && renderMode === 'practice') {
    throw new Error(
      `Matching "${data.id}" received redacted activity data in renderMode "practice", ` +
        'which grades locally and has no answer key to grade against. ' +
        'Render redacted data with renderMode="exam" (server grades) or "review" (pass `outcome`).',
    );
  }

  const submitted = state === 'completed';
  const inactive = disabled === true || submitted || isReview;

  /**
   * Whether answer-key-derived information may be shown. Never in `exam`; in
   * `practice` only once this component has scored; in `review` only once the
   * caller supplies a SCORED outcome.
   */
  const revealing = isReview ? outcome?.status === 'scored' : !isExam && submitted;
  // What the delivery policy lets that reveal show: right and wrong with the
  // author's feedback, and — as multiple choice does — the right option beside
  // a wrong match, but not while another try is on offer.
  const marking = revealing && policy.feedback;
  const solutions = marking && policy.solutions && !tries.open;

  const fireInteraction = (
    type: 'option-matched' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  const handleSelect = (promptId: string, optionId: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    const next = { ...matches, [promptId]: optionId };
    // Used once: an option the learner gives to this prompt leaves the one
    // that held it, as a heading dragged to another paragraph does on screen.
    let movedFrom: string | null = null;
    if (once && optionId !== '') {
      for (const [otherId, otherOption] of Object.entries(next)) {
        if (otherId !== promptId && otherOption === optionId) {
          next[otherId] = '';
          movedFrom = otherId;
        }
      }
    }
    if (!isControlled) {
      setInternalMatches(next);
    }
    const option = optionById.get(optionId);
    setMoved(movedFrom !== null && option !== undefined ? s.matchMoved(optionName(option)) : null);
    onChange?.(responseOf(next));
    fireInteraction('option-matched', {
      promptId,
      optionId,
      ...(movedFrom !== null ? { movedFrom } : {}),
    });
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive) {
      return;
    }
    const response = responseOf(matches);
    onSubmit?.(response);
    setMoved(null);

    if (isExam) {
      // The client neither grades nor reveals: no score(), no read of any
      // answer-key field, no onComplete, and no xAPI statement — its
      // correctResponsesPattern IS the answer key.
      complete();
      setSummary(s.answerSubmitted);
      fireInteraction('submitted', { matches });
      return;
    }

    const answer = score('matching', data as MatchingData, response);
    complete();
    const timeSpent = getTimeSpent();
    // The question's score under the policy — see MultipleChoice.
    const counted = tries.record({
      score: answer.score,
      maxScore: answer.maxScore,
      hintsRevealed,
    });
    const mine = counted.tries[counted.tries.length - 1];
    const costed = mine === undefined ? answer.score : mine.scored;
    const scoringResult =
      costed === answer.score
        ? answer
        : { ...answer, score: costed, passed: computePassThreshold(data as MatchingData, costed) };
    const passed =
      counted.score === scoringResult.score
        ? scoringResult.passed
        : computePassThreshold(data as MatchingData, counted.score);
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [data.locale ?? 'en-US']: data.title },
        ...xapiDefinitionFor(data),
      },
      scoringResult,
      timeSpentMs: timeSpent,
      // The xAPI matching response: `source[.]target` pairs, answered ones only.
      response: data.prompts
        .filter((prompt) => (matches[prompt.id] ?? '') !== '')
        .map((prompt) => `${prompt.id}[.]${matches[prompt.id]}`)
        .join('[,]'),
    });
    setResult(answer);
    onComplete?.(
      stampTake(
        { score: counted.score, maxScore: counted.maxScore, passed, timeSpent, xapiStatement },
        mintTake(),
      ),
    );
    setOverall(answer.feedback);
    setSummary(
      `${s.answerSubmitted} ${s.scoreAnnouncement(Math.round(counted.score * 100), passed)}`,
    );
    fireInteraction('submitted', { matches, score: scoringResult.score });
  };

  /** "Try again": the matches stay, to be changed; the marks go. */
  const retry = (): void => {
    reset('idle');
    setSummary(null);
    setOverall(null);
    focusAfterRef.current = 'answer';
  };

  /** "Keep this answer" or "Show the answer": no more tries. */
  const closeTries = (): void => {
    tries.close();
    focusAfterRef.current = 'feedback';
  };

  const correctByPrompt = (() => {
    if (isExam) {
      return new Map<string, boolean>();
    }
    if (isReview) {
      return outcome?.status === 'scored'
        ? correctnessByItem(outcome.details)
        : new Map<string, boolean>();
    }
    return correctnessByItem(result?.details ?? []);
  })();

  const reviewSummary = (() => {
    if (!isReview || outcome === undefined) {
      return null;
    }
    if (outcome.status === 'scored') {
      return `${s.scoreAnnouncement(Math.round(outcome.score * 100), outcome.passed)}${
        outcome.feedback ? ` ${outcome.feedback}` : ''
      }`;
    }
    if (outcome.status === 'deferred') {
      return s.notGradedYet;
    }
    if (outcome.status === 'graded') {
      const percent =
        outcome.maxScore > 0
          ? Math.round((outcome.score / outcome.maxScore) * 100)
          : Math.round(outcome.score * 100);
      return `${s.scoreAnnouncement(percent, outcome.passed)}${
        outcome.feedback ? ` ${outcome.feedback}` : ''
      }`;
    }
    return s.noGradeAvailable;
  })();

  /**
   * The right option of a prompt, where it may be shown: from the item in
   * practice, and from the scored outcome's `correctResponse` in review, which
   * is all a redacted item has.
   */
  const answerOf = (promptId: string): MatchingOption | undefined => {
    if (!solutions) {
      return undefined;
    }
    const prompt = data.prompts.find((candidate) => candidate.id === promptId);
    // Read defensively: a redact() projection omits it at runtime while the
    // type still says it is there.
    const fromItem = (prompt as { correctOptionId?: unknown } | undefined)?.correctOptionId;
    const fromOutcome =
      isReview && outcome?.status === 'scored'
        ? outcome.details.find((detail) => detail.itemId === promptId)?.correctResponse
        : undefined;
    const id =
      typeof fromItem === 'string'
        ? fromItem
        : Array.isArray(fromOutcome)
          ? fromOutcome[0]
          : fromOutcome;
    return typeof id === 'string' ? optionById.get(id) : undefined;
  };

  const used = new Set(Object.values(matches).filter((optionId) => optionId !== ''));
  const anyFeedback = data.prompts.some(
    (prompt) => (prompt as { feedback?: unknown }).feedback !== undefined,
  );
  const extra =
    !isReview && policy.feedback && submitted && tries.counted !== null
      ? triesSummary(s, scoringPolicy, tries.counted, tries.open)
      : '';
  const announced =
    summary === null
      ? null
      : `${summary}${extra ? ` ${extra}` : ''}${overall ? ` ${overall}` : ''}`;

  const instructions = instructionsOf(data);
  const instructionsId = `${data.id}-instructions`;
  const listTitleId = `${data.id}-options-title`;
  const optionsTitle = data.optionsTitle?.trim() ? data.optionsTitle : undefined;

  return (
    <form
      ref={formRef}
      className="lk-mt"
      aria-label={data.title}
      lang={locale}
      data-render-mode={renderMode}
      data-option-use={once ? 'once' : 'many'}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      <ItemInstructions id={instructionsId} className="lk-mt-instructions" text={instructions} />
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
      <fieldset
        disabled={inactive}
        aria-describedby={instructions === undefined ? undefined : instructionsId}
      >
        <section
          className="lk-mt-list"
          {...(optionsTitle !== undefined
            ? { 'aria-labelledby': listTitleId }
            : { 'aria-label': s.matchOptionsLabel })}
        >
          {optionsTitle !== undefined ? (
            <p className="lk-mt-list-title" id={listTitleId}>
              {optionsTitle}
            </p>
          ) : null}
          <ul className="lk-mt-options">
            {options.map((option) => {
              const label = option.label?.trim();
              const name = optionName(option);
              return (
                <li
                  key={option.id}
                  className="lk-mt-option"
                  data-option-id={option.id}
                  data-used={once && used.has(option.id) ? '' : undefined}
                >
                  {label !== undefined && label !== '' ? (
                    <span className="lk-mt-option-label">{label}</span>
                  ) : null}
                  {name === label ? null : <span className="lk-mt-option-text">{option.text}</span>}
                  {once && used.has(option.id) ? (
                    <span className="lk-visually-hidden"> {s.matchOptionUsed}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
        <ul className="lk-mt-prompts">
          {data.prompts.map((prompt) => {
            const selectId = `${data.id}-match-${prompt.id}`;
            const chosen = matches[prompt.id] ?? '';
            const correctness = correctByPrompt.get(prompt.id);
            // Read defensively and never in exam: a redact() projection omits
            // it at runtime while the type still says it is there.
            const promptFeedback = isExam ? undefined : (prompt as { feedback?: string }).feedback;
            const right = correctness === false ? answerOf(prompt.id) : undefined;
            return (
              <li
                key={prompt.id}
                className="lk-mt-prompt"
                data-correct={
                  marking && correctness !== undefined ? String(correctness) : undefined
                }
              >
                <label className="lk-mt-prompt-text" htmlFor={selectId}>
                  {prompt.text}
                </label>
                <select
                  id={selectId}
                  className="lk-mt-select"
                  value={chosen}
                  disabled={inactive}
                  aria-disabled={inactive || undefined}
                  data-correct={
                    marking && correctness !== undefined ? String(correctness) : undefined
                  }
                  onChange={(e) => handleSelect(prompt.id, e.target.value)}
                >
                  {/*
                    The empty entry is how a learner leaves a prompt alone and
                    takes an answer back, so "not answered" stays apart from
                    "answered wrongly" — `incorrect-omission` in the outcome.
                  */}
                  <option value="">{s.matchPlaceholder}</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {optionName(option)}
                      {once && used.has(option.id) && chosen !== option.id
                        ? ` ${s.matchOptionUsed}`
                        : ''}
                    </option>
                  ))}
                </select>
                {right !== undefined ? (
                  <span className="lk-mt-answer">{s.matchCorrectAnswer(optionName(right))}</span>
                ) : null}
                {marking && !feedbackHidden && promptFeedback ? (
                  <span
                    className="lk-mt-prompt-feedback"
                    role="note"
                    data-correct={correctness !== undefined ? String(correctness) : undefined}
                  >
                    {promptFeedback}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="lk-visually-hidden" aria-live="polite">
          {moved ?? ''}
        </p>
        {aiHints.offered && renderMode === 'practice' ? (
          <HintCost policy={scoringPolicy} strings={s} />
        ) : null}
        <AiHints help={aiHints} ai={ai} strings={s} />
        {isReview ? null : (
          <button type="submit" disabled={inactive}>
            {isExam ? s.submitAnswers : s.checkAnswers}
          </button>
        )}
      </fieldset>
      {marking && anyFeedback ? (
        <button
          type="button"
          className="lk-mt-feedback-toggle"
          aria-expanded={!feedbackHidden}
          onClick={() => setFeedbackHidden((h) => !h)}
        >
          {feedbackHidden ? s.showFeedback : s.hideFeedback}
        </button>
      ) : null}
      <FeedbackRegion
        id={`${data.id}-feedback`}
        {...(scoringPolicy.retries > 0 ? { ref: feedbackRef } : {})}
      >
        {feedbackAnnouncement({
          review: isReview,
          feedback: policy.feedback,
          outcome,
          readBack: reviewSummary,
          submitted: summary !== null,
          result: announced,
          received: s.answerSubmitted,
        })}
      </FeedbackRegion>
      <TryActions
        tries={tries}
        solutions={policy.solutions}
        strings={s}
        onRetry={retry}
        onClose={closeTries}
      />
      <AiExplanation
        ai={ai}
        data={data}
        renderMode={renderMode}
        submitted={submitted}
        response={{ type: 'matching', matches }}
        outcome={outcome}
        locale={locale}
        onInteraction={onInteraction}
        strings={s}
        // An explanation all but always names the answer: not while another
        // try is on offer.
        delivery={tries.open ? { ...policy, solutions: false } : policy}
      />
    </form>
  );
}
