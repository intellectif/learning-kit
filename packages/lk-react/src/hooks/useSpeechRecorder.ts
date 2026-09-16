'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IDLE_RECORDER,
  type RecordedTake,
  type RecorderEvent,
  type RecorderState,
  reduceRecorder,
  type SpeechRecorderError,
  type SpeechRecorderStatus,
} from './speech-recorder/machine.js';
import {
  downmix,
  joinBlocks,
  resampleToTarget,
  TARGET_SAMPLE_RATE,
} from './speech-recorder/resample.js';
import { encodeWav16, peakOf, rmsOf, WAV_MIME_TYPE } from './speech-recorder/wav.js';
import { CAPTURE_PROCESSOR, createProcessorUrl } from './speech-recorder/worklet.js';

// Public because `workletUrl` is: an option that names a module is only usable
// if the module's text can be reached without reading a minified chunk.
export { CAPTURE_PROCESSOR_SOURCE } from './speech-recorder/worklet.js';
export type { RecordedTake, SpeechRecorderError, SpeechRecorderStatus };

export interface SpeechRecorderOptions {
  /** The longest a take may be. Reached, the recording stops itself. */
  maxDurationMs: number;
  /** Shorter than this and the take is refused as `too-short`. */
  minDurationMs?: number;
  /** How many takes the learner may make. Unbounded when absent. */
  maxTakes?: number;
  /**
   * The URL of a self-hosted copy of {@link CAPTURE_PROCESSOR_SOURCE}, for an
   * application whose Content-Security-Policy does not allow `blob:` in
   * `script-src`. Serve that string unchanged; the contract a module here must
   * meet is written on it.
   *
   * **A URL that does not work is not reported.** If the module fails to load,
   * or loads without registering `lk-speech-capture`, the hook records through
   * the deprecated `ScriptProcessorNode` on the main thread instead — the
   * fallback it keeps for engines without audio worklets — and a recorder with
   * a broken `workletUrl` looks like a working one. Only an engine with neither
   * path reports `error: 'unsupported'`. Check that the module is actually
   * fetched.
   */
  workletUrl?: string;
}

export interface SpeechRecorder {
  status: SpeechRecorderStatus;
  error: SpeechRecorderError | null;
  /** The loudest block since the last update, 0..1. */
  level: number;
  /** How much audio has been captured, from the sample count. */
  elapsedMs: number;
  take: RecordedTake | null;
  takesUsed: number;
  /** Whether a take remains. Not whether a `start()` would be accepted now. */
  canRecord: boolean;
  /** Opens the microphone and begins capturing. **Never rejects.** */
  start(): Promise<void>;
  /** Ends the capture and encodes the take. */
  stop(): void;
  /** Throws the take away and releases the microphone. */
  discard(): void;
  /**
   * Starts over: releases the microphone, throws the take away **and gives the
   * budget back**.
   *
   * That last part is the whole difference from {@link SpeechRecorder.discard},
   * which deliberately refunds nothing — a budget a re-record gave back would
   * bound nothing. A reset is for a recorder that has been handed a different
   * reading while it stayed mounted: the takes belong to the activity, so the
   * next activity's are its own. Calling it for the same reading hands a
   * learner takes they have already spent.
   */
  reset(): void;
}

/**
 * The capture graph, typed by the surface this hook uses rather than by the
 * DOM lib.
 *
 * Two reasons, both load-bearing. The lib declares `audioWorklet` and
 * `createScriptProcessor` non-optional, and the engines this hook falls back
 * for are exactly the ones missing one or the other — comparing a type that
 * cannot be `undefined` against `undefined` is a compile error, so the lib's
 * types would force the fallback to be written blind. And a test harness can
 * implement these six members; it cannot implement `BaseAudioContext`.
 */
interface CaptureNode {
  connect(destination: CaptureNode): unknown;
  disconnect(): void;
}

interface CaptureGain extends CaptureNode {
  readonly gain: { value: number };
}

