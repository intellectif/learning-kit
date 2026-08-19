import type { XAPIActor } from '@intellectif/lk-core';

/** Dev = anything other than an explicit production NODE_ENV (browser-safe). */
export function isDevelopment(): boolean {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.NODE_ENV !== 'production';
}

/**
 * Activity components cannot know the learner's identity (Req 3.1 fixes the
 * prop set). They emit a structurally-valid statement with this anonymous
 * actor; real identity is applied by the useXAPI/LRS layer (XAPIConfig.actor).
 */
export const ANONYMOUS_ACTOR: XAPIActor = {
  objectType: 'Agent',
  account: { homePage: 'https://github.com/intellectif/learning-kit', name: 'anonymous' },
};

/** `data.id` is not an IRI; xAPI object ids must be. Wrap it as a URN. */
export function objectIdFor(id: string): string {
  return `urn:learning-kit:activity:${encodeURIComponent(id)}`;
}

/**
 * Random per-mount session id for the shuffle seed. `crypto.randomUUID` is
 * unavailable outside secure contexts (plain-http LAN/staging hosts), so a
 * Math.random fallback keeps the component from crashing there — the seed
 * only randomises presentation order, so cryptographic strength is not needed.
 */
export function randomSessionId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  return `s-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
