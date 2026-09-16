import { describe, expect, it, vi } from 'vitest';
import { joinCaptureGroup, stopCaptureGroup } from '../capture-registry.js';

// The registry is module-level, so every test names its own group: a leftover
// member of a shared name would quietly decide the next test's result.
describe('capture registry', () => {
  it('stops every capture in the group it was asked about, and no other', () => {
    const mine = vi.fn();
    const theirs = vi.fn();
    const leaveMine = joinCaptureGroup('one-slot', mine);
    const leaveTheirs = joinCaptureGroup('another-slot', theirs);

    stopCaptureGroup('one-slot');

    expect(mine).toHaveBeenCalledTimes(1);
    expect(theirs).not.toHaveBeenCalled();
    leaveMine();
    leaveTheirs();
  });

  it('stops every member of one group', () => {
    const first = vi.fn();
    const second = vi.fn();
    const leaveFirst = joinCaptureGroup('two-members', first);
    const leaveSecond = joinCaptureGroup('two-members', second);

    stopCaptureGroup('two-members');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    leaveFirst();
    leaveSecond();
  });

  it('leaves the group when the removal it returned is called', () => {
    const stop = vi.fn();
    joinCaptureGroup('left-early', stop)();
    stopCaptureGroup('left-early');
    expect(stop).not.toHaveBeenCalled();
  });

  it('sweeps the members it found, not the ones a stop added', () => {
    // A component that answers `stop` by recording again must not be stopped
    // by the sweep its own stop provoked.
    const restarted = vi.fn();
    let leaveRestarted = (): void => {};
    const stop = vi.fn(() => {
      leaveRestarted = joinCaptureGroup('restarts', restarted);
    });
    const leave = joinCaptureGroup('restarts', stop);

    stopCaptureGroup('restarts');

    expect(stop).toHaveBeenCalledTimes(1);
    expect(restarted).not.toHaveBeenCalled();
    leave();
    leaveRestarted();
  });

  it('skips no member when another stop mutates the group mid-sweep', () => {
    const second = vi.fn();
    let leaveSecond = (): void => {};
    const first = vi.fn(() => {
      leaveSecond();
    });
    const leaveFirst = joinCaptureGroup('mutating', first);
    leaveSecond = joinCaptureGroup('mutating', second);

    stopCaptureGroup('mutating');

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    leaveFirst();
  });

  it('has nothing to stop in a group nobody joined', () => {
    expect(() => {
      stopCaptureGroup('never-used');
    }).not.toThrow();
  });

  it('forgets a group once its last member leaves, and can be rejoined', () => {
    const stop = vi.fn();
    joinCaptureGroup('rejoined', stop)();
    const leave = joinCaptureGroup('rejoined', stop);
    stopCaptureGroup('rejoined');
    expect(stop).toHaveBeenCalledTimes(1);
    leave();
  });

  it('is unmoved by a removal called twice', () => {
    const stop = vi.fn();
    const leave = joinCaptureGroup('left-twice', stop);
    leave();
    leave();
    stopCaptureGroup('left-twice');
    expect(stop).not.toHaveBeenCalled();
  });
});
