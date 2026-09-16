import { writeFakeSpeechWav } from './fake-speech.js';

/**
 * Runs once, in the main process, before any browser launches.
 *
 * The chromium project points `--use-file-for-fake-audio-capture` at a file
 * that has to exist by the time a worker starts its browser. Writing it here
 * rather than at config load is deliberate: every worker loads the config, so a
 * write there would run once per worker and could tear the file while another
 * worker's browser was reading it.
 */
export default function globalSetup(): void {
  writeFakeSpeechWav();
}
