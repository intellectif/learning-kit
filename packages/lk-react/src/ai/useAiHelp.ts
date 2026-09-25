'use client';

import {
  type AiCoaching,
  type AiTextResult,
  type AiWritingFeedback,
  aiCoachingRequest,
  aiExplanationRequest,
  aiHintRequest,
  aiWritingFeedbackRequest,
  checkAiCoaching,
  checkAiExplanation,
  checkAiHint,
  checkAiWritingFeedback,
  combineDeliveryPolicies,
  type DeliveryPolicy,
  type GradeRecord,
  type InteractionEvent,
  type ItemOutcome,
  type LearnerResponse,
  type ReadAloudData,
  type SpeechAssessment,
} from '@intellectif/lk-core';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SequenceSlotContext } from '../components/shared/sequence-slot.js';
import type { RenderableActivity, RenderMode } from '../components/types.js';
import { type LearnerAi, useLearnerAi } from './LkAiProvider.js';
import {
  callPort,
  coachingOffered,
  explanationKey,
  explanationOffered,
  hintLimit,
  hintOffered,
  localeOf,
  warnRefused,
  writingFeedbackLimit,
  writingFeedbackOffered,
} from './rules.js';

/**
 * The question AI help is being asked about, as the SDK's own components know
 * it. A host drawing its own question passes what it has; everything optional
 * defaults to what the components pass.
 */
export interface AiHelpSituation {
  /** The question, as `data` is given to any activity component. */
  data: RenderableActivity;
  /** The learner's answer as it stands: submitted, restored, or being written. */
  response: LearnerResponse;
  /** Whether the learner has committed that answer. */
  submitted: boolean;
  /**
   * Pass on the `renderMode` your question was given. Left out, the paper
   * around the question answers for it — a question inside `<ActivitySequence>`
   * or `<InteractiveVideo>` knows its mode — and `practice` only where there is
   * no paper at all. An `exam` around the question wins over anything passed
   * here.
   */
  renderMode?: RenderMode;
  /**
   * The AI ports to use, overriding {@link LkAiProvider}'s for this question.
   * A question inside `<ActivitySequence>` or `<InteractiveVideo>` is handed
   * the ports in force as `ai` — pass that straight in.
   */
  ai?: LearnerAi;
  /** The interface language: the default language for what a model writes. */
  locale?: string;
  /** Where `ai-hint-shown` and `ai-explanation-shown` go. */
  onInteraction?: (event: InteractionEvent) => void;
  /**
   * The delivery policy your question was handed. The paper around the
   * question holds as well — a set that switched AI hints off keeps them off
   * here, whatever is passed — so leaving it out never turns anything on.
   */
  delivery?: DeliveryPolicy | null;
}

export interface AiExplanationInput extends AiHelpSituation {
  /** The grade of record, which `review` explains. */
  outcome?: ItemOutcome;
}

export interface AiExplanationHelp {
  /**
   * Whether to offer the learner an explanation at all: a port is present, the
   * answer is graded, the type is one the SDK explains, and the author left
   * explanations on. False in `exam`, always.
   */
  offered: boolean;
  status: 'idle' | 'loading' | 'shown' | 'unavailable';
  /** What to show, once it has arrived and been checked. Its `text` is text, never HTML. */
  explanation: AiTextResult | null;
  /**
   * Asks the port, when the learner presses something. Does nothing while a
   * call is on its way, and nothing at all where `offered` is false — so an
   * exam cannot reach a model through this hook, whatever ports are in scope.
   *
   * One identity for the life of the question, so it is safe in an effect's
   * dependencies.
   */
  ask: () => void;
}

export interface AiHintsInput extends AiHelpSituation {
  /** A disabled question gives no hints, as it takes no answer. */
  disabled?: boolean;
}

