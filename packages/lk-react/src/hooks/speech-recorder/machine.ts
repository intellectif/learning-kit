'use client';

/**
 * The recorder's state, as one pure reduction.
 *
 * Kept out of the hook because the hook's own work — opening a microphone,
 * building a graph, tearing both down — is asynchronous, and a state machine
 * spread across five callbacks is exactly where an auto-stop that races a
 * learner's `stop()` hides. Every transition is here, synchronous and
 * testable without a microphone; the hook only says which event happened.
 *
 * No transition reads a browser global, which is what lets `status`, `error`
 * and `canRecord` be rendered on a server.
 */

/** A recording the learner has made and not yet discarded. */
export interface RecordedTake {
  /** Mono 16-bit PCM WAV at 16 kHz — the format `inspectWav` measures. */
  blob: Blob;
  mimeType: string;
  /** The encoded recording's own length, not a wall-clock timing of the attempt. */
  durationMs: number;
  /** The loudest sample of the take, 0..1. */
  peakLevel: number;
}

export type SpeechRecorderStatus =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'recorded'
  | 'error';

export type SpeechRecorderError =
  | 'permission-denied'
  | 'no-device'
  | 'unsupported'
  | 'too-short'
  | 'failed';

export interface RecorderState {
  status: SpeechRecorderStatus;
  error: SpeechRecorderError | null;
  level: number;
  elapsedMs: number;
  take: RecordedTake | null;
  takesUsed: number;
}

export type RecorderEvent =
  | { kind: 'requested' }
  | { kind: 'started' }
  | { kind: 'progress'; level: number; elapsedMs: number }
  | { kind: 'captured'; take: RecordedTake }
  | { kind: 'failed'; error: SpeechRecorderError }
  | { kind: 'discarded' }
  | { kind: 'reset' };

/** The state a recorder mounts in, on a server as on a client. */
export const IDLE_RECORDER: RecorderState = {
  status: 'idle',
  error: null,
  level: 0,
  elapsedMs: 0,
  take: null,
  takesUsed: 0,
};

/**
 * Applies one event. Returns the state it was given, unchanged and identical,
 * when the event moves nothing — so a block arriving after teardown costs no
 * render.
 */
export function reduceRecorder(state: RecorderState, event: RecorderEvent): RecorderState {
  switch (event.kind) {
    case 'requested':
      // A new attempt clears the previous take. The learner has replaced it,
      // and a take left on screen through the next recording would offer a
      // submit button for audio that is no longer the one just made.
      return {
        ...state,
        status: 'requesting-permission',
        error: null,
        level: 0,
        elapsedMs: 0,
        take: null,
      };
    case 'started':
      // Only from a request this machine made. A microphone that opens after
      // the learner discarded the attempt must not put the meter back up.
      return state.status === 'requesting-permission' ? { ...state, status: 'recording' } : state;
    case 'progress':
      return state.status === 'recording'
        ? { ...state, level: event.level, elapsedMs: event.elapsedMs }
        : state;
    case 'captured':
      // The take count rises here and nowhere else, and `discard` never gives
      // one back: a budget a re-record refunded would bound nothing.
      return {
        ...state,
        status: 'recorded',
        error: null,
        level: 0,
        elapsedMs: event.take.durationMs,
        take: event.take,
        takesUsed: state.takesUsed + 1,
      };
    case 'failed':
      // No take was produced, so none was spent — a cough must not cost a
      // learner their only attempt. The elapsed time survives, because a
      // "too short" message reads better beside the length that was too short.
      return { ...state, status: 'error', error: event.error, level: 0, take: null };
    case 'discarded':
      return { ...state, status: 'idle', error: null, level: 0, elapsedMs: 0, take: null };
    case 'reset':
      // The budget goes back, which is the whole difference from `discarded`.
      // A discard is the same learner replacing their own take and must pay
      // for it; a reset is a different reading altogether — a new activity in
      // the same mounted component — and the takes it may have are its own.
      return state === IDLE_RECORDER ? state : IDLE_RECORDER;
  }
}