interface WorkletCaptureNode extends CaptureNode {
  readonly port: { onmessage: ((event: { data: unknown }) => void) | null };
}

interface ScriptProcessorCaptureNode extends CaptureNode {
  onaudioprocess:
    | ((event: {
        inputBuffer: { numberOfChannels: number; getChannelData(channel: number): Float32Array };
      }) => void)
    | null;
}

interface CaptureStream {
  getTracks(): readonly { stop(): void }[];
}

interface CaptureContext {
  readonly sampleRate: number;
  readonly destination: CaptureNode;
  readonly audioWorklet?: { addModule(url: string): Promise<void> };
  createMediaStreamSource(stream: CaptureStream): CaptureNode;
  createGain(): CaptureGain;
  createScriptProcessor?(
    bufferFrames: number,
    inputChannels: number,
    outputChannels: number,
  ): ScriptProcessorCaptureNode;
  close(): Promise<void>;
}

interface CaptureGlobals {
  navigator?: {
    mediaDevices?: { getUserMedia?(constraints: { audio: boolean }): Promise<CaptureStream> };
  };
  AudioContext?: new () => CaptureContext;
  AudioWorkletNode?: new (context: CaptureContext, name: string) => WorkletCaptureNode;
}

/** A capture node and the removal of the handler it was given. */
interface AttachedNode {
  node: CaptureNode;
  /** Detaches the handler, so a block delivered after teardown reaches nothing. */
  detach(): void;
}

type BlockHandler = (channels: readonly Float32Array[]) => void;

/** One recording in progress. Everything it holds must be released exactly once. */
interface CaptureSession {
  blocks: Float32Array[];
  frames: number;
  rate: number;
  /** The auto-stop deadline, as a sample count, beside the samples it bounds. */
  maxFrames: number;
  /** The loudest block since the meter last reported. */
  peak: number;
  /** The frame count at the last meter update. */
  reportedAt: number;
  release(): void;
}

/**
 * A `ScriptProcessorNode`'s buffer, in frames.
 *
 * This fallback runs its callback on the main thread, so the buffer has to
 * hold whatever a render blocks it for; 4096 frames is about 85 ms at 48 kHz,
 * and a smaller one drops samples out of the middle of a take whenever the
 * page is busy. The worklet path, which runs on the audio thread, needs none
 * of this.
 */
const PROCESSOR_BUFFER_FRAMES = 4096;

/** How often the meter and the elapsed time may move. */
const LEVEL_UPDATES_PER_SECOND = 10;

function stopTracks(stream: CaptureStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function closeQuietly(context: CaptureContext): void {
  void context.close().catch(() => {
    /* a context the page has already closed; nothing depends on the result */
  });
}

/**
 * Which refusal `getUserMedia` made.
 *
 * Read from `name`, not from the message: messages are localised and are
 * rewritten between browser versions, while the names are specified. Anything
 * unrecognised is `failed` rather than a guess — telling a learner their
 * permission was denied when their device was busy sends them to the wrong
 * setting.
 */
function microphoneError(error: unknown): SpeechRecorderError {
  switch ((error as { name?: string } | null)?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
      return 'no-device';
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'failed';
  }
}

/**
 * The worklet capture node, or `null` when this engine cannot build one.
 *
 * `null` rather than a throw for every one of its reasons — no
 * `AudioWorkletNode`, no worklet thread, an object URL the page's
 * Content-Security-Policy refuses, a module that fails to load — because none
 * of them is a failed recording: the caller has a working fallback for all of
 * them, and only the absence of both is an unsupported browser.
 */
async function createWorkletNode(
  context: CaptureContext,
  workletUrl: string | undefined,
  onBlock: BlockHandler,
): Promise<AttachedNode | null> {
  const AudioWorkletNodeConstructor = (globalThis as unknown as CaptureGlobals).AudioWorkletNode;
  const worklet = context.audioWorklet;
  if (AudioWorkletNodeConstructor === undefined || worklet === undefined) {
    return null;
  }
  const minted = workletUrl === undefined ? createProcessorUrl() : null;
  const url = workletUrl ?? minted?.url;
  if (url === undefined) {
    return null;
  }
  try {
    await worklet.addModule(url);
    const node = new AudioWorkletNodeConstructor(context, CAPTURE_PROCESSOR);
    node.port.onmessage = (event) => {
      onBlock(event.data as readonly Float32Array[]);
    };
    return {
      node,
      detach: () => {
        node.port.onmessage = null;
      },
    };
  } catch {
    return null;
  } finally {
    // Revoked as soon as the module has been fetched, whether it loaded or
    // not: an object URL lives until the document is discarded otherwise, and
    // this one is minted once per take.
    minted?.release();
  }
}

/** The `ScriptProcessorNode` fallback, or `null` on an engine without one. */
function createProcessorNode(context: CaptureContext, onBlock: BlockHandler): AttachedNode | null {
  const create = context.createScriptProcessor;
  if (create === undefined) {
    return null;
  }
  const node = create.call(context, PROCESSOR_BUFFER_FRAMES, 1, 1);
  node.onaudioprocess = (event) => {
    const buffer = event.inputBuffer;
    const channels: Float32Array[] = [];
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      channels.push(buffer.getChannelData(channel));
    }
    onBlock(channels);
  };
  return {
    node,
    detach: () => {
      node.onaudioprocess = null;
    },
  };
}