export interface AiHintsHelp {
  /**
   * Whether the learner may ask for hints here at all: a port is present, the
   * mode is `practice`, the answer is not in, the question is not disabled or
   * redacted, the type takes hints and the author left them on. It stays true
   * once `used` reaches `limit` — there are no more to give, but the question
   * is still one that gives them.
   */
  offered: boolean;
  status: 'idle' | 'loading' | 'unavailable';
  /** Every hint shown for this question, in the order they were given. */
  hints: readonly AiTextResult[];
  /** The host's `maxHints`, as a whole number from 1 to 10 (3 by default). */
  limit: number;
  /** How many hints have been shown. A refused hint is not counted. */
  used: number;
  /**
   * Asks for the next hint. Does nothing at the limit, while a call is on its
   * way, or where `offered` is false. One identity for the life of the
   * question.
   */
  ask: () => void;
}

/**
 * The mode a question is answered in: what the caller says, and what the paper
 * around it says.
 *
 * A host drawing its own question is given `renderMode` like every other prop
 * and is expected to pass it on, but nothing makes it — and a hook that took
 * `practice` on trust would offer hints on a paper of record, as soon as an
 * `LkAiProvider` sat anywhere above the pager. So an `exam` around the question
 * wins, and where the caller says nothing the paper answers for it. A question
 * standing on its own belongs to no paper, and is `practice` as before.
 */
function modeInForce(asked: RenderMode | undefined, around: RenderMode | undefined): RenderMode {
  if (around === 'exam') {
    return 'exam';
  }
  return asked ?? around ?? 'practice';
}

/**
 * What the record of help a learner was shown carries beside the fact of it:
 * who wrote it, and what the call cost — both only where the port sent them.
 *
 * The text is deliberately absent. A host that wants to keep what a learner
 * read has it in its own port; an interaction is a record of what happened, and
 * is kept for every learner and every question.
 */
function shownPayload(result: Pick<AiTextResult, 'provenance' | 'usage'>): Record<string, unknown> {
  return {
    ...(result.provenance !== undefined ? { provenance: result.provenance } : {}),
    ...(result.usage !== undefined ? { usage: result.usage } : {}),
  };
}

type ExplanationState =
  | { key: string; status: 'idle' | 'loading' | 'unavailable' }
  | { key: string; status: 'shown'; result: AiTextResult };

/**
 * "Explain my answer", without the SDK's own button and panel: the rules, the
 * call, the checks and the record, for a question you draw yourself.
 *
 * It is what `<MultipleChoice>` and the others use, so a host's own question
 * offers help on exactly the same terms: never in `exam`, never where the
 * item's author switched explanations off, and never an explanation whose
 * verdict contradicts the grade the SDK computed.
 *
 * ```tsx
 * const { offered, status, explanation, ask } = useAiExplanation({
 *   data, response, submitted, renderMode, outcome, ai: question.ai,
 * });
 * if (!offered) return null;
 * return explanation === null ? (
 *   <button type="button" onClick={ask} aria-busy={status === 'loading'}>Explain my answer</button>
 * ) : (
 *   <section>
 *     <p>{explanation.text}</p>
 *     <p>Written by AI. It can make mistakes.</p>
 *   </section>
 * );
 * ```
 *
 * **Say who wrote it.** The SDK's own panel carries "Written by AI. It can make
 * mistakes."; a page that drops that line passes a model's words off as the
 * course's.
 *
 * When the answer or its grade changes, the explanation is dropped and a call
 * still on its way is abandoned — a late explanation never lands beside an
 * answer it was not written for — as it is when the caller unmounts.
 */
