---
'@intellectif/lk-core': patch
---

Grade-stability vectors: lk-core's grading, frozen as data and shipped in the package.

The standing rule for this package is that anything which can change a historical grade is a major release. The unit suite already asserted scoring numbers, but against source, and those assertions change alongside the code they test. Nothing froze them independently, and nothing checked them against the package you actually install. Now something does.

`vectors/scoring.json` records 231 calls across every path that decides a grade — `score` and `evaluate` for each built-in activity type (including the legacy per-blank `caseSensitive` / `trimWhitespace` flags, and the refusal to score redacted data), written-response word counts recomputed from the text rather than taken from the client, `matchText` across every authored policy, rounding in every mode, `countWords`, `seededShuffle`, rubric grading, how a stored attempt plan becomes scored items, and whole-assessment composition — together with the exact value each returned. The values were frozen by executing 0.8.1, so **nothing about grading changes in this release**: the corpus records what already is.

- **It is replayed on every change.** `pnpm test` replays it against source; `check-packaging` replays it against the built package, CJS and ESM; and CI runs both on Node 22 and on Node 24, the Node the release is built with. A vector that returns anything different fails the build, by name.
- **It cannot drift from its inputs unnoticed.** `pnpm test` also fails when a case was never generated, a vector was deleted by hand, or a frozen call's arguments no longer match its case. The generator adds vectors freely but refuses to rewrite or remove one without `--accept-grade-change`.
- **Its coverage was tested rather than assumed.** The scoring source was deliberately broken — comparisons flipped, defaults changed, guards removed — and every one of those breaks that can reach a stored grade now fails at least one vector. The breaks that still pass change no grade: they touch feedback prose, xAPI patterns or a hook nothing in this package calls, have no observable effect, or sit exactly on a floating-point epsilon that only the epsilon itself can reach.
- **You can replay it against the build you install.** It ships in the tarball beside `vectors/replay.mjs`, which does the comparison, so a test suite that pins lk-core's arithmetic no longer has to restate it. `vectors/README.md` has the recipe.
- **It is deliberately not an export.** An export would be new public API — a minor, which would force a `@intellectif/lk-react` major for a file of test data. The corpus is reached by resolving `@intellectif/lk-core/package.json`, which is already exported.

Several vectors pin sharp edges on purpose, each with a note saying why. None of them changes in this release:

- rubric weights are read from each criterion and never joined from the activity's rubric;
- with no activity, `gradeFromRubric` compares against a literal `0.7` rather than `DEFAULT_PASS_THRESHOLD`;
- an unscorable item leaves the denominator of a composed score, which stays final;
- a paper whose graded sections all weigh 0 records a final 0 and a fail;
- `ignorePunctuation` on its own leaves the space a removed mark stood beside, so `"hola !"` does not match `"hola"` unless `collapseInnerWhitespace` is also set;
- band classification absorbs float noise just below a boundary, but not a genuine shortfall;
- `levenshtein: 1` against a one-character answer accepts any single character.

Also: the README now states the real browser floor — the built code needs `Object.hasOwn`, so Chrome and Edge 93, Firefox 92, Safari 15.4 — and the contributor docs no longer describe a Node 20 CI matrix that was retired.
