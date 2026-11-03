'use client';

import {
  type ActivityResult,
  type InteractionEvent,
  type InteractionKind,
  type LearnerResponse,
  type ReadAloudLearnerResponse,
  type RecordingRef,
  type SpeakingResponseLearnerResponse,
  xAPIBuilder,
  xapiDefinitionFor,
} from '@intellectif/lk-core';
import {
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useActivityState } from '../../hooks/useActivityState.js';
import type { RecordedTake, SpeechRecorderStatus } from '../../hooks/useSpeechRecorder.js';
import { type SpeechRecorder, useSpeechRecorder } from '../../hooks/useSpeechRecorder.js';
import type { LkStrings } from '../../i18n/strings.js';
import { ANONYMOUS_ACTOR, objectIdFor } from '../_internal.js';
import { secondsWithin } from '../ReadAloud/recording-bounds.js';
import type { RenderMode } from '../types.js';
import { joinCaptureGroup } from './capture-registry.js';
import { usePlaybackRefusal } from './playback-refusal.js';
import { type AssessReading, fractionOfGrade, type ReadGrade } from './read-grade.js';
import { mintTake, SequenceSlotContext, stampTake, type TakeState } from './sequence-slot.js';

/**
 * The take lifecycle a recorded answer shares, whatever it answers: a reading
 * (`<ReadAloud>`) or a spoken answer to a prompt (`<SpeakingResponse>`).
 *
 * Capture, the preview of the take, its upload, the judgement that may come
 * back, a retry of whichever step failed, what a pager is told about each take,
 * the release of the microphone when a pane hides, and the reset when the item
 * becomes a different one. Everything here was written for `<ReadAloud>` and
 * hardened there; it lives here so a second recorded type cannot drift from it.
 * Each component keeps what is its own: what it validates, what makes two items
 * the same item, how it reads a judgement, and what it shows.
 */

/** The level meter's resolution, in steps the skin can select on. */
const LEVEL_STEPS = 10;

/** The recorded types: each answer is a key in the application's storage. */
export type RecordedType = 'read-aloud' | 'speaking-response';

/**
 * How far the submitted take has got. `idle` also means "nothing submitted yet".
 *
 * Every other phase names its `take`, the number `mintTake` gave the submit
 * that reached it: a phase describes one take, and a pager told about it must
 * be able to tell that take from the one before it.
 */
export type SubmitPhase =
  | { kind: 'idle' }
  | { kind: 'uploading'; take: number }
  | { kind: 'upload-failed'; take: number }
  | { kind: 'assessing'; take: number }
  | { kind: 'submitted'; take: number }
  | { kind: 'unassessed'; take: number }
  /**
   * The assessor's judgement, as the component's reader read it: `grade` is
   * `null` when what came back cannot be shown as a grade, and `assessment` is
   * `null` when there is no evidence to show.
   */
  | {
      kind: 'graded';
      take: number;
      reading: Extract<AssessReading, { status: 'graded' }>;
    }
  | { kind: 'unscorable'; take: number; code: string | undefined }
  /** Judged, and waiting for a person's grade: the take is settled, and nothing is scored. */
  | { kind: 'pending'; take: number }
  | { kind: 'assess-failed'; take: number; retryable: boolean };

/**
 * Whether the screen offers "Try again" for the take this phase describes —
 * the one answer to that question, read by the button that offers it and by
 * the take state a pager is told, so the two cannot disagree. A retry re-sends
 * the SAME take: a take that failed to upload is sent again, and a stored take
 * whose assessment failed is judged again without being uploaded twice.
 */
function offersRetry(phase: SubmitPhase, uploaded: RecordingRef | null): boolean {
  return (
    phase.kind === 'upload-failed' ||
    (phase.kind === 'assess-failed' && phase.retryable && uploaded !== null)
  );
}

/**
 * The state of the phase's take, as a pager deciding whether its set is
 * finished reads it. Derived from the phase alone, so no path through a submit
 * can leave a pager waiting on a take this component has finished with: every
 * path ends in a phase.
 */
function takeStateOf(phase: SubmitPhase, uploaded: RecordingRef | null): TakeState {
  if (phase.kind === 'uploading' || phase.kind === 'assessing') {
    return 'in-flight';
  }
  return offersRetry(phase, uploaded) ? 'retryable' : 'settled';
}

