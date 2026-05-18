import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useActivityState } from '../useActivityState.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('useActivityState', () => {
  it('starts idle with zero elapsed time', () => {
    const { result } = renderHook(() => useActivityState());
    expect(result.current.state).toBe('idle');
    expect(result.current.getTimeSpent()).toBe(0);
  });

  it('transitions through start → complete → review → reset', () => {
    const { result } = renderHook(() => useActivityState());
    act(() => result.current.start());
    expect(result.current.state).toBe('in-progress');
    act(() => result.current.complete());
    expect(result.current.state).toBe('completed');
    act(() => result.current.review());
    expect(result.current.state).toBe('reviewing');
    act(() => result.current.reset());
    expect(result.current.state).toBe('idle');
    expect(result.current.getTimeSpent()).toBe(0);
  });

  it('start() is idempotent — repeated calls do not restart timing', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useActivityState());
    act(() => result.current.start());
    vi.advanceTimersByTime(50);
    const t1 = result.current.getTimeSpent();
    act(() => result.current.start());
    const t2 = result.current.getTimeSpent();
    expect(t1).toBeGreaterThanOrEqual(50);
    expect(t2).toBeGreaterThanOrEqual(t1);
    expect(result.current.state).toBe('in-progress');
  });

  it('reset() clears timing and a fresh start() re-times', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useActivityState());
    act(() => result.current.start());
    vi.advanceTimersByTime(30);
    act(() => result.current.reset());
    expect(result.current.getTimeSpent()).toBe(0);
    act(() => result.current.start());
    expect(result.current.state).toBe('in-progress');
    expect(result.current.getTimeSpent()).toBeGreaterThanOrEqual(0);
  });
});
