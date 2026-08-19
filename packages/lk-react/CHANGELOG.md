# @intellectif/lk-react

## 2.0.0

### Minor Changes

- a98f128: v1.1.0 — written-response component plus verified bug fixes. Additive API; two behavioral fixes are flagged below.

  **New: `<WrittenResponse>`** (`@intellectif/lk-react/components/WrittenResponse`): labelled textarea with a live word counter and bounds messaging for asynchronously graded free writing. Completes via `onSubmitted(submission)` — `text`, `wordCount` (recomputed with `countWords`), `withinWordBounds`, `timeSpent`, and a SUBMITTED-verb xAPI statement with no score fields. Deliberately not `onComplete`: an ungraded submission never fabricates a score. Not yet dispatched inside `ActivitySequence` (its results contract is score-based; widening lands in v0.4) — a written-response item in a sequence renders an unsupported-type note.

  **New: `shuffleSeed` prop on `MultipleChoice`.** Supply a seed (e.g. the attempt id) to make the shuffled order reproducible server-side, stable across reloads, and SSR-hydration-safe. Without it, behavior is unchanged (random per-mount order).

  **Fixed:**

  - `ActivitySequence` now resets its position and results when the activity **set** changes (B8): previously results leaked across sets, `onComplete` could fire with a mixed old/new results array, a shorter new set stranded the learner on an empty view, and the unkeyed child kept stale answer state. The child is now keyed per slot. The reset keys on the ordered activity **ids**, not the array reference — parents that rebuild a structurally identical array on every render (inline literals, `.map()` in render) keep their in-progress state.
  - `crypto.randomUUID` is no longer called unconditionally on every `MultipleChoice` mount — it crashed on non-HTTPS origins (LAN/staging) even with shuffle off. It is now lazy (shuffle-without-seed only) with a non-crypto fallback.
  - The embed `<iframe>` now actually has the `sandbox` attribute its documentation always claimed (`allow-scripts allow-same-origin allow-presentation`); combined with lk-core's new URL scheme allow-list this closes a stored-XSS vector.
  - **Behavioral fix — `useXAPI` now applies the configured identity**: `XAPIConfig.actor` replaces the SDK's anonymous placeholder actor, and `XAPIConfig.activityId` replaces the SDK's `urn:learning-kit:activity:*` object id, before sending. This implements the contract that was documented but never wired (both config fields were dead). Conservative: statements whose actor/object id were already rewritten by the app are left untouched. If you relied on the anonymous actor reaching your LRS while also passing `actor` in config, statements will now carry the configured actor. A hook instance is per-activity by contract; for pages sending **several activities through one hook**, `activityId` now also accepts a mapper — `(sdkObjectId) => string` — so each question keeps a distinct IRI instead of collapsing onto one.
  - xAPI statements now include `definition.type` + `interactionType` (+ `correctResponsesPattern`/`choices` for multiple-choice), and name language maps use the activity's `locale` instead of hardcoding `en-US`.
  - Overall feedback is now taken from `ScoringResult.feedback` (selected by lk-core on `passed` — same visible behavior, one source of truth).
  - The skin honors `prefers-reduced-motion`, and ships `.lk-wr*` styles for the new component.

  **Packaging:** `engines.node >= 20`, LICENSE now ships in the tarball.

### Patch Changes

- Updated dependencies [a98f128]
  - @intellectif/lk-core@0.3.0

## 1.0.1

### Patch Changes

- ed4a77d: Add a per-package README so visitors to npmjs.com see a focused overview, install command, quick-start example, subpath-export map, and links to the full documentation. No runtime change.
- Updated dependencies [ed4a77d]
  - @intellectif/lk-core@0.2.1

## 1.0.0

### Minor Changes

- 9e24763: V1 feature set: Multiple Choice & Fill-in-the-Blanks activities, scoring engine,
  xAPI builder + `useXAPI`, `useActivityState`, `ThemeProvider` with an optional
  token-driven skin and `createTailwindTheme`, `ActivitySequence` question-set
  pager, optional per-activity `media` (image/audio/video/embed) and authored
  overall `feedback`, full WCAG 2.2 AA accessibility, and project documentation.

### Patch Changes

- Updated dependencies [9e24763]
  - @intellectif/lk-core@0.2.0