export function useAiExplanation(input: AiExplanationInput): AiExplanationHelp {
  const { data, response, submitted, outcome } = input;
  const around = useContext(SequenceSlotContext);
  const renderMode = modeInForce(input.renderMode, around?.renderMode);
  const delivery = combineDeliveryPolicies(input.delivery, around?.delivery);
  const ai = useLearnerAi(input.ai);
  const resetKey = explanationKey(renderMode, submitted, response, outcome);
  const [state, setState] = useState<ExplanationState>({ key: resetKey, status: 'idle' });
  const run = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const current: ExplanationState =
    state.key === resetKey ? state : { key: resetKey, status: 'idle' };
  const offered =
    ai?.explain !== undefined &&
    explanationOffered({ data, renderMode, submitted, outcome, delivery });

  // What `ask` reads, as of this render, so `ask` itself can keep one identity
  // for the life of the question. The state goes in too: an event handler runs
  // after the render that set it, so the ref is what the learner last saw.
  const latest = useRef({ input, renderMode, ai, resetKey, offered, current });
  latest.current = { input, renderMode, ai, resetKey, offered, current };

  // Another answer, or the caller going away: abandon the call in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger — its cleanup runs when the answer changes
  useEffect(() => {
    return () => {
      run.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [resetKey]);

  const ask = useCallback((): void => {
    const now = latest.current;
    const port = now.ai?.explain;
    if (port === undefined || !now.offered || now.current.status === 'loading') {
      return;
    }
    const key = now.resetKey;
    const request = aiExplanationRequest({
      data: now.input.data,
      response: now.input.response,
      ...(now.renderMode === 'review' && now.input.outcome !== undefined
        ? { outcome: now.input.outcome }
        : {}),
      ...localeOf(now.ai, now.input.locale),
    });
    if (request === null) {
      setState({ key, status: 'unavailable' });
      return;
    }
    run.current += 1;
    const mine = run.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ key, status: 'loading' });
    callPort(() => port(request, { signal: abort.signal })).then(
      (raw) => {
        if (run.current !== mine) {
          return;
        }
        const checked = checkAiExplanation(raw, request);
        if (!checked.ok) {
          warnRefused('explanation', now.input.data.id, checked.refusal);
          setState({ key, status: 'unavailable' });
          latest.current.input.onInteraction?.({
            type: 'ai-help-refused',
            activityId: now.input.data.id,
            timestamp: Date.now(),
            payload: { feature: 'explanation', reason: checked.refusal },
          });
          return;
        }
        setState({ key, status: 'shown', result: checked.result });
        latest.current.input.onInteraction?.({
          type: 'ai-explanation-shown',
          activityId: now.input.data.id,
          timestamp: Date.now(),
          payload: shownPayload(checked.result),
        });
      },
      () => {
        if (run.current === mine) {
          setState({ key, status: 'unavailable' });
        }
      },
    );
  }, []);

  return {
    offered,
    status: current.status,
    explanation: current.status === 'shown' ? current.result : null,
    ask,
  };
}

interface HintState {
  key: string;
  hints: AiTextResult[];
  status: 'idle' | 'loading' | 'unavailable';
}

/**
 * "Get a hint", without the SDK's own button and list: the rules, the call, the
 * checks and the record, for a question you draw yourself.
 *
 * It is what `<MultipleChoice>` and the others use, so a host's own question
 * gives hints on exactly the same terms: only in `practice` before submit, up
 * to the host's limit, never on a redacted item or a type the SDK does not hint
 * for, and never a hint that gives the answer away — which is refused rather
 * than shown, and not counted.
 *
 * ```tsx
 * const { offered, status, hints, used, limit, ask } = useAiHints({
 *   data, response, submitted, renderMode, ai: question.ai,
 * });
 * ```
 *
 * **Say who wrote them**, as the SDK's own list does: "Written by AI. It can
 * make mistakes."
 *
 * Keep the hints on screen after submit — the learner can see what they were
 * given — while `offered` turns false. Another question starts with none.
 */
