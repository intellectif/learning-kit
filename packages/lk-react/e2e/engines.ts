import { platform } from 'node:os';

/**
 * Playwright's Windows build of WebKit is neither Safari nor the WebKit CI
 * runs on Linux: it ships with no media backend and no Web Audio. A `<video>`
 * there never leaves `HAVE_NOTHING` — `duration` is NaN and `ended` never
 * fires — and `AudioContext` and `navigator.mediaDevices` do not exist.
 *
 * A spec that plays media or records skips that build by name, and only that
 * build, so a skip can never hide a failure on an engine that has them.
 */
export function isWindowsWebKit(browserName: string): boolean {
  return browserName === 'webkit' && platform() === 'win32';
}

export const NO_MEDIA_IN_WINDOWS_WEBKIT =
  "Playwright's Windows WebKit has no media backend and no Web Audio";
