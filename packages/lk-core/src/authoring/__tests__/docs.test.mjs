/**
 * `docs/authoring.md` is where a consumer reads which draft issue codes exist
 * and how severe each is: the contract they translate by and branch on. A code
 * added, renamed or re-graded in `issues.ts` and not in the guide hands them a
 * table that is wrong, and nothing else would notice.
 *
 * Plain ESM, like `scoring-vectors.test.mjs`, because it reads a file from disk
 * and lk-core's typecheck carries no Node types for a `.ts` test to use.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRAFT_ISSUE_SEVERITY } from '../issues.ts';

describe('docs/authoring.md draft issue tables', () => {
  it('document every built-in code with its severity, and no code that does not exist', () => {
    const doc = readFileSync(new URL('../../../../../docs/authoring.md', import.meta.url), 'utf8');
    const start = doc.indexOf('### What each type reports');
    const end = doc.indexOf('### Your own activity types');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const rows = [
      ...doc.slice(start, end).matchAll(/^\| `([a-z_]+)` \| (incomplete|invalid) \|/gm),
    ].map(([, code, severity]) => [code, severity]);
    const documented = Object.fromEntries(rows);

    // A code listed twice would be collapsed by fromEntries and hide a conflict.
    expect(rows.length).toBe(Object.keys(documented).length);
    expect(documented).toEqual({ ...DRAFT_ISSUE_SEVERITY });
  });
});
