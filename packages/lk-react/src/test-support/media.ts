/**
 * A minimal media pipeline for jsdom.
 *
 * jsdom implements no media stack: `play()` rejects with "Not implemented" and
 * `currentTime` never advances, so a transport under test can neither start nor
 * report a playhead. These stubs give the element the two behaviours the
 * transport actually reasons about — a paused flag and a settable playhead —
 * which is what lets the state machine be exercised rather than mocked away.
 *
 * Shared rather than duplicated because two suites need it: the transport's own
 * tests and the translation-coverage sweep, which has to reach the `pause` and
 * `preparing` labels and therefore has to be able to start playback.
 */
export function stubMediaElement(): void {
  const state = new WeakMap<HTMLMediaElement, { paused: boolean; time: number }>();
  const get = (el: HTMLMediaElement) => {
    let s = state.get(el);
    if (s === undefined) {
      s = { paused: true, time: 0 };
      state.set(el, s);
    }
    return s;
  };

  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return get(this).paused;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return get(this).time;
    },
    set(this: HTMLMediaElement, value: number) {
      get(this).time = value;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get: () => 60,
  });
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    get(this).paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    get(this).paused = true;
    this.dispatchEvent(new Event('pause'));
  };
}
