'use client';

import {
  ActivitySchemaError,
  assertRedacted,
  computePassThreshold,
  type LearnerResponse,
  type MarkTheWordsData,
  type MarkTheWordsLearnerResponse,
  markableWords,
  type ScoringDetail,
  type ScoringResult,
  score,
  validateActivity,
  xAPIBuilder,
  xapiDefinitionFor,
} from '@intellectif/lk-core';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

export type MarkTheWordsProps = ActivityProps<MarkTheWordsData>;

const NO_MARKS: readonly number[] = [];

/**
 * The marked words out of a `LearnerResponse`. A response of another activity
 * type reads as "nothing marked" rather than throwing — a controlled host that
 * has not yet swapped its state on an activity change would otherwise crash
 * the attempt.
 */
function marksOf(response: LearnerResponse | undefined): readonly number[] {
  return response !== undefined &&
    response.type === 'mark-the-words' &&
    Array.isArray(response.marked)
    ? response.marked
    : NO_MARKS;
}

/** Which words a scored outcome names as targets. */
interface WordMarks {
  targets: Set<number>;
}

/**
 * Read from the details alone, so a review of a redacted item — which has no
 * targets — marks the text exactly as practice does.
 */
function wordMarksOf(details: readonly ScoringDetail[]): WordMarks {
  const targets = new Set<number>();
  for (const detail of details) {
    if (detail.itemId.startsWith('t') && Array.isArray(detail.correctResponse)) {
      for (const word of detail.correctResponse.map(Number).filter(Number.isInteger)) {
        targets.add(word);
      }
    }
  }
  return { targets };
}

