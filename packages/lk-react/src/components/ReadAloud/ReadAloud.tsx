'use client';

import {
  type ActivityMedia as ActivityMediaData,
  ActivitySchemaError,
  assertRedacted,
  type GradeRecord,
  type InteractionKind,
  type LearnerResponse,
  type MediaPlaybackPolicy,
  type ReadAloudData,
  type ReadAloudLearnerResponse,
  type ReadAloudWordAlignment,
  type RecordingRef,
  type ScoringDetail,
  type SpeechAssessment,
  validateActivity,
  xAPIBuilder,
  xapiDefinitionFor,
} from '@intellectif/lk-core';
import {
  type CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useActivityState } from '../../hooks/useActivityState.js';
import type { RecordedTake, SpeechRecorderStatus } from '../../hooks/useSpeechRecorder.js';
import { useSpeechRecorder } from '../../hooks/useSpeechRecorder.js';
import { localeDirectionOf } from '../../i18n/direction.js';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStrings } from '../../i18n/strings.js';
import { ANONYMOUS_ACTOR, detailIsRight, isDevelopment, objectIdFor } from '../_internal.js';
import { PronunciationFeedback } from '../PronunciationFeedback/index.js';
import { markSentence, VISUALLY_HIDDEN } from '../PronunciationFeedback/PronunciationFeedback.js';
import { ActivityMedia } from '../shared/ActivityMedia.js';
import { ReadingCoaching } from '../shared/AiCoaching.js';
import { joinCaptureGroup } from '../shared/capture-registry.js';
import { useDeliveryPolicy } from '../shared/delivery.js';
import { FeedbackRegion } from '../shared/FeedbackRegion.js';
import { usePlaybackRefusal } from '../shared/playback-refusal.js';
import {
  fractionOfGrade,
  type OutcomeReading,
  percentOfGrade,
  type ReadGrade,
  readAssessResult,
  readEvidence,
  readOutcome,
} from '../shared/read-grade.js';
import {
  mintTake,
  SequenceSlotContext,
  stampTake,
  type TakeState,
} from '../shared/sequence-slot.js';
import type { ActivityProps, Renderable } from '../types.js';
import { readRecordingBounds, secondsWithin } from './recording-bounds.js';

/**
 * Names playback groups for the model recordings. Per mount and never derived
 * from `useId`: two separately hydrated roots derive the same id for the same
 * tree position, and their recordings would pause each other. The name never
 * reaches the DOM.
 */
let modelsGroupCount = 0;

