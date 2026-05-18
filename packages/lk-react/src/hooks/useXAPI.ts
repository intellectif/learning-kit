'use client';

import type { XAPIConfig, XAPIStatement } from '@intellectif/lk-core';
import { useCallback, useRef } from 'react';

/** Backoff before retry 1 / 2 / 3 (Req 10.4). */
const BACKOFF_MS = [1000, 2000, 4000] as const;

/** UTF-8-safe base64 (`btoa` is Latin1-only and breaks on non-ASCII creds). */
function toBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function authHeader(auth: XAPIConfig['auth']): string {
  return auth.type === 'basic'
    ? `Basic ${toBase64Utf8(`${auth.username}:${auth.password}`)}`
    : `Bearer ${auth.token}`;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface UseXAPIResult {
  /**
   * Sends a statement to the configured LRS. **Never rejects** — xAPI is
   * fire-and-forget telemetry that must not break the learner's activity
   * flow. Network errors and 5xx responses are retried (backoff 1s/2s/4s,
   * up to 3 retries); a 4xx fails immediately. Any final failure is delivered
   * to `config.onError`.
   */
  sendStatement: (statement: XAPIStatement) => Promise<void>;
}

export function useXAPI(config: XAPIConfig): UseXAPIResult {
  // Keep the latest config without changing `sendStatement`'s identity when
  // callers pass an inline config object.
  const configRef = useRef(config);
  configRef.current = config;

  const sendStatement = useCallback(async (statement: XAPIStatement): Promise<void> => {
    const cfg = configRef.current;
    const maxAttempts = 1 + BACKOFF_MS.length;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let statusCode: number | undefined;
      let message = 'Request failed';

      try {
        const response = await fetch(cfg.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Experience-API-Version': '1.0.3',
            Authorization: authHeader(cfg.auth),
          },
          body: JSON.stringify(statement),
        });

        if (response.ok) {
          return;
        }

        statusCode = response.status;
        message = `LRS responded with ${response.status}`;

        // Only network errors and 5xx are retryable (Req 10.4). A 4xx is a
        // client error — fail immediately rather than waste retries.
        if (response.status < 500) {
          cfg.onError?.({ statement, attempt, statusCode, message });
          return;
        }
      } catch (error) {
        message = error instanceof Error ? error.message : 'Network error';
      }

      if (attempt === maxAttempts) {
        cfg.onError?.({
          statement,
          attempt,
          ...(statusCode !== undefined ? { statusCode } : {}),
          message,
        });
        return;
      }

      await sleep(BACKOFF_MS[attempt - 1]);
    }
  }, []);

  return { sendStatement };
}
