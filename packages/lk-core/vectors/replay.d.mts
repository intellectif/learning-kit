/** Types for `replay.mjs`. See that file for the contract and the encoding. */

/** The encoding version this replayer reads. */
export declare const CORPUS_VERSION: 1;

/** One frozen call. Exactly one of `fn` / `const` is present. */
export interface ScoringVector {
  id: string;
  fn?: string;
  const?: string;
  /** Encoded arguments. */
  args?: unknown[];
  /** Encoded return value, or `{ $throws: "<error.name>" }`. */
  expect: unknown;
  /** Keys excluded from comparison: developer-facing diagnostics only. */
  ignore?: string[];
  /** Why this vector exists, when that is not obvious from its id. */
  note?: string;
}

export interface ScoringCorpus {
  $comment?: string;
  corpusVersion: number;
  frozenFrom: string;
  vectors: ScoringVector[];
}

export interface VectorResult {
  id: string;
  ok: boolean;
  /** Canonical JSON of the frozen expectation. */
  expected: string;
  /** Canonical JSON of what this build returned. */
  actual: string;
  note?: string;
}

export declare function encode(value: unknown): unknown;
export declare function decode(value: unknown): unknown;
export declare function canonical(value: unknown): string;
/** `core` is the lk-core module namespace: `import * as core from '@intellectif/lk-core'`. */
export declare function callVector(core: object, vector: ScoringVector): unknown;
export declare function runVector(core: object, vector: ScoringVector): VectorResult;
export declare function replay(core: object, corpus: ScoringCorpus): VectorResult[];
