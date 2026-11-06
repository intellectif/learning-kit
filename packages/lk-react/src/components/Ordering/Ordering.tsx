'use client';

import {
  ActivitySchemaError,
  assertRedacted,
  computePassThreshold,
  type LearnerResponse,
  type OrderingData,
  type OrderingItem,
  type OrderingLearnerResponse,
  orderingStart,
  type ScoringDetail,
  type ScoringResult,
  score,
  validateActivity,
  xAPIBuilder,
  xapiDefinitionFor,
} from '@intellectif/lk-core';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useLearnerAi } from '../../ai/LkAiProvider.js';
import { useActivityState } from '../../hooks/useActivityState.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ANONYMOUS_ACTOR, isDevelopment, objectIdFor } from '../_internal.js';
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

export type OrderingProps = ActivityProps<OrderingData>;

/** Hidden from sight, never from a screen reader: the skin's `.lk-visually-hidden`, inline for an unstyled host. */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * The order to show: the ids of `response` that name an item, each once, then
 * any item it leaves out, where it starts. A response of another activity
 * type, or none, is the start order — a controlled host that has not yet
 * swapped its state on an activity change would otherwise crash the attempt.
 */
function orderOf(response: LearnerResponse | undefined, start: readonly string[]): string[] {
  const listed =
    response !== undefined && response.type === 'ordering' && Array.isArray(response.order)
      ? response.order
      : [];
  const known = new Set(start);
  const order: string[] = [];
  for (const id of listed) {
    if (typeof id === 'string' && known.has(id) && !order.includes(id)) {
      order.push(id);
    }
  }
  for (const id of start) {
    if (!order.includes(id)) {
      order.push(id);
    }
  }
  return order;
}

/** What a scored outcome says of each item, read from the details alone. */
interface ItemMarks {
  /** Each item's verdict: whether it follows the item it should. */
  right: Map<string, boolean>;
  /** The right order, rebuilt from each item's predecessor; empty when the details cannot give it. */
  solution: string[];
}

/**
 * Read from the details alone, so a review of a redacted item — which lists
 * its items in the order they start in — marks them, and shows the right
 * order, exactly as practice does.
 */
function itemMarksOf(details: readonly ScoringDetail[], known: ReadonlySet<string>): ItemMarks {
  const right = new Map<string, boolean>();
  const after = new Map<string, string>();
  for (const detail of details) {
    if (!known.has(detail.itemId)) {
      continue;
    }
    right.set(detail.itemId, detail.outcome === 'correct');
    if (typeof detail.correctResponse === 'string') {
      after.set(detail.correctResponse, detail.itemId);
    }
  }
  const solution: string[] = [];
  let next = after.get('');
  while (next !== undefined && !solution.includes(next)) {
    solution.push(next);
    next = after.get(next);
  }
  return { right, solution: solution.length === known.size ? solution : [] };
}