/**
 * Whether the recorder is capturing, or about to: the one answer to "is a take
 * being recorded", read by everything that must hold still for one. A
 * permission prompt counts — a prompt answered after the pane went away would
 * otherwise open a microphone nobody is in front of, and a model recording
 * played while the prompt is up would be charged a play and then silenced.
 */
export function capturing(status: SpeechRecorderStatus): boolean {
  return status === 'recording' || status === 'requesting-permission';
}

/** The stored take a learner response points at, or `null` for a blank or another type. */
function recordingOf(
  response: LearnerResponse | undefined,
  type: RecordedType,
): RecordingRef | null {
  return response !== undefined && response.type === type
    ? (response as ReadAloudLearnerResponse | SpeakingResponseLearnerResponse).recording
    : null;
}

/** The response a recorded answer emits; `takes` is written only when one was made. */
function responseOf(
  type: RecordedType,
  recording: RecordingRef | null,
  takes: number,
): ReadAloudLearnerResponse | SpeakingResponseLearnerResponse {
  return { type, recording, ...(takes > 0 ? { takes } : {}) };
}

/** How a take reaches the application, as the shared lifecycle calls it. */
export interface TakeBinding {
  upload(take: RecordedTake): Promise<RecordingRef>;
  assess?(ref: RecordingRef): Promise<unknown>;
  playbackUrl?(ref: RecordingRef): Promise<string>;
}

export interface RecordedAnswerOptions {
  type: RecordedType;
  /** The item, as its statement names it and its events are filed under. */
  data: { type: string; id: string; title: string; locale?: unknown };
  /**
   * What makes a take a take OF this item: a change to it is a different item,
   * and a take of the old one answers nothing. See `<ReadAloud>`'s
   * `readingKeyOf` for why it is never the identity of `data`.
   */
  readingKey: string;
  /** The bounds the recorder is given, as `readRecordingBounds` clamped them. */
  bounds: { maxSeconds: number; minSeconds: number | undefined; maxTakes: number | undefined };
  binding: TakeBinding | undefined;
  renderMode: RenderMode;
  disabled: boolean | undefined;
  value: LearnerResponse | undefined;
  defaultValue: LearnerResponse | undefined;
  defaultSubmitted: boolean | undefined;
  onSubmit: ((response: LearnerResponse) => void) | undefined;
  onComplete: ((result: ActivityResult) => void) | undefined;
  onInteraction: ((event: InteractionEvent) => void) | undefined;
  workletUrl: string | undefined;
  /** The one reader of what `assess` returned. Read once per answer. */
  readResult: (answer: unknown) => AssessReading;
}

export interface RecordedAnswer {
  recorder: SpeechRecorder;
  phase: SubmitPhase;
  submitted: boolean;
  /** Nothing can be recorded or sent: disabled, committed, or a review. */
  inactive: boolean;
  /** Uploading or assessing. */
  busy: boolean;
  takesLeft: number | undefined;
  /** Whether "Try again" is offered for the take on screen. */
  retryOffered: boolean;
  /** The learner's own take, as everything that plays it plays it. */
  takeAudio: string | null;
  playback: ReturnType<typeof usePlaybackRefusal>;
  /** Re-keys the alert so the SAME message announces again. */
  errorNonce: number;
  isCapturing: boolean;
  /** Item media inside it stays silent while a take is captured. */
  mediaRef: RefObject<HTMLDivElement | null>;
  /** The submit button, where focus goes when a retry takes its button away. */
  submitRef: RefObject<HTMLButtonElement | null>;
  handleSubmit: (event: React.FormEvent) => void;
  beginTake: () => void;
  submitBlank: () => void;
  retry: () => void;
}

/**
 * The shared take lifecycle. Call it before any throw, so hook order stays
 * stable; the component throws for its own reasons afterwards.
 */