export function MarkTheWords({
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
}: MarkTheWordsProps) {
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
    const result = validateActivity('mark-the-words', data);
    return result.success ? null : new ActivitySchemaError('mark-the-words', result.errors);
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
  const [internalMarks, setInternalMarks] = useState<readonly number[]>(() =>
    marksOf(defaultValue),
  );
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [overall, setOverall] = useState<string | null>(null);
  const [feedbackHidden, setFeedbackHidden] = useState(false);
  // The word that holds the one tab stop of the text.
  const [active, setActive] = useState(0);
  const seedHintsRef = useRef(hintsOf(value ?? defaultValue));
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const focusAfterRef = useRef<'answer' | 'feedback' | 'word' | null>(null);

  const marks = isControlled ? marksOf(value) : internalMarks;
  const markedSet = useMemo(() => new Set(marks), [marks]);

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
    setInternalMarks(marksOf(defaultValueRef.current));
    setResult(null);
    setSummary(null);
    setOverall(null);
    setFeedbackHidden(false);
    setActive(0);
    seedHintsRef.current = hintsOf(defaultValueRef.current);
    resetTries();
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [data, reset, resetTries]);

  const words = useMemo(() => markableWords(data.text), [data.text]);

  // Hints are a hook, so they are read here, before the throws below.
  const answered = state === 'completed';
  const aiHints = useComponentAiHints({
    ai,
    data,
    renderMode,
    submitted: answered,
    disabled: disabled === true,
    response: { type: 'mark-the-words', marked: [...marks] },
    locale,
    onInteraction,
    strings: s,
    delivery: policy,
  });
  const hintsRevealed = renderMode === 'practice' ? seedHintsRef.current + aiHints.used : 0;
  const responseOf = (next: readonly number[]): MarkTheWordsLearnerResponse => ({
    type: 'mark-the-words',
    marked: [...next].sort((a, b) => a - b),
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
      onChange?.(responseOf(marks));
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
    } else {
      textRef.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus();
    }
  });

  // All hooks are called before these throws, so hook order stays stable.
  if (devError) {
    throw devError;
  }
  if (data.redacted === true && renderMode === 'practice') {
    throw new Error(
      `Mark the Words "${data.id}" received redacted activity data in renderMode "practice", ` +
        'which grades locally and has no answer key to grade against. ' +
        'Render redacted data with renderMode="exam" (server grades) or "review" (pass `outcome`).',
    );
  }

  const submitted = state === 'completed';
  const inactive = disabled === true || submitted || isReview;

  /** Never in `exam`; in `practice` once scored here; in `review` with a scored outcome. */
  const revealing = isReview ? outcome?.status === 'scored' : !isExam && submitted;
  const marking = revealing && policy.feedback;
  // A target the learner did not mark is shown where answers may be, and
  // not while another try is on offer.
  const solutions = marking && policy.solutions && !tries.open;

  const fireInteraction = (
    type: 'word-marked' | 'word-unmarked' | 'submitted',
    payload: Record<string, unknown>,
  ): void => {
    onInteraction?.({ type, activityId: data.id, timestamp: Date.now(), payload });
  };

  const toggle = (index: number): void => {
    setActive(index);
    if (inactive) {
      return;
    }
    if (state === 'idle') {
      start();
    }
    const on = !markedSet.has(index);
    const next = on ? [...marks, index] : marks.filter((word) => word !== index);
    if (!isControlled) {
      setInternalMarks(next);
    }
    onChange?.(responseOf(next));
    fireInteraction(on ? 'word-marked' : 'word-unmarked', {
      index,
      word: words[index]?.text,
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last = words.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: Math.min(last, active + 1),
      ArrowDown: Math.min(last, active + 1),
      ArrowLeft: Math.max(0, active - 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    };
    if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      setActive(moves[event.key] as number);
      focusAfterRef.current = 'word';
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      // Enter would submit the form: here it marks, as Space does.
      event.preventDefault();
      toggle(active);
    }
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive) {
      return;
    }
    const response = responseOf(marks);
    onSubmit?.(response);

    if (isExam) {
      complete();
      setSummary(s.answerSubmitted);
      fireInteraction('submitted', { marked: response.marked });
      return;
    }

    const answer = score('mark-the-words', data as MarkTheWordsData, response);
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
            passed: computePassThreshold(data as MarkTheWordsData, costed),
          };
    const passed =
      counted.score === scoringResult.score
        ? scoringResult.passed
        : computePassThreshold(data as MarkTheWordsData, counted.score);
    const xapiStatement = xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [data.locale ?? 'en-US']: data.title },
        ...xapiDefinitionFor(data),
      },
      scoringResult,
      timeSpentMs: timeSpent,
      response: response.marked.join('[,]'),
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
    fireInteraction('submitted', { marked: response.marked, score: scoringResult.score });
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

  const wordMarks: WordMarks = (() => {
    if (isExam) {
      return { targets: new Set() };
    }
    if (isReview) {
      return outcome?.status === 'scored' ? wordMarksOf(outcome.details) : { targets: new Set() };
    }
    return wordMarksOf(result?.details ?? []);
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

  /** How a word reads once marked: right, wrong, or a target left unmarked. */
  const markOf = (index: number): 'correct' | 'wrong' | 'missed' | undefined => {
    if (!marking) {
      return undefined;
    }
    const isTarget = wordMarks.targets.has(index);
    if (markedSet.has(index)) {
      return isTarget ? 'correct' : 'wrong';
    }
    return isTarget && solutions ? 'missed' : undefined;
  };
  const markText = { correct: s.markCorrect, wrong: s.markWrong, missed: s.markMissed };

  // The text, with each word an option and everything between kept as written.
  const pieces: ReactNode[] = [];
  let at = 0;
  for (const word of words) {
    if (word.start > at) {
      pieces.push(data.text.slice(at, word.start));
    }
    const selected = markedSet.has(word.index);
    const mark = markOf(word.index);
    pieces.push(
      // biome-ignore lint/a11y/useKeyWithClickEvents: the listbox handles the keys, for every word at once
      <span
        key={word.index}
        role="option"
        className="lk-mw-word"
        aria-selected={selected}
        tabIndex={word.index === Math.min(active, words.length - 1) ? 0 : -1}
        data-word={word.index}
        data-mark={mark}
        // A checked word says how it was marked, after the word itself, so
        // the name still starts with what is on screen (WCAG 2.5.3).
        aria-label={mark === undefined ? undefined : `${word.text} (${markText[mark]})`}
        onClick={() => toggle(word.index)}
      >
        {word.text}
      </span>,
    );
    at = word.end;
  }
  if (at < data.text.length) {
    pieces.push(data.text.slice(at));
  }

  // Read defensively and never in exam: a redact() projection has no targets.
  const targetFeedback = isExam
    ? []
    : (Array.isArray((data as { targets?: unknown }).targets) ? data.targets : []).filter(
        (target) => typeof target.feedback === 'string' && target.feedback !== '',
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

  return (
    <form
      ref={formRef}
      className="lk-mw"
      aria-label={data.title}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      <ItemInstructions id={instructionsId} className="lk-mw-instructions" text={instructions} />
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
        <div
          ref={textRef}
          className="lk-mw-text"
          role="listbox"
          aria-multiselectable="true"
          aria-label={s.markWordsLabel}
          aria-describedby={instructions === undefined ? undefined : instructionsId}
          aria-disabled={inactive || undefined}
          onKeyDown={onKeyDown}
        >
          {pieces}
        </div>
        <p className="lk-mw-count">{s.markCount(marks.length)}</p>
        {marking && !feedbackHidden && targetFeedback.length > 0 ? (
          <ul className="lk-mw-feedback-list">
            {targetFeedback.map((target) => (
              <li key={`${target.text}#${target.occurrence ?? 1}`} role="note">
                <span className="lk-mw-feedback-target">{target.text}</span> {target.feedback}
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
      {marking && targetFeedback.length > 0 ? (
        <button
          type="button"
          className="lk-mw-feedback-toggle"
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
        response={{ type: 'mark-the-words', marked: [...marks] }}
        outcome={outcome}
        locale={locale}
        onInteraction={onInteraction}
        strings={s}
        delivery={tries.open ? { ...policy, solutions: false } : policy}
      />
    </form>
  );
}
