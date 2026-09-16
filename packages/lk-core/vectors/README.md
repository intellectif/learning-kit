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
- **`alignDictation`, `diffDictationChars` and `dictationReferenceWords`**, with
  the five **`DICTATION_MAX_*`** limits: how a dictation reads the learner's text
  and each transcript — punctuation, compatibility forms, joiners and other
  invisible characters, lone surrogates — how equivalence rules rewrite them,
  which transcript an attempt is compared with when several are accepted and how
  a tie breaks, the words a transcript is split into, how words and characters
  are paired, and where each limit cuts.
- **`computePassThreshold` and `DEFAULT_PASS_THRESHOLD`**, including an authored
  threshold of `0`, and the opt-in `rounding` option of `score`, both where it
  turns a raw fail in the rounding band into a pass and where it changes nothing.
- **`roundGrade`, `gte` and `classifyBand`** in every mode, including float
  edges, negative zero, half-even ties and near-ties, and bands that share a
  minimum.
- **`countWords`**, **`seededShuffle`** in both versions, **`gradeFromRubric`**
  including its unscorable paths, its opt-in `rounding` option on each of the
  three ways a pass is decided, and **`outcomeFromGrade`**.
- **`gradeReadAloud`**: every reason a pronunciation assessment is refused
  rather than scored — each `unscorable` code — the weighted total over the
  authored dimensions, a blank take, a dimension scored `0` against one that was
  not scored at all, the pass line with and without rounding, and the per-word
  marks in `details`, which are for review and never feed the score.
- **`alignReadAloud`**, which decides the reference word each mark lands on:
  omissions, insertions and mispronunciations, a repeated word, an assessor word
  that normalises to no token or to two, punctuation that merges two words into
  one, and both `miscue` settings. **`validateSpeechAssessment`** with the paths
  and codes an adapter branches on — including the two totals that bound the
  text of an assessment, at the bound and one character past it — and
  **`outcomeFromUnscorable`**, which keeps a refusal's code in the stored
  outcome.
- **`validateActivity`**, for the one rule that decides whether an item can be
  stored at all rather than how an answer scores: a read-aloud `referenceText`
  that survives normalisation as nothing. An item that marks no word grades a
  silent take at 0 with no omission recorded and a perfect reading as a run of
  insertions, so loosening that refusal would move grades.
- **`inspectWav`** and the **`READ_ALOUD_*`** and `SPEECH_ASSESSMENT_MAX_WORDS`
  limits: what a recording's duration, peak level and voiced time are measured
  as, across silence, a tone, two channels, two sample rates, a partial last
  window, an odd chunk's pad byte and WAVE_FORMAT_EXTENSIBLE, and which files
  are reported unread instead of guessed at.
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

A recording is bytes, which JSON cannot express either, so a `Uint8Array` is
tagged `{ "$bytes": "<base64>" }` and comes back from `decode` as a fresh one.
Any other view of an `ArrayBuffer` is refused rather than tagged: JSON would
store it as `{"0":82,"1":73}`, which replays as an ordinary object, and the call
under test would be handed something that is not a byte array at all. The base64
is computed in `replay.mjs` itself, so the file needs no `Buffer` and still runs
wherever your tests run.

`corpusVersion` changes only if this encoding does — it is **2** since the
`$bytes` tag was added, and no expectation changed with it. Adding vectors does
not change it, so always load the `replay.mjs` that sits beside the corpus: an
older one throws rather than replaying a corpus it cannot read.

## `frozenFrom`

`frozenFrom` is **the version of `@intellectif/lk-core` the corpus was last
regenerated at** — the package version in `package.json` when someone ran
`node scripts/generate-vectors.mjs`. That is all it is.

**It is not the version this corpus ships in, and it is not expected to match
it.** `changeset version` bumps the package without regenerating the corpus, so
a release almost always publishes a corpus whose `frozenFrom` names the previous
version. That is correct and wanted: the string records when these expectations
were last recomputed, and a release that changes no expectation should not
rewrite them.

It is deliberately not asserted anywhere. `replay()` never reads it — it walks
`vectors` alone, comparing each frozen call with what your build returns — and
the generator's own grade-change check compares only each vector's call and
expectation, so a `frozenFrom` one version behind can never fail a grade gate.
(`corpusVersion` is different: `replay()` does check that one, and throws when
it does not recognise the encoding.) Read `frozenFrom` as a date stamp, not as a
package label. The version that matters for "which build produced this grade" is
the one you installed; record that yourself beside any grade you store.

Adding a regenerate-after-version step to the release was considered and
rejected: it would put a step that can fail *after* the version bump, which is
strictly worse than a string that reads one version behind.
