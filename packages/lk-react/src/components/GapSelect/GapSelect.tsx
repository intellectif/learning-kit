'use client';

import {
  ActivitySchemaError,
  assertRedacted,
  computePassThreshold,
  type GapSelectBank,
  type GapSelectChoice,
  type GapSelectData,
  type GapSelectGap,
  type GapSelectLearnerResponse,
  type LearnerResponse,
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

export interface GapSelectProps extends ActivityProps<GapSelectData> {
  /**
   * Seeds the per-gap choice shuffle when `data.shuffleChoices` is set. Pass
   * the attempt id, exactly as on `<MultipleChoice>`: an order nobody can
   * reproduce cannot be reconciled with the attempt a server recorded. Without
   * one, a random per-mount seed is used — stable within the mount, and
   * deliberately not reproducible.
   */
  shuffleSeed?: string;
}

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

type Segment = { kind: 'text'; value: string } | { kind: 'gap'; id: string; ordinal: number };

/** Splits a passage into literal text and its `{{id}}` gaps, in order. */
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
    segments.push({ kind: 'gap', id: match[1] as string, ordinal });
    last = match.index + match[0].length;
    match = re.exec(passage);
  }
  if (last < passage.length) {
    segments.push({ kind: 'text', value: passage.slice(last) });
  }
  return segments;
}

const NO_SELECTIONS: Record<string, string> = {};

/**
 * The selections out of a `LearnerResponse`. A response of another activity
 * type reads as "nothing selected" rather than throwing — a controlled host
 * that has not yet swapped its state on an activity change would otherwise
 * crash the attempt.
 */
function selectionsOf(response: LearnerResponse | undefined): Record<string, string> {
  return response !== undefined && response.type === 'gap-select'
    ? response.selections
    : NO_SELECTIONS;
}

/** Per-gap correctness keyed by gap id, from each detail's `outcome`. */
function correctnessByItem(details: readonly ScoringDetail[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const detail of details) {
    map.set(detail.itemId, detailIsRight(detail));
  }
  return map;
}

/**
 * The choices a gap offers: its own list, or the bank it names.
 *
 * Both survive redaction — they are what the learner picks from — so this is
 * the one resolution that works identically on full and redacted data.
 */
function choicesFor(
  banks: readonly GapSelectBank[] | undefined,
  gap: GapSelectGap,
): readonly GapSelectChoice[] {
  if (gap.choices !== undefined) {
    return gap.choices;
  }
  return banks?.find((bank) => bank.id === gap.bankId)?.choices ?? [];
}

