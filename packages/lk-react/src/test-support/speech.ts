/**
 * A minimal Web Audio capture stack for jsdom.
 *
 * jsdom 25 implements almost none of it. Probed in this suite's own
 * environment rather than assumed, these are undefined: `AudioContext`,
 * `AudioWorkletNode`, `ScriptProcessorNode`, `MediaRecorder` and
 * `navigator.mediaDevices`. Without fakes for them a recorder cannot be
 * started under jsdom at all, so neither the hook's own suite nor the
 * translation sweep that has to reach every recording string could run.
 *
 * Two of the environment's own answers are worth writing down, because they
 * are not what a reading of jsdom's changelog predicts:
 *
 * - **`URL.createObjectURL` does exist here**, supplied by Node rather than by
 *   jsdom, minting `blob:nodedata:…`. It is still faked, so that a test can
 *   count what was minted and what was given back; and it can be taken away
 *   again with `without: ['objectUrls']`, which is the only way to reach the
 *   branch a strict embedder produces.
 * - **jsdom's `Blob` carries only `size`, `type` and `slice`** — no
 *   `arrayBuffer()`, no `text()`, no `stream()`. {@link bytesOf} is how a take's
 *   bytes are read here, and it is the reason this file exports it.
 *
 * The fakes are drivable rather than inert, which is the point: the
 * `addModule`-rejects path and the `ScriptProcessorNode` fallback are reached
 * by asking for them, not left as code no test can enter. The script-processor
 * fake also reuses its input buffer between callbacks, exactly as a real one
 * does, so a capture that forgot to copy a block fails here instead of in a
 * browser.
 *
 * Lives in `test-support/` because that directory is excluded from coverage.
 */

/**
 * The bytes of a `Blob`, the long way round.
 *
 * jsdom's `Blob` implements none of the byte accessors the platform has had
 * since 2019, so `FileReader` — which jsdom does implement — is the only route
 * from a take to the bytes a server would measure.
 */
