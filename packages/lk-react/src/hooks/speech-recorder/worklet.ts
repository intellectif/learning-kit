'use client';

/**
 * The audio worklet processor, and the module URL it is loaded through.
 *
 * The processor must run inside `AudioWorkletGlobalScope`, which can only be
 * reached by URL. Source text turned into a Blob URL is the only form of that
 * which needs nothing of the consuming application: `import.meta` is not
 * available in every target this package is bundled for — the CommonJS build
 * among them — and a separate asset file would have to be copied into the
 * public directory of every application that installs the SDK.
 *
 * An application whose Content-Security-Policy refuses that URL self-hosts the
 * same source and passes its URL as `workletUrl` instead. The source is public
 * for exactly that reason — see {@link CAPTURE_PROCESSOR_SOURCE}.
 */

/** The name the processor registers itself under, and is constructed by. */
export const CAPTURE_PROCESSOR = 'lk-speech-capture';

/**
 * The audio worklet module `useSpeechRecorder` captures through, as source
 * text — exported so an application with a strict Content-Security-Policy can
 * serve it itself.
 *
 * By default the hook loads this text from a `blob:` URL. A worklet module is
 * loaded as a script, so it is `script-src` that must allow `blob:` —
 * `worker-src` does not govern it. Where that is refused, write this string to
 * a file your policy's `script-src` does allow, at build time and from the
 * installed package so it moves with the version you run, and pass that file's
 * URL as `workletUrl`:
 *
 * ```ts
 * import { writeFileSync } from 'node:fs';
 * import { CAPTURE_PROCESSOR_SOURCE } from '@intellectif/lk-react/hooks/useSpeechRecorder';
 *
 * writeFileSync('public/lk-speech-capture.js', CAPTURE_PROCESSOR_SOURCE);
 * ```
 *
 * **The contract** a module at `workletUrl` must meet, which this source does:
 * register an `AudioWorkletProcessor` under the name `lk-speech-capture`, and
 * from its `process(inputs)` post the first input's channels to its `port` as
 * an array with one `Float32Array` per channel, **copied** — the render
 * quantum's buffers belong to the audio thread and are overwritten on the next
 * quantum, so a block posted without copying arrives as whatever the
 * microphone heard some milliseconds later. Return `true`, which keeps the
 * processor alive while its source is silent. Anything else changes what is
 * recorded, so serve this text unchanged rather than a copy of your own.
 */
export const CAPTURE_PROCESSOR_SOURCE = `class LkSpeechCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input === undefined || input.length === 0) {
      return true;
    }
    const block = [];
    for (let channel = 0; channel < input.length; channel += 1) {
      block.push(input[channel].slice());
    }
    this.port.postMessage(block);
    return true;
  }
}
registerProcessor(${JSON.stringify(CAPTURE_PROCESSOR)}, LkSpeechCapture);
`;

/** A module URL and the release that frees it. */
export interface ProcessorModule {
  url: string;
  release(): void;
}

/** The object-URL pair, as much of it as an environment happens to have. */
interface ObjectUrls {
  createObjectURL?(blob: Blob): string;
  revokeObjectURL?(url: string): void;
}

/**
 * Wraps {@link CAPTURE_PROCESSOR_SOURCE} in an object URL.
 *
 * Returns `null` where object URLs are unavailable — a server render, a test
 * environment, a hardened embedder — rather than throwing, because the caller
 * has a working fallback for exactly that case and a missing URL factory is
 * not a failed recording.
 *
 * Called from `start()` and never at module scope: `URL.createObjectURL` is a
 * browser global, and reading one while a module is evaluated is what breaks a
 * server render.
 */
export function createProcessorUrl(): ProcessorModule | null {
  const urls = (globalThis as { URL?: ObjectUrls }).URL;
  if (urls === undefined) {
    return null;
  }
  const create = urls.createObjectURL;
  const revoke = urls.revokeObjectURL;
  if (create === undefined || revoke === undefined) {
    return null;
  }
  const url = create.call(urls, new Blob([CAPTURE_PROCESSOR_SOURCE], { type: 'text/javascript' }));
  return {
    url,
    release: () => {
      revoke.call(urls, url);
    },
  };
}