export function useRecordedAnswer(options: RecordedAnswerOptions): RecordedAnswer {
  const {
    type,
    data,
    readingKey,
    bounds,
    renderMode,
    disabled,
    value,
    defaultValue,
    defaultSubmitted,
    onSubmit,
    onComplete,
    workletUrl,
  } = options;
  const { maxSeconds, minSeconds, maxTakes } = bounds;
  const isExam = renderMode === 'exam';
  const isReview = renderMode === 'review';
  // The pager slot this component sits in, if any: the capture group its pane
  // stops, and where the state of each take is reported. A context and never a
  // prop, so none of it is on a component's published signature — a consumer
  // string in a prop could stop another pager's microphone. `null` for a
  // standalone component, which then belongs to no group at all and releases
  // the microphone from its own unmount alone.
  const slot = useContext(SequenceSlotContext);
  const captureGroup = slot?.captureGroup;

  const recorder = useSpeechRecorder(
    useMemo(
      () => ({
        maxDurationMs: maxSeconds * 1000,
        ...(minSeconds !== undefined ? { minDurationMs: minSeconds * 1000 } : {}),
        ...(maxTakes !== undefined ? { maxTakes } : {}),
        // Forwarded, never defaulted: without it the recorder mints its own
        // `blob:` module, which is the one a strict policy refuses.
        ...(workletUrl !== undefined ? { workletUrl } : {}),
      }),
      [maxSeconds, minSeconds, maxTakes, workletUrl],
    ),
  );

  const { state, start, complete, getTimeSpent, reset } = useActivityState(
    defaultSubmitted === true ? 'completed' : 'idle',
  );
  const [phase, setPhase] = useState<SubmitPhase>({ kind: 'idle' });
  const [uploaded, setUploaded] = useState<RecordingRef | null>(null);
  const [takeUrl, setTakeUrl] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  // Re-keys the alert so the SAME message announces again — a learner who is
  // refused the microphone twice hears it twice.
  const [errorNonce, setErrorNonce] = useState(0);

  // The latest callbacks, so an effect can fire an event without depending on a
  // binding or a handler the host rebuilds on every render.
  const interactionRef = useRef(options.onInteraction);
  interactionRef.current = options.onInteraction;
  const bindingRef = useRef(options.binding);
  bindingRef.current = options.binding;
  const readResultRef = useRef(options.readResult);
  readResultRef.current = options.readResult;
  // Guards a second submit while one is in flight: two clicks would upload the
  // same take twice and charge the application for two assessments.
  const submittingRef = useRef(false);
  // Which reading this instance is on. Everything asynchronous reads it once
  // and re-reads it after every await, so an instance that has been unmounted,
  // or handed a different reading, reports nothing for the one it has left —
  // the treatment the playback-url effect below already gives itself.
  //
  // A counter rather than the boolean `live` that effect uses, because a
  // boolean cleared on the reading reset would stay cleared and leave a
  // perfectly live component unable to submit its next take.
  const runRef = useRef(0);
  // The pager slot as of the latest render, and the last take it was told
  // about, so an unmount can tell it that take is over — a take whose result
  // this instance will now never report must not hold a set open for ever.
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const reportedTakeRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      runRef.current += 1;
      const take = reportedTakeRef.current;
      if (take !== null) {
        slotRef.current?.takeState(take, 'settled');
      }
    },
    [],
  );

  const fire = useCallback(
    (kind: InteractionKind, payload: Record<string, unknown>): void => {
      interactionRef.current?.({ type: kind, activityId: data.id, timestamp: Date.now(), payload });
    },
    [data.id],
  );

  // `recording-started` and `recording-stopped` are reported from the recorder's
  // own status rather than from the click handlers: a take also ends when it
  // reaches its bound, and a handler would report only the ends a learner asked
  // for.
  const lastStatusRef = useRef<SpeechRecorderStatus>(recorder.status);
  useEffect(() => {
    if (lastStatusRef.current === recorder.status) {
      return;
    }
    lastStatusRef.current = recorder.status;
    if (recorder.status === 'recording') {
      fire('recording-started', { takes: recorder.takesUsed, durationMs: 0 });
    } else if (recorder.status === 'recorded' && recorder.take !== null) {
      fire('recording-stopped', {
        takes: recorder.takesUsed,
        durationMs: recorder.take.durationMs,
      });
    }
  }, [recorder.status, recorder.take, recorder.takesUsed, fire]);

  useEffect(() => {
    if (recorder.error !== null) {
      setErrorNonce((nonce) => nonce + 1);
    }
  }, [recorder.error]);

  // The take preview. Guarded because an embedder may forbid object URLs, and a
  // preview is worth less than the take it previews.
  const take = recorder.take;
  useEffect(() => {
    if (take === null || typeof URL.createObjectURL !== 'function') {
      return;
    }
    const url = URL.createObjectURL(take.blob);
    setTakeUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setTakeUrl(null);
    };
  }, [take]);

  const restored = recordingOf(value ?? defaultValue, type);
  const restoredKey = restored?.key ?? null;
  // Keyed by the reading as well as the take: the reading reset below clears
  // the link, and a link nothing mints again would leave the stored take with
  // no player for as long as it stays on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the stored take and the reading, not by the identity of a response object a host rebuilds every render
  useEffect(() => {
    const binding = bindingRef.current;
    if (!isReview || restored === null || binding?.playbackUrl === undefined) {
      return;
    }
    let live = true;
    void Promise.resolve(binding.playbackUrl(restored)).then(
      (url) => {
        if (live) {
          setPlaybackUrl(url);
        }
      },
      () => {
        /* a link that could not be minted; the marks still render without it */
      },
    );
    return () => {
      live = false;
    };
  }, [isReview, restoredKey, readingKey]);

  // What the registry may do to this component, and it is narrow: release the
  // DEVICE, and only while one is actually open.
  //
  // The pager stops a hidden slot's captures on EVERY hidden transition, so a
  // join that discarded unconditionally threw away a take that was already
  // encoded — and `discard` deliberately refunds nothing, so Next then Prev
  // left the learner an activity they could no longer answer and no message
  // saying why. That contradicts the pager's own founding principle: slots stay
  // mounted precisely so nobody silently loses an answer. A capture still
  // running has nothing to lose yet; a finished take has everything.
  //
  // The status is read from a ref so this callback keeps ONE identity and the
  // effect below joins the group exactly once, as `playback-group`'s does.
  const statusRef = useRef(recorder.status);
  statusRef.current = recorder.status;
  const releaseMicrophone = useCallback(() => {
    if (capturing(statusRef.current)) {
      recorder.discard();
    }
  }, [recorder.discard]);

  // The registry SUPPLEMENTS the recorder's own unmount cleanup; it covers the
  // one case that cleanup cannot, a component left mounted and merely hidden.
  useEffect(() => {
    if (captureGroup === undefined) {
      return;
    }
    return joinCaptureGroup(captureGroup, releaseMicrophone);
  }, [captureGroup, releaseMicrophone]);

  // Identity-guarded so the mount run is a no-op: without it this fires after
  // the first paint and undoes every seed it was just given.
  const defaultSubmittedRef = useRef(defaultSubmitted);
  useEffect(() => {
    defaultSubmittedRef.current = defaultSubmitted;
  }, [defaultSubmitted]);
  // Keyed by the READING, never by the identity of `data` — see `readingKeyOf`
  // for the regression that identity caused. A host that rebuilds an
  // unchanged item keeps the take, the budget and any grade still in flight.
  const lastReadingRef = useRef(readingKey);
  useEffect(() => {
    if (lastReadingRef.current === readingKey) {
      return;
    }
    lastReadingRef.current = readingKey;
    submittingRef.current = false;
    // Anything still in flight belongs to the reading that has just left.
    runRef.current += 1;
    setPhase({ kind: 'idle' });
    setUploaded(null);
    setPlaybackUrl(null);
    // `reset`, not `discard`: the takes belong to the READING, and `discard`
    // refunds none of them on purpose. A new reading that inherited the old
    // one's spent takes renders a recorder that looks live and refuses to
    // record — reachable in `<ActivityPreview>`, whose remount key is derived
    // from the media alone, so an author who tries one take and then edits the
    // reference text can never record again without reloading the page.
    recorder.reset();
    reset(defaultSubmittedRef.current === true ? 'completed' : 'idle');
  }, [readingKey, reset, recorder.reset]);

  // What became of each take, told to the pager slot this sits in: the one
  // channel through which a sequence learns whether its set can be reported.
  //
  // Read from the committed PHASE, and only from it. Every way a submit can end
  // — a grade, a take with no grade, a failure, a retry, a learner recording
  // again, a reading reset — ends in a phase, so none of them can leave a set
  // waiting on a take this component is done with. And an effect runs after
  // the commit, which is after `onSubmit` and `onComplete` were called for the
  // same phase: a pager told a take has settled has already been handed
  // everything that take produced. The one state that must not wait for a
  // commit — a take on its way — is reported as the submit starts.
  const phaseTake = phase.kind === 'idle' ? null : phase.take;
  const phaseTakeState = takeStateOf(phase, uploaded);
  useEffect(() => {
    // An idle phase settles the take before it: re-recording drops a take
    // whose failure was being offered a retry, and so does a reading reset.
    const take = phaseTake ?? reportedTakeRef.current;
    if (slot === null || take === null) {
      return;
    }
    reportedTakeRef.current = take;
    slot.takeState(take, phaseTakeState);
  }, [slot, phaseTake, phaseTakeState]);

  // Item recordings stay silent for as long as the learner records: a
  // microphone that hears the model reading would assess the model's
  // pronunciation, not theirs.
  //
  // Pausing once, when the capture starts, is not enough — the play controls
  // are still on screen and still work throughout the take, so the hazard
  // simply moves one door along. The listener holds the guard for the whole
  // capture and is removed with it; `play` does not bubble, so it is taken in
  // the capture phase. It is what silences the browser's own control bar; a
  // budgeted model is refused before it is charged, by the `disabled` its
  // player is rendered with.
  const mediaRef = useRef<HTMLDivElement>(null);
  const isCapturing = capturing(recorder.status);
  useEffect(() => {
    if (!isCapturing) {
      return;
    }
    const node = mediaRef.current;
    if (node === null) {
      return;
    }
    const hush = (): void => {
      for (const media of node.querySelectorAll('audio, video')) {
        const element = media as HTMLMediaElement;
        if (!element.paused) {
          element.pause();
        }
      }
    };
    hush();
    node.addEventListener('play', hush, true);
    return () => {
      node.removeEventListener('play', hush, true);
    };
  }, [isCapturing]);

  // The learner's own take, as every element that plays it plays it: the
  // preview before it is sent, the stored link a review mints, and the
  // per-word buttons in the feedback panel. One refusal covers all of them.
  const takeAudio = isReview ? playbackUrl : takeUrl;
  const playback = usePlaybackRefusal(takeAudio);
  // Where focus goes when a retry takes the "Try again" button away: the
  // submit it retries, which says it is busy for as long as the retry runs.
  const submitRef = useRef<HTMLButtonElement>(null);

  const submitted = state === 'completed';
  const inactive = disabled === true || submitted || isReview;
  const busy = phase.kind === 'uploading' || phase.kind === 'assessing';
  const takesLeft = maxTakes === undefined ? undefined : Math.max(0, maxTakes - recorder.takesUsed);

  /** Marks a failure so the alert announces even when the sentence repeats. */
  const raise = (next: SubmitPhase): void => {
    setErrorNonce((nonce) => nonce + 1);
    setPhase(next);
  };

  /**
   * Tells the pager slot, if there is one, that `take` is on its way — before
   * anything is awaited. The report a pager's set waits on must exist before
   * the first result it waits for can arrive; the take's later states follow
   * from the phase it reaches (see the effect above).
   */
  const beginTakeReport = (take: number): void => {
    reportedTakeRef.current = take;
    slot?.takeState(take, 'in-flight');
  };

  const runAssess = async (
    ref: RecordingRef,
    current: RecordedTake | null,
    take: number,
  ): Promise<void> => {
    const assess = bindingRef.current?.assess;
    const durationMs = current?.durationMs ?? 0;
    const takes = recorder.takesUsed;
    const run = runRef.current;
    if (assess === undefined) {
      // D5: a binding that stores but does not judge is a supported binding,
      // not a mistake — it is what an authoring preview supplies.
      setPhase({ kind: 'unassessed', take });
      return;
    }
    setPhase({ kind: 'assessing', take });
    fire('assessment-requested', { takes, durationMs });
    let answer: unknown;
    try {
      answer = await assess(ref);
    } catch {
      // Detached while the assessor was working: an instance that has been
      // unmounted, or handed a different reading, reports nothing for the one
      // it has left — not a phase, not an event, and not a grade.
      if (run !== runRef.current) {
        return;
      }
      raise({ kind: 'assess-failed', take, retryable: true });
      fire('assessment-failed', { takes, durationMs, retryable: true });
      return;
    }
    if (run !== runRef.current) {
      return;
    }
    // Read once, here, and nothing below touches `answer` again: the phase the
    // screen renders from, `onComplete` and the statement all take what the
    // reader returned, so they cannot disagree about what came back.
    const result = readResultRef.current(answer);
    if (result.status === 'failed') {
      raise({ kind: 'assess-failed', take, retryable: result.retryable });
      fire('assessment-failed', { takes, durationMs, retryable: result.retryable });
      return;
    }
    if (result.status === 'unscorable') {
      // Reported as a failed assessment because that is what it is to a
      // consumer's log — a take that produced no grade — and `code` says which
      // kind. `retryable` is true because another take is offered.
      setPhase({ kind: 'unscorable', take, code: result.code });
      fire('assessment-failed', {
        takes,
        durationMs,
        retryable: true,
        ...(result.code !== undefined ? { code: result.code } : {}),
      });
      return;
    }
    if (result.status === 'pending') {
      // Judged, and sent to a person: no grade to report yet, and no failure.
      // The take is settled; its grade reaches the host by its own route.
      setPhase({ kind: 'pending', take });
      return;
    }
    const timeSpent = getTimeSpent();
    setPhase({ kind: 'graded', take, reading: result });
    const grade = result.grade;
    if (grade === null) {
      // A judgement that carries no grade the reader can show is not an
      // `ActivityResult`: reporting one would mean inventing the score, exactly
      // as an `unscorable` result would. To a consumer's log it is what an
      // unscorable take is — an assessment that produced no grade, with another
      // take offered.
      fire('assessment-failed', { takes, durationMs, retryable: true });
      return;
    }
    onComplete?.(stampTake(resultOf(data, grade, result.responseText, timeSpent), take));
  };

  const submitTake = async (current: RecordedTake | null): Promise<void> => {
    const binding = bindingRef.current;
    if (inactive || submittingRef.current || binding === undefined) {
      return;
    }
    submittingRef.current = true;
    const takes = recorder.takesUsed;
    const run = runRef.current;
    // Every submit is a take of its own, a retried upload included: a number
    // no earlier submit on this page had, so whatever an earlier one still
    // brings back cannot be taken for this one's.
    const take = mintTake();
    beginTakeReport(take);
    try {
      let ref: RecordingRef | null = null;
      if (current !== null) {
        setPhase({ kind: 'uploading', take });
        try {
          ref = await binding.upload(current);
        } catch {
          if (run !== runRef.current) {
            return;
          }
          // The take never reached storage, so nothing is submitted: a take
          // that failed to upload must not become a blank response.
          raise({ kind: 'upload-failed', take });
          fire('recording-upload-failed', {
            takes,
            durationMs: current.durationMs,
            retryable: true,
          });
          return;
        }
        // Detached while the take travelled. The bytes are in the application's
        // storage and this instance drops their key, which is a smaller cost
        // than the alternative: `onSubmit` carries no activity id, so a
        // response reported for a reading the learner has left is one a pager
        // would file against whatever is on screen now.
        if (run !== runRef.current) {
          return;
        }
        setUploaded(ref);
        fire('recording-uploaded', { takes, durationMs: current.durationMs });
      }
      onSubmit?.(stampTake(responseOf(type, ref, takes), take));
      fire('submitted', { takes, durationMs: current?.durationMs ?? 0 });
      if (isExam || ref === null) {
        // Exam never assesses, never scores, never reveals, and builds no xAPI
        // statement: its `correctResponsesPattern` would be the answer key, and
        // a recorded answer is graded on a server from the stored bytes.
        complete();
        setPhase({ kind: 'submitted', take });
        return;
      }
      await runAssess(ref, current, take);
    } finally {
      submittingRef.current = false;
    }
  };

  /**
   * Judges the take that is already stored, again — the SAME take, so the same
   * number. Guarded like a submit: an assessment costs an application money,
   * and two presses of one retry must not buy two of them.
   */
  const retryAssess = async (ref: RecordingRef, take: number): Promise<void> => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    beginTakeReport(take);
    try {
      await runAssess(ref, recorder.take, take);
    } finally {
      submittingRef.current = false;
    }
  };

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (inactive || busy || recorder.take === null || phase.kind !== 'idle') {
      return;
    }
    void submitTake(recorder.take);
  };

  const beginTake = (): void => {
    if (inactive || busy || !recorder.canRecord) {
      return;
    }
    if (recorder.take !== null) {
      fire('recording-discarded', {
        takes: recorder.takesUsed,
        durationMs: recorder.take.durationMs,
      });
    }
    setPhase({ kind: 'idle' });
    setUploaded(null);
    start();
    void recorder.start();
  };

  const submitBlank = (): void => {
    if (!busy) {
      void submitTake(null);
    }
  };

  const retry = (): void => {
    // The retry takes this button away with the phase it answers, and focus on
    // a removed element drops to the page body — a keyboard learner is then
    // back at the top of the page with no idea the retry started. It goes to
    // the submit being retried.
    submitRef.current?.focus();
    if (phase.kind === 'upload-failed') {
      void submitTake(recorder.take);
    } else if (phase.kind === 'assess-failed' && uploaded !== null) {
      void retryAssess(uploaded, phase.take);
    }
  };

  return {
    recorder,
    phase,
    submitted,
    inactive,
    busy,
    takesLeft,
    retryOffered: offersRetry(phase, uploaded),
    takeAudio,
    playback,
    errorNonce,
    isCapturing,
    mediaRef,
    submitRef,
    handleSubmit,
    beginTake,
    submitBlank,
    retry,
  };
}

