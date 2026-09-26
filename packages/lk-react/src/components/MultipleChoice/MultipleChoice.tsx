'use client';

import {
  ActivitySchemaError,
  computePassThreshold,
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
import { type CSSProperties, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLearnerAi } from '../../ai/LkAiProvider.js';
import { useActivityState } from '../../hooks/useActivityState.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStrings } from '../../i18n/strings.js';
import {
  ANONYMOUS_ACTOR,
  isDevelopment,
  legacyCorrect,
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
 * {@link ScoringDetail.outcome} states this unambiguously. A detail stored
 * before lk-core 0.3 carries only a `correct` flag, which means "the learner
 * ACTED correctly on this option", not "this option is the answer"; the fact is
 * still recoverable, because we know whether the learner selected it:
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
      return wasSelected ? legacyCorrect(detail) === true : legacyCorrect(detail) !== true;
  }
}

/**
 * Announcement for `review` mode, built only from the server-supplied outcome.
 *
 * The authored overall feedback is appended by this function rather than being
 * baked into the score sentence, so a translation of "Score 80%. Passed." never
 * has to carry the author's words with it.
 */
function reviewAnnouncement(outcome: ItemOutcome | undefined, s: LkStrings): string | null {
  if (outcome === undefined) {
    return null;
  }
  if (outcome.status === 'scored') {
    const overall = outcome.feedback;
    return `${s.scoreAnnouncement(Math.round(outcome.score * 100), outcome.passed)}${
      overall ? ` ${overall}` : ''
    }`;
  }
  if (outcome.status === 'deferred') {
    // Never "0%": ungraded is not the same as wrong.
    return s.notGradedYet;
  }
  if (outcome.status === 'unscorable') {
    return s.noGradeAvailable;
  }
  // `graded` is left silent here deliberately: a returned GradeRecord on a
  // multiple-choice item has no rubric to render, and announcing a bare
  // percentage would duplicate what the marking already shows.
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
  mediaBudget,
  mediaStrings,
  onInteraction,
  theme,
  locale,
  disabled,
  shuffleSeed,
  strings,
  ai: aiProp,
  delivery,
  scoring,
}: MultipleChoiceProps) {
  const s = useLkStrings(strings);
  const ai = useLearnerAi(aiProp);
  const policy = useDeliveryPolicy(delivery);
  const scoringPolicy = useItemScoringPolicy(scoring);

  // Dev-only boundary validation. Throwing during render lets
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
  // Before anything that resets them: a new question starts with no tries.
  const tries = useTries({
    policy: scoringPolicy,
    graded: renderMode === 'practice' && policy.feedback,
    submitted: state === 'completed',
    disabled: disabled === true,
  });
  const resetTries = tries.reset;
  const closeQuestion = tries.close;
  // Uncontrolled state. `defaultValue` seeds the mount only (React convention);
  // to re-seed later, remount with a `key` or drive the component with `value`.
  const [internalSelection, setInternalSelection] = useState<string[]>(() =>
    selectionOf(defaultValue),
  );
  const [summary, setSummary] = useState<string | null>(null);
  // The authored overall feedback on the last graded answer, said after the
  // score and what the policy made of it.
  const [overall, setOverall] = useState<string | null>(null);
  // Hints the learner had been shown before this mount: a restored answer's
  // count stands, and the hints shown here add to it.
  const seedHintsRef = useRef(hintsOf(value ?? defaultValue));
  const rootRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const focusAfterRef = useRef<'answer' | 'feedback' | null>(null);

  // Reset on data-prop CHANGE. The identity guard makes the mount
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
    setOverall(null);
    seedHintsRef.current = hintsOf(defaultValueRef.current);
    resetTries();
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [data, reset, resetTries]);

  const displayedOptions = useMemo<MultipleChoiceOption[]>(() => {
    if (!data.shuffle) {
      return [...data.options];
    }
    // biome-ignore lint/suspicious/noAssignInExpressions: sanctioned lazy ref initialization
    const seedSource = shuffleSeed ?? (sessionIdRef.current ??= randomSessionId());
    // The seed string is unchanged from when the algorithm lived in this file,
    // so an order a consumer recorded against a seed still reproduces.
    return seededShuffle(data.options, `${seedSource}:${data.id}`, { version: 1 });
  }, [data, shuffleSeed]);

  // Per-option correctness for `review`, indexed by option id. Null unless the
  // caller supplied a SCORED outcome — the only source of truth this mode has.
  const reviewDetails = useMemo(() => {
    if (renderMode !== 'review' || outcome === undefined || outcome.status !== 'scored') {
      return null;
    }
    return new Map(outcome.details.map((detail) => [detail.itemId, detail]));
  }, [renderMode, outcome]);

  // Hints are a hook, so they are read here, before the throws below.
  const answered = state === 'completed';
  const chosen = value !== undefined ? selectionOf(value) : internalSelection;
  const aiHints = useComponentAiHints({
    ai,
    data,
    renderMode,
    submitted: answered,
    disabled: disabled === true,
    response: { type: 'multiple-choice', selectedOptionIds: chosen },
    locale,
    onInteraction,
    strings: s,
    delivery: policy,
  });
  // Every hint the learner has been shown on this question, counted from its
  // start: what a scoring policy charges for. Hints exist only in practice.
  const hintsRevealed = renderMode === 'practice' ? seedHintsRef.current + aiHints.used : 0;
  const responseOf = (selectedOptionIds: string[]): MultipleChoiceLearnerResponse => ({
    type: 'multiple-choice',
    selectedOptionIds,
    ...(hintsRevealed > 0 ? { hintsRevealed } : {}),
  });
  // A hint shown is part of the answer's record, so a host that restores an
  // answer restores what it cost: say so as it happens, not at the next click.
  const hintsSeenRef = useRef(aiHints.used);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new hint is the trigger, and the response it reports is this render's
  useEffect(() => {
    if (hintsSeenRef.current === aiHints.used) {
      return;
    }
    hintsSeenRef.current = aiHints.used;
    if (aiHints.used > 0) {
      onChange?.(responseOf(chosen));
    }
  }, [aiHints.used]);
  // After "Try again" the learner is back at their answer; after "Show answer"
  // the buttons they pressed are gone, and the result is what is left.
  useEffect(() => {
    const target = focusAfterRef.current;
    if (target === null) {
      return;
    }
    focusAfterRef.current = null;
    if (target === 'answer') {
      rootRef.current?.querySelector<HTMLElement>('input:not(:disabled)')?.focus();
    } else {
      feedbackRef.current?.focus();
    }
  });

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
  /**
   * What the delivery policy lets that reveal show. `marks`: right and wrong at
   * all, and the author's feedback. `solutions`: the right answer where the
   * learner did not choose it — without it, only the options the learner chose
   * are marked, so a missed correct option is not given away.
   */
  const marks = reveal && policy.feedback;
  // While the learner is offered another try, the right answer stays hidden:
  // the next try is for finding it.
  const solutions = marks && policy.solutions && !tries.open;

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
    onChange?.(responseOf(selectedOptionIds));
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
    const response = responseOf(selected);
    // Always first, and before anything that can throw: an exam runner must be
    // able to persist the raw response no matter what happens after.
    onSubmit?.(response);

    if (isExam) {
      // No score(), no answer key read, no onComplete, no xAPI — the server
      // grades. The announcement deliberately carries no correctness signal.
      complete();
      setSummary(s.answerSubmitted);
      fireInteraction('submitted', { selectedOptionIds: selected });
      return;
    }

    const answer = score('multiple-choice', data as MultipleChoiceData, response);
    complete();
    const timeSpent = getTimeSpent();
    // The question's score under the policy: this try's answer, less what its
    // hints and the tries before it cost, or an earlier try's. With no policy
    // it is exactly what the answer scored.
    const counted = tries.record({
      score: answer.score,
      maxScore: answer.maxScore,
      hintsRevealed,
    });
    const mine = counted.tries[counted.tries.length - 1];
    const costed = mine === undefined ? answer.score : mine.scored;
    // The statement records this try, at what it scored after its costs.
    const scoringResult =
      costed === answer.score
        ? answer
        : {
            ...answer,
            score: costed,
            passed: computePassThreshold(data as MultipleChoiceData, costed),
          };
    const passed =
      counted.score === scoringResult.score
        ? scoringResult.passed
        : computePassThreshold(data as MultipleChoiceData, counted.score);
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
    // Stamped, so a set this question sits in knows a later try replaces it.
    onComplete?.(
      stampTake(
        {
          score: counted.score,
          maxScore: counted.maxScore,
          passed,
          timeSpent,
          xapiStatement,
        },
        mintTake(),
      ),
    );
    // Core selects the authored overall feedback on `passed` (B3 fix): it is
    // the answer's, so it follows the answer's own grade.
    setOverall(answer.feedback);
    setSummary(
      `${s.answerSubmitted} ${s.scoreAnnouncement(Math.round(counted.score * 100), passed)}`,
    );
    fireInteraction('submitted', {
      selectedOptionIds: selected,
      score: scoringResult.score,
    });
  };

  /** "Try again": the answer stays, to be changed; the marks go. */
  const retry = (): void => {
    reset('idle');
    setSummary(null);
    setOverall(null);
    focusAfterRef.current = 'answer';
  };

  /** "Show answer": no more tries; the question shows what a finished one shows. */
  const closeTries = (): void => {
    closeQuestion();
    focusAfterRef.current = 'feedback';
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
    // An option the learner did not choose is marked only where solutions
    // show: marking the right one they missed would hand them the answer.
    const markable = marks && (solutions || checked);
    if (isReview) {
      const detail = reviewDetails?.get(option.id);
      correctness =
        !markable || detail === undefined ? undefined : String(isAnswerOption(detail, checked));
    } else if (markable) {
      correctness = String(option.isCorrect);
    }
    const media = option.media;
    // A picture goes INSIDE the label: it has no controls of its own, clicking
    // it is how a learner picks that option, and its `alt` joins the option's
    // accessible name. A recording cannot — see below.
    const picture =
      media?.type === 'image' ? (
        <img className="lk-mc-option-image" src={media.url} alt={media.alt ?? ''} />
      ) : null;

    const label = (
      <label className="lk-mc-option" data-correct={correctness}>
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
        {picture}
        {markable && option.feedback ? (
          <span className="lk-mc-option-feedback" role="note">
            {option.feedback}
          </span>
        ) : null}
      </label>
    );

    if (media?.type !== 'audio') {
      return <Fragment key={option.id}>{label}</Fragment>;
    }

    // A recording sits OUTSIDE the label, deliberately. A <label> activates its
    // control for any click inside it, so an <audio> nested in one would select
    // the option the moment the learner pressed play — and a listening item is
    // answered by comparing all the recordings before choosing any of them.
    // Selecting an option must stay something the learner does on purpose.
    return (
      <div className="lk-mc-option-media" key={option.id}>
        {label}
        {/* biome-ignore lint/a11y/useMediaCaption: captions are optional in the data contract — a <track> is rendered when captionsUrl is provided; absence is the author's documented choice */}
        <audio
          className="lk-mc-option-audio"
          src={media.url}
          controls
          preload="none"
          aria-label={media.alt ?? option.text}
        >
          {media.captionsUrl ? (
            <track kind="captions" src={media.captionsUrl} label={media.alt ?? option.text} />
          ) : null}
        </audio>
      </div>
    );
  });

  const extra =
    !isReview && policy.feedback && submitted && tries.counted !== null
      ? triesSummary(s, scoringPolicy, tries.counted, tries.open)
      : '';
  const announced =
    summary === null
      ? null
      : `${summary}${extra ? ` ${extra}` : ''}${overall ? ` ${overall}` : ''}`;

  return (
    <div className="lk-mc" lang={locale} style={theme as CSSProperties | undefined} ref={rootRef}>
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
          {aiHints.offered && renderMode === 'practice' ? (
            <HintCost policy={scoringPolicy} strings={s} />
          ) : null}
          <AiHints help={aiHints} ai={ai} strings={s} />
          {/* review is read-only: there is nothing left to submit. */}
          {isReview ? null : (
            <button type="submit" disabled={inactive}>
              {s.submit}
            </button>
          )}
        </fieldset>
      </form>
      <FeedbackRegion
        id={`${data.id}-feedback`}
        {...(scoringPolicy.retries > 0 ? { ref: feedbackRef } : {})}
      >
        {feedbackAnnouncement({
          review: isReview,
          feedback: policy.feedback,
          outcome,
          readBack: reviewAnnouncement(outcome, s),
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
        response={{ type: 'multiple-choice', selectedOptionIds: selected }}
        outcome={outcome}
        locale={locale}
        onInteraction={onInteraction}
        strings={s}
        // An explanation all but always names the answer: not while another
        // try is on offer.
        delivery={tries.open ? { ...policy, solutions: false } : policy}
      />
    </div>
  );
}
