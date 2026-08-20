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
  // Params are declared so `mock.calls[i][1]` is typed as the request init
  // rather than an empty tuple — otherwise the header assertions below only
  // compile behind a cast that hides real mistakes.
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
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
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
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
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    // Literal, not Buffer.from(...): lk-react is a browser package, and
    // recomputing the expectation the same way the implementation does would
    // make this assertion tautological. 'u:p@ß' is UTF-8 75 3A 70 40 C3 9F.
    expect(headers.Authorization).toBe('Basic dTpwQMOf');
  });
});

describe('useXAPI identity application (release-review fixes)', () => {
  const sdkStatement = (id: string): XAPIStatement =>
    ({
      id: 's-x',
      actor: {
        objectType: 'Agent',
        account: { homePage: 'https://github.com/intellectif/learning-kit', name: 'anonymous' },
      },
      verb: { id: 'http://adlnet.gov/expapi/verbs/answered', display: { 'en-US': 'answered' } },
      object: { objectType: 'Activity', id },
      timestamp: 'now',
      version: '1.0.3',
    }) as unknown as XAPIStatement;

  it('maps each SDK URN through an activityId function (multi-activity pages)', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 200 }));
    const { result } = renderHook(() =>
      useXAPI(cfg({ activityId: (urn) => `https://app.example/items/${urn.split(':').pop()}` })),
    );
    await result.current.sendStatement(sdkStatement('urn:learning-kit:activity:q1'));
    await result.current.sendStatement(sdkStatement('urn:learning-kit:activity:q2'));
    const bodies = fetchMock.mock.calls.map((c) =>
      JSON.parse((c as unknown as [string, { body: string }])[1].body),
    );
    expect(bodies[0].object.id).toBe('https://app.example/items/q1');
    expect(bodies[1].object.id).toBe('https://app.example/items/q2');
    expect(bodies[0].actor.mbox).toBe('mailto:l@example.com');
  });

  it('leaves consumer-rewritten actors and object ids untouched', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 200 }));
    const { result } = renderHook(() => useXAPI(cfg({ activityId: 'https://app.example/one' })));
    const custom = {
      ...sdkStatement('https://consumer.example/already-set'),
      actor: { objectType: 'Agent', mbox: 'mailto:real@example.com' },
    } as unknown as XAPIStatement;
    await result.current.sendStatement(custom);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body.object.id).toBe('https://consumer.example/already-set');
    expect(body.actor.mbox).toBe('mailto:real@example.com');
  });
});