/**
 * The result `onComplete` receives for a judged take, with its statement.
 *
 * xAPI's `score.scaled` is a fraction in [-1, 1], and the SDK's builder writes
 * `ScoringResult.score` into it verbatim, then validates — so a points-based
 * grade (82 out of 100, which `GradeRecord` allows and a grader's own units
 * readily produce) does not merely ship a wrong number: the build THROWS, and
 * the grade never reaches the screen at all. The read grade's fraction is in
 * 0..1 by construction, and `passed` is a boolean by construction, so the
 * statement validates whatever the host sent. The learner's own numbers go to
 * `onComplete` untouched.
 */
function resultOf(
  data: RecordedAnswerOptions['data'],
  grade: ReadGrade,
  responseText: string | undefined,
  timeSpent: number,
): ActivityResult {
  const locale = typeof data.locale === 'string' ? data.locale : 'en-US';
  return {
    score: grade.score,
    maxScore: grade.maxScore,
    passed: grade.passed,
    timeSpent,
    xapiStatement: xAPIBuilder.buildAnsweredStatement({
      actor: ANONYMOUS_ACTOR,
      object: {
        id: objectIdFor(data.id),
        name: { [locale]: data.title },
        ...xapiDefinitionFor(data),
      },
      timeSpentMs: timeSpent,
      response: responseText ?? '',
      // `ScoringResult.details` is required where `GradeRecord.details` is
      // optional, and an empty list is the honest reading of "no per-word
      // marks were stored" — never a mark of its own.
      scoringResult: {
        score: fractionOfGrade(grade),
        maxScore: 1,
        passed: grade.passed,
        feedback: grade.feedback,
        details: grade.details ?? [],
      },
    }),
  };
}

