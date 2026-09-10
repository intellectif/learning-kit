# Grade-stability vectors

`scoring.json` is lk-core's binding rule written down as data:

> Anything that can change a historical grade is a package **major**, always.

Each vector is a call to a scoring function and the exact value that call
returned when the vector was frozen. If a release of `@intellectif/lk-core`
returns anything different for any vector, a grade you stored would come out
differently today than on the day you recorded it — and that release is not
allowed to be a minor or a patch.

The SDK replays this corpus against its own source and against its built
package, CommonJS and ES module, on every pull request, on the Node version
consumers run and on the one the release is built with. It ships in the tarball
so you can replay it against the build **you** install.

## Replaying it in your own test suite

```js
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '@intellectif/lk-core';

const root = dirname(createRequire(import.meta.url).resolve('@intellectif/lk-core/package.json'));
const { replay } = await import(pathToFileURL(join(root, 'vectors/replay.mjs')).href);
const corpus = JSON.parse(readFileSync(join(root, 'vectors/scoring.json'), 'utf8'));

test('lk-core still grades exactly as it did', () => {
  const changed = replay(core, corpus).filter((result) => !result.ok);
  expect(changed).toEqual([]);
});
```

These files are deliberately **not** package exports. An export would be new
public API — a lk-core minor, which forces a lk-react major — for what is test
data. They are reached by resolving `package.json`, which lk-core does export.

## If a vector fails

Do not change the expectation to make it pass. A failing vector means an
upgrade changed how a learner's answer scores. Decide whether that change is
wanted, and if it is, work out what it does to grades you already hold before
you accept the new number. Every failure names its vector, and the ones that pin
a known hazard carry a `note` saying why they exist.

## What it covers

- **`score` and `evaluate`** for every built-in activity type, including each
  default a future release could plausibly "improve" — diacritic folding, Unicode
  normalisation, empty-input handling — the legacy per-blank `caseSensitive` and
  `trimWhitespace` flags and the way `match` overrides them, and the refusal to
  score redacted data or an answer key that cannot produce a finite score.
- **Written-response word counts**, recomputed from the text rather than taken
  from the client's `wordCount`, with inclusive `minWords` / `maxWords` bounds.
- **`matchText` and `levenshteinDistance`** across every authored policy.
- **`computePassThreshold` and `DEFAULT_PASS_THRESHOLD`**, including an authored
  threshold of `0`.
- **`roundGrade`, `gte` and `classifyBand`** in every mode, including float
  edges, negative zero, half-even ties and near-ties, and bands that share a
  minimum.
- **`countWords`**, **`seededShuffle`** in both versions, **`gradeFromRubric`**
  including its unscorable paths, and **`outcomeFromGrade`**.
- **`scoredItemsFromPlan`**, which decides what a stored paper's denominator is
  when an outcome is missing, and **`composeAssessmentScore`** across weights,
  points, provisional and unscorable items, and section thresholds.

## What it does not cover

- **Planning an attempt** (`planAttempt`, `planHash`, `verifyAttemptPlan`) and
  **redaction** (`redact`). A plan's hashes are identity rather than a grade, and
  both are verified by their own tests. How a stored plan becomes scored items is
  covered, above.
- **Custom missing-outcome policies.** `scoredItemsFromPlan` accepts a function
  for `missing`; a function cannot be stored as data, so only the built-in
  policies are pinned.
- **xAPI statements**, and **anything `@intellectif/lk-react` renders**.
- **Your own arithmetic.** If you round, aggregate or canonicalise answers
  yourself, this corpus says nothing about that code.
- **Text of developer-facing diagnostics.** A vector can mark a field such as an
  `unscorable` reason as ignored, because rewording a diagnostic is not a grade
  change. Codes that are contract, like `'requires_async_grading'`, are never
  ignored.

## Encoding

JSON cannot express four values these functions produce or accept, so they are
tagged: `{ "$number": "NaN" | "Infinity" | "-Infinity" | "-0" }` and
`{ "$undefined": true }`. A call that throws is recorded as
`{ "$throws": "<error.name>" }`. Every non-ASCII character is stored as a
`\uXXXX` escape, so a no-break space can never pass for an ordinary one.
Comparison ignores object key order.

`corpusVersion` changes only if this encoding does. Adding vectors does not
change it, so always load the `replay.mjs` that sits beside the corpus.