export function useAiHints(input: AiHintsInput): AiHintsHelp {
  const { data, submitted } = input;
  const around = useContext(SequenceSlotContext);
  const renderMode = modeInForce(input.renderMode, around?.renderMode);
  const delivery = combineDeliveryPolicies(input.delivery, around?.delivery);
  const disabled = input.disabled === true;
  const ai = useLearnerAi(input.ai);
  const resetKey = data.id;
  const [state, setState] = useState<HintState>({ key: resetKey, hints: [], status: 'idle' });
  const run = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const current: HintState =
    state.key === resetKey ? state : { key: resetKey, hints: [], status: 'idle' };
  const offered =
    ai?.hint !== undefined && hintOffered({ data, renderMode, submitted, disabled, delivery });
  const limit = hintLimit(ai);

  const latest = useRef({ input, renderMode, ai, offered, limit, current });
  latest.current = { input, renderMode, ai, offered, limit, current };

  // Another question, or the caller going away: abandon the call in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger — its cleanup runs when the question changes
  useEffect(() => {
    return () => {
      run.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [resetKey]);

  // Submitted, or disabled, while a hint was on its way: it would arrive for an
  // answer that can no longer use it.
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

  const ask = useCallback((): void => {
    const now = latest.current;
    const port = now.ai?.hint;
    const held = now.current;
    if (
      port === undefined ||
      !now.offered ||
      held.status === 'loading' ||
      held.hints.length >= now.limit
    ) {
      return;
    }
    const key = held.key;
    const request = aiHintRequest({
      data: now.input.data,
      response: now.input.response,
      previousHints: held.hints.map((hint) => hint.text),
      ...localeOf(now.ai, now.input.locale),
    });
    if (request === null) {
      setState({ ...held, status: 'unavailable' });
      return;
    }
    run.current += 1;
    const mine = run.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ ...held, status: 'loading' });
    callPort(() => port(request, { signal: abort.signal })).then(
      (raw) => {
        if (run.current !== mine) {
          return;
        }
        const checked = checkAiHint(raw, request);
        if (!checked.ok) {
          warnRefused('hint', now.input.data.id, checked.refusal);
          setState((shown) => ({ ...shown, status: 'unavailable' }));
          latest.current.input.onInteraction?.({
            type: 'ai-help-refused',
            activityId: now.input.data.id,
            timestamp: Date.now(),
            payload: {
              feature: 'hint',
              reason: checked.refusal,
              hintNumber: request.hintNumber,
            },
          });
          return;
        }
        setState((shown) => ({
          ...shown,
          hints: shown.key === key ? [...shown.hints, checked.result] : shown.hints,
          status: 'idle',
        }));
        latest.current.input.onInteraction?.({
          type: 'ai-hint-shown',
          activityId: now.input.data.id,
          timestamp: Date.now(),
          payload: { hintNumber: request.hintNumber, ...shownPayload(checked.result) },
        });
      },
      () => {
        if (run.current === mine) {
          setState((shown) => ({ ...shown, status: 'unavailable' }));
        }
      },
    );
  }, []);

  return {
    offered,
    status: current.status,
    hints: current.hints,
    limit,
    used: current.hints.length,
    ask,
  };
}

export interface AiWritingFeedbackInput extends AiHelpSituation {
  /** A disabled question takes no feedback, as it takes no answer. */
  disabled?: boolean;
}

export interface AiWritingFeedbackHelp {
  /**
   * Whether the learner may ask for feedback here at all: a port is present,
   * the mode is `practice`, the answer is not in, the question is a written
   * response that is not disabled or redacted, its author left explanations on,
   * and the paper shows feedback and solutions and allows AI explanations. It
   * stays true once `used` reaches `limit`.
   */
  offered: boolean;
  status: 'idle' | 'loading' | 'unavailable';
  /** Every piece of feedback shown for this question, oldest first. */
  feedback: readonly AiWritingFeedback[];
  /** The latest, or `null` before any. Its `text` is text, never HTML. */
  latest: AiWritingFeedback | null;
  /**
   * Whether `latest` is about the draft as it stands. Once the learner revises,
   * its corrections point at words that may no longer be there: say so.
   */
  current: boolean;
  /** The host's `maxWritingFeedback`, as a whole number from 1 to 10 (3 by default). */
  limit: number;
  /** How many times feedback has been shown. A refused reply is not counted. */
  used: number;
  /**
   * Asks for feedback on the draft as it stands. Does nothing at the limit,
   * while a call is on its way, on an empty draft, or where `offered` is false.
   * One identity for the life of the question.
   */
  ask: () => void;
}

interface WritingFeedbackState {
  key: string;
  shown: { feedback: AiWritingFeedback; about: string }[];
  status: 'idle' | 'loading' | 'unavailable';
}

/** The text of a written response; another type's response is no draft at all. */
const draftOf = (response: LearnerResponse): string =>
  response.type === 'written-response' ? response.text : '';

