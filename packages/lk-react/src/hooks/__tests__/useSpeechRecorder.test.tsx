import { inspectWav } from '@intellectif/lk-core';
import { act, type RenderHookResult, renderHook } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bytesOf,
  type SpeechCaptureHarness,
  type SpeechCaptureOptions,
  stubSpeechCapture,
} from '../../test-support/speech.js';
import { type RecordedTake, type SpeechRecorder, useSpeechRecorder } from '../useSpeechRecorder.js';

/** A measurement policy `inspectWav` accepts; nothing here asserts about it. */
const POLICY = { silenceDbfs: -45, frameMs: 20 };

let harness: SpeechCaptureHarness | undefined;

afterEach(() => {
  harness?.restore();
  harness = undefined;
});

function install(options?: SpeechCaptureOptions): SpeechCaptureHarness {
  harness = stubSpeechCapture(options);
  return harness;
}

type Recorder = RenderHookResult<SpeechRecorder, unknown>;

function mount(options: Parameters<typeof useSpeechRecorder>[0]): Recorder {
  return renderHook(() => useSpeechRecorder(options));
}

async function begin(recorder: Recorder): Promise<void> {
  await act(async () => {
    await recorder.result.current.start();
  });
}

/**
 * Yields until `reached`, so a test can act in the middle of a `start()`.
 *
 * A fixed number of ticks would be a guess at how many awaits an async function
 * takes to arrive somewhere; a condition is what the test actually means.
 */
async function settleUntil(reached: () => boolean): Promise<void> {
  for (let tick = 0; tick < 50 && !reached(); tick += 1) {
    await Promise.resolve();
  }
  if (!reached()) {
    throw new Error('the recorder never reached the point this test acts at');
  }
}

/** Measures a take exactly as a server would, from the bytes it carries. */
async function measure(take: RecordedTake) {
  const wav = inspectWav(await bytesOf(take.blob), POLICY);
  if (!wav.valid) {
    throw new Error(`the take is not a WAV the SDK can measure: ${wav.reason}`);
  }
  return wav;
}

/** One encoded sample, as the signed 16-bit integer the file holds. */
async function pcmAt(take: RecordedTake, index: number): Promise<number> {
  const bytes = await bytesOf(take.blob);
  return new DataView(bytes.buffer).getInt16(44 + index * 2, true);
}

function takeOf(recorder: Recorder): RecordedTake {
  const { take } = recorder.result.current;
  if (take === null) {
    throw new Error(`no take was produced; the recorder is ${recorder.result.current.status}`);
  }
  return take;
}

function Probe(): React.JSX.Element {
  const recorder = useSpeechRecorder({ maxDurationMs: 15_000, maxTakes: 2 });
  return (
    <p>{`${recorder.status}|${recorder.error ?? 'none'}|${recorder.canRecord ? 'can' : 'cannot'}|${recorder.takesUsed}`}</p>
  );
}