export function Ordering({
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
  ai: aiProp,
  delivery,
  scoring,
}: OrderingProps) {
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
    const result = validateActivity('ordering', data);
    return result.success ? null : new ActivitySchemaError('ordering', result.errors);
  }, [data]);

  // A redacted copy already lists its items in the order they start in.
  const items = Array.isArray(data.items) ? data.items : [];
  const start = useMemo(
    () =>
      (data.redacted === true ? items : orderingStart({ id: data.id, items })).map(
        (item) => item.id,
      ),
    [data.redacted, data.id, items],
  );
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const {
    state,
    start: begin,
    complete,
    getTimeSpent,
    reset,
  } = useActivityState(defaultSubmitted === true ? 'completed' : 'idle');
  // Before anything that resets them: a new question starts with no tries.
  const tries = useTries({
    policy: scoringPolicy,
    graded: renderMode === 'practice' && policy.feedback,
    submitted: state === 'completed',
    disabled: disabled === true,
  });
  const resetTries = tries.reset;
  const isControlled = value !== undefined;
  const [internalOrder, setInternalOrder] = useState<readonly string[]>(() =>
    orderOf(defaultValue, start),
  );
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [overall, setOverall] = useState<string | null>(null);
  const [moved, setMoved] = useState('');
  const [feedbackHidden, setFeedbackHidden] = useState(false);
  const seedHintsRef = useRef(hintsOf(value ?? defaultValue));
  const listRef = useRef<HTMLOListElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const focusAfterRef = useRef<
    { id: string; button: 'up' | 'down' } | 'answer' | 'feedback' | null
  >(null);

  const order = isControlled
    ? orderOf(value, start)
    : orderOf({ type: 'ordering', order: [...internalOrder] }, start);

  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);

  const defaultSubmittedRef = useRef(defaultSubmitted);
  useEffect(() => {
    defaultSubmittedRef.current = defaultSubmitted;
  }, [defaultSubmitted]);

  // Identity-guarded so the mount run is a no-op.
  const lastDataRef = useRef(data);
  useEffect(() => {
    if (lastDataRef.current === data) {
      return;
    }
    lastDataRef.current = data;
    setInternalOrder(orderOf(defaultValueRef.current, start));
    setResult(null);
    setSummary(null);
    setOverall(null);
    setMoved('');
    setFeedbackHidden(false);
    seedHintsRef.current = hintsOf(defaultValueRef.current);
    resetTries();
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [data, start, reset, resetTries]);

  // Hints are a hook, so they are read here, before the throws below.
  const answered = state === 'completed';
  const aiHints = useComponentAiHints({
    ai,
    data,
    renderMode,
    submitted: answered,
    disabled: disabled === true,
    response: { type: 'ordering', order: [...order] },
    locale,
    onInteraction,
    strings: s,
    delivery: policy,
  });
  const hintsRevealed = renderMode === 'practice' ? seedHintsRef.current + aiHints.used : 0;
  const responseOf = (next: readonly string[]): OrderingLearnerResponse => ({
    type: 'ordering',
    order: [...next],
    ...(hintsRevealed > 0 ? { hintsRevealed } : {}),
  });
  const hintsSeenRef = useRef(aiHints.used);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new hint is the trigger, and the response it reports is this render's
  useEffect(() => {
    if (hintsSeenRef.current === aiHints.used) {
      return;
    }
    hintsSeenRef.current = aiHints.used;
    if (aiHints.used > 0) {
      onChange?.(responseOf(order));
    }
  }, [aiHints.used]);
  useEffect(() => {
    const target = focusAfterRef.current;
    if (target === null) {
      return;
    }
    focusAfterRef.current = null;
    if (target === 'feedback') {
      feedbackRef.current?.focus();
    } else if (target === 'answer') {
      listRef.current?.querySelector<HTMLElement>('button')?.focus();
    } else {
      // By attribute value, not a selector: an id may hold any character.
      const row = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-item]') ?? [])].find(
        (element) => element.dataset.item === target.id,
      );
      row?.querySelector<HTMLElement>(`.lk-or-${target.button}`)?.focus();
    }
  });

  // All hooks are called before these throws, so hook order stays stable.
  if (devError) {
    throw devError;
  }
  if (data.redacted === true && renderMode === 'practice') {
    throw new Error(
      `Ordering "${data.id}" received redacted activity data in renderMode "practice", ` +
        'which grades locally and has no answer key to grade against. ' +
        'Render redacted data with renderMode="exam" (server grades) or "review" (pass `outcome`).',
    );
  }

  const submitted = state === 'completed';
  const inactive = disabled === true || submitted || isReview;

  /** Never in `exam`; in `practice` once scored here; in `review` with a scored outcome. */
  const revealing = isReview ? outcome?.status === 'scored' : !isExam && submitted;
  const marking = revealing && policy.feedback;
  // The right order is shown where answers may be, and not while another try is on offer.
  const solutions = marking && policy.solutions && !tries.open;

  const fireInteraction = (
    type: 'item-moved' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  const move = (id: string, delta: -1 | 1): void => {
    const from = order.indexOf(id);
    const to = from + delta;
    if (inactive || from < 0 || to < 0 || to >= order.length) {
      return;
    }
    if (state === 'idle') {
      begin();
    }
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    if (!isControlled) {
      setInternalOrder(next);
    }
    onChange?.(responseOf(next));
    fireInteraction('item-moved', { id, from, to });
    setMoved(s.orderMoved(byId.get(id)?.text ?? id, to + 1, next.length));
    focusAfterRef.current = { id, button: delta < 0 ? 'up' : 'down' };
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive) {
      return;
    }
    const response = responseOf(order);
    onSubmit?.(response);
    setMoved('');

    if (isExam) {
      complete();
      setSummary(s.answerSubmitted);
      fireInteraction('submitted', { order: response.order });
      return;
    }

    const answer = score('ordering', data as OrderingData, response);
    complete();
    const timeSpent = getTimeSpent();
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
        : {
            ...answer,
            score: costed,
            passed: computePassThreshold(data as OrderingData, costed),
          };
    const passed =
      counted.score === scoringResult.score
        ? scoringResult.passed
        : computePassThreshold(data as OrderingData, counted.score);
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [data.locale ?? 'en-US']: data.title },
        ...xapiDefinitionFor(data),
      },
      scoringResult,
      timeSpentMs: timeSpent,
      response: response.order.join('[,]'),
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
    fireInteraction('submitted', { order: response.order, score: scoringResult.score });
  };

  const retry = (): void => {
    reset('idle');
    setSummary(null);
    setOverall(null);
    focusAfterRef.current = 'answer';
  };

  const closeTries = (): void => {
    tries.close();
    focusAfterRef.current = 'feedback';
  };

  const known = new Set(start);
  const itemMarks: ItemMarks = (() => {
    if (isExam) {
      return { right: new Map(), solution: [] };
    }
    if (isReview) {
      return outcome?.status === 'scored'
        ? itemMarksOf(outcome.details, known)
        : { right: new Map(), solution: [] };
    }
    return itemMarksOf(result?.details ?? [], known);
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

  /** How an item reads once checked: after the item it should follow, or not. */
  const markOf = (id: string): 'correct' | 'wrong' | undefined => {
    if (!marking) {
      return undefined;
    }
    const right = itemMarks.right.get(id);
    return right === undefined ? undefined : right ? 'correct' : 'wrong';
  };
  const markText = { correct: s.orderInOrder, wrong: s.orderOutOfOrder };
  const allRight = order.every((id) => itemMarks.right.get(id) === true);
  const showSolution = solutions && !allRight && itemMarks.solution.length > 0;

  // Read defensively and never in exam: a redact() projection has no feedback.
  const itemFeedback: OrderingItem[] = isExam
    ? []
    : items.filter((item) => typeof item.feedback === 'string' && item.feedback !== '');
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
  const textId = (id: string): string => `${data.id}-item-${id}`;

  return (
    <form
      className="lk-or"
      aria-label={data.title}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      <ItemInstructions id={instructionsId} className="lk-or-instructions" text={instructions} />
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
        <ol ref={listRef} className="lk-or-list" aria-label={s.orderListLabel}>
          {order.map((id, index) => {
            const item = byId.get(id);
            const mark = markOf(id);
            return (
              <li key={id} className="lk-or-item" data-item={id} data-mark={mark}>
                <span className="lk-or-text" id={textId(id)}>
                  {item?.text ?? id}
                </span>
                {mark === undefined ? null : <span className="lk-or-mark">{markText[mark]}</span>}
                {isReview ? null : (
                  <span className="lk-or-moves">
                    <button
                      type="button"
                      className="lk-or-up"
                      aria-label={s.orderMoveUp}
                      aria-describedby={textId(id)}
                      aria-disabled={index === 0 || undefined}
                      onClick={() => move(id, -1)}
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      className="lk-or-down"
                      aria-label={s.orderMoveDown}
                      aria-describedby={textId(id)}
                      aria-disabled={index === order.length - 1 || undefined}
                      onClick={() => move(id, 1)}
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="lk-or-status lk-visually-hidden" style={VISUALLY_HIDDEN} role="status">
          {moved}
        </p>
        {showSolution ? (
          <div className="lk-or-solution">
            <p className="lk-or-solution-title" id={`${data.id}-solution`}>
              {s.orderSolution}
            </p>
            <ol aria-labelledby={`${data.id}-solution`}>
              {itemMarks.solution.map((id) => (
                <li key={id}>{byId.get(id)?.text ?? id}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {marking && !feedbackHidden && itemFeedback.length > 0 ? (
          <ul className="lk-or-feedback-list">
            {itemFeedback.map((item) => (
              <li key={item.id} role="note">
                <span className="lk-or-feedback-item">{item.text}</span> {item.feedback}
              </li>
            ))}
          </ul>
        ) : null}
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
      {marking && itemFeedback.length > 0 ? (
        <button
          type="button"
          className="lk-or-feedback-toggle"
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
        response={{ type: 'ordering', order: [...order] }}
        outcome={outcome}
        locale={locale}
        onInteraction={onInteraction}
        strings={s}
        delivery={tries.open ? { ...policy, solutions: false } : policy}
      />
    </form>
  );
}