/**
 * "Get feedback on my draft", without the SDK's own button and panel: the
 * rules, the call, the checks and the record, for a written response you draw
 * yourself.
 *
 * It is what `<WrittenResponse>` uses, so a host's own essay box gets feedback
 * on the same terms: only in `practice` before submit, up to the host's limit,
 * and never feedback that corrects words the learner did not write — which is
 * refused rather than shown, and not counted.
 *
 * ```tsx
 * const { offered, status, latest, current, used, limit, ask } = useAiWritingFeedback({
 *   data, response, submitted, renderMode, ai: question.ai,
 * });
 * ```
 *
 * **Say who wrote it**, as the SDK's own panel does: "Written by AI. It can make
 * mistakes." And show `indicativeScore` as what it is — an indication, not a
 * grade.
 */
export function useAiWritingFeedback(input: AiWritingFeedbackInput): AiWritingFeedbackHelp {
  const { data, submitted, response } = input;
  const around = useContext(SequenceSlotContext);
  const renderMode = modeInForce(input.renderMode, around?.renderMode);
  const delivery = combineDeliveryPolicies(input.delivery, around?.delivery);
  const disabled = input.disabled === true;
  const ai = useLearnerAi(input.ai);
  const resetKey = data.id;
  const [state, setState] = useState<WritingFeedbackState>({
    key: resetKey,
    shown: [],
    status: 'idle',
  });
  const run = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const current: WritingFeedbackState =
    state.key === resetKey ? state : { key: resetKey, shown: [], status: 'idle' };
  const offered =
    ai?.writingFeedback !== undefined &&
    writingFeedbackOffered({ data, renderMode, submitted, disabled, delivery });
  const limit = writingFeedbackLimit(ai);

  const latest = useRef({ input, ai, offered, limit, current });
  latest.current = { input, ai, offered, limit, current };

  // Another question, or the caller going away: abandon the call in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger — its cleanup runs when the question changes
  useEffect(() => {
    return () => {
      run.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [resetKey]);

  // Submitted, or disabled, while feedback was on its way: it would arrive for
  // a draft that can no longer be revised.
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

  const ask = useCallback((): void => {
    const now = latest.current;
    const port = now.ai?.writingFeedback;
    const held = now.current;
    if (
      port === undefined ||
      !now.offered ||
      held.status === 'loading' ||
      held.shown.length >= now.limit
    ) {
      return;
    }
    const key = held.key;
    const about = draftOf(now.input.response);
    const request = aiWritingFeedbackRequest({
      data: now.input.data,
      response: now.input.response,
      previousFeedback: held.shown.map((one) => one.feedback.text),
      ...localeOf(now.ai, now.input.locale),
    });
    if (request === null) {
      // An empty draft: nothing to give feedback on, and nothing went wrong.
      return;
    }
    run.current += 1;
    const mine = run.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ ...held, status: 'loading' });
    callPort(() => port(request, { signal: abort.signal })).then(
      (raw) => {
        if (run.current !== mine) {
          return;
        }
        const checked = checkAiWritingFeedback(raw, request);
        if (!checked.ok) {
          warnRefused('writing feedback', now.input.data.id, checked.refusal);
          setState((was) => ({ ...was, status: 'unavailable' }));
          latest.current.input.onInteraction?.({
            type: 'ai-help-refused',
            activityId: now.input.data.id,
            timestamp: Date.now(),
            payload: {
              feature: 'writing-feedback',
              reason: checked.refusal,
              draftNumber: request.draftNumber,
            },
          });
          return;
        }
        const { feedback } = checked;
        setState((was) => ({
          ...was,
          shown: was.key === key ? [...was.shown, { feedback, about }] : was.shown,
          status: 'idle',
        }));
        latest.current.input.onInteraction?.({
          type: 'ai-writing-feedback-shown',
          activityId: now.input.data.id,
          timestamp: Date.now(),
          payload: {
            draftNumber: request.draftNumber,
            corrections: feedback.corrections.length,
            ...(feedback.indicativeScore !== null
              ? { indicativeScore: feedback.indicativeScore }
              : {}),
            ...shownPayload(feedback),
          },
        });
      },
      () => {
        if (run.current === mine) {
          setState((was) => ({ ...was, status: 'unavailable' }));
        }
      },
    );
  }, []);

  const last = current.shown[current.shown.length - 1];
  return {
    offered,
    status: current.status,
    feedback: current.shown.map((one) => one.feedback),
    latest: last?.feedback ?? null,
    current: last !== undefined && last.about === draftOf(response),
    limit,
    used: current.shown.length,
    ask,
  };
}

