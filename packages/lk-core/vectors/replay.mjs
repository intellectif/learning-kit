/**
 * Replays the grade-stability corpus (`scoring.json`) against an lk-core build.
 *
 * The corpus is the SDK's binding rule — "anything that can change a historical
 * grade is a package major" — written down as data. Each vector is a call and
 * the exact value that call returned when the vector was frozen. If a release
 * returns anything else, a stored grade would score differently today than on
 * the day it was recorded, and that release is not allowed to be a minor.
 *
 * This file ships in the package so a consumer can run the same corpus against
 * the build they actually install, without re-implementing the comparison:
 *
 * ```js
 * import { createRequire } from 'node:module';
 * import { dirname, join } from 'node:path';
 * import { pathToFileURL } from 'node:url';
 * import { readFileSync } from 'node:fs';
 * import * as core from '@intellectif/lk-core';
 *
 * const root = dirname(createRequire(import.meta.url).resolve('@intellectif/lk-core/package.json'));
 * const { replay } = await import(pathToFileURL(join(root, 'vectors/replay.mjs')).href);
 * const corpus = JSON.parse(readFileSync(join(root, 'vectors/scoring.json'), 'utf8'));
 * const failures = replay(core, corpus).filter((result) => !result.ok);
 * ```
 *
 * It is plain ESM with no imports, so it runs unchanged under Node, Vitest and
 * Jest, and it is deliberately NOT a package export: an export would be new API
 * and a lk-core minor, which forces a lk-react major for a file of test data.
 *
 * ## Encoding
 *
 * JSON cannot express four values the scoring functions genuinely produce or
 * accept, so they are tagged: `{ "$number": "NaN" | "Infinity" | "-Infinity" |
 * "-0" }` and `{ "$undefined": true }`. `-0` is tagged because `roundGrade`
 * deliberately returns `0`, not `-0`, for a negative value that rounds to
 * zero, and JSON would erase the difference. A call that throws is recorded as
 * `{ "$throws": "<error.name>" }`.
 */

/** Bump only when the ENCODING changes. Adding vectors does not change it. */
export const CORPUS_VERSION = 1;

/** Turns a runtime value into the corpus's JSON-safe form. */
export function encode(value) {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $number: 'NaN' };
    if (value === Number.POSITIVE_INFINITY) return { $number: 'Infinity' };
    if (value === Number.NEGATIVE_INFINITY) return { $number: '-Infinity' };
    if (Object.is(value, -0)) return { $number: '-0' };
    return value;
  }
  if (value === undefined) return { $undefined: true };
  if (Array.isArray(value)) return value.map(encode);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      // An absent key and a key set to `undefined` serialise identically in
      // JSON; recording both as absent keeps the corpus honest about that.
      if (entry !== undefined) out[key] = encode(entry);
    }
    return out;
  }
  return value;
}

/** Inverse of {@link encode}. Always returns fresh objects. */
export function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$number') {
      return {
        NaN: Number.NaN,
        Infinity: Number.POSITIVE_INFINITY,
        '-Infinity': Number.NEGATIVE_INFINITY,
        '-0': -0,
      }[value.$number];
    }
    if (keys.length === 1 && keys[0] === '$undefined') return undefined;
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = decode(entry);
    return out;
  }
  return value;
}

/**
 * JSON with keys sorted at every depth. Object key ORDER is not a grade: a
 * refactor that reorders an object literal must not fail the gate, or people
 * learn to regenerate the corpus to make it pass — which is the one habit that
 * would turn this tripwire into a formality.
 */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Removes the named keys at every depth. Used only where a vector opts in. */
function without(value, ignore) {
  if (ignore.size === 0) return value;
  if (Array.isArray(value)) return value.map((entry) => without(entry, ignore));
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!ignore.has(key)) out[key] = without(entry, ignore);
    }
    return out;
  }
  return value;
}

/** Executes one vector against `core` and returns the encoded result. */
export function callVector(core, vector) {
  if (vector.const !== undefined) {
    return core[vector.const] === undefined
      ? { $missing: vector.const }
      : encode(core[vector.const]);
  }
  const fn = core[vector.fn];
  if (typeof fn !== 'function') return { $missing: vector.fn };
  try {
    return encode(fn(...vector.args.map(decode)));
  } catch (error) {
    return { $throws: error?.name ?? 'Error' };
  }
}

/**
 * Executes one vector and compares it with its frozen expectation.
 *
 * `ignore` exists for exactly one kind of field: a developer-facing diagnostic
 * sentence such as an `unscorable` reason. Rewording one of those does not
 * change a grade, and pinning its text would make copy edits fail a gate that
 * exists for grades. Codes that ARE contract — a deferred outcome's
 * `'requires_async_grading'` — are never ignored.
 */
export function runVector(core, vector) {
  const ignore = new Set(vector.ignore ?? []);
  const actual = canonical(without(callVector(core, vector), ignore));
  const expected = canonical(without(vector.expect, ignore));
  return { id: vector.id, ok: actual === expected, expected, actual, note: vector.note };
}

/** Replays a whole corpus. Throws if the corpus uses an encoding this file does not speak. */
export function replay(core, corpus) {
  if (corpus?.corpusVersion !== CORPUS_VERSION) {
    throw new Error(
      `scoring.json declares corpusVersion ${String(corpus?.corpusVersion)}, but this replay.mjs reads ` +
        `version ${CORPUS_VERSION}. Load the replay.mjs shipped beside the corpus.`,
    );
  }
  return corpus.vectors.map((vector) => runVector(core, vector));
}
