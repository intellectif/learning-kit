import type { ScoringDetail, XAPIActor } from '@intellectif/lk-core';

/**
 * The one global this module reads by name. Declared here, not globally: this
 * package compiles without Node's types on purpose, and nothing else in it may
 * come to rely on `process`.
 */
declare const process: { env: { NODE_ENV?: string } };

/**
 * Whether this is anything other than a production build — the one answer
 * every development check and the error boundary's stack trace read.
 *
 * **The literal `process.env.NODE_ENV`, spelled exactly so.** It is the one
 * expression bundlers replace at build time — Vite, webpack, esbuild, Next.js
 * and Rollup's replace plugin all substitute it — and a browser has no
 * `process` to read at run time. The reading this replaces,
 * `globalThis.process?.env?.NODE_ENV`, is not that expression, so no bundler
 * touched it, and in a browser it found no `process` and answered
 * "development" in every production app: learners were shown a stack trace
 * where each component's production fallback belonged. Tests running in Node
 * never saw it, because Node has a `process`.
 *
 * This package's own build must leave the literal in its output, for the
 * consumer's bundler to replace. A library build that substituted it would
 * freeze every consumer into whichever mode the library was built in.
 *
 * The `try` covers code that reaches a runtime unbundled, with no `process`
 * at all: that is development, as it always was.
 */
export function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
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

/**
 * The `correct` flag of a detail stored before lk-core 0.3, which carries it in
 * place of an `outcome`; `undefined` on any other detail. The type stopped
 * describing it in 1.0, but a grade of record stored then still has it. On a
 * blank, a gap or a word it meant the part was right; on a multiple-choice
 * option, that the learner acted rightly on it.
 */
export function legacyCorrect(detail: ScoringDetail): boolean | undefined {
  const { correct } = detail as { correct?: unknown };
  return typeof correct === 'boolean' ? correct : undefined;
}

/**
 * Whether a detail marks its blank, gap or word right: its `outcome`, or on a
 * detail stored before lk-core 0.3, its `correct` flag.
 */
export function detailIsRight(detail: ScoringDetail): boolean {
  const outcome: unknown = detail.outcome;
  return outcome === undefined ? legacyCorrect(detail) === true : outcome === 'correct';
}