describe('useSpeechRecorder', () => {
  it('is idle with its budget intact before anything touches a microphone', () => {
    // No harness on purpose: jsdom has none of the capture globals, and a hook
    // that probed for them at render would already have failed here.
    const recorder = mount({ maxDurationMs: 15_000, maxTakes: 3 });
    expect(recorder.result.current).toMatchObject({
      status: 'idle',
      error: null,
      level: 0,
      elapsedMs: 0,
      take: null,
      takesUsed: 0,
      canRecord: true,
    });
  });

  it('renders the same on a server as in the browser that hydrates it', async () => {
    const complaints = vi.spyOn(console, 'error').mockImplementation(() => {});
    const markup = renderToString(<Probe />);
    expect(markup).toContain('idle|none|can|0');

    const island = document.createElement('div');
    island.innerHTML = markup;
    document.body.append(island);
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(island, <Probe />);
    });

    expect(island.textContent).toBe('idle|none|can|0');
    expect(complaints.mock.calls.filter((call) => /hydrat/i.test(String(call[0])))).toHaveLength(0);

    act(() => {
      root?.unmount();
    });
    island.remove();
    complaints.mockRestore();
  });

  it('keeps one identity for its methods, and for itself while nothing changes', () => {
    const recorder = mount({ maxDurationMs: 15_000 });
    const first = recorder.result.current;
    recorder.rerender();
    expect(recorder.result.current).toBe(first);
    expect(recorder.result.current.start).toBe(first.start);
    expect(recorder.result.current.stop).toBe(first.stop);
    expect(recorder.result.current.discard).toBe(first.discard);
    expect(recorder.result.current.reset).toBe(first.reset);
  });

  it('gives the budget back on a reset, and the microphone with it', async () => {
    // What a component calls when it is handed a DIFFERENT reading while it
    // stays mounted: `discard` refunds nothing on purpose, so a new activity
    // would otherwise inherit the last one's spent takes and refuse to record.
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000, maxTakes: 1 });
    await begin(recorder);
    act(() => {
      audio.pushLevel(0.5, audio.sampleRate / 2);
      recorder.result.current.stop();
    });
    expect(recorder.result.current).toMatchObject({ takesUsed: 1, canRecord: false });

    act(() => {
      recorder.result.current.reset();
    });
    expect(recorder.result.current).toMatchObject({
      status: 'idle',
      error: null,
      take: null,
      takesUsed: 0,
      canRecord: true,
      level: 0,
      elapsedMs: 0,
    });
    expect(audio.liveTracks()).toBe(0);
    expect(audio.openContexts()).toBe(0);

    // The refund is real: the microphone opens again.
    await begin(recorder);
    expect(recorder.result.current.status).toBe('recording');
    expect(audio.microphonesOpened()).toBe(2);
  });

  it('abandons an attempt whose permission prompt is still open when it is reset', async () => {
    const audio = install({ holdWorkletModule: true });
    const recorder = mount({ maxDurationMs: 15_000 });
    let started: Promise<void> = Promise.resolve();
    await act(async () => {
      started = recorder.result.current.start();
      await settleUntil(() => audio.addedModules().length === 1);
      recorder.result.current.reset();
      audio.loadWorkletModule();
      await started;
    });
    expect(recorder.result.current).toMatchObject({ status: 'idle', takesUsed: 0 });
    expect(audio.liveTracks()).toBe(0);
    expect(audio.openContexts()).toBe(0);
  });

  it('reports an unsupported environment rather than probing for one at render', async () => {
    install({ without: ['mediaDevices'] });
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    expect(recorder.result.current).toMatchObject({ status: 'error', error: 'unsupported' });
  });

  it('reports an unsupported environment with no AudioContext', async () => {
    const audio = install({ without: ['AudioContext'] });
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    expect(recorder.result.current.error).toBe('unsupported');
    expect(audio.microphonesOpened()).toBe(0);
  });

  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-device'],
    ['NotSupportedError', 'unsupported'],
    ['AbortError', 'failed'],
  ] as const)('reads a %s refusal as %s', async (name, expected) => {
    install({ refuseMicrophone: name });
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    expect(recorder.result.current).toMatchObject({ status: 'error', error: expected });
  });

  it('captures a take the SDK can measure, and gives the microphone back', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    expect(recorder.result.current.status).toBe('recording');
    expect(audio.capturePath()).toBe('worklet');

    act(() => {
      audio.pushLevel(0.5, audio.sampleRate);
    });
    act(() => {
      recorder.result.current.stop();
    });

    const take = takeOf(recorder);
    expect(recorder.result.current).toMatchObject({ status: 'recorded', takesUsed: 1, level: 0 });
    expect(take.mimeType).toBe('audio/wav');
    expect(take.durationMs).toBe(1000);
    expect(take.peakLevel).toBeCloseTo(0.5, 4);

    const wav = await measure(take);
    expect(wav.sampleRate).toBe(16_000);
    expect(wav.channels).toBe(1);
    expect(wav.durationMs).toBe(take.durationMs);
    expect(wav.voicedMs).toBe(1000);

    expect(audio.liveTracks()).toBe(0);
    expect(audio.openContexts()).toBe(0);
    // The worklet module is fetched once per take and its URL given straight
    // back; an object URL otherwise lives until the document is discarded.
    expect(audio.liveObjectUrls()).toBe(0);
  });

  it('stops itself at the duration bound, counted from the samples', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 500 });
    await begin(recorder);

    act(() => {
      audio.pushLevel(0.5, audio.sampleRate * 2);
    });

    expect(recorder.result.current.status).toBe('recorded');
    const take = takeOf(recorder);
    expect(take.durationMs).toBe(500);
    expect((await measure(take)).durationMs).toBe(500);
    expect(audio.liveTracks()).toBe(0);
  });

  it('holds the bound at a device rate that does not divide the target', async () => {
    // 44.1 kHz resamples to 16 kHz by a ratio that is not a whole number, which
    // is where a bound counted in samples could round its way past itself.
    const audio = install({ sampleRate: 44_100 });
    const recorder = mount({ maxDurationMs: 700 });
    await begin(recorder);
    act(() => {
      audio.pushLevel(0.5, audio.sampleRate);
    });
    expect((await measure(takeOf(recorder))).durationMs).toBeLessThanOrEqual(700);
  });

  it('refuses a take under the minimum, and spends none on it', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000, minDurationMs: 1000 });
    await begin(recorder);

    act(() => {
      audio.pushLevel(0.5, audio.sampleRate / 5);
    });
    act(() => {
      recorder.result.current.stop();
    });

    expect(recorder.result.current).toMatchObject({
      status: 'error',
      error: 'too-short',
      take: null,
      takesUsed: 0,
      canRecord: true,
    });
    expect(audio.liveTracks()).toBe(0);
  });

  it('records an empty take where no bound says otherwise', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    act(() => {
      recorder.result.current.stop();
    });
    expect(takeOf(recorder).durationMs).toBe(0);
    expect((await measure(takeOf(recorder))).durationMs).toBe(0);
    expect(audio.openContexts()).toBe(0);
  });

  it('moves the meter about ten times a second, holding the loudest block', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    const block = audio.sampleRate / 100; // 10 ms

    act(() => {
      for (const amplitude of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
        audio.pushLevel(amplitude, block);
      }
    });
    expect(recorder.result.current).toMatchObject({ level: 0, elapsedMs: 0 });

    act(() => {
      audio.pushLevel(0.2, block);
    });
    expect(recorder.result.current.level).toBeCloseTo(0.9, 4);
    expect(recorder.result.current.elapsedMs).toBe(100);

    act(() => {
      for (let pushes = 0; pushes < 10; pushes += 1) {
        audio.pushLevel(0.1, block);
      }
    });
    // The hold is released with each report, or a single loud moment would pin
    // the meter for the rest of the take.
    expect(recorder.result.current.level).toBeCloseTo(0.1, 4);
    expect(recorder.result.current.elapsedMs).toBe(200);
  });

  it('falls back to a script processor when the worklet module is refused', async () => {
    const audio = install({ refuseWorkletModule: true });
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);

    expect(audio.capturePath()).toBe('script-processor');
    expect(audio.addedModules()).toHaveLength(1);
    expect(audio.liveObjectUrls()).toBe(0);

    act(() => {
      audio.pushLevel(0.5, audio.sampleRate / 2);
    });
    act(() => {
      recorder.result.current.stop();
    });
    expect((await measure(takeOf(recorder))).durationMs).toBe(500);
  });

  // Three separate reasons a worklet cannot be built, each of which a real
  // engine or a real policy produces, and none of which is a failed recording.
  it.each(['AudioWorkletNode', 'audioWorklet', 'objectUrls'] as const)(
    'falls back to a script processor in an environment without %s',
    async (missing) => {
      const audio = install({ without: [missing] });
      const recorder = mount({ maxDurationMs: 15_000 });
      await begin(recorder);
      expect(audio.capturePath()).toBe('script-processor');
      expect(recorder.result.current.status).toBe('recording');
    },
  );

  it('keeps every block, even where the engine reuses its input buffer', async () => {
    // The script-processor fallback is handed the same array on every callback,
    // so this is where a capture that forgot to copy shows up as one long take
    // of whatever was said last.
    const audio = install({ without: ['AudioWorkletNode'] });
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);

    act(() => {
      audio.pushLevel(0.25, audio.sampleRate);
      audio.pushLevel(0.75, audio.sampleRate);
    });
    act(() => {
      recorder.result.current.stop();
    });

    const take = takeOf(recorder);
    expect(take.durationMs).toBe(2000);
    expect(await pcmAt(take, 4000)).toBeCloseTo(0.25 * 32767, -2);
    expect(await pcmAt(take, 24_000)).toBeCloseTo(0.75 * 32767, -2);
  });

  it('loads a self-hosted worklet module when one is given', async () => {
    const audio = install();
    const recorder = mount({
      maxDurationMs: 15_000,
      workletUrl: 'https://cdn.test/lk-speech-capture.js',
    });
    await begin(recorder);
    expect(audio.addedModules()).toEqual(['https://cdn.test/lk-speech-capture.js']);
    expect(audio.capturePath()).toBe('worklet');
  });

  it('reports unsupported when neither capture node can be built', async () => {
    const audio = install({ without: ['AudioWorkletNode', 'scriptProcessor'] });
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    expect(recorder.result.current).toMatchObject({ status: 'error', error: 'unsupported' });
    expect(audio.liveTracks()).toBe(0);
    expect(audio.openContexts()).toBe(0);
  });

  it('gives the microphone back when the graph itself cannot be built', async () => {
    const audio = install({ refuseSourceNode: true });
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    expect(recorder.result.current).toMatchObject({ status: 'error', error: 'failed' });
    expect(audio.liveTracks()).toBe(0);
    expect(audio.openContexts()).toBe(0);
  });

  it('ignores a second start while one is already running', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    await begin(recorder);
    expect(audio.microphonesOpened()).toBe(1);
    expect(recorder.result.current.status).toBe('recording');
  });

  it('stops offering takes once the budget is spent', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000, maxTakes: 2 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await begin(recorder);
      act(() => {
        audio.pushLevel(0.5, audio.sampleRate / 2);
      });
      act(() => {
        recorder.result.current.stop();
      });
    }
    expect(recorder.result.current).toMatchObject({ takesUsed: 2, canRecord: false });

    await begin(recorder);
    expect(audio.microphonesOpened()).toBe(2);
    expect(recorder.result.current.status).toBe('recorded');
  });

  it('throws a take away and releases the microphone with it', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    act(() => {
      audio.pushLevel(0.5, audio.sampleRate / 10);
    });
    act(() => {
      recorder.result.current.discard();
    });
    expect(recorder.result.current).toMatchObject({
      status: 'idle',
      take: null,
      takesUsed: 0,
      level: 0,
      elapsedMs: 0,
    });
    expect(audio.liveTracks()).toBe(0);
    expect(audio.openContexts()).toBe(0);
  });

  it('releases the microphone when the component unmounts mid-recording', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    act(() => {
      audio.pushLevel(0.5, audio.sampleRate / 10);
    });
    recorder.unmount();
    expect(audio.liveTracks()).toBe(0);
    expect(audio.openContexts()).toBe(0);
  });

  it('reports unsupported when the engine will open no more audio contexts', async () => {
    const audio = install({ refuseAudioContext: true });
    const recorder = mount({ maxDurationMs: 15_000 });
    await begin(recorder);
    expect(recorder.result.current).toMatchObject({ status: 'error', error: 'unsupported' });
    expect(audio.microphonesOpened()).toBe(1);
    expect(audio.liveTracks()).toBe(0);
  });

  it('gives the whole graph back when the attempt is abandoned mid-module-load', async () => {
    // The longest window in a start: fetching the worklet module over a
    // network, with the microphone already open and a context already built.
    const audio = install({ holdWorkletModule: true });
    const recorder = mount({ maxDurationMs: 15_000 });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = recorder.result.current.start();
    });
    await act(async () => {
      await settleUntil(() => audio.addedModules().length === 1);
    });
    expect(audio.openContexts()).toBe(1);

    act(() => {
      recorder.result.current.stop();
    });
    await act(async () => {
      audio.loadWorkletModule();
      await pending;
    });

    expect(recorder.result.current.status).toBe('idle');
    expect(audio.liveTracks()).toBe(0);
    expect(audio.openContexts()).toBe(0);
    expect(audio.liveObjectUrls()).toBe(0);
  });

  it('gives back a microphone granted after a stop cancelled the attempt', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000 });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = recorder.result.current.start();
    });
    expect(recorder.result.current.status).toBe('requesting-permission');

    act(() => {
      recorder.result.current.stop();
    });
    await act(async () => {
      await pending;
    });

    expect(recorder.result.current.status).toBe('idle');
    expect(audio.microphonesOpened()).toBe(1);
    expect(audio.liveTracks()).toBe(0);
    // Abandoned before an audio context was ever opened for it.
    expect(audio.contextsOpened()).toBe(0);
  });

  it('gives back a microphone granted after the component unmounted', async () => {
    const audio = install();
    const recorder = mount({ maxDurationMs: 15_000 });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = recorder.result.current.start();
    });
    recorder.unmount();
    await act(async () => {
      await pending;
    });
    expect(audio.microphonesOpened()).toBe(1);
    expect(audio.liveTracks()).toBe(0);
  });
});
