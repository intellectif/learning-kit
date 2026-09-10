/**
 * Replays the grade-stability corpus against SOURCE, and checks that the corpus
 * is still the one `scripts/vector-cases.mjs` describes.
 *
 * `scripts/verify-dist.mjs` replays the same corpus against the BUILT package,
 * CJS and ESM. This file is the fast, early half of that gate, and the only
 * place the corpus is compared with its inputs.
 *
 * That comparison exists because the generator's refusal to change or remove
 * an expectation without `--accept-grade-change` only binds someone who runs
 * the generator, and CI never does. Before these checks, deleting a vector from
 * `scoring.json` by hand, or adding a case and never generating it, passed every
 * gate. What they still cannot stop is removing a case AND its vector together,
 * deliberately: that shows up as a deleted vector in review, which is where a
 * decision to stop pinning a grade belongs.
 *
 * Plain ESM on purpose: it loads `replay.mjs` and `scoring.json` the way
 * `vectors/README.md` tells a consumer to, so the documented recipe is itself
 * under test rather than merely described.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CASES } from '../../scripts/vector-cases.mjs';
import { canonical, encode, replay } from '../../vectors/replay.mjs';
import * as core from '../index.ts';

const corpus = JSON.parse(
  readFileSync(new URL('../../vectors/scoring.json', import.meta.url), 'utf8'),
);
const frozen = new Map(corpus.vectors.map((vector) => [vector.id, vector]));

/** The call a vector makes, without its result: exactly what the generator freezes. */
const callOf = (entry) =>
  canonical({
    fn: entry.fn ?? null,
    const: entry.const ?? null,
    args: entry.args ?? null,
    ignore: entry.ignore ?? null,
  });

describe('grade-stability corpus', () => {
  it('has a vector for every case, and no vector without a case', () => {
    expect(CASES.length).toBeGreaterThan(0);
    const caseIds = new Set(CASES.map((entry) => entry.id));
    // A case that was never generated, or a vector deleted from scoring.json by hand.
    expect(CASES.map((entry) => entry.id).filter((id) => !frozen.has(id))).toEqual([]);
    // A case removed without regenerating. Dropping a vector is a grade decision
    // and goes through `--accept-grade-change`.
    expect(corpus.vectors.map((vector) => vector.id).filter((id) => !caseIds.has(id))).toEqual([]);
  });

  it('freezes exactly the call each case declares', () => {
    // A hand-edited `args` in scoring.json would still replay green — against
    // the edited call — and quietly stop testing what the case says it tests.
    const drifted = CASES.filter((entry) => frozen.has(entry.id))
      .filter(
        (entry) =>
          callOf({ ...entry, args: entry.args?.map(encode) }) !== callOf(frozen.get(entry.id)),
      )
      .map((entry) => entry.id);
    expect(drifted).toEqual([]);
  });

  it('carries the current note for every vector (regenerate; no flag is needed)', () => {
    const stale = CASES.filter(
      (entry) =>
        frozen.has(entry.id) && (entry.note ?? null) !== (frozen.get(entry.id).note ?? null),
    ).map((entry) => entry.id);
    expect(stale).toEqual([]);
  });

  it('grades every vector exactly as it did when the vector was frozen', () => {
    const changed = replay(core, corpus)
      .filter((result) => !result.ok)
      .map(({ id, note, expected, actual }) => ({ id, note, expected, actual }));
    expect(changed).toEqual([]);
  });
});
