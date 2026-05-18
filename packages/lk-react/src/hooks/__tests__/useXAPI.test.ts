import type { XAPIConfig, XAPIStatement } from '@intellectif/lk-core';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useXAPI } from '../useXAPI.js';

const statement = { id: 's1', verb: { id: 'v' } } as unknown as XAPIStatement;

const cfg = (over: Partial<XAPIConfig> = {}): XAPIConfig => ({
  endpoint: 'https://lrs.example/xapi/statements',
  auth: { type: 'bearer', token: 'TKN' },
  activityId: 'act',
  actor: { objectType: 'Agent', mbox: 'mailto:l@example.com' },
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockFetch(impl: (call: number) => { ok: boolean; status: number }) {
  let n = 0;
  const fn = vi.fn(async () => {
    n += 1;
    return impl(n) as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('useXAPI', () => {
  it('POSTs once on success with the correct headers', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 204 }));
    const onError = vi.fn();
    const { result } = renderHook(() => useXAPI(cfg({ onError })));
    await result.current.sendStatement(statement);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Experience-API-Version']).toBe('1.0.3');
    expect(headers.Authorization).toBe('Bearer TKN');
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not retry a 4xx and reports onError immediately', async () => {
    const fetchMock = mockFetch(() => ({ ok: false, status: 400 }));
    const onError = vi.fn();
    const { result } = renderHook(() => useXAPI(cfg({ onError })));
    await result.current.sendStatement(statement);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, statusCode: 400 }));
  });

  it('retries 5xx with backoff then succeeds', async () => {
    const fetchMock = mockFetch((n) =>
      n < 3 ? { ok: false, status: 503 } : { ok: true, status: 204 },
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useXAPI(cfg({ onError })));
    const p = result.current.sendStatement(statement);
    await vi.runAllTimersAsync();
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports onError after exhausting retries and never rejects', async () => {
    const fetchMock = mockFetch(() => ({ ok: false, status: 500 }));
    const onError = vi.fn();
    const { result } = renderHook(() => useXAPI(cfg({ onError })));
    let rejected = false;
    const p = result.current.sendStatement(statement).catch(() => {
      rejected = true;
    });
    await vi.runAllTimersAsync();
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ attempt: 4, statusCode: 500 }));
    expect(rejected).toBe(false);
  });

  it('builds a UTF-8-safe Basic auth header', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 204 }));
    const { result } = renderHook(() =>
      useXAPI(cfg({ auth: { type: 'basic', username: 'u', password: 'p@ß' } })),
    );
    await result.current.sendStatement(statement);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('u:p@ß', 'utf8').toString('base64')}`);
  });
});
