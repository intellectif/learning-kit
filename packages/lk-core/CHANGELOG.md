# @intellectif/lk-core

## 0.5.0

### Minor Changes

- 339a5e0: Hardening: a typecheck gate, descriptor-driven xAPI interop, and an opt-in rounded item threshold.

  **The test suites did not compile, and nothing noticed.** `tsc` only ever ran over `src/` as part of the build, so type errors in test files accumulated unseen — and a released defect (`redact()` being uncallable with the SDK's own exported interfaces) survived precisely because the suite that should have caught it was not type-checked. Both packages now have a `typecheck` script covering the full program, tests included, wired into `turbo` and CI. Getting to zero surfaced real problems rather than noise: matcher types that were never in the program (a `vitest-axe` augmentation the package does not ship), a fetch mock whose untyped parameters made `mock.calls[i][1]` an empty tuple so header assertions only compiled behind a cast, and a Node-only `Buffer` in a browser package's test.

  **`xapiDefinitionFor(data)` (new).** `ActivityTypeDescriptor.interop` declares the activity-type IRI, the cmi.interaction type and how to derive `correctResponsesPattern` — and had **no reader anywhere**. Every renderer rebuilt the same strings inline, which is the same "declared but never used" defect this SDK has fixed elsewhere. The built-in components now read the descriptor, so a consumer-registered activity type gets correct xAPI interop with no component changes. Returns `{}` for an unregistered type, so it is always safe to spread.

  **`computePassThreshold(data, score, rounding?)` — new optional third argument.** Item-level pass/fail still compared raw floats with `>=`, so an item displayed as "70%" could be recorded as a fail at 69.6 — exactly the disagreement `RoundingPolicy` eliminates for assessment totals. Passing a policy compares both sides rounded, via `gte`. It is **opt-in**: enabling it by default would change item-level pass/fail for any score inside the rounding band, and this SDK does not alter historical grades without an explicit decision. Absent, the comparison is bit-for-bit what it has always been.

- 2d962aa: Shared stimulus and item groups — the reading/listening-comprehension container.

  **The gap was a container, not an item type.** Real comprehension content is one passage or recording serving several questions; with nowhere to put the passage, it ended up hidden behind a toggle or pasted into every item. `Stimulus` and `ItemGroup` are that container, modelled as **content** so they drop into a sequence, a lesson quiz or an exam section alike. `kind` is enforced (a `text` stimulus needs a body, an `audio` one needs audio media, a `video` one accepts an embed), `bodyHtml` requires the plain `body` it falls back to, and `transcript` is the one author-only field. `validateItemGroup` validates the container, the stimulus and every item against its registered schema, reporting an unregistered item type rather than throwing — an author fixing a six-item group wants every problem listed.

  **Ordering lives in lk-core, so the server and the client agree.** `flattenSequence(entries, { shuffleEntries?, seed? })` turns activities and groups into presented slots. Groups are **shuffle-atomic** — a section shuffle moves a group as one block and never interleaves two passages' questions — and only a group that declares `shuffle: 'within-group'` reorders its items. A seed is **required** whenever anything shuffles, and an **empty group is refused**: contributing no slots would delete a whole section from a sequence that still looked well-formed, and `composeAssessmentScore` would then report a `final` grade over the survivors. Each slot's `slotId` comes from the _authored_ position, so it is unique and stable under shuffling.

  **Redaction.** `redactItemGroup` / `assertRedactedItemGroup` extend the fail-closed model to the container: the transcript goes, the passage stays, every item is proven learner-safe against its own type's schema, and failures are reported at `items.<index>`. `item-group` is reserved in the registry.

  **React.** `ActivitySequence` accepts `SequenceEntry[]`, flattens groups into consecutive questions, and mounts each group's stimulus **once**, kept beside every question in the group. New `shuffle`, `shuffleSeed`, `sanitizeHtml` and `onSubmit` props; new `<StimulusPanel>`, also exported for custom runners.

  ***

  The rest of this entry is what a review of the above turned up. Several are older defects the group work only made visible.

  **`ActivitySequence` had no exam response channel at all.** In `exam` mode the components deliberately never grade: they emit the raw answer through `onSubmit` and return before `onComplete`. The pager forwarded `onComplete` and nothing else, so an exam runner received _nothing_ — no response, no completion, for any question. `onSubmit(response, { slotId, index, activityId })` is new and fires in every mode before grading, and an exam slot now records a `responded` outcome so `onFinished` reports the finished set instead of never firing. (`SequenceItemOutcome` gains that third arm, so an exhaustive `switch` over it needs a new case.)

  **Hiding a pane did not stop its media.** The pager keeps every question and stimulus mounted so answers survive back-navigation, and toggles visibility with `hidden` — which is `display: none`, and CSS does not touch playback. A recording started for one question carried on underneath the next, its controls removed from the page and from the accessibility tree, with no way to stop it but navigating back. Panes now pause their `<audio>`/`<video>` as they hide, preserving `currentTime`: a recording keeps its position between questions of its own group, stops on the way out, and never auto-resumes. A provider `embed` cannot be controlled this way and is documented as such. This affected per-question media too, since before item groups existed.

  **Navigation put focus on the passage, not the question.** The stimulus was rendered inside the region labelled "Question 3 of 5", ahead of the question, so every Next dropped focus onto a landmark that began with the whole passage, keyboard users tabbed through it (audio controls included) before reaching the question, and a region sat nested inside a region. The stimulus is now a sibling of the question region: same visual order, still a landmark to jump back to, focus lands on the question.

  **`onActivityComplete` could not identify what it had completed.** It reported the _presented_ index, which moves under shuffling and already differs from the slot identity once a group is present — while `composeAssessmentScore` keys on `slotId`, so persisted rows could not be reconciled with the grade. It now receives `slotId` as a third argument (existing two-parameter handlers keep compiling).

  **A reordering set change could leave a sequence unfinishable.** Changing the presented order cleared the recorded outcomes but left the children mounted under unchanged keys — and therefore still `completed`. Those slots could not be answered again and nothing would refill them, so the set could never finish. A reset now resets both halves.

  **Same-tick completions could be lost.** Outcomes were read from a `useState` closure, so two slots completing in one tick both saw the pre-update array and the second overwrote the first. They are held in a ref, written synchronously.

  **Redacted groups did not type-check into the pager**, and the obvious fix does not work: `Renderable<T>` is built on `Omit`, which does not distribute over a union, so `Renderable<ActivityData>` collapses to the fields every activity shares and `.type` stops narrowing — widening the prop to it would have broken the pager's own dispatch and every custom renderer. `RenderableActivity` distributes properly (and fixes `ActivityProps`, where custom renderers could not narrow `data` either), and `asRenderableSequence` is the single documented crossing for `RedactedActivityData`, whose all-`unknown` fields satisfy no widening at all.

  **`FillInTheBlanks` accepted redacted data in `practice` mode.** It would then call `score()` from the submit handler — where React error boundaries cannot reach — throwing after the learner had typed their answers. It now fails at render like `MultipleChoice` already did.

  **`seededShuffle` gains an opt-in `version`.** Version 1 takes the Fisher–Yates index from its generator's low bits, which in an LCG are strongly correlated: on a four-option item only 12 of 24 orders are reachable _for any seed_, and the last authored option lands first 8% of the time against 42% second — a real fairness defect on an exam. Version 2 draws from the high bits and reaches every order uniformly. **Version 1 remains the default**, because the permutations are a wire contract: an attempt may be stored with only its seed, and a review render must reproduce what the learner saw, so changing the default is a package major. Use `{ version: 2 }` for new content.

  **A stimulus no longer lends its language to the SDK's own text.** `lang` was set on the whole panel, so a screen reader read this package's English strings — the region's name, "Questions 3–5" — in the passage's voice (WCAG 3.1.2). It is now declared on the authored parts only.

## 0.4.0

### Minor Changes

- b96969b: Sectioned assessment scoring, with rounding treated as the two distinct operations it actually is.

  **`composeAssessmentScore(sections, policy)`** turns per-item outcomes into a weighted, sectioned grade: normalised section weights, per-section thresholds with per-section overrides, per-item `points`, and an explicit `passFailureReason` (`overall_below_threshold` | `section_below_threshold` | `both` | `null`).

  This exists because the formula is invariably written twice — once on the server that records the grade, once on the client that shows the learner their breakdown — and the two drift, usually on the scale (0–1 vs 0–100) or on whether a section override is honoured.

  **Ungraded work never counts as zero — and the two reasons for it are kept apart.** `deferred` items (a grade is coming) are excluded from the denominator, reported in `pendingSlotIds`, and hold the result at `status: 'provisional'`. `unscorable` items (a grade is never coming — an unregistered type, redacted data) are excluded from the denominator too, but reported separately in `unscorableSlotIds` and they do **not** hold the result provisional: `evaluate()` returns that status precisely so a mixed-version content bank does not crash an exam, and such an attempt still has to be recordable.

  `passed` and `passFailureReason` are also `null` when **nothing was gradable at all** — every item unscorable, or an empty assessment. There is no evidence either way, and a hard `false` would record a fail at 0% for a learner whose work was never gradable. While the result is `provisional`, they are likewise `null` rather than `false` — an attempt with unmarked work has neither passed nor failed, and returning `false` would let a UI keyed on `passed` show a fail for an essay nobody has looked at. Crucially, a section with nothing graded yet does not drag the total down: the weighted total is computed over the sections that _have_ something graded, with their weights renormalised among themselves. `SectionScore.normalizedWeight` reports that **live** weight (0 for a section contributing nothing), so a client can rebuild the grade from `sections[]` and agree with the record: `roundGrade(sum(section.score * section.normalizedWeight), rounding) === result.score`, exactly, by construction. Apply the same final rounding — the raw weighted sum of already-rounded section scores is not itself a rounded value (0.85 and 1.00 at equal weights sum to 0.925 against a recorded 0.93), so comparing it unrounded is off by up to half a quantum. The authored weight is still reported verbatim as `weight`. Without that, a midterm containing an unmarked essay reads as a failing 50% — a learner shown a fail for work nobody has looked at yet. A section with nothing graded is likewise never reported as having failed its threshold.

  **Items are keyed on `slotId`, not activity id.** The same activity can legitimately appear in two sections; keying on the activity collapses them into one and silently scores the second occurrence as zero.

  **`RoundingPolicy` — required, with no default, ever.** Rounding is two operations that must not share one policy:

  - **Grade rounding** (`roundGrade`) decides the number a learner is shown and recorded against. `dp` is required and load-bearing: at 2 decimal places a learner shown "70%" is not recorded as a fail at 69.6.
  - **Band classification** (`classifyBand`) deliberately **floors**, because over-placement is the more harmful error, so a boundary is never reached by rounding up.

  Supplying a single default would silently invert one of them, so the SDK supplies neither.

  `roundGrade` also guards binary float noise with a sign-aware epsilon — `1.005 * 100` is `100.49999999999999`, which would otherwise round down and cost a learner a grade step. **`gte(value, threshold, policy)`** rounds _both_ sides before comparing, so "what the learner sees" and "what the gradebook decides" are the same comparison. Modes: `half-up`, `half-even`, `floor`, `ceil`.

  `roundGrade` is **idempotent** for every mode: the float-noise allowance is applied in the direction each mode needs (`ceil` nudges down, `floor` nudges up, half modes nudge away from zero), so a value already exact at `dp` is never moved. A uniform away-from-zero nudge would make `ceil` climb a whole step each call — 0.7 to 0.71 to 0.72, and a true zero to 0.01 — which matters because a composed score is rounded once and then compared through `gte`, which rounds again.

- d08a518: The return trip for deferred grading: a grade that arrives later is now a first-class SDK value.

  `evaluate()` could already say a submission was `deferred` — graded later by an AI or a human — but there was no type for the grade that comes **back**, so every consumer invented one and mirrored it by hand into their frontend. That gap is closed.

  **New in `lk-core`:**

  - **`GradeRecord`** — a scaled score, pass state and narrative feedback, plus the parts a rubric grader actually produces: `criteria` (per-criterion score or ordinal `band`, with comments and the weight applied), `corrections` (anchored in the learner's own text, with optional character offsets), `evidence`, `rationale`, `confidence`, `requiresHumanReview`, `grader` provenance (`kind`, `model`, `promptHash`) and token/cost `usage`. The shapes are the intersection of two independent production graders that converged on the same envelope.
  - **`ItemOutcome` gains a `graded` arm** carrying the record, with `score` / `maxScore` / `passed` / `feedback` mirrored onto the outcome for uniform reads. `scored` continues to mean "the SDK computed this deterministically"; `graded` means "a grader returned it".
  - **`gradeFromRubric(criteria, activity?, options?)`** — the weighted total as a **pure function of the grader's judgements**. A grader is asked for judgement, not mental arithmetic: if the model also returns the total, the grade becomes unverifiable and irreproducible, since two runs can disagree for identical criterion scores. Weights are normalised by their sum, so they need not add to 1. Criteria marked `notApplicable`, and band-only criteria with no numeric score, are excluded from **both** numerator and denominator. When nothing scoreable remains it returns `{ unscorable: true, reason }` — never a zero.

    It also refuses out-of-contract input rather than turning it into a grade: a criterion whose score is `NaN` or infinite is **rejected, not silently dropped** (dropping it would regrade the learner on fewer criteria, with different effective weights, and nobody would know), and a score outside the scaled `[0,1]` range — a grader reporting raw points such as 4-out-of-5 — is rejected by name instead of being clamped, because silently rescaling someone's grader is worse than telling them it is out of contract. Float noise a hair outside the range is clamped.

  - **`outcomeFromGrade(grade)`** and **`hasGrade(outcome)`**. Use `hasGrade` instead of testing `status === 'scored'`, which silently misses asynchronously graded work.
  - **`XAPIVerb.SCORED`** for "a grade now exists", distinct from `answered` (which asserts the grade existed at submission time — here the learner acted earlier and the grade arrived later, often from a different actor).

  **New in `lk-react`:** `<WrittenResponse renderMode="review" outcome={…} />` renders a returned grade — the percentage and pass state, narrative feedback, every criterion with its score or band and comment, inline corrections shown as `<del>`/`<ins>` pairs with explanations, and an awaiting-review affordance when `requiresHumanReview` is set. `notApplicable` criteria render as such rather than as zeros, and a `deferred` outcome still renders "not graded yet" rather than 0%.

  Additive: `ItemOutcome` gained a union member, so an exhaustive `switch` over outcome statuses will need the new `graded` case.

### Patch Changes

- 0d62bca: Fix package resolution for CommonJS TypeScript consumers, and gate it in CI so it cannot regress.

  **A CommonJS TypeScript project could not import these packages at all.** Both `exports` maps declared a single `types` condition pointing at the ESM `.d.ts`, which was then served to `require` as well. TypeScript under `node16`/`nodenext` resolution reported the declaration as ESM and failed the import with `TS1479` ("the current file is a CommonJS module whose imports will produce require calls"). `are-the-types-wrong` flagged every entrypoint as "Masquerading as ESM". The `types` condition is now nested inside each format, so `require` resolves the `.d.cts` declaration that was always being built:

  ```jsonc
  ".": {
    "import":  { "types": "./dist/index.d.ts",  "default": "./dist/index.js"  },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
  }
  ```

  This is a resolution fix only — no build change, no runtime change, no API change. ESM and bundler resolution were already correct and are unaffected. It matters most for server-side use: a Node grading service or queue worker compiled as CommonJS can now `import { evaluate, redact } from '@intellectif/lk-core'` directly, instead of working around it with `await import()` or switching `moduleResolution`.

  **Raised the `zod` floor to `^3.25.1` (lk-core).** The previous range allowed `zod@3.25.0`, which declares a `./v4` export whose target files are absent from the published tarball. Since the schema layer imports `zod/v4`, any install that resolved exactly 3.25.0 failed with `MODULE_NOT_FOUND` in both ESM and CJS. No supported version is dropped — 3.25.0 was never functional here.

  **New CI gate:** `publint` and `are-the-types-wrong` now run on every build (`pnpm check-packaging`). `node10` resolution is deliberately ignored — that is TypeScript before 4.7, and this SDK requires React 19.

## 0.3.1

### Patch Changes

- 69da998: Documentation-only clarifications to two v0.3 behaviours that changed silently for upgraders:

  - **Fill-in-the-blanks `caseSensitive` and `trimWhitespace` are classified `answer-key`** and are therefore removed by `redact()`. This is intentional — they describe how strictly the key is compared, so revealing them narrows the answer — but it changed the shape of redacted payloads on upgrade with no type error to warn you. If a renderer read those flags from a redacted payload, it now receives `undefined`. Use `redact(data, { policy: { blanks: { caseSensitive: 'public' } } })` if a deployment genuinely needs them client-side.
  - **`ScoringDetail.outcome` is optional in the type but always written** by both built-in scorers. It is a compatibility bridge so v0.2-era consumer-constructed literals keep compiling. **In v1.0 it becomes required and the deprecated `ScoringDetail.correct` is removed.** Migrate reads from `.correct` to `.outcome` now: `.correct` means "the learner acted correctly on this option", which for multiple-choice marks unselected distractors as `true`.

## 0.3.0

### Minor Changes

- a98f128: v0.3.0 — "close the holes, open the type system". Every change that touches grading semantics is opt-in: for identical `(data, response)` inputs, `score` / `passed` are bit-for-bit v0.2. Runtime-additive throughout; three TypeScript-surface notes for upgrading consumers:

  1. **`ActivityType` / `ActivityData` / `LearnerResponse` gain `'written-response'`.** Exhaustive `Record<ActivityType, T>` literals and `assertNever` switches need the new case (or `Partial<Record<…>>`).
  2. **`ScoringResult.feedback` may now be a string** where it was always `null` (only when the activity authored feedback), and `ScoringDetail` gains `outcome`/`weight` — deep-equality comparisons against hand-built results need updating. `outcome` is optional in the type (0.2-era literals keep compiling) but always written by both scorers.
  3. **Schema tightenings reject data that was always broken but previously validated:** duplicate option ids, duplicate `{{id}}` placeholders / blank ids (these silently corrupted partial scores), whitespace-only accepted answers (matched empty input), and dangerous media URL schemes. Components validate in dev only, so production rendering of legacy rows is unaffected — but run a validation sweep over stored content before wiring these schemas into an authoring save path. xAPI durations now carry centiseconds (`PT5.40S`, was `PT5S`).

  **New: written-response activity type (Req 22, wire-format byte-compatible).** `WrittenResponseData` / `WrittenResponseLearnerResponse` / `WrittenResponseDataSchema` (loose — unknown keys and sidecars survive validation verbatim), `countWords()` (canonical `\s+` split, hyphenated tokens count 1), `writtenResponseJsonSchema`. Grading is deferred: use `evaluate()`, not `score()`.

  **New: `evaluate(data, response): ItemOutcome`** — `'scored' | 'deferred' | 'unscorable'`. An ungraded written response returns `{ status: 'deferred', reason: 'requires_async_grading', partial: { withinWordBounds, wordCount } }` instead of a fake 0; an unregistered type returns `'unscorable'` instead of throwing. `score()` keeps its exact signature and now throws a typed `DeferredScoringError` for deferred-only types (previously the type didn't exist in the union at all).

  **New: activity-type registry (R1).** `defineActivityType` / `registerActivityType` / `getActivityTypeDescriptor` / `registeredActivityTypes`; `validateActivity`, `score`, `evaluate`, `redact`, and the new `jsonSchemaFor(type)` are registry-backed, so a consumer can register a custom activity type without an SDK release. `ActivityType` is now `keyof ActivityDataMap` and `LearnerResponseMap` exists — both open to TypeScript module augmentation.

  **New: `redact()` + `FieldPolicy` + `assertRedacted()` (R7).** Fail-closed, exhaustive redaction driven by per-type field policies: unclassified fields (including unknown passthrough keys) are never emitted, and `scoringStrategy`, answer keys, per-item hints' answers and authored pass/fail feedback are stripped. Learner-facing content survives — including the `questionHtml` / `passageHtml` / `promptHtml` rich-text sidecars an exam renderer needs, and the **rubric**, which tells a learner what they are being graded on. Default (`reveal: 'none'`) output validates against new strict redacted schemas (`RedactedMultipleChoiceDataSchema` etc.); `reveal: 'after-submit'` restores answer-key fields for review renders. Sensitivity is partly a pedagogical choice, so it is not frozen in the SDK: `redact(data, { policy: { rubric: 'author-only' } })` tightens any field per call.

  **New: `questionHtml` (multiple-choice) and `passageHtml` (fill-in-the-blanks)** as first-class optional fields, matching `promptHtml` on written-response. The SDK carries, validates and redacts them as learner-visible content but does not render them yet — components still escape text, and sanitisation remains the application's responsibility. Rendering lands with the controlled/redacted renderer in v0.4.

  **New: `matchText()` + `TextMatchPolicy` (R3.3).** Opt-in Unicode normalization (`NFC`/`NFKC`), diacritic folding, inner-whitespace collapse, punctuation tolerance, Levenshtein distance, and locale-aware case folding; `TextMatchResult.via` reports match quality. `BlankConfig.match` wires a policy into fill-in-the-blanks scoring; defaults are bit-for-bit the previous trim+lowercase semantics.

  **Fixed (verified against the external SDK audit):**

  - B1: `DEFAULT_PASS_THRESHOLD` (0.7) is now exported; the `.d.ts` JSDoc that claimed 0.6 (twice) is corrected.
  - B3: `score()`/`evaluate()` now select authored `ActivityFeedback` into `ScoringResult.feedback` keyed on `passed` — exactly the condition the components applied.
  - B4: `ScoringDetail.outcome` (`correct | incorrect | correct-omission | incorrect-omission`) replaces the ambiguous `.correct`, which is deprecated but still written.
  - B5: `ScoringDetail.weight` is now written (`1`) by both scorers.
  - B7: all schemas are loose (`z.looseObject`) — `validateActivity` no longer strips unknown fields, deleting the consumer's merge workaround. The exported JSON Schemas no longer emit `additionalProperties: false`, so the two validation paths finally agree.
  - B9: option ids must be unique; duplicate `{{id}}` placeholders and duplicate `blanks[].id` are rejected (each id appears exactly once — previously duplicates corrupted the partial-score denominator); MC option cap raised 10 → 26; accepted answers must be non-empty after trimming (a whitespace-only key used to mark empty input correct).
  - B10 (slice): `definition.interactionType` / `correctResponsesPattern` / `choices` and `context.contextActivities` are now expressible and validated; durations carry centisecond precision (`PT1.23S` — previously anything under 500 ms collapsed to `PT0S`).
  - Security: media URLs are scheme-allow-listed (`https:`/`http:`/`data:`/`blob:` + root-relative) — `javascript:`, `file:`, `ftp:` are rejected. Previously `javascript:alert(1)` validated and reached an iframe `src`. Root-relative URLs are newly allowed. **`embed` media is stricter still: absolute http(s) only** — a `data:`/`blob:`/same-origin document inside the allow-scripts embed iframe would defeat its sandbox.
  - Statement ids no longer require `crypto.randomUUID`: on non-secure (plain-http) origins a `getRandomValues`-based v4 fallback is used — previously every component crashed **at submit**, losing the learner's answer.
  - `assertRedacted` now fails closed when a type registers no `redactedSchema` (a marker alone proves nothing).
  - xAPI: new `SUBMITTED` verb (`http://activitystrea.ms/schema/1.0/submit`) and `xAPIBuilder.buildSubmittedStatement()` for deferred submissions — no `score`/`success`/`completion` fields, so an LRS can never mistake "submitted, ungraded" for a result.

  **Packaging:** `sideEffects: false`, `engines.node >= 20`, LICENSE now ships in the tarball.

  **Upgrading from an app-side `written-response` shim.** The activity payload is field-for-field identical (same names, casing and nesting), so **stored activity rows need no data migration**. Two caveats, because "no migration" is not the same as "nothing to do":

  - **`WrittenResponseDataSchema` is stricter than a typical hand-rolled shim.** New constraints that can reject rows a looser app-side check accepted: `minWords`/`maxWords` must be integers with `maxWords >= minWords`; `rubric.criteria` must be non-empty and each criterion needs a non-empty `name` (an authoring UI that adds a blank criterion row will trip this); `media` must satisfy the alt-text and URL-scheme rules. Run a validation sweep over stored content before wiring these schemas into a save path — the same advice as the multiple-choice / fill-in-the-blanks tightenings above.
  - **Deferred grading needs storage the SDK does not model yet.** `evaluate()` returns `{ status: 'deferred' }`, but there is no SDK type yet for the grade that comes back. Persisting a grade (per-criterion scores, corrections, confidence, human override) is still yours to design; a `GradeRecord` and a `graded` outcome are planned for v0.4.

  You can also delete any raw-payload merge workaround around `validateActivity` (unknown keys now survive validation) and import `DEFAULT_PASS_THRESHOLD` instead of duplicating the constant.

## 0.2.1

### Patch Changes

- ed4a77d: Add a per-package README so visitors to npmjs.com see a focused overview, install command, quick-start example, subpath-export map, and links to the full documentation. No runtime change.

## 0.2.0

### Minor Changes

- 9e24763: V1 feature set: Multiple Choice & Fill-in-the-Blanks activities, scoring engine,
  xAPI builder + `useXAPI`, `useActivityState`, `ThemeProvider` with an optional
  token-driven skin and `createTailwindTheme`, `ActivitySequence` question-set
  pager, optional per-activity `media` (image/audio/video/embed) and authored
  overall `feedback`, full WCAG 2.2 AA accessibility, and project documentation.