export interface AiCoachingInput {
  /**
   * The read-aloud item, as `data` is given to `<ReadAloud>` — or as much of
   * one as coaching reads: its id, title, text and language, and the author's
   * `instructions` and `ai` settings where it has them.
   */
  data: Pick<ReadAloudData, 'id' | 'title' | 'referenceText' | 'locale'> &
    Partial<Pick<ReadAloudData, 'instructions' | 'ai'>>;
  /**
   * The speech engine's assessment of the take, as the learner is shown it.
   * When given, it is the marks — each word's, with its sounds and what each
   * was heard as — and the only ones: see `aiCoachingRequest` in lk-core.
   */
  assessment?: SpeechAssessment | null;
  /**
   * The grade of record. Its score is context for the model; without an
   * assessment, its word details are the marks, and they carry no sounds.
   */
  grade?: GradeRecord | null;
  /**
   * Pass on the `renderMode` your reading was given. Coaching is never offered
   * in `exam`, and an `exam` around the reading wins over anything passed here.
   */
  renderMode?: RenderMode;
  /** The AI ports to use, overriding {@link LkAiProvider}'s for this reading. */
  ai?: LearnerAi;
  /** The interface language: the default language for what a model writes. */
  locale?: string;
  /** Where `ai-coaching-shown` and `ai-help-refused` go. */
  onInteraction?: (event: InteractionEvent) => void;
  /**
   * The delivery policy your reading was handed. Coaching needs feedback shown
   * and AI explanations allowed; the paper around the reading holds as well.
   */
  delivery?: DeliveryPolicy | null;
}

export interface AiCoachingHelp {
  /**
   * Whether to offer coaching at all: a `pronunciationCoaching` port is
   * present, there are marks to coach, the mode is not `exam`, the item's
   * author left explanations on, and the paper shows feedback and allows AI
   * explanations.
   */
  offered: boolean;
  status: 'idle' | 'loading' | 'shown' | 'unavailable';
  /**
   * What to show, once it has arrived and been checked: the coaching's text,
   * and the words it works on in reading order, each with its tip and, where
   * the engine reported one, the sound. All of it is text, never HTML.
   */
  coaching: AiCoaching | null;
  /**
   * Asks the port, when the learner presses something. Does nothing while a
   * call is on its way, once coaching is shown — one per reading — or where
   * `offered` is false. One identity for the life of the reading.
   */
  ask: () => void;
}

type CoachingState =
  | { key: string; status: 'idle' | 'loading' | 'unavailable' }
  | { key: string; status: 'shown'; coaching: AiCoaching };

/**
 * "Coach me on this reading", without the SDK's own button and panel: the
 * rules, the call, the checks and the record, for marks you draw yourself.
 *
 * It is what `<PronunciationFeedback>` and `<ReadAloud>` use, so a host's own
 * marks get coaching on the same terms: never in `exam`, never where the
 * item's author switched explanations off, and never coaching on a word the
 * engine did not mark or a sound it did not report — which is refused whole.
 *
 * ```tsx
 * const { offered, status, coaching, ask } = useAiCoaching({
 *   data: item, assessment, grade, renderMode, ai,
 * });
 * ```
 *
 * **Say who wrote it**, as the SDK's own panel does: "Written by AI. It can make
 * mistakes." The marks beside it are the engine's; the coaching is a model's.
 *
 * Another reading — other marks, another text — drops the coaching and
 * abandons a call still on its way, as the caller unmounting does.
 */