/**
 * Records a take of speech as mono 16-bit PCM WAV at 16 kHz.
 *
 * That is the one format the SDK measures directly: `inspectWav` reads it
 * without a decoding library, and it is what every mainstream pronunciation
 * assessor accepts. A take is captured at whatever rate the device runs at,
 * downmixed to mono, low-pass filtered and resampled, then encoded — so what a
 * server measures is what this hook produced, not a claim about it.
 *
 * **Server rendering.** `status`, `error` and `canRecord` are derived from the
 * take count alone and never from a browser global, so the markup a server
 * produces is the markup the browser's first render produces. Support is
 * discovered inside {@link SpeechRecorder.start} and reported as
 * `error: 'unsupported'`; the obvious `!!navigator.mediaDevices` guard at
 * render time would make a server render and its hydration disagree.
 *
 * **Identity.** `start`, `stop`, `discard` and `reset` keep one identity for the
 * life of the hook, so they are safe in a dependency array. The returned object keeps
 * one identity for as long as none of its values changes, so a render caused
 * by something else does not invalidate an effect that depends on it.
 *
 * `start()` does nothing when no take remains, so `canRecord` is presentation:
 * mark the control `aria-disabled` rather than `disabled`, which would take it
 * out of the tab order and leave a learner nothing to read.
 *
 * ```tsx
 * const recorder = useSpeechRecorder({ maxDurationMs: 20_000, maxTakes: 3 });
 * <button
 *   type="button"
 *   aria-disabled={!recorder.canRecord}
 *   onClick={() => {
 *     void recorder.start();
 *   }}
 * >
 *   Record
 * </button>
 * ```
 */