export function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('the blob could not be read'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

/** A global or context member the harness can leave out. */
export type SpeechCaptureFeature =
  | 'mediaDevices'
  | 'AudioContext'
  | 'AudioWorkletNode'
  | 'audioWorklet'
  | 'scriptProcessor'
  | 'objectUrls';

export interface SpeechCaptureOptions {
  /** The rate the fake device captures at. Defaults to 48 kHz. */
  sampleRate?: number;
  /** Reject `getUserMedia` with an error carrying this `name`. */
  refuseMicrophone?: string;
  /** Throw from `new AudioContext()`, as a browser does once too many are open. */
  refuseAudioContext?: boolean;
  /** Reject `audioWorklet.addModule`, which drives the fallback. */
  refuseWorkletModule?: boolean;
  /**
   * Leave `audioWorklet.addModule` pending until
   * {@link SpeechCaptureHarness.loadWorkletModule} is called, which is the
   * window a real module fetch opens over a network.
   */
  holdWorkletModule?: boolean;
  /**
   * Throw from `createMediaStreamSource`, as a browser does for a stream whose
   * audio track has already ended.
   */
  refuseSourceNode?: boolean;
  /** Features to leave out of the environment. */
  without?: readonly SpeechCaptureFeature[];
}

export interface SpeechCaptureHarness {
  /** The rate the fake device captures at. */
  readonly sampleRate: number;
  /** How the capture node in use was built, or `'none'` before there is one. */
  capturePath(): 'worklet' | 'script-processor' | 'none';
  /** Delivers one block to the live capture node, one array per channel. */
  push(...channels: Float32Array[]): void;
  /** Delivers `frames` frames of mono at a steady amplitude. */
  pushLevel(amplitude: number, frames: number): void;
  /** Microphone streams `getUserMedia` has handed out. */
  microphonesOpened(): number;
  /** Tracks handed out and not yet stopped. */
  liveTracks(): number;
  /** Audio contexts constructed. */
  contextsOpened(): number;
  /** Audio contexts constructed and not yet closed. */
  openContexts(): number;
  /** Object URLs minted and not yet revoked. */
  liveObjectUrls(): number;
  /** The module URLs `addModule` was called with, in order. */
  addedModules(): readonly string[];
  /** Settles the `addModule` a `holdWorkletModule` harness left pending. */
  loadWorkletModule(): void;
  /** Puts back every global this replaced or added. */
  restore(): void;
}

interface ScriptProcessorEvent {
  inputBuffer: { numberOfChannels: number; getChannelData(channel: number): Float32Array };
}

/** The shared parts of every fake node: it can be wired up and taken apart. */
class FakeNode {
  connect(destination: unknown): unknown {
    return destination;
  }
  disconnect(): void {
    /* nothing this harness asserts on depends on the graph being taken apart */
  }
}

class FakeGainNode extends FakeNode {
  readonly gain = { value: 1 };
}

class FakeWorkletNode extends FakeNode {
  readonly port: { onmessage: ((event: { data: unknown }) => void) | null } = { onmessage: null };

  deliver(channels: readonly Float32Array[]): void {
    // A real processor copies each channel before posting it, and the
    // structured clone copies again, so fresh arrays are what a worklet
    // faithfully delivers.
    this.port.onmessage?.({ data: channels.map((channel) => channel.slice()) });
  }
}

class FakeScriptProcessorNode extends FakeNode {
  onaudioprocess: ((event: ScriptProcessorEvent) => void) | null = null;
  /** Reused between callbacks, exactly as a real node reuses its input buffer. */
  private readonly buffers: Float32Array[] = [];

  deliver(channels: readonly Float32Array[]): void {
    const handler = this.onaudioprocess;
    if (handler === null) {
      return;
    }
    for (let channel = 0; channel < channels.length; channel += 1) {
      const block = channels[channel];
      let buffer = this.buffers[channel];
      if (buffer === undefined || buffer.length < block.length) {
        buffer = new Float32Array(block.length);
        this.buffers[channel] = buffer;
      }
      buffer.set(block);
    }
    const frames = channels.length === 0 ? 0 : channels[0].length;
    handler({
      inputBuffer: {
        numberOfChannels: channels.length,
        getChannelData: (channel: number) => this.buffers[channel].subarray(0, frames),
      },
    });
  }
}

class FakeTrack {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

/** Builds an error `getUserMedia` would reject with, named as the standard names it. */
function refusal(name: string): Error {
  const error = new Error(`${name}: the fake microphone refused`);
  error.name = name;
  return error;
}

export function stubSpeechCapture(options: SpeechCaptureOptions = {}): SpeechCaptureHarness {
  const rate = options.sampleRate ?? 48_000;
  const without = new Set<SpeechCaptureFeature>(options.without ?? []);
  const undo: (() => void)[] = [];

  const tracks: FakeTrack[] = [];
  const streams: { getTracks(): readonly FakeTrack[] }[] = [];
  const contexts: { closed: boolean }[] = [];
  const urls = new Set<string>();
  const modules: string[] = [];
  let node: FakeWorkletNode | FakeScriptProcessorNode | null = null;
  let loadModule: (() => void) | null = null;

  /** Replaces one own property and remembers how to put it back. */
  const define = (target: object, key: string, value: unknown): void => {
    const had = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, writable: true, value });
    undo.push(() => {
      if (had === undefined) {
        delete (target as Record<string, unknown>)[key];
      } else {
        Object.defineProperty(target, key, had);
      }
    });
  };

  class FakeAudioContext {
    readonly sampleRate = rate;
    readonly destination = new FakeNode();
    readonly audioWorklet = without.has('audioWorklet')
      ? undefined
      : {
          addModule: (url: string): Promise<void> => {
            modules.push(url);
            if (options.refuseWorkletModule === true) {
              return Promise.reject(new Error('the fake worklet refused the module'));
            }
            if (options.holdWorkletModule !== true) {
              return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
              loadModule = resolve;
            });
          },
        };
    readonly createScriptProcessor = without.has('scriptProcessor')
      ? undefined
      : (): FakeScriptProcessorNode => {
          const created = new FakeScriptProcessorNode();
          node = created;
          return created;
        };
    private readonly open = { closed: false };

    constructor() {
      if (options.refuseAudioContext === true) {
        throw new Error('the fake engine has too many audio contexts open');
      }
      contexts.push(this.open);
    }

    /** Stands in for `MediaStreamAudioSourceNode`, which jsdom also lacks. */
    createMediaStreamSource(): FakeNode {
      if (options.refuseSourceNode === true) {
        throw new Error('the fake stream carries no live audio track');
      }
      return new FakeNode();
    }

    createGain(): FakeGainNode {
      return new FakeGainNode();
    }

    close(): Promise<void> {
      this.open.closed = true;
      return Promise.resolve();
    }
  }

  // A feature in `without` is defined as `undefined` rather than left alone:
  // the environment supplies `URL.createObjectURL` itself, so leaving it alone
  // would leave the branch it guards unreachable.
  define(
    globalThis.navigator,
    'mediaDevices',
    without.has('mediaDevices')
      ? undefined
      : {
          getUserMedia: (): Promise<unknown> => {
            if (options.refuseMicrophone !== undefined) {
              return Promise.reject(refusal(options.refuseMicrophone));
            }
            const track = new FakeTrack();
            tracks.push(track);
            const stream = { getTracks: (): readonly FakeTrack[] => [track] };
            streams.push(stream);
            return Promise.resolve(stream);
          },
        },
  );

  define(globalThis, 'AudioContext', without.has('AudioContext') ? undefined : FakeAudioContext);

  define(
    globalThis,
    'AudioWorkletNode',
    without.has('AudioWorkletNode')
      ? undefined
      : class extends FakeWorkletNode {
          constructor() {
            super();
            node = this;
          }
        },
  );

  let minted = 0;
  define(
    globalThis.URL,
    'createObjectURL',
    without.has('objectUrls')
      ? undefined
      : (): string => {
          minted += 1;
          const url = `blob:lk-speech/${minted}`;
          urls.add(url);
          return url;
        },
  );
  define(
    globalThis.URL,
    'revokeObjectURL',
    without.has('objectUrls')
      ? undefined
      : (url: string): void => {
          urls.delete(url);
        },
  );

  const deliver = (channels: readonly Float32Array[]): void => {
    if (node === null) {
      throw new Error('stubSpeechCapture: no capture node has been built yet');
    }
    node.deliver(channels);
  };

  return {
    sampleRate: rate,
    capturePath: () =>
      node === null ? 'none' : node instanceof FakeWorkletNode ? 'worklet' : 'script-processor',
    push: (...channels) => {
      deliver(channels);
    },
    pushLevel: (amplitude, frames) => {
      deliver([new Float32Array(frames).fill(amplitude)]);
    },
    microphonesOpened: () => streams.length,
    liveTracks: () => tracks.filter((track) => !track.stopped).length,
    contextsOpened: () => contexts.length,
    openContexts: () => contexts.filter((context) => !context.closed).length,
    liveObjectUrls: () => urls.size,
    addedModules: () => modules,
    loadWorkletModule: () => {
      if (loadModule === null) {
        throw new Error('stubSpeechCapture: no worklet module is waiting to load');
      }
      loadModule();
      loadModule = null;
    },
    restore: () => {
      for (const put of undo.reverse()) {
        put();
      }
      undo.length = 0;
      node = null;
    },
  };
}