export function GapSelect({
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
}: GapSelectProps) {
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
    const result = validateActivity('gap-select', data);
    return result.success ? null : new ActivitySchemaError('gap-select', result.errors);
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
  const [internalSelections, setInternalSelections] = useState<Record<string, string>>(() =>
    selectionsOf(defaultValue),
  );
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [overall, setOverall] = useState<string | null>(null);
  const [feedbackHidden, setFeedbackHidden] = useState(false);
  // Hints the learner had been shown before this mount: a restored answer's
  // count stands, and the hints shown here add to it.
  const seedHintsRef = useRef(hintsOf(value ?? defaultValue));
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const focusAfterRef = useRef<'answer' | 'feedback' | null>(null);

  const selections = isControlled ? selectionsOf(value) : internalSelections;

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
    setInternalSelections(selectionsOf(defaultValueRef.current));
    setResult(null);
    setSummary(null);
    setOverall(null);
    setFeedbackHidden(false);
    seedHintsRef.current = hintsOf(defaultValueRef.current);
    resetTries();
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [data, reset, resetTries]);

  const segments = useMemo(() => parsePassage(data.passage), [data.passage]);
  const gapById = useMemo(() => new Map(data.gaps.map((gap) => [gap.id, gap])), [data.gaps]);

  const sessionIdRef = useRef<string | null>(null);
  /**
   * The choices each gap shows, in the order it shows them.
   *
   * Seeded PER GAP, not once for the activity: two gaps drawing on the same
   * word bank must not be dealt the same order, or the bank's distractors line
   * up column-wise and the second gap becomes easier than the first.
   */
  const choicesByGap = useMemo(() => {
    const map = new Map<string, readonly GapSelectChoice[]>();
    // biome-ignore lint/suspicious/noAssignInExpressions: sanctioned lazy ref initialization
    const seedSource = shuffleSeed ?? (sessionIdRef.current ??= randomSessionId());
    for (const gap of data.gaps) {
      const choices = choicesFor(data.banks, gap);
      map.set(
        gap.id,
        data.shuffleChoices === true
          ? seededShuffle(choices, `${seedSource}:${data.id}:${gap.id}`, { version: 1 })
          : choices,
      );
    }
    return map;
  }, [data, shuffleSeed]);

  // Hints are a hook, so they are read here, before the throws below.
  const answered = state === 'completed';
  const aiHints = useComponentAiHints({
    ai,
    data,
    renderMode,
    submitted: answered,
    disabled: disabled === true,
    response: { type: 'gap-select', selections },
    locale,
    onInteraction,
    strings: s,
    delivery: policy,
  });
  // Every hint the learner has been shown on this question, counted from its
  // start: what a scoring policy charges for. Hints exist only in practice.
  const hintsRevealed = renderMode === 'practice' ? seedHintsRef.current + aiHints.used : 0;
  const responseOf = (next: Record<string, string>): GapSelectLearnerResponse => ({
    type: 'gap-select',
    selections: next,
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
      onChange?.(responseOf(selections));
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
  // grade against — `score()` would throw RedactedScoringError from the submit
  // handler, where no error boundary can reach it and after the learner has
  // answered. Fail at render instead, in production too, exactly as every other
  // built-in does.
  if (data.redacted === true && renderMode === 'practice') {
    throw new Error(
      `Gap Select "${data.id}" received redacted activity data in renderMode "practice", ` +
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
  // What the delivery policy lets that reveal show: right and wrong, and the
  // author's feedback. A gap select never writes in the right choice, so
  // `solutions` has nothing here to hide.
  const marking = revealing && policy.feedback;

  const fireInteraction = (
    type: 'gap-selected' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  const handleSelect = (gapId: string, choiceId: string): void => {
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    const next = { ...selections, [gapId]: choiceId };
    if (!isControlled) {
      setInternalSelections(next);
    }
    onChange?.(responseOf(next));
    fireInteraction('gap-selected', { gapId, choiceId });
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive) {
      return;
    }
    const response = responseOf(selections);
    onSubmit?.(response);

    if (isExam) {
      // The client neither grades nor reveals: no score(), no read of any
      // answer-key field, no onComplete, and no xAPI statement — its
      // correctResponsesPattern IS the answer key.
      complete();
      setSummary(s.answerSubmitted);
      fireInteraction('submitted', { selections });
      return;
    }

    const answer = score('gap-select', data as GapSelectData, response);
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
        : { ...answer, score: costed, passed: computePassThreshold(data as GapSelectData, costed) };
    const passed =
      counted.score === scoringResult.score
        ? scoringResult.passed
        : computePassThreshold(data as GapSelectData, counted.score);
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [data.locale ?? 'en-US']: data.title },
        ...xapiDefinitionFor(data),
      },
      scoringResult,
      timeSpentMs: timeSpent,
      response: JSON.stringify(selections),
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
    fireInteraction('submitted', { selections, score: scoringResult.score });
  };

  /** "Try again": the choices stay, to be changed; the marks go. */
  const retry = (): void => {
    reset('idle');
    setSummary(null);
    setOverall(null);
    focusAfterRef.current = 'answer';
  };

  /** "Keep this answer": no more tries. A gap select never writes in the right choice. */
  const closeTries = (): void => {
    tries.close();
    focusAfterRef.current = 'feedback';
  };

  const correctByGap = useMemo(() => {
    if (isExam) {
      return new Map<string, boolean>();
    }
    if (isReview) {
      return outcome?.status === 'scored'
        ? correctnessByItem(outcome.details)
        : new Map<string, boolean>();
    }
    return correctnessByItem(result?.details ?? []);
  }, [isExam, isReview, outcome, result]);

  const reviewSummary = useMemo(() => {
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
  }, [isReview, outcome, s]);

  const anyFeedback = data.gaps.some((gap) => gap.feedback !== undefined);
  const extra =
    !isReview && policy.feedback && submitted && tries.counted !== null
      ? triesSummary(s, scoringPolicy, tries.counted, tries.open)
      : '';
  const announced =
    summary === null
      ? null
      : `${summary}${extra ? ` ${extra}` : ''}${overall ? ` ${overall}` : ''}`;

  return (
    <form
      ref={formRef}
      className="lk-gs"
      aria-label={data.title}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
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
      <fieldset disabled={inactive}>
        <p className="lk-gs-passage">
          {segments.map((seg, i) => {
            if (seg.kind === 'text') {
              // biome-ignore lint/suspicious/noArrayIndexKey: passage segments are positional and static
              return <span key={`t${i}`}>{seg.value}</span>;
            }
            const gap = gapById.get(seg.id);
            if (!gap) {
              return null;
            }
            const choices = choicesByGap.get(seg.id) ?? [];
            const correctness = correctByGap.get(seg.id);
            // Read defensively and never in exam: a redact() projection omits
            // both at runtime while the type still says they are there.
            const gapFeedback = isExam ? undefined : gap.feedback;
            return (
              <span key={seg.id} className="lk-gs-gap">
                <select
                  className="lk-gs-select"
                  aria-label={s.gapLabel(seg.ordinal)}
                  value={selections[seg.id] ?? ''}
                  disabled={inactive}
                  aria-disabled={inactive || undefined}
                  data-correct={
                    marking && correctness !== undefined ? String(correctness) : undefined
                  }
                  onChange={(e) => handleSelect(seg.id, e.target.value)}
                >
                  {/*
                    The empty entry is part of the contract, not a decoration.
                    It is how a learner leaves a gap alone — and how they take
                    an answer back — so "not answered" stays distinguishable
                    from "answered wrongly" all the way into ItemOutcome, where
                    the scorer reports it as `incorrect-omission`.
                  */}
                  <option value="">{s.gapPlaceholder}</option>
                  {choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.text}
                    </option>
                  ))}
                </select>
                {marking && !feedbackHidden && gapFeedback ? (
                  <span
                    className="lk-gs-gap-feedback"
                    role="note"
                    data-correct={correctness !== undefined ? String(correctness) : undefined}
                  >
                    {gapFeedback}
                  </span>
                ) : null}
              </span>
            );
          })}
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
          className="lk-gs-feedback-toggle"
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
        solutions={false}
        strings={s}
        onRetry={retry}
        onClose={closeTries}
      />
      <AiExplanation
        ai={ai}
        data={data}
        renderMode={renderMode}
        submitted={submitted}
        response={{ type: 'gap-select', selections }}
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
