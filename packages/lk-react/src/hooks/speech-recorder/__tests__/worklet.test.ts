import { afterEach, describe, expect, it } from 'vitest';
import { type SpeechCaptureHarness, stubSpeechCapture } from '../../../test-support/speech.js';
import { CAPTURE_PROCESSOR, CAPTURE_PROCESSOR_SOURCE, createProcessorUrl } from '../worklet.js';

let harness: SpeechCaptureHarness | null = null;

afterEach(() => {
  harness?.restore();
  harness = null;
});

interface CapturedProcessor {
  process(inputs: Float32Array[][]): boolean;
}

/**
 * Evaluates the processor source in a stand-in for `AudioWorkletGlobalScope`.
 *
 * The source is a string, so no compiler checks it and no bundler parses it:
 * this is the only place its behaviour is proved, and the behaviour that
 * matters is that it copies a block before it posts it.
 */
function loadProcessor(): { processor: CapturedProcessor; posted: unknown[] } {
  const posted: unknown[] = [];
  class AudioWorkletProcessorStub {
    readonly port = {
      postMessage: (message: unknown): void => {
        posted.push(message);
      },
    };
  }
  let registeredName = '';
  let registered: (new () => CapturedProcessor) | null = null;
  const evaluate = new Function(
    'AudioWorkletProcessor',
    'registerProcessor',
    CAPTURE_PROCESSOR_SOURCE,
  );
  evaluate(AudioWorkletProcessorStub, (name: string, declared: new () => CapturedProcessor) => {
    registeredName = name;
    registered = declared;
  });
  const Processor = registered as (new () => CapturedProcessor) | null;
  if (Processor === null) {
    throw new Error('the processor source registered nothing');
  }
  expect(registeredName).toBe(CAPTURE_PROCESSOR);
  return { processor: new Processor(), posted };
}

describe('CAPTURE_PROCESSOR_SOURCE', () => {
  it('posts a copy of every block, not the buffer the audio thread reuses', () => {
    const { processor, posted } = loadProcessor();
    // Values a 32-bit float holds exactly, so the assertion is about the copy
    // and not about the rounding a Float32Array does on the way in.
    const quantum = new Float32Array([0.25, 0.5]);
    expect(processor.process([[quantum]])).toBe(true);
    quantum.fill(0.875);
    expect(posted).toHaveLength(1);
    expect(Array.from((posted[0] as Float32Array[])[0])).toEqual([0.25, 0.5]);
  });

  it('posts every channel the input carries', () => {
    const { processor, posted } = loadProcessor();
    processor.process([[new Float32Array([1]), new Float32Array([-1])]]);
    expect((posted[0] as Float32Array[]).map((channel) => channel[0])).toEqual([1, -1]);
  });

  it('stays alive through a disconnected input rather than ending the capture', () => {
    const { processor, posted } = loadProcessor();
    expect(processor.process([])).toBe(true);
    expect(processor.process([[]])).toBe(true);
    expect(posted).toHaveLength(0);
  });
});

describe('createProcessorUrl', () => {
  it('is null where object URLs are unavailable, which is not a failed recording', () => {
    // The environment supplies `URL.createObjectURL` itself — Node's, not
    // jsdom's — so the harness has to take it away to produce the shape a
    // hardened embedder has, where the caller must fall back rather than throw.
    harness = stubSpeechCapture({ without: ['objectUrls'] });
    expect(createProcessorUrl()).toBeNull();
  });

  it('is null where there is no URL constructor at all', () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'URL');
    delete (globalThis as { URL?: unknown }).URL;
    try {
      expect(createProcessorUrl()).toBeNull();
    } finally {
      if (had !== undefined) {
        Object.defineProperty(globalThis, 'URL', had);
      }
    }
  });

  it('mints a URL and gives it back again', () => {
    harness = stubSpeechCapture();
    const module = createProcessorUrl();
    if (module === null) {
      throw new Error('the harness installed no object URLs');
    }
    expect(harness.liveObjectUrls()).toBe(1);
    module.release();
    expect(harness.liveObjectUrls()).toBe(0);
  });
});