export function useAiCoaching(input: AiCoachingInput): AiCoachingHelp {
  const { data, assessment, grade } = input;
  const around = useContext(SequenceSlotContext);
  const renderMode = modeInForce(input.renderMode, around?.renderMode);
  const delivery = combineDeliveryPolicies(input.delivery, around?.delivery);
  const ai = useLearnerAi(input.ai);
  const { learnerLocale } = localeOf(ai, input.locale);
  const { id, title, referenceText, locale: itemLocale, instructions, ai: permissions } = data;

  // Built as the learner sees the marks, and rebuilt only when they change: the
  // fields, not the object, so a caller that spreads a fresh `data` on every
  // render does not realign the reading on every render.
  const request = useMemo(() => {
    const item = {
      type: 'read-aloud',
      id,
      title,
      referenceText,
      locale: itemLocale,
      instructions,
      ai: permissions,
    };
    return aiCoachingRequest({
      data: item,
      ...(assessment !== undefined && assessment !== null ? { assessment } : {}),
      ...(grade !== undefined && grade !== null ? { grade } : {}),
      ...(learnerLocale !== undefined ? { learnerLocale } : {}),
    });
  }, [
    id,
    title,
    referenceText,
    itemLocale,
    instructions,
    permissions,
    assessment,
    grade,
    learnerLocale,
  ]);
  // The reading the coaching is about: the take, and its marks. Another take is
  // another reading even where the engine marked it the same, and coaching
  // still on its way for the last one must not land on it. By content, not by
  // object, so a caller that rebuilds the same assessment keeps its coaching.
  const take = typeof assessment?.recordingKey === 'string' ? assessment.recordingKey : null;
  const resetKey = useMemo(
    () => (request === null ? '' : JSON.stringify([take, request])),
    [take, request],
  );
  const [state, setState] = useState<CoachingState>({ key: resetKey, status: 'idle' });
  const run = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const current: CoachingState = state.key === resetKey ? state : { key: resetKey, status: 'idle' };
  const offered =
    ai?.pronunciationCoaching !== undefined &&
    coachingOffered({
      data: { type: 'read-aloud', id, title, ai: permissions },
      renderMode,
      marked: request !== null,
      delivery,
    });

  const latest = useRef({ input, ai, request, resetKey, offered, current });
  latest.current = { input, ai, request, resetKey, offered, current };

  // Another reading, or the caller going away: abandon the call in flight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger — its cleanup runs when the marks change
  useEffect(() => {
    return () => {
      run.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [resetKey]);

  // No longer offered — the paper switched AI off, or the reading is now an
  // exam's — while coaching was on its way: it would land where none is allowed.
  useEffect(() => {
    if (!offered) {
      run.current += 1;
      controller.current?.abort();
      controller.current = null;
      setState((previous) =>
        previous.status === 'loading' ? { key: previous.key, status: 'idle' } : previous,
      );
    }
  }, [offered]);

  const ask = useCallback((): void => {
    const now = latest.current;
    const port = now.ai?.pronunciationCoaching;
    const request = now.request;
    if (
      port === undefined ||
      !now.offered ||
      request === null ||
      now.current.status === 'loading' ||
      now.current.status === 'shown'
    ) {
      return;
    }
    const key = now.resetKey;
    const activityId = request.facts.activityId;
    run.current += 1;
    const mine = run.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ key, status: 'loading' });
    callPort(() => port(request, { signal: abort.signal })).then(
      (raw) => {
        if (run.current !== mine) {
          return;
        }
        const checked = checkAiCoaching(raw, request);
        if (!checked.ok) {
          warnRefused('pronunciation coaching', activityId, checked.refusal);
          setState({ key, status: 'unavailable' });
          latest.current.input.onInteraction?.({
            type: 'ai-help-refused',
            activityId,
            timestamp: Date.now(),
            payload: { feature: 'pronunciation-coaching', reason: checked.refusal },
          });
          return;
        }
        const { coaching } = checked;
        setState({ key, status: 'shown', coaching });
        latest.current.input.onInteraction?.({
          type: 'ai-coaching-shown',
          activityId,
          timestamp: Date.now(),
          payload: { words: coaching.words.length, ...shownPayload(coaching) },
        });
      },
      () => {
        if (run.current === mine) {
          setState({ key, status: 'unavailable' });
        }
      },
    );
  }, []);

  return {
    offered,
    status: offered ? current.status : 'idle',
    coaching: offered && current.status === 'shown' ? current.coaching : null,
    ask,
  };
}