/** A title with something in it a screen reader can say. */
const VISIBLE_TEXT_RE = /[^\p{White_Space}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;

/** A stored mark's id, as `gradeReadAloud` numbers the reference words. */
const MARK_ID_RE = /^w\d+$/;

/** The states a mark rebuilt from stored details can carry: insertions are not stored. */
const STORED_STATES: readonly ReadAloudWordAlignment['state'][] = [
  'correct',
  'mispronounced',
  'omitted',
];

/** The level meter's resolution, in steps the skin can select on. */
const LEVEL_STEPS = 10;

/**
 * What an application's assessor came back with.
 *
 * `code` is a plain `string` and not `SpeechUnscorableCode`: an application's
 * own assessor may refuse a take for a reason the SDK has no name for, and a
 * narrower type would make it unreportable. This component classifies the two
 * codes that mean "nothing was heard" and treats every other one the same way.
 */
export type ReadAloudAssessResult =
  | { status: 'graded'; assessment: SpeechAssessment; grade: GradeRecord }
  | { status: 'unscorable'; code: string; assessment?: SpeechAssessment }
  | { status: 'failed'; retryable: boolean };

/**
 * How a take reaches the application, and how a judgement comes back.
 *
 * Named `recordingBinding` rather than `recording` because both
 * `ReadAloudData.recording` (the bounds) and `ReadAloudLearnerResponse.recording`
 * (the stored take) already exist: the plain name would read as one of those.
 */
export interface RecordingBinding {
  /**
   * Puts the take in your storage and returns its key. **Required** outside
   * `review`: without it a learner can speak into a control that submits
   * nothing. Settle it — a promise that never does leaves the submit pending
   * for ever.
   */
  upload(take: RecordedTake): Promise<RecordingRef>;
  /**
   * Judges the stored take. `practice` only — an exam never assesses on the
   * client. Optional: a binding without it records, uploads and submits, and
   * the feedback is replaced by a notice.
   */
  assess?(ref: RecordingRef): Promise<ReadAloudAssessResult>;
  /** A playable link to a stored take. `review` only. */
  playbackUrl?(ref: RecordingRef): Promise<string>;
}

export interface ReadAloudProps extends ActivityProps<ReadAloudData> {
  /** How a take is stored and judged. See {@link RecordingBinding}. */
  recordingBinding?: RecordingBinding;
  /**
   * The evidence behind a stored grade, for `review`. Without it a graded
   * outcome still shows its marks, rebuilt from `outcome.grade.details`; with
   * neither, the score is shown and no marks are.
   */
  assessment?: SpeechAssessment;
  /**
   * Confidence above which a break note is shown, 0..1, forwarded to
   * {@link PronunciationFeedback}. No default — see its own prop.
   */
  breakThreshold?: number;
  /** The same, for the monotone note. */
  monotoneThreshold?: number;
  /**
   * The URL of a self-hosted copy of `CAPTURE_PROCESSOR_SOURCE`, handed to the
   * recorder, for a Content-Security-Policy whose `script-src` does not allow
   * `blob:`. Without it the capture module is loaded from a `blob:` URL, and a
   * policy that refuses one sends every take through the deprecated
   * main-thread `ScriptProcessorNode` — a take that still records, so nothing
   * says so. See `useSpeechRecorder`'s option of the same name.
   */
  workletUrl?: string;
  /**
   * Never called. A read-aloud answer is a key in your storage, and there is
   * none until the take has been uploaded — so there is no intermediate
   * response to report, and reporting the take itself would offer a host a
   * recording it has nowhere to put. `onSubmit` carries the response, once.
   */
  onChange?: (response: LearnerResponse) => void;
}

/** What the live region says: the SDK's own sentence, then any grader feedback. */
interface Announcement {
  text: string;
  feedback: string | null;
}

/**
 * How far the submitted take has got. `idle` also means "nothing submitted yet".
 *
 * Every other phase names its `take`, the number `mintTake` gave the submit
 * that reached it: a phase describes one take, and a pager told about it must
 * be able to tell that take from the one before it.
 */
type SubmitPhase =
  | { kind: 'idle' }
  | { kind: 'uploading'; take: number }
  | { kind: 'upload-failed'; take: number }
  | { kind: 'assessing'; take: number }
  | { kind: 'submitted'; take: number }
  | { kind: 'unassessed'; take: number }
  /**
   * The assessor's judgement, as `readAssessResult` read it: `grade` is `null`
   * when what came back cannot be shown as a grade, and `assessment` is `null`
   * when there is no evidence to mark words from.
   */
  | {
      kind: 'graded';
      take: number;
      assessment: SpeechAssessment | null;
      grade: ReadGrade | null;
    }
  | { kind: 'unscorable'; take: number; code: string | undefined }
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
function capturing(status: SpeechRecorderStatus): boolean {
  return status === 'recording' || status === 'requesting-permission';
}

/**
 * What a take is a take OF: the item, the words, their language and the bounds
 * the take is captured under. A change to any of these is a different reading,
 * and a take of the old one answers nothing.
 *
 * Deliberately NOT the identity of `data`. `redact()` returns a new object on
 * every call, and `activities={raw.map(redact)}` is a documented way to pass a
 * paper, so a host that rebuilds its items on every render is ordinary — and a
 * reset keyed on identity silently threw away every grade still in flight and
 * refunded the take budget on each of those renders, so a `maxTakes: 1` exam
 * accepted a second take. The title, the instructions and the model recordings
 * are presentation; editing them leaves the take a take of the same reading.
 *
 * The bounds are the CLAMPED ones, which are what the recorder is given. Read
 * field by field into strings, so no value unvalidated data carries can make
 * the key throw.
 */
function readingKeyOf(
  data: Renderable<ReadAloudData>,
  bounds: { maxSeconds: number; minSeconds: number | undefined; maxTakes: number | undefined },
): string {
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  return JSON.stringify([
    text(data.id),
    text(data.referenceText),
    text(data.locale),
    String(bounds.maxSeconds),
    String(bounds.minSeconds),
    String(bounds.maxTakes),
  ]);
}

/**
 * The slower model recording as an `ActivityMedia`: it follows the model
 * recording's playback policy minus `maxPlays` (`controls`, `seek`, `rate`,
 * the native hints), so a locked scrubber or a fixed speed binds both files —
 * and it never carries a budget of its own, so `<ActivityMedia>` never demands
 * a binding for it. `undefined` when there is no slow recording.
 */
function slowMediaFor(
  data: Renderable<ReadAloudData>,
  label: string,
): ActivityMediaData | undefined {
  const slow = data.slowMedia;
  if (slow === undefined) {
    return undefined;
  }
  const policy: MediaPlaybackPolicy = data.media?.playback ?? {};
  const { maxPlays: _budget, ...inherited } = policy;
  const hasPolicy = Object.values(inherited).some((value) => value !== undefined);
  return {
    type: 'audio',
    url: slow.url,
    alt: slow.alt ?? label,
    ...(hasPolicy ? { playback: inherited } : {}),
  };
}

/**
 * Word marks rebuilt from stored scoring details — a server-recorded mark shown
 * after the fact, with no assessment on the client. Inserted words are not in
 * the details (`gradeReadAloud` stores one mark per REFERENCE word, and a word
 * the learner added is not one the item asked for), so none appear.
 *
 * The details are a read grade's, so every entry is well-formed; what is left
 * to decide here is whether they are word marks at all, rather than a rubric's
 * own breakdown.
 */
function marksFromDetails(details: readonly ScoringDetail[]): ReadAloudWordAlignment[] | null {
  if (details.length === 0 || !details.every((detail) => MARK_ID_RE.test(detail.itemId))) {
    return null;
  }
  return details.map((detail) => {
    const heard = Array.isArray(detail.learnerResponse)
      ? detail.learnerResponse.join(' ')
      : detail.learnerResponse;
    const reference = Array.isArray(detail.correctResponse)
      ? detail.correctResponse.join(' ')
      : detail.correctResponse;
    const correct = detailIsRight(detail);
    const state: ReadAloudWordAlignment['state'] = correct
      ? 'correct'
      : detail.outcome === 'incorrect-omission'
        ? 'omitted'
        : 'mispronounced';
    return {
      itemId: detail.itemId,
      reference,
      heard,
      state,
      // `ScoringDetail.score` is the word's accuracy divided by 100; the marks
      // carry it back in the units the assessment used.
      ...(typeof detail.score === 'number' ? { accuracy: detail.score * 100 } : {}),
    };
  });
}

/** The stored take a learner response points at, or `null` for a blank or another type. */
function recordingOf(response: LearnerResponse | undefined): RecordingRef | null {
  return response !== undefined && response.type === 'read-aloud' ? response.recording : null;
}

/** The response this component emits; `takes` is written only when one was made. */
function responseOf(recording: RecordingRef | null, takes: number): ReadAloudLearnerResponse {
  return { type: 'read-aloud', recording, ...(takes > 0 ? { takes } : {}) };
}

/**
 * Which learner message an unscorable code earns. The two codes that mean
 * "nothing was heard" send the learner back to a quieter room; every other one,
 * the SDK's and an application's own alike — and no code at all — says only
 * that this take could not be assessed. **The code itself is never shown** — it
 * is a developer's label.
 */
function unscorableMessage(code: string | undefined, s: LkStrings): string {
  return code === 'no_speech' || code === 'insufficient_voiced_time'
    ? s.readAloudNotHeard
    : s.readAloudNotAssessed;
}

/**
 * The announcement, with grader feedback in its own isolated span: its
 * direction is its own, so an English "Well read." in an Arabic interface keeps
 * its full stop at its end. Its language is not guessed — feedback may be
 * written in the interface's language or the reading's.
 */
function AnnouncementText({ announcement }: { announcement: Announcement | null }) {
  if (announcement === null) {
    return null;
  }
  return (
    <>
      {announcement.text}
      {announcement.feedback ? (
        <>
          {' '}
          <span dir="auto">{announcement.feedback}</span>
        </>
      ) : null}
    </>
  );
}

/**
 * The server's outcome in `review`, as `readOutcome` read it. Nothing on this
 * path scores, infers or defaults a grade.
 *
 * `scoreShown` says whether the grade is already on screen — it is, whenever
 * `<PronunciationFeedback>` was given the same grade — so the sentence is not
 * rendered twice. The wrapper and its attributes are rendered either way,
 * because they are what a stylesheet and a diagnostic read.
 */
function OutcomeSummary({
  reading,
  s,
  scoreShown,
}: {
  reading: OutcomeReading;
  s: LkStrings;
  scoreShown: boolean;
}) {
  switch (reading.kind) {
    case 'graded':
      return (
        <div
          className="lk-ra-outcome"
          data-status={reading.status}
          data-passed={String(reading.grade.passed)}
        >
          {scoreShown ? null : (
            <>
              <p className="lk-ra-grade">
                {s.scoreAnnouncement(percentOfGrade(reading.grade), reading.grade.passed)}
              </p>
              {reading.grade.feedback ? (
                <p className="lk-ra-grade-feedback" dir="auto">
                  {reading.grade.feedback}
                </p>
              ) : null}
            </>
          )}
        </div>
      );
    case 'deferred':
      return (
        <div className="lk-ra-outcome" data-status="deferred">
          <p className="lk-ra-grade">{s.awaitingGrade}</p>
        </div>
      );
    case 'unscorable':
      // An unscorable code is a developer-facing label: it goes on the element
      // for diagnostics and routing, and never in front of the learner as text.
      return (
        <div
          className="lk-ra-outcome"
          data-status="unscorable"
          {...(reading.code !== undefined ? { 'data-code': reading.code } : {})}
        >
          <p className="lk-ra-grade">{s.couldNotBeGraded}</p>
        </div>
      );
    default:
      // A stored outcome that claims a grade and carries none that can be read
      // gets the deferred vocabulary's own sentence rather than "Score NaN%.":
      // there is a grade, and this screen cannot say what it was. No
      // `data-passed`, because there is no verdict to style.
      return (
        <div
          className="lk-ra-outcome"
          {...(reading.status !== undefined ? { 'data-status': reading.status } : {})}
        >
          <p className="lk-ra-grade">{s.couldNotBeGraded}</p>
        </div>
      );
  }
}

/**
 * Reads a text aloud and hands the recording to the application.
 *
 * The SDK records; it never judges. A take is captured as mono 16-bit PCM WAV
 * at 16 kHz — the one format `inspectWav` measures directly — handed to
 * `recordingBinding.upload`, and reported through `onSubmit`. Whether anything
 * assesses it, and where, is the application's: in `practice` an optional
 * `assess` may come back with a grade, and in `exam` nothing is ever assessed
 * on the client.
 *
 * **`recordingBinding.upload` is required outside `review`** and its absence
 * throws at render, in production too: a learner must never speak into a
 * control that stores nothing. `assess` is not required — a binding without it
 * records, uploads and submits, and shows a notice in place of the feedback.
 *
 * **A grade that comes back is read, not trusted** — whether `assess` returned
 * it or `outcome` carries it. A score that is not a number between 0 and its
 * maximum, or a `passed` that is not a boolean, is shown as could-not-be-graded
 * and never reaches `onComplete` or a statement; `onComplete` fires exactly when
 * a score is on screen, with that score.
 *
 * **AI coaching**, with a `pronunciationCoaching` port: under the marks, a
 * button asks a model to explain them — in `practice` once a take is graded,
 * and in `review` wherever marks are shown, from kept evidence or from the
 * stored grade's details. Never in `exam`. The marks are the engine's, and
 * coaching on a word it did not mark is refused whole.
 *
 * **Under a strict Content-Security-Policy** the take is played back from a
 * `blob:` URL, so `media-src` must allow `blob:` — refused, the player and the
 * per-word buttons give way to a note saying the take cannot be played here —
 * and the capture module loads from one too, so either `script-src` allows
 * `blob:` or `workletUrl` names a self-hosted copy of `CAPTURE_PROCESSOR_SOURCE`.
 *
 * ```tsx
 * <ReadAloud
 *   data={item}
 *   recordingBinding={{ upload, assess }}
 *   onSubmit={persist}
 *   onComplete={record}
 * />
 * ```
 */
export function ReadAloud({
  data,
  onComplete,
  onSubmit,
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
  recordingBinding,
  assessment,
  breakThreshold,
  monotoneThreshold,
  workletUrl,
  delivery,
  ai,
}: ReadAloudProps) {
  const isExam = renderMode === 'exam';
  // A read-aloud's grade comes back from the host's assessor, but showing it is
  // still feedback: without it the learner hears that the take was handed in,
  // and the grade still reaches `onComplete`. It has no solution and no hints.
  const policy = useDeliveryPolicy(delivery);
  const isReview = renderMode === 'review';
  const s = useLkStrings(strings);
  // The pager slot this component sits in, if any: the capture group its pane
  // stops, and where the state of each take is reported. A context and never a
  // prop, so none of it is on this component's published signature — a
  // consumer string in a prop could stop another pager's microphone. `null`
  // for a standalone component, which then belongs to no group at all and
  // releases the microphone from its own unmount alone.
  const slot = useContext(SequenceSlotContext);
  const captureGroup = slot?.captureGroup;

  const devError = useMemo(() => {
    if (!isDevelopment()) {
      return null;
    }
    // No `hasKey` branch, unlike `<Dictation>`: a read-aloud item has no answer
    // key, so `redact()` produces a projection the strict redacted schema
    // describes exactly and there is no revealed variant to make room for.
    if (data.redacted === true) {
      try {
        assertRedacted(data);
        return null;
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    }
    const result = validateActivity('read-aloud', data);
    return result.success ? null : new ActivitySchemaError('read-aloud', result.errors);
  }, [data]);

  // The bounds a take is captured under, READ and not merely defaulted, because
  // `practice` renders unvalidated content in production: a `maxSeconds` of
  // 100000 arms a recording that never stops itself, a `maxTakes` of "1" meant
  // unlimited takes, and a minimum above the maximum refused every take. One
  // reader owns all of it — see `readRecordingBounds`.
  const { maxSeconds, minSeconds, maxTakes } = readRecordingBounds(data.recording);
  const readingKey = readingKeyOf(data, { maxSeconds, minSeconds, maxTakes });

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

  const ids = useId();
  const titleId = `${ids}-title`;
  // Per mount, not per activity id: two renderings of one item on a page (a
  // review list, a preview beside a sequence) are separate players.
  const [modelsGroup] = useState(() => {
    modelsGroupCount += 1;
    return `lk-ra-models-${modelsGroupCount}`;
  });

  // The latest callbacks, so an effect can fire an event without depending on a
  // binding or a handler the host rebuilds on every render.
  const interactionRef = useRef(onInteraction);
  interactionRef.current = onInteraction;
  const bindingRef = useRef(recordingBinding);
  bindingRef.current = recordingBinding;
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
    (type: InteractionKind, payload: Record<string, unknown>): void => {
      interactionRef.current?.({ type, activityId: data.id, timestamp: Date.now(), payload });
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

  const restored = recordingOf(value ?? defaultValue);
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

  // Model recordings stay silent for as long as the learner records: a
  // microphone that hears the model reading would assess the model's
  // pronunciation, not theirs.
  //
  // Pausing once, when the capture starts, is not enough — the play controls
  // are still on screen and still work throughout the take, so the hazard
  // simply moves one door along. The listener holds the guard for the whole
  // capture and is removed with it; `play` does not bubble, so it is taken in
  // the capture phase. It is what silences the browser's own control bar; a
  // budgeted model is refused before it is charged, by the `disabled` its
  // player is rendered with below.
  const modelsRef = useRef<HTMLDivElement>(null);
  const isCapturing = capturing(recorder.status);
  useEffect(() => {
    if (!isCapturing) {
      return;
    }
    const node = modelsRef.current;
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

  const slowMedia = useMemo(
    () => slowMediaFor(data, s.readAloudSlowRecording),
    [data, s.readAloudSlowRecording],
  );

  // The learner's own take, as every element that plays it plays it: the
  // preview before it is sent, the stored link a review mints, and the
  // per-word buttons in the feedback panel. One refusal covers all of them.
  const takeAudio = isReview ? playbackUrl : takeUrl;
  const playback = usePlaybackRefusal(takeAudio);
  // Where focus goes when a retry takes the "Try again" button away: the
  // submit it retries, which says it is busy for as long as the retry runs.
  const submitRef = useRef<HTMLButtonElement>(null);

  // All hooks are called before these throws, so hook order stays stable.
  if (devError) {
    throw devError;
  }
  // `review` needs no upload: it renders what a server already stored.
  if (!isReview && recordingBinding?.upload === undefined) {
    throw new Error(
      `ReadAloud "${data.id}" was rendered in renderMode "${renderMode}" without ` +
        '`recordingBinding.upload`. The learner could record a take that is stored ' +
        'nowhere and submitted as nothing, which looks like a working activity the ' +
        'whole way through. Pass a `recordingBinding` whose `upload` puts the take in ' +
        'your storage and returns its key. `assess` is optional: without it the take is ' +
        'still recorded, uploaded and submitted, and a notice replaces the feedback.',
    );
  }

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
    const result = readAssessResult(answer);
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
    const timeSpent = getTimeSpent();
    setPhase({ kind: 'graded', take, assessment: result.assessment, grade: result.grade });
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

    // xAPI's `score.scaled` is a fraction in [-1, 1], and the SDK's builder
    // writes `ScoringResult.score` into it verbatim, then validates — so a
    // points-based grade (82 out of 100, which `GradeRecord` allows and a
    // grader's own units readily produce) does not merely ship a wrong number:
    // the build THROWS, and the grade never reaches the screen at all. The read
    // grade's fraction is in 0..1 by construction, and `passed` is a boolean by
    // construction, so the statement validates whatever the host sent. The
    // learner's own numbers go to `onComplete` untouched.
    //
    // Stamped with its take, as the response was: a pager records a grade only
    // for the take its slot holds now, so a grade that outlived a newer take
    // can never be filed beside that newer take's response.
    onComplete?.(
      stampTake(
        {
          score: grade.score,
          maxScore: grade.maxScore,
          passed: grade.passed,
          timeSpent,
          xapiStatement: xAPIBuilder.buildAnsweredStatement({
            actor: ANONYMOUS_ACTOR,
            object: {
              id: objectIdFor(data.id),
              name: { [data.locale ?? 'en-US']: data.title },
              ...xapiDefinitionFor(data),
            },
            timeSpentMs: timeSpent,
            response: result.recognizedText ?? '',
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
        },
        take,
      ),
    );
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
      onSubmit?.(stampTake(responseOf(ref, takes), take));
      fire('submitted', { takes, durationMs: current?.durationMs ?? 0 });
      if (isExam || ref === null) {
        // Exam never assesses, never scores, never reveals, and builds no xAPI
        // statement: its `correctResponsesPattern` would be the answer key, and
        // a read-aloud is graded on a server from the stored bytes.
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

  // The reading's own language and the direction its tag names. No `_`→`-`
  // normalisation, unlike `<Dictation>`: `ReadAloudData.locale` is canonical by
  // schema, so there is nothing to normalise.
  const contentLang = typeof data.locale === 'string' ? data.locale : undefined;
  const contentDir = localeDirectionOf(data.locale);
  // What the marks and the coaching on them read of the item: its text and
  // language for the marks, and its name and the author's settings for a model.
  const coachingItem = {
    id: data.id,
    title: data.title,
    referenceText: data.referenceText,
    locale: data.locale,
    ...(data.instructions !== undefined ? { instructions: data.instructions } : {}),
    ...(data.ai !== undefined ? { ai: data.ai } : {}),
  };

  // What the host sent, as the one reader of a host's grade reads it. Every
  // path below that shows or decides anything about a grade — the summary, the
  // panel, the marks, who renders the score, the announcement — reads these and
  // never `outcome` or `assessment` directly.
  const outcomeReading = useMemo(() => readOutcome(outcome), [outcome]);
  const keptEvidence = useMemo(() => readEvidence(assessment), [assessment]);
  const storedGrade =
    outcomeReading?.kind === 'graded' && outcomeReading.status === 'graded'
      ? outcomeReading.grade
      : null;
  // The marks a review shows: the assessment when the caller kept one, and the
  // stored details otherwise. With neither, the score is shown and no marks are.
  const storedMarks = useMemo(
    () =>
      policy.feedback && isReview && keptEvidence === null && storedGrade?.details !== undefined
        ? marksFromDetails(storedGrade.details)
        : null,
    [policy.feedback, isReview, keptEvidence, storedGrade],
  );
  // No panel at all without feedback: the marks, the score and the grader's
  // words are all in it.
  const feedbackAssessment = !policy.feedback
    ? null
    : isReview
      ? keptEvidence
      : phase.kind === 'graded'
        ? phase.assessment
        : null;
  const feedbackGrade = isReview ? storedGrade : phase.kind === 'graded' ? phase.grade : null;
  // A take the page refused to play is handed to no per-word button: each of
  // them would do nothing when pressed, and the note in the player's place
  // already says why.
  const feedbackAudio = playback.refused ? null : takeAudio;

  // Whether the score and the grader's words are already on screen inside the
  // feedback panel, which is what decides who renders them here.
  //
  // The props say the panel WAS GIVEN a grade; only the DOM says it rendered
  // one. The panel can fail outright — D2's dev throw for evidence the
  // validator refuses is one way, and nothing on either path validates a host's
  // grade either — and clipping on the props alone then hides a score that
  // exists nowhere, leaving a learner "this activity could not be displayed"
  // and no percentage at all. So the props may only ever clip for the single
  // commit before the fact arrives, and the fact may always un-clip: a grade on
  // screen twice is a far smaller defect than a grade nowhere. `.lk-pf-grade`
  // is the panel's own hook for this, named as such in its source.
  const rootRef = useRef<HTMLFormElement>(null);
  const [panelLostTheGrade, setPanelLostTheGrade] = useState(false);
  // Only a READ grade is handed to the panel, and the panel shows a read grade's
  // score without exception — so the prediction is made from the reader's
  // output, and never from a grade the panel would refuse.
  const panelHasGrade = feedbackAssessment !== null && feedbackGrade !== null;
  const gradeShownInPanel = panelHasGrade && !panelLostTheGrade;
  // Deliberately without a dependency list: what it reads is the committed DOM,
  // which no list can name. The updater keeps the settled value a fixed point,
  // so a render that changes nothing here costs one extra pass and then stops.
  useEffect(() => {
    const root = rootRef.current;
    const lost = panelHasGrade && (root === null || root.querySelector('.lk-pf-grade') === null);
    setPanelLostTheGrade((was) => (was === lost ? was : lost));
  });

  const announcement = useMemo<Announcement | null>(() => {
    if (isReview) {
      return null;
    }
    // The two moments of a capture, said once each. The per-second counter used
    // to be a live region of its own, so a ten-second take produced ten
    // announcements — and on any device without headphones a screen reader
    // speaks each of them into the take about to be assessed FOR PRONUNCIATION.
    // This component already stops the model recordings for exactly that
    // reason; the counter it generates itself is the same hazard.
    if (recorder.status === 'recording') {
      return { text: s.readAloudRecordingStarted, feedback: null };
    }
    // The length is in the sentence because the counter is no longer announced:
    // a take that ran to its bound reads back as "20 of 20 seconds", which is
    // how a learner hears that it stopped itself rather than that they stopped it.
    const stopped: Announcement | null =
      recorder.status === 'recorded' && take !== null
        ? {
            text: s.readAloudRecordingStopped(
              secondsWithin(take.durationMs, maxSeconds, 'nearest'),
              maxSeconds,
            ),
            feedback: null,
          }
        : null;
    if (isExam) {
      if (phase.kind === 'submitted' || submitted) {
        return { text: s.answerSubmitted, feedback: null };
      }
      return phase.kind === 'idle' ? stopped : null;
    }
    switch (phase.kind) {
      case 'graded': {
        const grade = phase.grade;
        // A judgement with no grade that can be read says so, in the same
        // sentence a review uses — never nothing, which reads as a grade
        // still on its way.
        if (grade === null) {
          return { text: `${s.answerSubmitted} ${s.couldNotBeGraded}`, feedback: null };
        }
        // Graded, and said to be handed in only: the policy shows no grades.
        if (!policy.feedback) {
          return { text: s.answerSubmitted, feedback: null };
        }
        return {
          text: `${s.answerSubmitted} ${s.scoreAnnouncement(percentOfGrade(grade), grade.passed)}`,
          feedback: grade.feedback,
        };
      }
      case 'unscorable':
        return { text: unscorableMessage(phase.code, s), feedback: null };
      case 'unassessed':
        return { text: s.readAloudAssessmentUnavailable, feedback: null };
      case 'idle':
        return stopped;
      default:
        // Uploading and assessing have their own pending sentence, and both
        // failures have an alert; a stale "recording stopped" beside either
        // would be the loudest thing on the screen.
        return null;
    }
  }, [isReview, isExam, phase, submitted, s, recorder.status, take, maxSeconds, policy.feedback]);

  const alertText =
    recorder.error !== null
      ? s.readAloudRecorderError(recorder.error)
      : phase.kind === 'upload-failed'
        ? s.readAloudUploadFailed
        : phase.kind === 'assess-failed'
          ? s.readAloudAssessmentFailed
          : null;

  return (
    <form
      className="lk-ra"
      ref={rootRef}
      // A title with nothing to say would name the form with silence.
      aria-labelledby={VISIBLE_TEXT_RE.test(data.title) ? titleId : undefined}
      lang={locale}
      data-render-mode={renderMode}
      style={theme as CSSProperties | undefined}
      onSubmit={handleSubmit}
    >
      {/*
        The form's name: read from here, it keeps the content's language. A
        paragraph of its own, so without a language to go by its own first
        letter decides its direction.
      */}
      <p id={titleId} className="lk-ra-title" dir={contentDir ?? 'auto'} lang={contentLang}>
        {data.title}
      </p>

      {typeof data.instructions === 'string' && data.instructions !== '' ? (
        <p className="lk-ra-instructions" dir={contentDir ?? 'auto'} lang={contentLang}>
          {data.instructions}
        </p>
      ) : null}

      {/* The reading itself. Never redacted: a read-aloud has no answer key, so
          the learner's copy carries the text in full. */}
      <p className="lk-ra-reference" dir={contentDir ?? 'auto'} lang={contentLang}>
        {data.referenceText}
      </p>

      {data.media !== undefined || slowMedia !== undefined ? (
        <div className="lk-ra-models" ref={modelsRef}>
          {/*
            Each model recording is a named group (a fieldset with a legend,
            which is what `role="group"` plus a label spells natively), so the
            two players are told apart by name and not only by position.
          */}
          {data.media !== undefined ? (
            <fieldset className="lk-ra-model">
              <legend className="lk-ra-model-label">{s.readAloudModelRecording}</legend>
              {/* The ONLY budgeted recording: the binding is whatever the pager or the caller passes.
                  Disabled while a take is captured, so a press is refused BEFORE a play is
                  charged — silenced after the charge, it cost the learner a play they never
                  heard. Nothing is announced for the refusal: a screen reader speaking now
                  would speak into the take. */}
              <ActivityMedia
                media={data.media}
                renderMode={renderMode}
                playbackGroup={modelsGroup}
                {...(mediaBudget !== undefined ? { mediaBudget } : {})}
                {...(mediaStrings !== undefined ? { mediaStrings } : {})}
                {...(strings !== undefined ? { strings } : {})}
                {...(onInteraction !== undefined ? { onInteraction } : {})}
                {...(locale !== undefined ? { locale } : {})}
                {...(disabled === true || isCapturing ? { disabled: true } : {})}
              />
            </fieldset>
          ) : null}
          {slowMedia !== undefined ? (
            <fieldset className="lk-ra-model" data-slow="true">
              <legend className="lk-ra-model-label">{s.readAloudSlowRecording}</legend>
              {/* No budget of its own, by contract — so no binding is passed and none is demanded. */}
              <ActivityMedia
                media={slowMedia}
                renderMode={renderMode}
                playbackGroup={modelsGroup}
                {...(mediaStrings !== undefined ? { mediaStrings } : {})}
                {...(strings !== undefined ? { strings } : {})}
                {...(locale !== undefined ? { locale } : {})}
                {...(disabled === true || isCapturing ? { disabled: true } : {})}
              />
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {/* Gone once the item is committed, rather than left behind disabled: a
          submitted exam answer is not a control a learner should still meet. */}
      {isReview || submitted ? null : (
        <div
          className="lk-ra-recorder"
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
              className="lk-ra-stop"
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
              className="lk-ra-record"
              disabled={inactive}
              aria-disabled={!recorder.canRecord || busy || undefined}
              onClick={beginTake}
            >
              {recorder.take === null ? s.readAloudRecord : s.readAloudRerecord}
            </button>
          )}
          {recorder.status === 'recording' ? (
            // Visible, and hidden from assistive technology, beside the level
            // meter the recorder's `data-level` drives. Its text changes every
            // whole second, so as a live region it announced ten times in a
            // ten-second take — into the microphone. What a screen-reader
            // learner needs instead is said once each, below.
            <p className="lk-ra-progress" aria-hidden="true">
              {s.readAloudRecordingProgress(
                secondsWithin(recorder.elapsedMs, maxSeconds, 'down'),
                maxSeconds,
              )}
            </p>
          ) : null}
          {takesLeft !== undefined && maxTakes !== undefined ? (
            <p className="lk-ra-takes">{s.readAloudTakesRemaining(takesLeft, maxTakes)}</p>
          ) : null}
        </div>
      )}

      {takeAudio === null ? null : playback.refused ? (
        // In the player's place, not beside it: a player the page will not
        // load looks exactly like one that works until it is pressed, and then
        // does nothing. A note rather than an alert — the learner can still
        // submit, and nothing here asks them to act.
        <p className="lk-ra-take-unavailable" role="note">
          {s.readAloudPlaybackUnavailable}
        </p>
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: the learner's own take has no caption track to offer; its accessible name says whose recording it is
        <audio
          className="lk-ra-take"
          controls
          src={takeAudio}
          aria-label={s.readAloudYourRecording}
          onError={(event) => playback.refuse(event.currentTarget)}
          {...(isReview ? {} : { 'data-take': recorder.takesUsed })}
        />
      )}

      {isReview || submitted ? null : (
        <div className="lk-ra-actions">
          <button
            ref={submitRef}
            type="submit"
            className="lk-ra-submit"
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
              className="lk-ra-submit-blank"
              disabled={inactive}
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) {
                  void submitTake(null);
                }
              }}
            >
              {s.readAloudSubmitWithoutRecording}
            </button>
          ) : null}
          {offersRetry(phase, uploaded) ? (
            <button
              type="button"
              className="lk-ra-retry"
              onClick={() => {
                // The retry takes this button away with the phase it answers,
                // and focus on a removed element drops to the page body — a
                // keyboard learner is then back at the top of the page with no
                // idea the retry started. It goes to the submit being retried.
                submitRef.current?.focus();
                if (phase.kind === 'upload-failed') {
                  void submitTake(recorder.take);
                } else if (phase.kind === 'assess-failed' && uploaded !== null) {
                  void retryAssess(uploaded, phase.take);
                }
              }}
            >
              {s.readAloudTryAgain}
            </button>
          ) : null}
        </div>
      )}

      {busy ? (
        <p className="lk-ra-pending" role="status" aria-busy="true">
          {phase.kind === 'uploading' ? s.readAloudUploading : s.readAloudAssessing}
        </p>
      ) : null}

      {alertText !== null ? (
        <p key={errorNonce} className="lk-ra-alert" role="alert">
          {alertText}
        </p>
      ) : null}

      {feedbackAssessment !== null ? (
        <PronunciationFeedback
          data={coachingItem}
          assessment={feedbackAssessment}
          {...(feedbackGrade !== null ? { grade: feedbackGrade } : {})}
          {...(feedbackAudio !== null ? { audioUrl: feedbackAudio } : {})}
          {...(breakThreshold !== undefined ? { breakThreshold } : {})}
          {...(monotoneThreshold !== undefined ? { monotoneThreshold } : {})}
          {...(locale !== undefined ? { locale } : {})}
          {...(strings !== undefined ? { strings } : {})}
          {...(ai !== undefined ? { ai } : {})}
          {...(onInteraction !== undefined ? { onInteraction } : {})}
          renderMode={renderMode}
          delivery={policy}
        />
      ) : null}

      {storedMarks !== null ? (
        <div className="lk-ra-marks">
          {/* The list's name and the hidden sentences are interface text; only
              the words carry the reading's language. */}
          <ol className="lk-ra-words" aria-label={s.pronunciationWordsLabel} dir={contentDir}>
            {storedMarks.map((entry, index) => {
              const sentence = markSentence(entry, s);
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: mark order is the identity; words repeat
                  key={index}
                  className="lk-ra-word"
                  data-state={entry.state}
                >
                  {/* One channel for assistive technology, not two: the same
                      sentence as a `title` is an accessible description, read
                      straight after the name it repeats. */}
                  <span className="lk-visually-hidden" style={VISUALLY_HIDDEN}>
                    {sentence}
                  </span>
                  <span
                    className="lk-ra-word-text"
                    aria-hidden="true"
                    dir={contentDir ?? 'auto'}
                    lang={contentLang}
                  >
                    {entry.reference}
                  </span>
                </li>
              );
            })}
          </ol>
          {/* Three rows, not four: a stored mark set carries no insertions. */}
          <ul className="lk-ra-legend">
            {STORED_STATES.map((state) => (
              <li key={state} data-state={state}>
                {s.pronunciationLegend(state)}
              </li>
            ))}
          </ul>
          {/* The same coaching the panel offers, on the marks read back here:
              the stored grade's, which carry no sounds. */}
          <ReadingCoaching
            data={coachingItem}
            grade={storedGrade}
            renderMode={renderMode}
            delivery={policy}
            {...(ai !== undefined ? { ai } : {})}
            {...(locale !== undefined ? { locale } : {})}
            {...(onInteraction !== undefined ? { onInteraction } : {})}
            strings={s}
            contentLang={contentLang}
            contentDir={contentDir}
          />
        </div>
      ) : null}

      <FeedbackRegion id={`${data.id}-feedback`}>
        {isReview ? (
          // A grade read back is feedback; "not graded yet" and a grade that
          // could not be read are not.
          outcomeReading !== undefined && (policy.feedback || outcomeReading.kind !== 'graded') ? (
            <OutcomeSummary reading={outcomeReading} s={s} scoreShown={gradeShownInPanel} />
          ) : null
        ) : gradeShownInPanel ? (
          // Announced, not repeated. A grade the feedback panel is already
          // showing would otherwise be read on screen twice, feedback and all —
          // but a live region is the only thing that TELLS a screen-reader
          // learner a grade arrived, since nothing takes focus. Clipped rather
          // than `display: none`, which would stop it being announced at all.
          <span className="lk-visually-hidden" style={VISUALLY_HIDDEN}>
            <AnnouncementText announcement={announcement} />
          </span>
        ) : (
          <AnnouncementText announcement={announcement} />
        )}
      </FeedbackRegion>
    </form>
  );
}
