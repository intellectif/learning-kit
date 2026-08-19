# @intellectif/lk-core

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