export function useSpeechRecorder(options: SpeechRecorderOptions): SpeechRecorder {
  // The latest options without changing `start`/`stop`/`discard`'s identity
  // when the caller passes an inline object, exactly as `useXAPI` keeps its
  // config.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<RecorderState>(IDLE_RECORDER);
  // The state as of this instant, written synchronously. Two events in one
  // tick — an auto-stop reached inside a capture callback and the learner's
  // own `stop()` — would otherwise both read the value React has not committed
  // yet, which is the bug `AudioTransport` and `ActivitySequence` each carry a
  // report of.
  const stateRef = useRef<RecorderState>(IDLE_RECORDER);
  const sessionRef = useRef<CaptureSession | null>(null);
  const startingRef = useRef(false);
  // Bumped by anything that abandons an attempt. `start()` re-reads it after
  // every await: a learner who discards, or a component that unmounts, while
  // the permission prompt is still open must not have a microphone opened
  // behind them and left open for ever.
  const attemptRef = useRef(0);

  const dispatch = useCallback((event: RecorderEvent) => {
    const next = reduceRecorder(stateRef.current, event);
    if (next === stateRef.current) {
      return;
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const endSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.release();
  }, []);

  const finish = useCallback(() => {
    const session = sessionRef.current;
    if (session === null) {
      return;
    }
    sessionRef.current = null;
    session.release();

    const { minDurationMs } = optionsRef.current;
    const samples = resampleToTarget(joinBlocks(session.blocks, session.frames), session.rate);
    // Taken from the encoded samples, so a take reports the duration a server
    // will measure in its bytes rather than a wall-clock timing of the attempt.
    //
    // No second bound is applied here. The capture was bounded at the device's
    // own rate, and resampling cannot push a whole-millisecond bound over:
    // checked across every rate from 8 to 192 kHz and every bound up to five
    // minutes, the encoded length never exceeds what the bound allows. (A
    // fractional `maxDurationMs` can overshoot by up to a fortieth of a
    // millisecond, which is less than one sample at this rate.)
    const durationMs = (samples.length / TARGET_SAMPLE_RATE) * 1000;
    if (minDurationMs !== undefined && durationMs < minDurationMs) {
      dispatch({ kind: 'failed', error: 'too-short' });
      return;
    }
    dispatch({
      kind: 'captured',
      take: {
        blob: new Blob([encodeWav16(samples, TARGET_SAMPLE_RATE)], { type: WAV_MIME_TYPE }),
        mimeType: WAV_MIME_TYPE,
        durationMs,
        peakLevel: peakOf(samples),
      },
    });
  }, [dispatch]);

  const handleBlock = useCallback(
    (channels: readonly Float32Array[]) => {
      const session = sessionRef.current;
      if (session === null) {
        return;
      }
      let block = downmix(channels);
      const room = session.maxFrames - session.frames;
      if (block.length > room) {
        block = block.subarray(0, room);
      }
      session.blocks.push(block);
      session.frames += block.length;
      const level = rmsOf(block);
      if (level > session.peak) {
        session.peak = level;
      }

      // Auto-stop is measured from the samples themselves, never from a timer:
      // the samples ARE the recording, so a take cannot run past its bound
      // however the page's timers were scheduled, and there is no deadline
      // left for a learner's own `stop()` to race.
      if (session.frames >= session.maxFrames) {
        finish();
        return;
      }
      if (session.frames - session.reportedAt < session.rate / LEVEL_UPDATES_PER_SECOND) {
        return;
      }
      session.reportedAt = session.frames;
      // The meter reports the loudest block since it last did, not the latest
      // one: at ten updates a second the latest block is one in forty, and a
      // meter that samples speech that thinly flickers instead of reading.
      const peak = session.peak;
      session.peak = 0;
      dispatch({
        kind: 'progress',
        level: peak,
        elapsedMs: (session.frames / session.rate) * 1000,
      });
    },
    [dispatch, finish],
  );

  const start = useCallback(async (): Promise<void> => {
    const { maxDurationMs, maxTakes, workletUrl } = optionsRef.current;
    // A second start while one is in flight, or while a capture is running, is
    // a learner pressing twice; a start with no takes left is a control the
    // caller should not have offered. Neither is an error worth a message.
    if (startingRef.current || sessionRef.current !== null) {
      return;
    }
    if (maxTakes !== undefined && stateRef.current.takesUsed >= maxTakes) {
      return;
    }
    const attempt = attemptRef.current;
    startingRef.current = true;
    dispatch({ kind: 'requested' });
    // Everything acquired so far, in the order it must be given back. Each
    // step replaces it, so every early return and the catch release exactly
    // what exists at that point.
    let release = (): void => {};

    try {
      // Support is discovered HERE and nowhere else — see the hook's note on
      // server rendering.
      const view = globalThis as unknown as CaptureGlobals;
      const devices = view.navigator?.mediaDevices;
      const getUserMedia = devices?.getUserMedia;
      const AudioContextConstructor = view.AudioContext;
      if (
        devices === undefined ||
        getUserMedia === undefined ||
        AudioContextConstructor === undefined
      ) {
        dispatch({ kind: 'failed', error: 'unsupported' });
        return;
      }

      let stream: CaptureStream;
      try {
        stream = await getUserMedia.call(devices, { audio: true });
      } catch (error) {
        dispatch({ kind: 'failed', error: microphoneError(error) });
        return;
      }
      release = () => {
        stopTracks(stream);
      };
      if (attempt !== attemptRef.current) {
        release();
        dispatch({ kind: 'discarded' });
        return;
      }

      let context: CaptureContext;
      try {
        context = new AudioContextConstructor();
      } catch {
        release();
        dispatch({ kind: 'failed', error: 'unsupported' });
        return;
      }
      const open = context;
      release = () => {
        stopTracks(stream);
        closeQuietly(open);
      };

      const attached =
        (await createWorkletNode(open, workletUrl, handleBlock)) ??
        createProcessorNode(open, handleBlock);
      if (attached === null) {
        release();
        dispatch({ kind: 'failed', error: 'unsupported' });
        return;
      }

      const source = open.createMediaStreamSource(stream);
      // A capture node is only pulled while it is reachable from the
      // destination, so the graph ends in a gain of zero: without the
      // connection some engines never call the processor at all, and with a
      // plain one the learner hears themselves through their own speakers.
      const sink = open.createGain();
      sink.gain.value = 0;
      source.connect(attached.node);
      attached.node.connect(sink);
      sink.connect(open.destination);
      release = () => {
        attached.detach();
        attached.node.disconnect();
        source.disconnect();
        sink.disconnect();
        stopTracks(stream);
        closeQuietly(open);
      };
      if (attempt !== attemptRef.current) {
        release();
        dispatch({ kind: 'discarded' });
        return;
      }

      sessionRef.current = {
        blocks: [],
        frames: 0,
        rate: open.sampleRate,
        maxFrames: Math.max(1, Math.floor((maxDurationMs / 1000) * open.sampleRate)),
        peak: 0,
        reportedAt: 0,
        release,
      };
      dispatch({ kind: 'started' });
    } catch {
      // `start()` never rejects. A recorder that throws into a click handler
      // leaves the learner with a dead control and no message, so anything
      // unforeseen becomes `failed` — which the caller already has a message
      // for — and gives back whatever had been acquired.
      release();
      sessionRef.current = null;
      dispatch({ kind: 'failed', error: 'failed' });
    } finally {
      startingRef.current = false;
    }
  }, [dispatch, handleBlock]);

  const stop = useCallback(() => {
    if (sessionRef.current === null) {
      // Before the microphone opens there is nothing to encode, so a stop is a
      // cancelled attempt: the bump is what makes `start()` give back the
      // stream it is about to be handed.
      attemptRef.current += 1;
      return;
    }
    finish();
  }, [finish]);

  const discard = useCallback(() => {
    attemptRef.current += 1;
    endSession();
    dispatch({ kind: 'discarded' });
  }, [dispatch, endSession]);

  const reset = useCallback(() => {
    attemptRef.current += 1;
    endSession();
    dispatch({ kind: 'reset' });
  }, [dispatch, endSession]);

  useEffect(() => {
    // Cleanup only. Every acquisition happens inside `start()` and is released
    // by the session it created, so the mount run has nothing to do and
    // StrictMode's extra mount/cleanup pair leaks nothing.
    return () => {
      attemptRef.current += 1;
      endSession();
    };
  }, [endSession]);

  const { maxTakes } = options;
  return useMemo(
    () => ({
      status: state.status,
      error: state.error,
      level: state.level,
      elapsedMs: state.elapsedMs,
      take: state.take,
      takesUsed: state.takesUsed,
      canRecord: maxTakes === undefined || state.takesUsed < maxTakes,
      start,
      stop,
      discard,
      reset,
    }),
    [state, maxTakes, start, stop, discard, reset],
  );
}
