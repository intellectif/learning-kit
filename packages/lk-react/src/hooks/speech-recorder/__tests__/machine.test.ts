import { describe, expect, it } from 'vitest';
import {
  IDLE_RECORDER,
  type RecordedTake,
  type RecorderState,
  reduceRecorder,
} from '../machine.js';

const take: RecordedTake = {
  blob: new Blob([new Uint8Array(44)], { type: 'audio/wav' }),
  mimeType: 'audio/wav',
  durationMs: 1400,
  peakLevel: 0.4,
};

/** The state after a whole recording, which most transitions are reached from. */
function recorded(): RecorderState {
  const requested = reduceRecorder(IDLE_RECORDER, { kind: 'requested' });
  const started = reduceRecorder(requested, { kind: 'started' });
  return reduceRecorder(started, { kind: 'captured', take });
}

describe('reduceRecorder', () => {
  it('starts idle, with nothing recorded and no take spent', () => {
    expect(IDLE_RECORDER).toEqual({
      status: 'idle',
      error: null,
      level: 0,
      elapsedMs: 0,
      take: null,
      takesUsed: 0,
    });
  });

  it('runs a whole recording from request to take', () => {
    const requested = reduceRecorder(IDLE_RECORDER, { kind: 'requested' });
    expect(requested.status).toBe('requesting-permission');
    const started = reduceRecorder(requested, { kind: 'started' });
    expect(started.status).toBe('recording');
    const running = reduceRecorder(started, { kind: 'progress', level: 0.3, elapsedMs: 700 });
    expect(running).toMatchObject({ level: 0.3, elapsedMs: 700 });
    const done = reduceRecorder(running, { kind: 'captured', take });
    expect(done).toMatchObject({
      status: 'recorded',
      take,
      takesUsed: 1,
      level: 0,
      elapsedMs: 1400,
    });
  });

  it('clears the previous take when the next attempt begins', () => {
    // A take left on screen through the next recording would offer a submit
    // button for audio that is no longer the one just made.
    const again = reduceRecorder(recorded(), { kind: 'requested' });
    expect(again.take).toBeNull();
    expect(again.takesUsed).toBe(1);
  });

  it('spends a take on a recording, and never gives one back', () => {
    const after = reduceRecorder(recorded(), { kind: 'discarded' });
    expect(after).toMatchObject({ status: 'idle', take: null, takesUsed: 1 });
  });

  it('spends no take on a recording that was refused', () => {
    const started = reduceRecorder(reduceRecorder(IDLE_RECORDER, { kind: 'requested' }), {
      kind: 'started',
    });
    const short = reduceRecorder(started, { kind: 'failed', error: 'too-short' });
    expect(short).toMatchObject({ status: 'error', error: 'too-short', take: null, takesUsed: 0 });
  });

  it('keeps the elapsed time a refusal was measured from', () => {
    const running = reduceRecorder(
      reduceRecorder(reduceRecorder(IDLE_RECORDER, { kind: 'requested' }), { kind: 'started' }),
      { kind: 'progress', level: 0.2, elapsedMs: 300 },
    );
    expect(reduceRecorder(running, { kind: 'failed', error: 'too-short' }).elapsedMs).toBe(300);
  });

  it('ignores a microphone that opens after the attempt was abandoned', () => {
    const abandoned = reduceRecorder(reduceRecorder(IDLE_RECORDER, { kind: 'requested' }), {
      kind: 'discarded',
    });
    expect(reduceRecorder(abandoned, { kind: 'started' })).toBe(abandoned);
  });

  it('ignores a block that arrives after the capture ended', () => {
    const after = recorded();
    expect(reduceRecorder(after, { kind: 'progress', level: 0.9, elapsedMs: 9000 })).toBe(after);
  });

  it('clears an earlier error when a new attempt begins', () => {
    const failed = reduceRecorder(IDLE_RECORDER, { kind: 'failed', error: 'permission-denied' });
    expect(reduceRecorder(failed, { kind: 'requested' }).error).toBeNull();
  });

  it('gives the budget back on a reset, which is the whole difference from a discard', () => {
    // A discard is the same learner replacing their own take and must cost
    // them one; a reset is a different reading in the same mounted component,
    // and its takes are its own.
    const after = reduceRecorder(recorded(), { kind: 'reset' });
    expect(after).toEqual(IDLE_RECORDER);
    expect(reduceRecorder(recorded(), { kind: 'discarded' }).takesUsed).toBe(1);
  });

  it('costs no render when a reset finds nothing to reset', () => {
    expect(reduceRecorder(IDLE_RECORDER, { kind: 'reset' })).toBe(IDLE_RECORDER);
  });
});
