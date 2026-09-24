/**
 * Replays the validation corpus against SOURCE: every validator accepts and
 * refuses what it did when the corpus was frozen, each error at the same path
 * under the same code — what docs/stability.md promises for 1.x.
 *
 * `scripts/verify-dist.mjs` replays it against the BUILT package, CJS and ESM.
 * A change here is either a bug or a decision that needs
 * `--accept-validation-change` and a sentence in the changeset; see
 * `scripts/generate-validation-vectors.mjs`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { replayValidation } from '../../vectors/validation.mjs';
import * as core from '../index.ts';

const corpus = JSON.parse(
  readFileSync(new URL('../../vectors/validation.json', import.meta.url), 'utf8'),
);

describe('validation corpus', () => {
  it('accepts and refuses exactly as it did, each error at the same path under the same code', () => {
    const changed = replayValidation(core, corpus)
      .filter((result) => !result.ok)
      .map(({ id, expected, actual }) => ({ id, expected, actual }));
    expect(changed).toEqual([]);
  }, 60_000);
});