/**
 * The recorder, the learner's take, the buttons that send it and what is said
 * while it travels: the controls every recorded answer shows, in one order.
 * `prefix` keeps each component's own class names, which are its styling
 * contract (`lk-ra` for a reading).
 */
export function TakeControls({
  answer,
  prefix,
  s,
  maxSeconds,
  maxTakes,
  isExam,
  isReview,
  disabled,
  assessingText,
  alertText,
}: {
  answer: RecordedAnswer;
  prefix: 'lk-ra' | 'lk-sr';
  s: LkStrings;
  maxSeconds: number;
  maxTakes: number | undefined;
  isExam: boolean;
  isReview: boolean;
  disabled: boolean | undefined;
  /** Said while the assessor judges the take. */
  assessingText: string;
  alertText: string | null;
}) {
  const { recorder, phase, submitted, inactive, busy, takesLeft, takeAudio, playback } = answer;
  return (
    <>
      {/* Gone once the item is committed, rather than left behind disabled: a
          submitted exam answer is not a control a learner should still meet. */}
      {isReview || submitted ? null : (
        <div
          className={`${prefix}-recorder`}
          data-status={recorder.status}
          data-level={
            recorder.status === 'recording'
              ? Math.min(LEVEL_STEPS, Math.round(recorder.level * LEVEL_STEPS))
              : undefined
          }
        >
          {recorder.status === 'recording' ? (
            <button
              type="button"
              className={`${prefix}-stop`}
              disabled={inactive}
              onClick={() => recorder.stop()}
            >
              {s.readAloudStop}
            </button>
          ) : (
            // aria-disabled, never disabled, once the takes are spent: a
            // natively disabled button drops keyboard focus to the page body,
            // and this is the control a learner comes back to.
            <button
              type="button"
              className={`${prefix}-record`}
              disabled={inactive}
              aria-disabled={!recorder.canRecord || busy || undefined}
              onClick={answer.beginTake}
            >
              {recorder.take === null ? s.readAloudRecord : s.readAloudRerecord}
            </button>
          )}
          {recorder.status === 'recording' ? (
            // Visible, and hidden from assistive technology, beside the level
            // meter the recorder's `data-level` drives. Its text changes every
            // whole second, so as a live region it announced ten times in a
            // ten-second take — into the microphone. What a screen-reader
            // learner needs instead is said once each, by the component.
            <p className={`${prefix}-progress`} aria-hidden="true">
              {s.readAloudRecordingProgress(
                secondsWithin(recorder.elapsedMs, maxSeconds, 'down'),
                maxSeconds,
              )}
            </p>
          ) : null}
          {takesLeft !== undefined && maxTakes !== undefined ? (
            <p className={`${prefix}-takes`}>{s.readAloudTakesRemaining(takesLeft, maxTakes)}</p>
          ) : null}
        </div>
      )}

      {takeAudio === null ? null : playback.refused ? (
        // In the player's place, not beside it: a player the page will not
        // load looks exactly like one that works until it is pressed, and then
        // does nothing. A note rather than an alert — the learner can still
        // submit, and nothing here asks them to act.
        <p className={`${prefix}-take-unavailable`} role="note">
          {s.readAloudPlaybackUnavailable}
        </p>
      ) : (
        // No caption track: the learner's own take has none to offer; its accessible name says whose recording it is.
        <audio
          className={`${prefix}-take`}
          controls
          src={takeAudio}
          aria-label={s.readAloudYourRecording}
          onError={(event) => playback.refuse(event.currentTarget)}
          {...(isReview ? {} : { 'data-take': recorder.takesUsed })}
        />
      )}

      {isReview || submitted ? null : (
        <div className={`${prefix}-actions`}>
          <button
            ref={answer.submitRef}
            type="submit"
            className={`${prefix}-submit`}
            disabled={disabled === true}
            aria-disabled={recorder.take === null || phase.kind !== 'idle' || undefined}
            aria-busy={busy || undefined}
          >
            {s.submit}
          </button>
          {isExam ? (
            // Explicit, and only here: an exam answer with no recording is a
            // decision a learner takes, never something a failed upload does
            // for them.
            <button
              type="button"
              className={`${prefix}-submit-blank`}
              disabled={inactive}
              aria-disabled={busy || undefined}
              onClick={answer.submitBlank}
            >
              {s.readAloudSubmitWithoutRecording}
            </button>
          ) : null}
          {answer.retryOffered ? (
            <button type="button" className={`${prefix}-retry`} onClick={answer.retry}>
              {s.readAloudTryAgain}
            </button>
          ) : null}
        </div>
      )}

      {busy ? (
        <p className={`${prefix}-pending`} role="status" aria-busy="true">
          {phase.kind === 'uploading' ? s.readAloudUploading : assessingText}
        </p>
      ) : null}

      {alertText !== null ? (
        <p key={answer.errorNonce} className={`${prefix}-alert`} role="alert">
          {alertText}
        </p>
      ) : null}
    </>
  );
}

/**
 * What the alert says: the recorder's own refusal first, then whichever step
 * of the take failed. `assessmentFailed` is the component's own sentence.
 */
export function alertTextOf(
  answer: RecordedAnswer,
  s: LkStrings,
  assessmentFailed: string,
): string | null {
  return answer.recorder.error !== null
    ? s.readAloudRecorderError(answer.recorder.error)
    : answer.phase.kind === 'upload-failed'
      ? s.readAloudUploadFailed
      : answer.phase.kind === 'assess-failed'
        ? assessmentFailed
        : null;
}
